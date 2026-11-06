import io
import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

os.environ['COMFYUI_URL'] = 'http://127.0.0.1:1'
os.environ['JWT_SECRET'] = 'test-secret-with-at-least-32-characters-long'
os.environ.setdefault('DATABASE_URL', 'sqlite:////tmp/aibox-backend-test.sqlite3')
os.environ.setdefault('REDIS_URL', 'redis://127.0.0.1:6399/0')
os.environ['UPLOAD_DIR'] = '/tmp/aibox-backend-test-uploads'
os.environ['WORKFLOW_CONFIG'] = '/tmp/aibox-backend-test-workflows/registry.json'

from app.config import settings
from app.db import Base, engine
from app.main import app
from app.workflows import registry

@pytest.fixture(autouse=True)
def setup(tmp_path):
    Base.metadata.drop_all(engine)
    path = Path(settings().workflow_config)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({'demo-image': {'kind': 'image', 'file': 'image.json', 'inputs': {'prompt': '6.text', 'image': '10.image'}}}))
    (path.parent / 'image.json').write_text(json.dumps({'6': {'inputs': {'text': ''}}, '10': {'inputs': {'image': ''}}}))
    registry.cache_clear()
    yield
    registry.cache_clear()

@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client

def register(client, email='test@example.com'):
    return client.post('/api/auth/register', json={'email': email, 'password': 'password123'})

def test_auth_and_task_validation(client):
    assert client.get('/api/auth/me').status_code == 401
    assert register(client).status_code == 201
    assert client.get('/api/auth/me').json()['email'] == 'test@example.com'
    assert client.post('/api/tasks', json={'kind':'image','model':'missing','prompt':'hello'}).status_code == 422
    result = client.post('/api/tasks', json={'kind':'image','model':'demo-image','prompt':'hello'})
    assert result.status_code == 202
    assert result.json()['status'] == 'queued'
    task_id = result.json()['id']
    assert client.get('/api/tasks/' + task_id).json()['prompt'] == 'hello'
    assert client.post('/api/auth/logout').status_code == 200
    assert client.get('/api/tasks/' + task_id).status_code == 401
    assert client.post('/api/auth/login', json={'email':'test@example.com','password':'badpassword'}).status_code == 401
    assert client.post('/api/auth/login', json={'email':'test@example.com','password':'password123'}).status_code == 200

def test_upload_and_ownership(client):
    register(client)
    image = io.BytesIO()
    Image.new('RGB', (4, 4), 'red').save(image, format='PNG')
    assert client.post('/api/uploads', files={'file': ('fake.png', b'not an image', 'image/png')}).status_code == 400
    result = client.post('/api/uploads', files={'file': ('image.png', image.getvalue(), 'image/png')})
    assert result.status_code == 201
    upload_id = result.json()['id']
    task = client.post('/api/tasks', json={'kind':'image','model':'demo-image','prompt':'draw','upload_id':upload_id}).json()
    client.post('/api/auth/logout')
    register(client, 'another@example.com')
    assert client.get('/api/tasks/' + task['id']).status_code == 404
    assert client.post('/api/tasks', json={'kind':'image','model':'demo-image','prompt':'draw','upload_id':upload_id}).status_code == 404

def test_worker_submits_once_and_polls(client, monkeypatch):
    from app import worker
    register(client)
    task = client.post('/api/tasks', json={'kind':'image','model':'demo-image','prompt':'draw'}).json()
    calls = []
    class FakeResponse:
        status_code = 200
        def __init__(self, payload): self.payload = payload
        def raise_for_status(self): pass
        def json(self): return self.payload
    class FakeClient:
        def __init__(self, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, json):
            calls.append(json)
            return FakeResponse({'prompt_id': json['prompt_id']})
        def get(self, url):
            prompt_id = url.rsplit('/', 1)[-1]
            return FakeResponse({prompt_id: {'status': {'completed': True}, 'outputs': {'9': {'images': [{'filename':'test.png', 'subfolder':'', 'type':'output'}]}}}})
    monkeypatch.setattr(worker.httpx, 'Client', FakeClient)
    assert worker.claim() == task['id']
    assert worker.claim() is None
    worker.submit(task['id'])
    assert len(calls) == 1
    assert calls[0]['prompt']['6']['inputs']['text'] == 'draw'
    worker.poll_running()
    result = client.get('/api/tasks/' + task['id']).json()
    assert result['status'] == 'completed'
    assert len(result['outputs']) == 1

