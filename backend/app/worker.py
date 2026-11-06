"""MySQL is the durable queue; Redis caches task snapshots, never owns tasks."""
import logging
import copy
import json
import time
import threading
import uuid
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlencode, urlsplit, urlunsplit

import httpx
import redis
import websocket
from sqlalchemy import select

from .config import settings
from .db import Session, Task, TaskEvent, TaskInputAsset, TaskOutput, TaskWorkflowSnapshot, Upload, utcnow
from .main import cache_task
from .workflows import WorkflowError, build_workflow

cfg = settings()
log = logging.getLogger('worker')
_poll_cursor = None
_progress_lock = threading.Lock()
_progress_threads: dict[str, threading.Thread] = {}
_progress_retry_after: dict[str, float] = {}

def headers():
    return {'Authorization': f'Bearer {cfg.comfyui_token}'} if cfg.comfyui_token else {}

def claim():
    with Session.begin() as session:
        task = session.scalar(select(Task).where(Task.status == 'queued').order_by(Task.created_at).with_for_update(skip_locked=True).limit(1))
        if not task:
            return None
        task.status = 'submitting'
        task.comfy_prompt_id = str(uuid.uuid4())
        task.updated_at = utcnow()
        session.add(TaskEvent(id=str(uuid.uuid4()), task_id=task.id, status='submitting'))
        task_id = task.id
    with Session() as session:
        task = session.get(Task, task_id)
        if task:
            cache_task(task)
    return task_id

def update(task_id, status, error=None, outputs=None, expected=None, stale_before=None):
    changed = False
    with Session.begin() as session:
        task = session.get(Task, task_id, with_for_update=True)
        if task is None or (expected and task.status not in expected):
            return False
        if stale_before and task.updated_at >= stale_before:
            return False
        if task.status == status:
            return False
        task.status = status
        task.error = error
        task.updated_at = utcnow()
        if status == 'running' and task.progress is None:
            task.progress = 0
        if status == 'completed':
            task.progress = 100
        if outputs is not None:
            task.outputs = outputs
            for position, item in enumerate(outputs):
                existing = session.get(TaskOutput, (task.id, position))
                if existing is None:
                    session.add(TaskOutput(task_id=task.id, position=position, filename=item['filename'], subfolder=item.get('subfolder') or '', storage_type=item.get('type') or 'output'))
        session.add(TaskEvent(id=str(uuid.uuid4()), task_id=task.id, status=status, message=error))
        changed = True
    if changed:
        with Session() as session:
            task = session.get(Task, task_id)
            if task:
                cache_task(task)
    return changed

def update_progress(task_id, prompt_id, progress):
    progress = max(0, min(99, int(progress)))
    changed = False
    with Session.begin() as session:
        task = session.get(Task, task_id, with_for_update=True)
        if task is None or task.status != 'running' or task.comfy_prompt_id != prompt_id:
            return False
        current = task.progress or 0
        progress = max(current, progress)
        if progress == current:
            return False
        task.progress = progress
        changed = True
    if changed:
        with Session() as session:
            task = session.get(Task, task_id)
            if task:
                cache_task(task)
    return changed

def progress_websocket_url(client_id):
    parsed = urlsplit(cfg.comfyui_url.rstrip('/'))
    scheme = 'wss' if parsed.scheme == 'https' else 'ws'
    path = parsed.path.rstrip('/') + '/ws'
    return urlunsplit((scheme, parsed.netloc, path, urlencode({'clientId': client_id}), ''))

def connect_progress_socket(client_id):
    extra_headers = [f'Authorization: Bearer {cfg.comfyui_token}'] if cfg.comfyui_token else None
    connection = websocket.create_connection(progress_websocket_url(client_id), timeout=1, header=extra_headers)
    connection.settimeout(1)
    return connection

def _task_is_running(task_id, prompt_id):
    with Session() as session:
        task = session.get(Task, task_id)
        return bool(task and task.status == 'running' and task.comfy_prompt_id == prompt_id)

