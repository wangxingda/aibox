import io
import asyncio
import hashlib
import re
import json
import os
import subprocess
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

import httpx
import jwt
import redis
from fastapi import Cookie, Depends, FastAPI, File, HTTPException, Header, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image, UnidentifiedImageError
from pwdlib import PasswordHash
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import case, delete, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from .config import settings
from .db import Base, Session, Task, TaskEvent, TaskInputAsset, TaskOutput, TaskRequest, TaskWorkflowSnapshot, Upload, User, engine
from .workflows import WorkflowError, build_workflow, extend_driving_video, registry
from .output_storage import local_output

cfg = settings()
password_hash = PasswordHash.recommended()
cache = redis.Redis.from_url(cfg.redis_url, decode_responses=True, socket_connect_timeout=1, socket_timeout=1)

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    cfg.path(cfg.upload_dir).mkdir(parents=True, exist_ok=True)
    yield
    cache.close()
    engine.dispose()

app = FastAPI(title='AIBox API', version='0.1.0', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[v.strip() for v in cfg.cors_origins.split(',') if v.strip()], allow_credentials=True, allow_methods=['GET', 'POST', 'DELETE'], allow_headers=['Content-Type', 'Idempotency-Key'])

@app.middleware('http')
async def validate_origin(request: Request, call_next):
    origin = request.headers.get('origin')
    allowed = {v.strip().rstrip('/') for v in cfg.cors_origins.split(',') if v.strip()}
    if request.method not in {'GET', 'HEAD', 'OPTIONS'} and origin and origin.rstrip('/') not in allowed:
        return JSONResponse({'detail': '请求来源不允许'}, status_code=403)
    return await call_next(request)


def db():
    with Session() as session:
        yield session

def current_user(session_token: str | None = Cookie(default=None), session: DBSession = Depends(db)) -> User:
    try:
        payload = jwt.decode(session_token or '', cfg.jwt_secret, algorithms=['HS256'], options={'require': ['exp', 'sub']})
        user = session.get(User, payload['sub'])
        if not user:
            raise ValueError('No user')
        return user
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(401, '请先登录')

def set_session(response: Response, user: User):
    token = jwt.encode({'sub': user.id, 'exp': datetime.now(timezone.utc) + timedelta(hours=cfg.session_hours)}, cfg.jwt_secret, algorithm='HS256')
    response.set_cookie('session_token', token, httponly=True, secure=cfg.cookie_secure, samesite='lax', max_age=cfg.session_hours * 3600, path='/')

class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

class TaskInput(BaseModel):
    kind: Literal['image', 'video']
    model: str = Field(min_length=1, max_length=100)
    mode: str | None = Field(default=None, max_length=50)
    prompt: str = Field(default='', max_length=8000)
    upload_id: str | None = None
    second_upload_id: str | None = None
    video_upload_id: str | None = None
    quality: Literal['540P', '720P', '2K', 'auto'] = '540P'
    ratio: Literal['16:9', '9:16', '1:1', 'auto'] = '16:9'
    duration: Literal['5s', '10s'] = '5s'

def redact_service_address(message: str | None) -> str | None:
    if not message:
        return message
    parsed = urlsplit(cfg.comfyui_url)
    for value in (cfg.comfyui_url.rstrip('/'), parsed.netloc, parsed.hostname):
        if value:
            message = message.replace(value, '[生成服务]')
    return message

def serialize(task: Task) -> dict:
    return {'id': task.id, 'kind': task.kind, 'model': task.model, 'prompt': task.prompt, 'upload_id': task.upload_id, 'status': task.status, 'progress': task.progress, 'options': task.options, 'error': redact_service_address(task.error), 'created_at': task.created_at.isoformat() + 'Z', 'updated_at': task.updated_at.isoformat() + 'Z', 'outputs': [{'url': f'/api/tasks/{task.id}/outputs/{i}'} for i in range(len(task.outputs or []))]}

def cache_task(task: Task):
    try:
        cache.setex(f'task:{task.id}', 60, json.dumps(serialize(task)))
    except redis.RedisError:
        pass

def own_task(session: DBSession, user: User, task_id: str) -> Task:
    task = session.get(Task, task_id)
    if task is None or task.user_id != user.id:
        raise HTTPException(404, '任务不存在')
    return task

@app.get('/api/health')
def health():
    return {'status': 'ok'}