def test_rejects_cross_origin_mutation(client):
    result = client.post('/api/auth/register', headers={'Origin':'https://attacker.example'}, json={'email':'test@example.com','password':'password123'})
    assert result.status_code == 403

def test_uncertain_submission_is_not_requeued(client, monkeypatch):
    import httpx
    from app import worker
    register(client)
    task = client.post('/api/tasks', json={'kind':'image','model':'demo-image','prompt':'draw'}).json()
    class FailingClient:
        def __init__(self, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, json): raise httpx.ConnectError('disconnected')
    monkeypatch.setattr(worker.httpx, 'Client', FailingClient)
    assert worker.claim() == task['id']
    worker.submit(task['id'])
    assert client.get('/api/tasks/' + task['id']).json()['status'] == 'unknown'
    assert worker.claim() is None

def test_minimax_requires_two_owned_images_and_maps_inputs(client):
    import shutil
    from app.workflows import build_workflow, WorkflowError
    source = Path(__file__).resolve().parents[1] / 'workflows'
    target = Path(settings().workflow_config).parent
    shutil.copy(source / 'minimax_h3_r2v.json', target / 'minimax_h3_r2v.json')
    shutil.copy(source / 'registry.json', target / 'registry.json')
    registry.cache_clear()
    options = {'ratio': '9:16', 'duration': '5s', 'quality': '540P'}
    with pytest.raises(WorkflowError, match='第二张'):
        build_workflow('MiniMax H3 参考图转视频', 'video', 'test', options, 'first.png')
    result = build_workflow('MiniMax H3 参考图转视频', 'video', 'test', options, 'first.png', 'second.png')
    assert result['137']['inputs']['image'] == 'first.png'
    assert result['139']['inputs']['image'] == 'second.png'
    assert result['138']['inputs']['value'] == 'test'
    assert result['115']['inputs']['aspect_ratio'] == '9:16 (Portrait Widescreen)'
    assert result['132']['inputs']['value'] == 5
    assert 0 <= result['129']['inputs']['noise_seed'] < 2**31
    assert result['146']['inputs']['value'] is False
    register(client)
    img = io.BytesIO()
    Image.new('RGB', (4, 4), 'red').save(img, format='PNG')
    first = client.post('/api/uploads', files={'file': ('first.png', img.getvalue(), 'image/png')}).json()['id']
    data = {'kind':'video', 'model':'MiniMax H3 参考图转视频', 'prompt':'test', 'upload_id':first}
    assert client.post('/api/tasks', json=data).status_code == 422
    second = client.post('/api/uploads', files={'file': ('second.png', img.getvalue(), 'image/png')}).json()['id']
    data['second_upload_id'] = second
    assert client.post('/api/tasks', json=data).status_code == 202
    client.post('/api/auth/logout')
    register(client, 'another@example.com')
    assert client.post('/api/tasks', json=data).status_code == 404