def _watch_progress(task_id, prompt_id, node_count, connection=None):
    ws = connection
    try:
        if ws is None:
            ws = connect_progress_socket(task_id)
        total_nodes = max(1, node_count)
        completed_nodes = set()
        current_node = None
        current_fraction = 0.0

        def publish():
            fraction = current_fraction if current_node and current_node not in completed_nodes else 0.0
            percentage = int((len(completed_nodes) + fraction) * 100 / total_nodes)
            update_progress(task_id, prompt_id, percentage)

        while _task_is_running(task_id, prompt_id):
            try:
                raw = ws.recv()
            except websocket.WebSocketTimeoutException:
                continue
            if not isinstance(raw, str):
                continue
            try:
                message = json.loads(raw)
            except ValueError:
                continue
            if not isinstance(message, dict):
                continue
            event_type = message.get('type')
            data = message.get('data')
            if not isinstance(data, dict):
                continue
            event_prompt_id = data.get('prompt_id')
            if event_prompt_id is not None and event_prompt_id != prompt_id:
                continue

            if event_type == 'progress':
                maximum = data.get('max')
                value = data.get('value')
                if isinstance(maximum, (int, float)) and maximum > 0 and isinstance(value, (int, float)):
                    current_node = str(data.get('node') or current_node or 'progress')
                    current_fraction = max(0.0, min(1.0, value / maximum))
                    publish()
            elif event_type == 'execution_cached':
                nodes = data.get('nodes')
                if isinstance(nodes, list):
                    completed_nodes.update(str(node) for node in nodes)
                    publish()
            elif event_type == 'executed':
                node = data.get('node')
                if node is not None:
                    completed_nodes.add(str(node))
                    if current_node == str(node):
                        current_node = None
                        current_fraction = 0.0
                    publish()
            elif event_type == 'executing':
                node = data.get('node')
                if node is None:
                    if current_node:
                        completed_nodes.add(current_node)
                    update_progress(task_id, prompt_id, 99)
                    return
                node = str(node)
                if current_node and current_node != node:
                    completed_nodes.add(current_node)
                current_node = node
                current_fraction = 0.0
                publish()
    except (OSError, websocket.WebSocketException) as exc:
        log.info('ComfyUI progress stream unavailable for task %s: %s', task_id, exc)
        with _progress_lock:
            _progress_retry_after[task_id] = time.monotonic() + 30
    finally:
        if ws is not None:
            try:
                ws.close()
            except websocket.WebSocketException:
                pass
        with _progress_lock:
            _progress_threads.pop(task_id, None)

def ensure_progress_monitor(task_id, prompt_id, node_count, connection=None):
    with _progress_lock:
        thread = _progress_threads.get(task_id)
        if thread and thread.is_alive():
            if connection is not None:
                connection.close()
            return
        if _progress_retry_after.get(task_id, 0) > time.monotonic():
            if connection is not None:
                connection.close()
            return
        thread = threading.Thread(target=_watch_progress, args=(task_id, prompt_id, node_count, connection), daemon=True, name=f'comfy-progress-{task_id[:8]}')
        _progress_threads[task_id] = thread
        thread.start()