@app.post('/api/auth/register', status_code=201)
def register(data: Credentials, response: Response, session: DBSession = Depends(db)):
    user = User(id=str(uuid.uuid4()), email=data.email.lower(), password_hash=password_hash.hash(data.password))
    session.add(user)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, '该邮箱已注册')
    set_session(response, user)
    return {'id': user.id, 'email': user.email}

@app.post('/api/auth/login')
def login(data: Credentials, response: Response, session: DBSession = Depends(db)):
    user = session.scalar(select(User).where(User.email == data.email.lower()))
    if not user or not password_hash.verify(data.password, user.password_hash):
        raise HTTPException(401, '邮箱或密码错误')
    set_session(response, user)
    return {'id': user.id, 'email': user.email}

@app.post('/api/auth/logout')
def logout(response: Response):
    response.delete_cookie('session_token', path='/', secure=cfg.cookie_secure, httponly=True, samesite='lax')
    return {'ok': True}

@app.get('/api/auth/me')
def me(user: User = Depends(current_user)):
    return {'id': user.id, 'email': user.email}

@app.get('/api/models')
def models():
    return [{'id': name, 'kind': item['kind'], 'requires_image': bool(item.get('requires_image')), 'supports_image': 'image' in item.get('inputs', {}), 'requires_second_image': bool(item.get('requires_second_image')), 'supports_second_image': 'image2' in item.get('inputs', {}), 'requires_video': bool(item.get('requires_video')), 'supports_video': 'video' in item.get('inputs', {}), 'requires_prompt': item.get('requires_prompt', True), 'max_prompt_length': item.get('max_prompt_length', 8000), 'fixed_resolution': bool(item.get('fixed_resolution')), 'resolution_label': item.get('resolution_label', '工作流固定'), 'supported_qualities': list(item.get('value_maps', {}).get('quality', {}).keys()), 'supported_ratios': list(item.get('value_maps', {}).get('ratio', {}).keys()), 'supported_durations': list(item.get('value_maps', {}).get('duration', {}).keys()), 'modes': item.get('modes', []), 'default_ratio': item.get('default_ratio', '16:9')} for name, item in registry().items() if not item.get('hidden')]

@app.post('/api/uploads', status_code=201)
async def upload_image(file: UploadFile = File(...), user: User = Depends(current_user), session: DBSession = Depends(db)):
    data = await file.read(10 * 1024 * 1024 + 1)
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(413, '图片不能超过 10 MB')
    try:
        image = Image.open(io.BytesIO(data))
        if image.format not in {'JPEG', 'PNG', 'WEBP'} or image.width * image.height > 40_000_000:
            raise ValueError('Unsupported image')
        image.verify()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(400, '仅支持有效的 JPEG、PNG 或 WebP 图片')
    digest = hashlib.sha256(data).hexdigest()
    directory = cfg.path(cfg.upload_dir)
    directory.mkdir(parents=True, exist_ok=True)
    existing = session.scalar(select(Upload).where(Upload.user_id == user.id, Upload.sha256 == digest))
    if existing:
        path = directory / Path(existing.path).name
        if not path.is_file():
            temporary = directory / f'.restore-{uuid.uuid4()}'
            try:
                temporary.write_bytes(data)
                os.replace(temporary, path)
            finally:
                temporary.unlink(missing_ok=True)
        return {'id': existing.id, 'deduplicated': True}
    upload_id = str(uuid.uuid4())
    ext = {'JPEG': '.jpg', 'PNG': '.png', 'WEBP': '.webp'}[image.format]
    path = directory / (upload_id + ext)
    path.write_bytes(data)
    row = Upload(id=upload_id, user_id=user.id, path=path.name, content_type=Image.MIME[image.format], sha256=digest)
    session.add(row)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        path.unlink(missing_ok=True)
        existing = session.scalar(select(Upload).where(Upload.user_id == user.id, Upload.sha256 == digest))
        if existing:
            return {'id': existing.id, 'deduplicated': True}
        raise
    except Exception:
        session.rollback()
        path.unlink(missing_ok=True)
        raise
    return {'id': upload_id, 'deduplicated': False}

@app.get('/api/uploads')
def list_uploads(user: User = Depends(current_user), session: DBSession = Depends(db), limit: int = 30, offset: int = 0, kind: Literal['image', 'video', 'all'] = 'image'):
    media_filter = or_(Upload.content_type.like('image/%'), Upload.content_type.like('video/%')) if kind == 'all' else Upload.content_type.like(f'{kind}/%')
    rows = session.scalars(select(Upload).where(Upload.user_id == user.id, media_filter).order_by(Upload.created_at.desc(), Upload.id.desc()).limit(max(1, min(limit, 100))).offset(max(offset, 0))).all()
    return [{'id': row.id, 'content_type': row.content_type, 'created_at': row.created_at.isoformat() + 'Z', 'url': f'/api/uploads/{row.id}/content'} for row in rows]