def test_worker_uploads_both_minimax_references_once(client, monkeypatch):
    import shutil
    from app import worker
    source = Path(__file__).resolve().parents[1] / 'workflows'
    target = Path(settings().workflow_config).parent
    shutil.copy(source / 'minimax_h3_r2v.json', target / 'minimax_h3_r2v.json')
    shutil.copy(source / 'registry.json', target / 'registry.json')
    registry.cache_clear()
    register(client)
    image = io.BytesIO()
    Image.new('RGB', (4, 4), 'red').save(image, format='PNG')
    ids = [client.post('/api/uploads', files={'file': (f'{i}.png', image.getvalue(), 'image/png')}).json()['id'] for i in range(2)]
    task = client.post('/api/tasks', json={'kind':'video', 'model':'MiniMax H3 参考图转视频', 'prompt':'test', 'upload_id':ids[0], 'second_upload_id':ids[1]}).json()
    uploads, submissions = [], []
    class FakeResponse:
        status_code = 200
        def __init__(self, payload): self.payload = payload
        def raise_for_status(self): pass
        def json(self): return self.payload
    class FakeClient:
        def __init__(self, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, **kwargs):
            if url.endswith('/upload/image'):
                name = kwargs['files']['image'][0]
                uploads.append(name)
                return FakeResponse({'name': name, 'subfolder': ''})
            submissions.append(kwargs['json'])
            return FakeResponse({'prompt_id': kwargs['json']['prompt_id']})
    monkeypatch.setattr(worker.httpx, 'Client', FakeClient)
    assert worker.claim() == task['id']
    worker.submit(task['id'])
    assert len(uploads) == 2 and len(submissions) == 1
    assert submissions[0]['prompt']['137']['inputs']['image'] == uploads[0]
    assert submissions[0]['prompt']['139']['inputs']['image'] == uploads[1]
    assert client.get('/api/tasks/' + task['id']).json()['status'] == 'running'

def test_task_listing_filters_kind_and_user(client):
    from app.db import Session, Task, User
    from sqlalchemy import select
    register(client)
    with Session.begin() as session:
        user = session.scalar(select(User).where(User.email == 'test@example.com'))
        session.add_all([
            Task(id='video-test', user_id=user.id, kind='video', model='video', prompt='video prompt', status='completed', outputs=[]),
            Task(id='image-test', user_id=user.id, kind='image', model='image', prompt='image prompt', status='completed', outputs=[]),
        ])
    assert {task['id'] for task in client.get('/api/tasks').json()} == {'video-test', 'image-test'}
    assert [task['id'] for task in client.get('/api/tasks?kind=video').json()] == ['video-test']
    assert [task['id'] for task in client.get('/api/tasks?kind=image').json()] == ['image-test']
    assert client.get('/api/tasks?kind=audio').status_code == 422
    client.post('/api/auth/logout')
    register(client, 'another@example.com')
    assert client.get('/api/tasks?kind=video').json() == []

def test_task_listing_paginates_with_kind_filter(client):
    from app.db import Session, Task, User
    from sqlalchemy import select
    import uuid
    register(client)
    with Session.begin() as session:
        user = session.scalar(select(User).where(User.email == 'test@example.com'))
        session.add_all([Task(id=str(uuid.uuid4()), user_id=user.id, kind='video', model='video', prompt=f'video {i}', status='completed', outputs=[]) for i in range(35)])
        session.add(Task(id=str(uuid.uuid4()), user_id=user.id, kind='image', model='image', prompt='image', status='completed', outputs=[]))
    first = client.get('/api/tasks?kind=video&limit=30&offset=0').json()
    second = client.get('/api/tasks?kind=video&limit=30&offset=30').json()
    assert len(first) == 30 and len(second) == 5
    assert len({task['id'] for task in first + second}) == 35
    assert all(task['kind'] == 'video' for task in first + second)