def submit(task_id):
    with Session() as session:
        task = session.get(Task, task_id)
        if not task:
            return
        snapshot = session.get(TaskWorkflowSnapshot, task.id)
        data = {'model': task.model, 'kind': task.kind, 'prompt': task.prompt, 'options': task.options, 'prompt_id': task.comfy_prompt_id, 'workflow': copy.deepcopy(snapshot.workflow) if snapshot else None, 'image_inputs': dict(snapshot.image_inputs) if snapshot else {}}
        input1 = session.get(TaskInputAsset, (task.id, 0))
        input2 = session.get(TaskInputAsset, (task.id, 1))
        input_video = session.get(TaskInputAsset, (task.id, 2))
        upload1_id = input1.upload_id if input1 else task.upload_id
        upload2_id = input2.upload_id if input2 else task.options.get('second_upload_id')
        video_id = input_video.upload_id if input_video else task.options.get('video_upload_id')
        upload = session.get(Upload, upload1_id) if upload1_id else None
        upload2 = session.get(Upload, upload2_id) if upload2_id else None
        video = session.get(Upload, video_id) if video_id else None
        invalid_input = any(upload_id and (not item or item.user_id != task.user_id) for upload_id, item in ((upload1_id, upload), (upload2_id, upload2), (video_id, video)))
        upload_data = (upload.path, upload.content_type) if upload else None
        upload2_data = (upload2.path, upload2.content_type) if upload2 else None
        video_data = (video.path, video.content_type) if video else None
    if invalid_input:
        update(task_id, 'failed', '参考图片不存在或不可访问。', expected={'submitting'})
        return
    base = cfg.comfyui_url.rstrip('/')
    monitor_socket = None
    try:
        with httpx.Client(timeout=60, headers=headers()) as client:
            uploaded_images = []
            for entry in (upload_data, upload2_data, video_data):
                if not entry:
                    uploaded_images.append(None)
                    continue
                name, content_type = entry
                path = cfg.path(cfg.upload_dir) / Path(name).name
                with path.open('rb') as source:
                    result = client.post(base + '/upload/image', files={'image': (name, source, content_type)}, data={'type': 'input', 'overwrite': 'false'})
                result.raise_for_status()
                uploaded = result.json()
                uploaded_images.append('/'.join(filter(None, [uploaded.get('subfolder', ''), uploaded['name']])))
            workflow = data['workflow']
            if workflow is None:
                # Pre-migration queued tasks have no snapshot; preserve legacy behavior.
                workflow = build_workflow(data['model'], data['kind'], data['prompt'], data['options'], *uploaded_images)
            else:
                for key, value in zip(('image', 'image2', 'video'), uploaded_images):
                    if value is not None:
                        node, field = data['image_inputs'][key].split('.', 1)
                        workflow[node]['inputs'][field] = value
            # Do not retry a POST whose outcome is unknown: it may have been accepted.
            try:
                try:
                    monitor_socket = connect_progress_socket(task_id)
                except (OSError, websocket.WebSocketException) as exc:
                    log.info('Could not open ComfyUI progress stream before submit for task %s: %s', task_id, exc)
                result = client.post(base + '/prompt', json={'prompt': workflow, 'client_id': task_id, 'prompt_id': data['prompt_id']})
            except httpx.RequestError:
                update(task_id, 'unknown', '提交结果不确定，请联系管理员核对 ComfyUI 队列。', expected={'submitting'})
                return
            if result.status_code >= 500:
                update(task_id, 'unknown', '生成服务返回服务器错误，请联系管理员核对队列。', expected={'submitting'})
                return
            result.raise_for_status()
            try:
                response_prompt_id = result.json().get('prompt_id')
            except (ValueError, AttributeError):
                update(task_id, 'unknown', '生成服务响应无法解析，请联系管理员核对队列。', expected={'submitting'})
                return
            if response_prompt_id != data['prompt_id']:
                update(task_id, 'unknown', '生成服务返回了不匹配的任务编号，请联系管理员核对。', expected={'submitting'})
                return
            if update(task_id, 'running', expected={'submitting'}):
                ensure_progress_monitor(task_id, data['prompt_id'], len(workflow), monitor_socket)
                monitor_socket = None
    except (httpx.HTTPError, OSError, ValueError, KeyError, WorkflowError):
        log.exception('Task preparation/submission failed: %s', task_id)
        update(task_id, 'failed', '任务提交失败，请检查工作流及生成服务配置。', expected={'submitting'})
    finally:
        if monitor_socket is not None:
            try:
                monitor_socket.close()
            except websocket.WebSocketException:
                pass