@app.post('/api/uploads/video', status_code=201)
async def upload_video(file: UploadFile = File(...), user: User = Depends(current_user), session: DBSession = Depends(db)):
    directory = cfg.path(cfg.upload_dir)
    directory.mkdir(parents=True, exist_ok=True)
    temporary = directory / f'.video-{uuid.uuid4()}'
    digest = hashlib.sha256()
    size = 0
    try:
        with temporary.open('wb') as dest:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > 100 * 1024 * 1024:
                    raise HTTPException(413, '视频不能超过 100 MB')
                digest.update(chunk)
                dest.write(chunk)
        try:
            probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_type:format=format_name', '-of', 'json', str(temporary)], capture_output=True, timeout=15, check=True)
            info = json.loads(probe.stdout)
            formats = set(info.get('format', {}).get('format_name', '').split(','))
            if not info.get('streams') or not formats.intersection({'mov', 'mp4', 'matroska', 'webm'}):
                raise ValueError('unsupported video')
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError):
            raise HTTPException(400, '请上传有效的 MP4、MOV 或 WebM 视频')
        except FileNotFoundError:
            raise HTTPException(503, '服务端未安装视频检查工具')
        sha = digest.hexdigest()
        existing = session.scalar(select(Upload).where(Upload.user_id == user.id, Upload.sha256 == sha))
        if existing:
            path = directory / Path(existing.path).name
            if not path.is_file():
                os.replace(temporary, path)
            return {'id': existing.id, 'deduplicated': True}
        extension, content_type = ('.webm', 'video/webm') if 'webm' in formats else ('.mp4', 'video/mp4')
        upload_id = str(uuid.uuid4())
        path = directory / (upload_id + extension)
        os.replace(temporary, path)
        session.add(Upload(id=upload_id, user_id=user.id, path=path.name, content_type=content_type, sha256=sha))
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            path.unlink(missing_ok=True)
            existing = session.scalar(select(Upload).where(Upload.user_id == user.id, Upload.sha256 == sha))
            if existing:
                return {'id': existing.id, 'deduplicated': True}
            raise
        except Exception:
            session.rollback()
            path.unlink(missing_ok=True)
            raise
        return {'id': upload_id, 'deduplicated': False}
    finally:
        temporary.unlink(missing_ok=True)

@app.get('/api/uploads/{upload_id}/content')
def upload_content(upload_id: str, user: User = Depends(current_user), session: DBSession = Depends(db)):
    upload = session.get(Upload, upload_id)
    if not upload or upload.user_id != user.id:
        raise HTTPException(404, '素材不存在')
    path = cfg.path(cfg.upload_dir) / Path(upload.path).name
    if not path.is_file():
        raise HTTPException(404, '素材文件不存在')
    return FileResponse(path, media_type=upload.content_type, headers={'Cache-Control': 'private, max-age=60', 'X-Content-Type-Options': 'nosniff'})

@app.delete('/api/uploads/{upload_id}')
def delete_upload(upload_id: str, user: User = Depends(current_user), session: DBSession = Depends(db)):
    upload = session.get(Upload, upload_id)
    if not upload or upload.user_id != user.id:
        raise HTTPException(404, '素材不存在')
    in_use = session.scalar(select(Task.id).where(or_(Task.upload_id == upload_id, Task.options['second_upload_id'].as_string() == upload_id, Task.options['video_upload_id'].as_string() == upload_id)).limit(1)) or session.scalar(select(TaskInputAsset.task_id).where(TaskInputAsset.upload_id == upload_id).limit(1))
    if in_use:
        raise HTTPException(409, '素材正在被作品使用，请先删除相关作品')
    path = cfg.path(cfg.upload_dir) / Path(upload.path).name
    session.delete(upload)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, '素材正在被作品使用，请先删除相关作品')
    path.unlink(missing_ok=True)
    return {'deleted': True}