def test_idempotent_creation_conflict_and_workflow_snapshot(client, monkeypatch):
    from app import worker
    from app.db import Session, TaskInputAsset, TaskEvent, TaskWorkflowSnapshot
    from sqlalchemy import select
    register(client)
    data = {'kind': 'image', 'model': 'demo-image', 'prompt': 'original'}
    first = client.post('/api/tasks', json=data, headers={'Idempotency-Key': 'same-request'})
    assert first.status_code == 202
    again = client.post('/api/tasks', json=data, headers={'Idempotency-Key': 'same-request'})
    assert again.json()['id'] == first.json()['id']
    assert client.post('/api/tasks', json={**data, 'prompt': 'different'}, headers={'Idempotency-Key': 'same-request'}).status_code == 409
    assert len(client.get('/api/tasks').json()) == 1
    with Session() as session:
        assert session.get(TaskWorkflowSnapshot, first.json()['id']).workflow['6']['inputs']['text'] == 'original'
        assert [e.status for e in session.scalars(select(TaskEvent).where(TaskEvent.task_id == first.json()['id'])).all()] == ['queued']
        assert session.scalars(select(TaskInputAsset).where(TaskInputAsset.task_id == first.json()['id'])).all() == []
    # Editing the registered workflow after queuing cannot change this task.
    (Path(settings().workflow_config).parent / 'image.json').write_text(json.dumps({'6': {'inputs': {'text': 'changed'}}}))
    sent = []
    class FakeResponse:
        status_code = 200
        def raise_for_status(self): pass
        def json(self): return {'prompt_id': sent[-1]['prompt_id']}
    class FakeClient:
        def __init__(self, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, json): sent.append(json); return FakeResponse()
    monkeypatch.setattr(worker.httpx, 'Client', FakeClient)
    assert worker.claim() == first.json()['id']
    worker.submit(first.json()['id'])
    assert sent[0]['prompt']['6']['inputs']['text'] == 'original'
    assert client.get('/api/tasks/' + first.json()['id']).json()['status'] == 'running'

def test_stale_worker_cannot_overwrite_completed_task(client):
    from app import worker
    register(client)
    task = client.post('/api/tasks', json={'kind': 'image', 'model': 'demo-image', 'prompt': 'test'}).json()
    assert worker.claim() == task['id']
    assert worker.update(task['id'], 'running', expected={'submitting'})
    assert worker.update(task['id'], 'completed', outputs=[{'filename':'result.png','type':'output','subfolder':''}], expected={'running'})
    assert not worker.update(task['id'], 'unknown', expected={'submitting'})
    assert client.get('/api/tasks/' + task['id']).json()['status'] == 'completed'

def test_upload_library_is_private(client):
    register(client)
    image = io.BytesIO()
    Image.new('RGB', (4, 4), 'red').save(image, format='PNG')
    upload = client.post('/api/uploads', files={'file': ('image.png', image.getvalue(), 'image/png')}).json()
    assert [item['id'] for item in client.get('/api/uploads').json()] == [upload['id']]
    assert client.get('/api/uploads/' + upload['id'] + '/content').content == image.getvalue()
    client.post('/api/auth/logout')
    register(client, 'another@example.com')
    assert client.get('/api/uploads').json() == []
    assert client.get('/api/uploads/' + upload['id'] + '/content').status_code == 404

def test_legacy_migration_is_additive_and_restartable(tmp_path):
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session as LocalSession
    from app.db import Base, User, Upload, Task, TaskInputAsset, TaskOutput, TaskEvent, SchemaMigration
    from app.migrate import migrate, VERSION
    isolated = create_engine(f'sqlite:///{tmp_path}/legacy.sqlite')
    Base.metadata.create_all(isolated, tables=[User.__table__, Upload.__table__, Task.__table__])
    with LocalSession(isolated) as session:
        session.add(User(id='user', email='legacy@example.com', password_hash='hash'))
        session.flush()
        session.add(Upload(id='upload1', user_id='user', path='one.png', content_type='image/png'))
        session.add(Upload(id='upload2', user_id='user', path='two.png', content_type='image/png'))
        session.flush()
        session.add(Task(id='legacy', user_id='user', kind='video', model='legacy model', prompt='keep this', upload_id='upload1', options={'second_upload_id':'upload2'}, status='completed', outputs=[{'filename':'result.mp4', 'subfolder':'video', 'type':'output'}]))
        session.commit()
    migrate(isolated)
    migrate(isolated)
    with LocalSession(isolated) as session:
        task = session.get(Task, 'legacy')
        assert task.prompt == 'keep this' and task.outputs[0]['filename'] == 'result.mp4'
        assert session.get(TaskInputAsset, ('legacy', 0)).upload_id == 'upload1'
        assert session.get(TaskInputAsset, ('legacy', 1)).upload_id == 'upload2'
        assert session.get(TaskOutput, ('legacy', 0)).filename == 'result.mp4'
        assert len(session.scalars(select(TaskEvent).where(TaskEvent.task_id == 'legacy')).all()) == 1
        assert session.get(SchemaMigration, VERSION)
    isolated.dispose()