def poll_running():
    global _poll_cursor
    with Session() as session:
        query = select(Task.id, Task.comfy_prompt_id, Task.updated_at, TaskWorkflowSnapshot.workflow, Task.options).outerjoin(TaskWorkflowSnapshot, TaskWorkflowSnapshot.task_id == Task.id).where(Task.status == 'running')
        if _poll_cursor:
            last_time, last_id = _poll_cursor
            query = query.where((Task.updated_at > last_time) | ((Task.updated_at == last_time) & (Task.id > last_id)))
        rows = session.execute(query.order_by(Task.updated_at, Task.id).limit(100)).all()
        if not rows and _poll_cursor:
            _poll_cursor = None
            rows = session.execute(select(Task.id, Task.comfy_prompt_id, Task.updated_at, TaskWorkflowSnapshot.workflow, Task.options).outerjoin(TaskWorkflowSnapshot, TaskWorkflowSnapshot.task_id == Task.id).where(Task.status == 'running').order_by(Task.updated_at, Task.id).limit(100)).all()
        if rows:
            _poll_cursor = (rows[-1].updated_at, rows[-1].id)
    for task_id, prompt_id, updated_at, workflow, options in rows:
        ensure_progress_monitor(task_id, prompt_id, len(workflow) if isinstance(workflow, dict) else 1)
        timed_out = updated_at < utcnow() - timedelta(seconds=cfg.task_timeout_seconds)
        try:
            with httpx.Client(timeout=10, headers=headers()) as client:
                response = client.get(cfg.comfyui_url.rstrip('/') + '/history/' + prompt_id)
                response.raise_for_status()
                history = response.json().get(prompt_id)
            if not history:
                if timed_out:
                    update(task_id, 'unknown', '任务等待超时，请联系管理员核对生成服务。', expected={'running'})
                continue
            status = history.get('status', {})
            if status.get('status_str') == 'error':
                update(task_id, 'failed', 'ComfyUI 工作流执行失败，请检查服务端日志。', expected={'running'})
                continue
            if not status.get('completed'):
                if timed_out:
                    update(task_id, 'unknown', '任务等待超时，请联系管理员核对生成服务。', expected={'running'})
                continue
            outputs = []
            selected_nodes = (options or {}).get('output_nodes')
            for node_id, node in history.get('outputs', {}).items():
                if selected_nodes and node_id not in selected_nodes:
                    continue
                for key in ('images', 'gifs', 'videos'):
                    for item in node.get(key, []):
                        if isinstance(item, dict) and isinstance(item.get('filename'), str):
                            outputs.append({k: item.get(k, '') for k in ('filename', 'subfolder', 'type')})
            if outputs:
                update(task_id, 'completed', outputs=outputs, expected={'running'})
            else:
                update(task_id, 'failed', '工作流已完成，但没有可读取的图片或视频输出。', expected={'running'})
        except (httpx.HTTPError, ValueError, TypeError, KeyError):
            log.warning('Cannot poll ComfyUI task %s', task_id, exc_info=True)
            if timed_out:
                update(task_id, 'unknown', '无法确认超时任务状态，请联系管理员核对生成服务。', expected={'running'})

def recover_uncertain():
    cutoff = utcnow() - timedelta(seconds=180)
    with Session() as session:
        ids = session.scalars(select(Task.id).where(Task.status == 'submitting', Task.updated_at < cutoff)).all()
    for task_id in ids:
        update(task_id, 'unknown', '工作进程在提交时中断，请联系管理员核对 ComfyUI 队列。', expected={'submitting'}, stale_before=cutoff)

def main():
    logging.basicConfig(level=logging.INFO)
    while True:
        try:
            recover_uncertain()
            task_id = claim()
            if task_id:
                submit(task_id)
            poll_running()
            if not task_id:
                time.sleep(2)
        except Exception:
            log.exception('Worker cycle failed')
            time.sleep(5)

if __name__ == '__main__':
    main()