@app.post('/api/tasks', status_code=202)
def create_task(data: TaskInput, user: User = Depends(current_user), session: DBSession = Depends(db), idempotency_key: str | None = Header(default=None, alias='Idempotency-Key')):
    prompt = data.prompt.strip()
    if idempotency_key and not re.fullmatch(r'[A-Za-z0-9._-]{1,128}', idempotency_key):
        raise HTTPException(400, '无效的请求标识')
    payload = data.model_dump()
    payload['prompt'] = prompt
    fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()

    def previous_request():
        record = session.scalar(select(TaskRequest).where(TaskRequest.user_id == user.id, TaskRequest.request_key == idempotency_key))
        if not record:
            return None
        if record.payload_hash != fingerprint:
            raise HTTPException(409, '请求标识已用于其他任务')
        task = session.get(Task, record.task_id)
        if not task:
            raise HTTPException(409, '原任务不存在')
        return task

    if idempotency_key:
        existing = previous_request()
        if existing:
            return serialize(existing)
    for upload_id, expected_type in ((data.upload_id, 'image/'), (data.second_upload_id, 'image/'), (data.video_upload_id, 'video/')):
        if upload_id:
            upload = session.get(Upload, upload_id)
            if not upload or upload.user_id != user.id:
                raise HTTPException(404, '上传素材不存在')
            if not upload.content_type.startswith(expected_type):
                raise HTTPException(422, '上传素材类型不匹配')
    model_config = registry().get(data.model, {})
    if data.mode and data.mode not in model_config.get('modes', []):
        raise HTTPException(422, '当前模型不支持此创作模式')
    if data.mode == 'text-to-video' and (data.upload_id or data.second_upload_id or data.video_upload_id):
        raise HTTPException(422, '文生视频仅支持文字提示词')
    options = {'mode': data.mode, 'quality': data.quality, 'ratio': data.ratio, 'duration': data.duration, 'second_upload_id': data.second_upload_id, 'video_upload_id': data.video_upload_id, 'output_nodes': model_config.get('output_nodes')}
    try:
        workflow = build_workflow(data.model, data.kind, prompt, options, '__INPUT_IMAGE_1__' if data.upload_id else None, '__INPUT_IMAGE_2__' if data.second_upload_id else None, '__INPUT_VIDEO__' if data.video_upload_id else None)
        if data.video_upload_id and data.model in ('Wan SCAIL2 角色替换', 'Wan Animate2 动作迁移'):
            driving = session.get(Upload, data.video_upload_id)
            path = cfg.path(cfg.upload_dir) / Path(driving.path).name
            try:
                probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'json', str(path)], capture_output=True, timeout=120, check=True)
                frame_count = int(json.loads(probe.stdout)['streams'][0]['nb_read_frames'])
            except FileNotFoundError:
                raise HTTPException(503, '服务端未安装视频检查工具')
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError, KeyError, IndexError, OSError):
                raise HTTPException(422, '无法读取驱动视频的帧数')
            workflow = extend_driving_video(workflow, data.model, frame_count)
    except WorkflowError as exc:
        raise HTTPException(422, str(exc))
    task = Task(id=str(uuid.uuid4()), user_id=user.id, kind=data.kind, model=data.model, prompt=prompt, upload_id=data.upload_id, options=options, status='queued', progress=0, outputs=[])
    session.add(task)
    session.flush()
    for position, upload_id in enumerate((data.upload_id, data.second_upload_id, data.video_upload_id)):
        if upload_id:
            session.add(TaskInputAsset(task_id=task.id, position=position, upload_id=upload_id))
    session.add(TaskEvent(id=str(uuid.uuid4()), task_id=task.id, status='queued'))
    input_map = {key: value for key, value in registry()[data.model]['inputs'].items() if key in ('image', 'image2', 'video')}
    session.add(TaskWorkflowSnapshot(task_id=task.id, workflow=workflow, image_inputs=input_map))
    if idempotency_key:
        session.add(TaskRequest(id=str(uuid.uuid4()), user_id=user.id, request_key=idempotency_key, payload_hash=fingerprint, task_id=task.id))
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        if idempotency_key:
            existing = previous_request()
            if existing:
                return serialize(existing)
        raise
    cache_task(task)
    return serialize(task)

@app.get('/api/tasks')
def list_tasks(user: User = Depends(current_user), session: DBSession = Depends(db), limit: int = 30, offset: int = 0, kind: Literal['image', 'video'] | None = None):
    query = select(Task).where(Task.user_id == user.id)
    if kind is not None:
        query = query.where(Task.kind == kind)
    rows = session.scalars(query.order_by(Task.created_at.desc(), Task.id.desc()).limit(max(1, min(limit, 100))).offset(max(offset, 0))).all()
    return [serialize(row) for row in rows]