def test_parallel_idempotent_requests_create_one_task(client):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from app.db import engine
    if engine.dialect.name != 'mysql':
        pytest.skip('Requires MySQL row locking and unique-key behavior')
    register(client)
    token = client.cookies.get('session_token')
    barrier = Barrier(2)
    def submit():
        barrier.wait(timeout=10)
        return client.post('/api/tasks', cookies={'session_token': token}, headers={'Idempotency-Key': 'parallel-test'}, json={'kind':'image','model':'demo-image','prompt':'parallel'})
    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(lambda _: submit(), range(2)))
    assert [response.status_code for response in responses] == [202, 202]
    assert responses[0].json()['id'] == responses[1].json()['id']
    assert len(client.get('/api/tasks').json()) == 1

def test_qwen_text_to_image_workflow_has_correct_prompt_ratio_seed(client):
    import shutil
    from app.workflows import build_workflow, WorkflowError
    source = Path(__file__).resolve().parents[1] / 'workflows'
    target = Path(settings().workflow_config).parent
    shutil.copy(source / 'qwen_image_2_1_t2i.json', target / 'qwen_image_2_1_t2i.json')
    shutil.copy(source / 'registry.json', target / 'registry.json')
    registry.cache_clear()
    workflow = build_workflow('Qwen Image 2.1 文生图', 'image', '一只猫在花园里', {'ratio':'1:1', 'duration':'5s', 'quality':'540P'}, None)
    assert workflow['459:474']['inputs']['on_false'] == '一只猫在花园里'
    assert workflow['459:474']['inputs']['switch'] is False
    assert workflow['13']['inputs']['aspect_ratio'] == '1:1 (Square)'
    assert workflow['13']['inputs']['megapixels'] == 1
    assert 0 <= workflow['459:458']['inputs']['seed'] < 2**31
    with pytest.raises(WorkflowError, match='不支持图片'):
        build_workflow('Qwen Image 2.1 文生图', 'image', 'test', {'ratio':'1:1'}, 'unexpected.png')

def test_expired_poll_checks_history_before_marking_unknown(client, monkeypatch):
    from datetime import timedelta
    from app import worker
    from app.db import Session, Task, utcnow
    register(client)
    task = client.post('/api/tasks', json={'kind':'image','model':'demo-image','prompt':'test'}).json()
    assert worker.claim() == task['id']
    worker.update(task['id'], 'running', expected={'submitting'})
    with Session.begin() as session:
        row = session.get(Task, task['id'])
        row.updated_at = utcnow() - timedelta(seconds=worker.cfg.task_timeout_seconds + 10)
    class FakeResponse:
        def __init__(self, prompt_id): self.prompt_id = prompt_id
        def raise_for_status(self): pass
        def json(self): return {self.prompt_id: {'status': {'completed': True}, 'outputs': {'9': {'images': [{'filename':'result.png','type':'output'}]}}}}
    class FakeClient:
        def __init__(self, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def get(self, url): return FakeResponse(url.rsplit('/', 1)[-1])
    worker._poll_cursor = None
    monkeypatch.setattr(worker.httpx, 'Client', FakeClient)
    worker.poll_running()
    assert client.get('/api/tasks/' + task['id']).json()['status'] == 'completed'

def test_task_event_history_is_owned_and_ordered(client):
    from app import worker
    register(client)
    task = client.post('/api/tasks', json={'kind':'image','model':'demo-image','prompt':'events'}).json()
    assert worker.claim() == task['id']
    assert worker.update(task['id'], 'running', expected={'submitting'})
    assert worker.update(task['id'], 'completed', outputs=[{'filename':'done.png','type':'output'}], expected={'running'})
    assert [event['status'] for event in client.get('/api/tasks/' + task['id'] + '/events').json()] == ['queued', 'submitting', 'running', 'completed']
    client.post('/api/auth/logout')
    register(client, 'another@example.com')
    assert client.get('/api/tasks/' + task['id'] + '/events').status_code == 404

def test_invalid_workflow_choice_reports_useful_error(client):
    import shutil
    from app.workflows import build_workflow, WorkflowError
    source = Path(__file__).resolve().parents[1] / 'workflows'
    target = Path(settings().workflow_config).parent
    shutil.copy(source / 'qwen_image_2_1_t2i.json', target / 'qwen_image_2_1_t2i.json')
    shutil.copy(source / 'registry.json', target / 'registry.json')
    registry.cache_clear()
    with pytest.raises(WorkflowError, match='不支持该ratio'):
        build_workflow('Qwen Image 2.1 文生图', 'image', 'test', {'ratio':'auto'}, None)

def test_image_edit_optional_second_image(client):
    import shutil
    from app.workflows import build_workflow, WorkflowError
    source = Path(__file__).resolve().parents[1] / 'workflows'
    target = Path(settings().workflow_config).parent
    for name in ('registry.json', 'qwen_image_2_1_image_edit.json'):
        shutil.copy(source / name, target / name)
    registry.cache_clear()
    model = 'Qwen Image 2.1 图片编辑'
    assert next(item for item in client.get('/api/models').json() if item['id'] == model)['requires_second_image'] is False
    one = build_workflow(model, 'image', '修改背景', {}, 'first.png')
    assert one['470']['inputs']['image'] == 'first.png'
    assert one['502']['inputs']['image'] == 'None'
    assert one['459:484']['inputs']['on_false'] == '修改背景'
    two = build_workflow(model, 'image', '修改背景', {}, 'first.png', 'second.png')
    assert two['502']['inputs']['image'] == 'second.png'
    with pytest.raises(WorkflowError, match='第一张'):
        build_workflow(model, 'image', '修改背景', {}, None)

def test_delete_completed_task_requires_ownership_and_preserves_upload(client):
    from app.db import Session, Task, Upload
    register(client)
    image = io.BytesIO()
    Image.new('RGB', (4, 4), 'red').save(image, format='PNG')
    upload_id = client.post('/api/uploads', files={'file': ('image.png', image.getvalue(), 'image/png')}).json()['id']
    task = client.post('/api/tasks', json={'kind':'image','model':'demo-image','prompt':'edit','upload_id':upload_id}).json()
    assert task['upload_id'] == upload_id
    assert client.delete('/api/tasks/' + task['id']).status_code == 409
    with Session.begin() as session:
        session.get(Task, task['id']).status = 'completed'
    client.post('/api/auth/logout')
    register(client, 'other@example.com')
    assert client.delete('/api/tasks/' + task['id']).status_code == 404
    client.post('/api/auth/logout')
    assert client.post('/api/auth/login', json={'email':'test@example.com','password':'password123'}).status_code == 200
    assert client.delete('/api/tasks/' + task['id']).status_code == 200
    assert client.get('/api/tasks/' + task['id']).status_code == 404
    with Session() as session:
        assert session.get(Upload, upload_id) is not None

def test_upload_deduplicates_per_user_and_restores_missing_file(client):
    from app.db import Session, Upload
    register(client)
    img = io.BytesIO()
    Image.new('RGB', (8, 8), 'blue').save(img, format='PNG')
    content = img.getvalue()
    first = client.post('/api/uploads', files={'file': ('one.png', content, 'image/png')}).json()
    again = client.post('/api/uploads', files={'file': ('renamed.png', content, 'image/png')}).json()
    assert first['id'] == again['id'] and again['deduplicated'] is True
    assert len(client.get('/api/uploads').json()) == 1
    with Session() as session:
        row = session.get(Upload, first['id'])
        path = settings().path(settings().upload_dir) / row.path
    path.unlink()
    assert client.post('/api/uploads', files={'file': ('again.png', content, 'image/png')}).json()['id'] == first['id']
    assert path.read_bytes() == content
    client.post('/api/auth/logout')
    register(client, 'other@example.com')
    other = client.post('/api/uploads', files={'file': ('one.png', content, 'image/png')}).json()
    assert other['id'] != first['id'] and not other['deduplicated']


def test_upload_dedup_migration_remaps_legacy_tasks(tmp_path, monkeypatch):
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session as LocalSession
    from app.db import User, Upload, Task, TaskInputAsset
    from app.migrate import migrate
    monkeypatch.setattr(settings(), 'upload_dir', str(tmp_path))
    (tmp_path / 'a.png').write_bytes(b'identical image')
    (tmp_path / 'b.png').write_bytes(b'identical image')
    isolated = create_engine('sqlite:///' + str(tmp_path / 'db.sqlite'))
    Base.metadata.create_all(isolated)
    with LocalSession(isolated) as session:
        session.add(User(id='u', email='u@example.com', password_hash='test'))
        session.add_all([Upload(id='a', user_id='u', path='a.png', content_type='image/png'), Upload(id='b', user_id='u', path='b.png', content_type='image/png')])
        session.flush()
        session.add(Task(id='t', user_id='u', kind='image', model='test', prompt='test', upload_id='b', options={'second_upload_id':'b'}, status='completed', outputs=[]))
        session.commit()
    migrate(isolated)
    migrate(isolated)
    with LocalSession(isolated) as session:
        uploads = session.scalars(select(Upload)).all()
        assert len(uploads) == 1 and uploads[0].sha256
        task = session.get(Task, 't')
        assert task.upload_id == uploads[0].id and task.options['second_upload_id'] == uploads[0].id
        assert session.get(TaskInputAsset, ('t', 0)).upload_id == uploads[0].id
        assert session.get(TaskInputAsset, ('t', 1)).upload_id == uploads[0].id
    isolated.dispose()

def test_parallel_uploads_reuse_one_asset(client):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    register(client)
    token = client.cookies.get('session_token')
    image = io.BytesIO()
    Image.new('RGB', (10, 10), 'green').save(image, format='PNG')
    content = image.getvalue()
    barrier = Barrier(2)
    def upload():
        barrier.wait(timeout=10)
        return client.post('/api/uploads', cookies={'session_token': token}, files={'file': ('image.png', content, 'image/png')})
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: upload(), range(2)))
    assert [r.status_code for r in responses] == [201, 201]
    assert responses[0].json()['id'] == responses[1].json()['id']
    assert len(client.get('/api/uploads').json()) == 1