@app.get('/api/tasks/{task_id}')
def get_task(task_id: str, user: User = Depends(current_user), session: DBSession = Depends(db)):
    task = own_task(session, user, task_id)
    try:
        cached = cache.get(f'task:{task.id}')
        if cached:
            snapshot = json.loads(cached)
            if ('upload_id' in snapshot and snapshot.get('updated_at') == task.updated_at.isoformat() + 'Z'
                and snapshot.get('status') == task.status
                and snapshot.get('progress') == task.progress
                and snapshot.get('error') == task.error
                and len(snapshot.get('outputs', [])) == len(task.outputs or [])):
                snapshot['error'] = redact_service_address(snapshot.get('error'))
                return snapshot
    except (redis.RedisError, ValueError):
        pass
    result = serialize(task)
    cache_task(task)
    return result

@app.post('/api/tasks/{task_id}/cancel')
def cancel_task(task_id: str, user: User = Depends(current_user), session: DBSession = Depends(db)):
    task = session.scalar(select(Task).where(Task.id == task_id, Task.user_id == user.id).with_for_update())
    if not task:
        raise HTTPException(404, '任务不存在')
    if task.status == 'submitting':
        raise HTTPException(409, '任务正在提交，请稍后再取消。')
    if task.status not in ('queued', 'running'):
        raise HTTPException(409, '任务状态已改变，请刷新后重试。')
    if task.status == 'running':
        headers = {'Authorization': f'Bearer {cfg.comfyui_token}'} if cfg.comfyui_token else {}
        try:
            response = httpx.post(cfg.comfyui_url.rstrip('/') + '/api/jobs/' + task.comfy_prompt_id + '/cancel', headers=headers, timeout=10)
            response.raise_for_status()
            if response.json().get('cancelled') is not True:
                raise HTTPException(409, '生成服务未确认取消，任务可能已结束，请稍后刷新。')
        except (httpx.HTTPError, ValueError, TypeError):
            raise HTTPException(502, '无法确认生成服务已取消任务，请稍后重试。')
    for table in (TaskInputAsset, TaskOutput, TaskEvent, TaskRequest, TaskWorkflowSnapshot):
        session.execute(delete(table).where(table.task_id == task_id))
    session.delete(task)
    session.commit()
    try:
        cache.delete(f'task:{task_id}')
    except redis.RedisError:
        pass
    return {'deleted': True}

@app.delete('/api/tasks/{task_id}')
def delete_task(task_id: str, user: User = Depends(current_user), session: DBSession = Depends(db)):
    task = session.scalar(select(Task).where(Task.id == task_id, Task.user_id == user.id).with_for_update())
    if not task:
        raise HTTPException(404, '任务不存在')
    if task.status != 'completed':
        raise HTTPException(409, '只能删除已完成的任务')
    for table in (TaskInputAsset, TaskOutput, TaskEvent, TaskRequest, TaskWorkflowSnapshot):
        session.execute(delete(table).where(table.task_id == task_id))
    session.delete(task)
    session.commit()
    try:
        cache.delete(f'task:{task_id}')
    except redis.RedisError:
        pass
    return {'deleted': True}

@app.get('/api/tasks/{task_id}/events')
def task_events(task_id: str, user: User = Depends(current_user), session: DBSession = Depends(db)):
    own_task(session, user, task_id)
    order = case({'queued': 0, 'submitting': 1, 'running': 2, 'completed': 3, 'failed': 3, 'unknown': 3}, value=TaskEvent.status, else_=4)
    events = session.scalars(select(TaskEvent).where(TaskEvent.task_id == task_id).order_by(TaskEvent.created_at, order, TaskEvent.id)).all()
    return [{'status': event.status, 'message': redact_service_address(event.message), 'created_at': event.created_at.isoformat() + 'Z'} for event in events]

@app.get('/api/tasks/{task_id}/outputs/{index}')
async def output(task_id: str, index: int, request: Request, download: bool = False, user: User = Depends(current_user), session: DBSession = Depends(db)):
    task = own_task(session, user, task_id)
    if index < 0 or index >= len(task.outputs or []):
        raise HTTPException(404, '文件不存在')
    item = task.outputs[index]
    try:
        saved = local_output(task.id, index, item)
    except (OSError, ValueError, TypeError, KeyError):
        saved = None
    if saved is None:
        raise HTTPException(404, '作品文件不存在。')
    path, media_type = saved
    suffix = path.suffix
    return FileResponse(path, media_type=media_type,
                        filename=f'aibox-{task.id}-{index + 1}{suffix}' if download else None,
                        headers={'Cache-Control': 'private, max-age=60', 'X-Content-Type-Options': 'nosniff'})