def test_three_video_workflows_map_inputs_and_requirements(client):
    import shutil
    from app.workflows import build_workflow, WorkflowError
    source = Path(__file__).resolve().parents[1] / 'workflows'
    target = Path(settings().workflow_config).parent
    for name in ('registry.json', 'pika_h3_flex_ref2va.json', 'wan21_scail2_character_replacement.json', 'wan_animate2_distilled.json'):
        shutil.copy(source / name, target / name)
    registry.cache_clear()
    options = {'ratio':'16:9', 'duration':'5s'}
    pika = build_workflow('Pika H3 参考图生视频','video','测试',options,None,None)
    assert pika['152']['inputs']['image'] == 'None' and pika['151']['inputs']['image'] == 'None'
    pika2 = build_workflow('Pika H3 参考图生视频','video','测试',options,'one.png','two.png')
    assert pika2['152']['inputs']['image'] == 'one.png' and pika2['151']['inputs']['image'] == 'two.png'
    with pytest.raises(WorkflowError, match='提示词'):
        build_workflow('Pika H3 参考图生视频','video','',options,None,None)
    for model, image_node, video_node in [('Wan SCAIL2 角色替换','30','155'),('Wan Animate2 动作迁移','189','240')]:
        with pytest.raises(WorkflowError, match='驱动视频'):
            build_workflow(model,'video','',options,'ref.png')
        graph = build_workflow(model,'video','自定义内容',options,'ref.png',None,'drive.mp4')
        assert graph[image_node]['inputs']['image'] == 'ref.png' and graph[video_node]['inputs']['file'] == 'drive.mp4'
    assert build_workflow('Wan SCAIL2 角色替换','video','自定义内容',options,'ref.png',None,'drive.mp4')['262:258']['inputs']['text'] == '自定义内容'


def test_video_upload_and_task_snapshot(client, tmp_path, monkeypatch):
    import shutil, subprocess
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        pytest.skip('ffmpeg and ffprobe required')
    source = Path(__file__).resolve().parents[1] / 'workflows'
    target = Path(settings().workflow_config).parent
    for name in ('registry.json', 'wan_animate2_distilled.json'):
        shutil.copy(source / name, target / name)
    registry.cache_clear()
    register(client)
    image = io.BytesIO()
    Image.new('RGB', (8, 8), 'red').save(image, format='PNG')
    image_id = client.post('/api/uploads', files={'file': ('ref.png', image.getvalue(), 'image/png')}).json()['id']
    path = tmp_path / 'clip.mp4'
    subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=32x32:d=1','-c:v','mpeg4','-y',str(path)],check=True)
    video = client.post('/api/uploads/video', files={'file': ('clip.mp4', path.read_bytes(), 'video/mp4')})
    assert video.status_code == 201
    assert client.post('/api/uploads/video', files={'file': ('bad.mp4', b'not video', 'video/mp4')}).status_code == 400
    video_id = video.json()['id']
    result = client.post('/api/tasks', json={'kind':'video','model':'Wan Animate2 动作迁移','prompt':'','upload_id':image_id,'video_upload_id':video_id})
    assert result.status_code == 202
    from app.db import Session, TaskInputAsset, TaskWorkflowSnapshot
    with Session() as session:
        assert session.get(TaskInputAsset, (result.json()['id'], 2)).upload_id == video_id
        snap = session.get(TaskWorkflowSnapshot, result.json()['id'])
        assert snap.workflow['240']['inputs']['file'] == '__INPUT_VIDEO__'
        assert snap.image_inputs['video'] == '240.file'
    from app import worker
    uploaded, submitted = [], []
    class FakeResponse:
        status_code = 200
        def __init__(self, data): self.data = data
        def raise_for_status(self): pass
        def json(self): return self.data
    class FakeClient:
        def __init__(self, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, **kwargs):
            if url.endswith('/upload/image'):
                name = kwargs['files']['image'][0]
                uploaded.append(name)
                return FakeResponse({'name': name, 'subfolder': ''})
            submitted.append(kwargs['json'])
            return FakeResponse({'prompt_id': kwargs['json']['prompt_id']})
    monkeypatch.setattr(worker.httpx, 'Client', FakeClient)
    monkeypatch.setattr(worker, 'connect_progress_socket', lambda _id: (_ for _ in ()).throw(OSError('test')))
    monkeypatch.setattr(worker, 'ensure_progress_monitor', lambda *args: None)
    assert worker.claim() == result.json()['id']
    worker.submit(result.json()['id'])
    assert len(uploaded) == 2 and uploaded[1].endswith('.mp4')
    assert submitted[0]['prompt']['240']['inputs']['file'] == uploaded[1]
