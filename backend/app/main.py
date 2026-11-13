import io
import asyncio
import hashlib
import re
import shutil
import json
import math
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
from fastapi import Cookie, Depends, FastAPI, File, Form, HTTPException, Header, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image, UnidentifiedImageError
from pwdlib import PasswordHash
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import case, delete, func, or_, select, union
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from .credits import CreditPricingError, locked_wallet, refund_task, task_credit_cost, today
from .config import settings
from .db import Base, CreditCharge, CreditGrant, CreditWallet, Session, Task, TaskEvent, TaskInputAsset, TaskOutput, TaskRequest, TaskWorkflowSnapshot, Upload, User, VoiceWork, engine
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
    audio_upload_id: str | None = None
    quality: Literal['540P', '720P', '2K', 'auto'] = '540P'
    ratio: Literal['16:9', '9:16', '1:1', 'auto'] = '16:9'
    duration: Literal['5s', '10s', '15s'] = '5s'

def redact_service_address(message: str | None) -> str | None:
    if not message:
        return message
    parsed = urlsplit(cfg.comfyui_url)
    for value in (cfg.comfyui_url.rstrip('/'), parsed.netloc, parsed.hostname):
        if value:
            message = message.replace(value, '[生成服务]')
    return message

def public_task_error(message: str | None, status: str) -> str | None:
    if not message:
        return None
    if status == 'failed':
        return '生成失败，请稍后重试。'
    if status == 'unknown':
        return '暂时无法确认任务结果，请联系客服核实后再重试，避免重复生成。'
    return redact_service_address(message)

def serialize(task: Task) -> dict:
    return {'id': task.id, 'kind': task.kind, 'model': task.model, 'prompt': task.prompt, 'upload_id': task.upload_id, 'status': task.status, 'progress': task.progress, 'options': task.options, 'error': public_task_error(task.error, task.status), 'created_at': task.created_at.isoformat() + 'Z', 'updated_at': task.updated_at.isoformat() + 'Z', 'outputs': [{'url': f'/api/tasks/{task.id}/outputs/{i}'} for i in range(len(task.outputs or []))]}

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

@app.get('/api/credits')
def credit_balance(user: User = Depends(current_user), session: DBSession = Depends(db)):
    wallet = locked_wallet(session, user.id)
    result = {'balance': wallet.balance if wallet.day == today() else 0, 'claimed': wallet.day == today()}
    session.commit()
    return result

@app.post('/api/credits/claim')
def claim_credits(user: User = Depends(current_user), session: DBSession = Depends(db)):
    wallet = locked_wallet(session, user.id)
    if wallet.day != today():
        wallet.day = today()
        wallet.balance = 1000 + wallet.pending_refund
        wallet.pending_refund = 0
    result = {'balance': wallet.balance, 'claimed': True}
    session.commit()
    return result

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

@app.post('/api/uploads/audio', status_code=201)
async def upload_audio(file: UploadFile = File(...), user: User = Depends(current_user), session: DBSession = Depends(db)):
    data = await file.read(3 * 1024 * 1024 + 1)
    if len(data) > 3 * 1024 * 1024:
        raise HTTPException(413, '音频不能超过 3 MB')
    if not data:
        raise HTTPException(400, '音频不能为空')
    try:
        probe = subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-of', 'json', '-i', 'pipe:0'], input=data, capture_output=True, timeout=15)
        streams = json.loads(probe.stdout).get('streams', [])
        if probe.returncode or not streams or any(item.get('codec_type') != 'audio' for item in streams):
            raise ValueError('Invalid audio')
        if data.startswith(b'RIFF') and data[8:12] == b'WAVE':
            ext, content_type = '.wav', 'audio/wav'
        elif data.startswith(b'ID3') or (len(data) > 1 and data[0] == 0xff and data[1] & 0xe0 == 0xe0):
            ext, content_type = '.mp3', 'audio/mpeg'
        elif data.startswith(b'\x1a\x45\xdf\xa3'):
            ext, content_type = '.webm', 'audio/webm'
        else:
            raise ValueError('Unsupported audio')
    except (ValueError, OSError, subprocess.TimeoutExpired):
        raise HTTPException(400, '仅支持有效的 WAV、MP3 或录制的 WebM 音频')
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
    path = directory / (upload_id + ext)
    path.write_bytes(data)
    row = Upload(id=upload_id, user_id=user.id, path=path.name, content_type=content_type, sha256=digest, name=(file.filename or "")[:100] or None)
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

class ExampleAssetInput(BaseModel):
    filename: str
    collection: Literal['examples', 'templates'] = 'examples'

@app.post('/api/example-assets', status_code=201)
def import_example_asset(data: ExampleAssetInput, user: User = Depends(current_user), session: DBSession = Depends(db)):
    pattern = r'(?:reference|replacement|motion)-[1-9][0-9]*-input\.(?:jpg|png|mp4)' if data.collection == 'examples' else r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-input\.(?:jpg|mp4)'
    if not re.fullmatch(pattern, data.filename):
        raise HTTPException(400, '示例素材无效')
    root = cfg.path(cfg.example_dir if data.collection == 'examples' else cfg.template_dir).resolve()
    source = (root / data.filename).resolve()
    if not source.is_relative_to(root) or not source.is_file():
        raise HTTPException(404, '示例素材不存在')
    digest = hashlib.sha256()
    with source.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    sha = digest.hexdigest()
    existing = session.scalar(select(Upload).where(Upload.user_id == user.id, Upload.sha256 == sha))
    if existing:
        return {'id': existing.id}
    suffix = source.suffix.lower()
    content_type = {'.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4'}[suffix]
    upload_id = str(uuid.uuid4())
    directory = cfg.path(cfg.upload_dir)
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / (upload_id + suffix)
    try:
        shutil.copyfile(source, destination)
        session.add(Upload(id=upload_id, user_id=user.id, path=destination.name, content_type=content_type, sha256=sha))
        session.commit()
    except IntegrityError:
        session.rollback()
        destination.unlink(missing_ok=True)
        existing = session.scalar(select(Upload).where(Upload.user_id == user.id, Upload.sha256 == sha))
        if existing: return {'id': existing.id}
        raise
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return {'id': upload_id}

@app.get('/api/uploads')
def list_uploads(user: User = Depends(current_user), session: DBSession = Depends(db), limit: int = 30, offset: int = 0, kind: Literal['image', 'video', 'audio', 'all'] = 'image'):
    media_filter = or_(Upload.content_type.like('image/%'), Upload.content_type.like('video/%'), Upload.content_type.like('audio/%')) if kind == 'all' else Upload.content_type.like(f'{kind}/%')
    rows = session.scalars(select(Upload).where(Upload.user_id == user.id, media_filter).order_by(Upload.created_at.desc(), Upload.id.desc()).limit(max(1, min(limit, 100))).offset(max(offset, 0))).all()
    return [{'id': row.id, 'content_type': row.content_type, 'name': row.name, 'created_at': row.created_at.isoformat() + 'Z', 'url': f'/api/uploads/{row.id}/content'} for row in rows]

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

@app.get('/api/uploads/{upload_id}')
def upload_metadata(upload_id: str, user: User = Depends(current_user), session: DBSession = Depends(db)):
    upload = session.get(Upload, upload_id)
    if not upload or upload.user_id != user.id:
        raise HTTPException(404, '素材不存在')
    return {'id': upload.id, 'content_type': upload.content_type, 'url': f'/api/uploads/{upload.id}/content'}

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

@app.get('/api/credits/quote')
def credit_quote(model: str, kind: str, duration: str = '', video_upload_id: str | None = None, audio_upload_id: str | None = None,
                 user: User = Depends(current_user), session: DBSession = Depends(db)):
    frames = None
    if video_upload_id:
        upload = session.get(Upload, video_upload_id)
        if not upload or upload.user_id != user.id or not upload.content_type.startswith('video/'):
            raise HTTPException(404, '视频素材不存在')
        try:
            probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'json', str(cfg.path(cfg.upload_dir) / Path(upload.path).name)], capture_output=True, timeout=120, check=True)
            frames = int(json.loads(probe.stdout)['streams'][0]['nb_read_frames'])
        except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError, KeyError, IndexError, OSError):
            raise HTTPException(422, '无法读取驱动视频帧数')
    if audio_upload_id:
        upload = session.get(Upload, audio_upload_id)
        if not upload or upload.user_id != user.id or not upload.content_type.startswith('audio/'):
            raise HTTPException(404, '音频素材不存在')
        try:
            probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(cfg.path(cfg.upload_dir) / Path(upload.path).name)], capture_output=True, timeout=30, check=True)
            seconds = float(json.loads(probe.stdout)['format']['duration'])
            if not 0 < seconds <= 150: raise ValueError('duration')
            frames = max(1, math.ceil(seconds * 25))
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError, KeyError, OSError):
            raise HTTPException(422, '驱动音频无法读取或超过 150 秒')
    try:
        return {'cost': task_credit_cost(model, kind, duration, frames)}
    except CreditPricingError as exc:
        raise HTTPException(422, str(exc))

@app.get('/api/digital-human/modes')
def digital_human_modes():
    return [
        {'id': 'audio', 'name': '音频驱动', 'available': True},
        {'id': 'text', 'name': '文本驱动', 'available': False},
        {'id': 'clone', 'name': '声音克隆', 'available': False},
    ]

@app.post('/api/tasks', status_code=202)
def create_task(data: TaskInput, user: User = Depends(current_user), session: DBSession = Depends(db), idempotency_key: str | None = Header(default=None, alias='Idempotency-Key')):
    prompt = data.prompt.strip()
    if data.mode in ('digital-human-text', 'digital-human-clone'):
        raise HTTPException(503, '此数字人模式的工作流尚未配置')
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
    for upload_id, expected_type in ((data.upload_id, 'image/'), (data.second_upload_id, 'image/'), (data.video_upload_id, 'video/'), (data.audio_upload_id, 'audio/')):
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
    options = {'mode': data.mode, 'quality': data.quality, 'ratio': data.ratio, 'duration': data.duration, 'second_upload_id': data.second_upload_id, 'video_upload_id': data.video_upload_id, 'audio_upload_id': data.audio_upload_id, 'output_nodes': model_config.get('output_nodes')}
    frame_count = None
    try:
        workflow = build_workflow(data.model, data.kind, prompt, options, '__INPUT_IMAGE_1__' if data.upload_id else None, '__INPUT_IMAGE_2__' if data.second_upload_id else None, '__INPUT_VIDEO__' if data.video_upload_id else None, '__INPUT_AUDIO__' if data.audio_upload_id else None)
        if data.audio_upload_id and data.model == 'InfiniTalk 音频驱动':
            audio = session.get(Upload, data.audio_upload_id)
            path = cfg.path(cfg.upload_dir) / Path(audio.path).name
            try:
                probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(path)], capture_output=True, timeout=30, check=True)
                seconds = float(json.loads(probe.stdout)['format']['duration'])
                if not 0 < seconds <= 150: raise ValueError('duration')
                frame_count = max(1, math.ceil(seconds * 25))
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError, KeyError, OSError):
                raise HTTPException(422, '驱动音频无法读取或超过 150 秒')
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
    try:
        price = task_credit_cost(data.model, data.kind, data.duration, frame_count)
    except CreditPricingError as exc:
        raise HTTPException(422, str(exc))
    wallet = locked_wallet(session, user.id)
    if idempotency_key:
        existing = previous_request()
        if existing:
            return serialize(existing)
    if wallet.day != today() or wallet.balance < price:
        raise HTTPException(402, '积分不足，请先领取每日积分或调整生成参数。')
    wallet.balance -= price
    task = Task(id=str(uuid.uuid4()), user_id=user.id, kind=data.kind, model=data.model, prompt=prompt, upload_id=data.upload_id, options=options, status='queued', progress=0, outputs=[])
    session.add(task)
    from .db import CreditCharge
    session.add(CreditCharge(task_id=task.id, user_id=user.id, day=today(), amount=price, refunded=False))
    session.flush()
    for position, upload_id in enumerate((data.upload_id, data.second_upload_id, data.video_upload_id, data.audio_upload_id)):
        if upload_id:
            session.add(TaskInputAsset(task_id=task.id, position=position, upload_id=upload_id))
    session.add(TaskEvent(id=str(uuid.uuid4()), task_id=task.id, status='queued'))
    input_map = {key: value for key, value in registry()[data.model]['inputs'].items() if key in ('image', 'image2', 'video', 'audio')}
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

@app.post('/api/tasks/{task_id}/retry', status_code=202)
def retry_task(task_id: str, user: User = Depends(current_user), session: DBSession = Depends(db), idempotency_key: str | None = Header(default=None, alias='Idempotency-Key')):
    task = own_task(session, user, task_id)
    if task.status not in ('failed', 'unknown', 'completed'):
        raise HTTPException(409, '任务尚未结束，请稍后重试。')
    if not idempotency_key:
        raise HTTPException(400, '缺少请求标识，请刷新后重试。')
    if task.status == 'unknown':
        try:
            headers = {'Authorization': f'Bearer {cfg.comfyui_token}'} if cfg.comfyui_token else {}
            response = httpx.get(cfg.comfyui_url.rstrip('/') + '/history/' + task.comfy_prompt_id, headers=headers, timeout=10)
            response.raise_for_status()
            history = response.json().get(task.comfy_prompt_id, {})
            if history.get('status', {}).get('status_str') != 'error':
                raise HTTPException(409, '任务结果仍未确认，暂时无法重试，以免重复生成。')
        except (httpx.HTTPError, ValueError, TypeError):
            raise HTTPException(409, '暂时无法确认原任务结果，请稍后再试。')
    if task.status == 'unknown':
        refund_task(session, task)
        task.status = 'failed'
    options = task.options or {}
    data = TaskInput(kind=task.kind, model=task.model, prompt=task.prompt, upload_id=task.upload_id,
                     second_upload_id=options.get('second_upload_id'), video_upload_id=options.get('video_upload_id'), audio_upload_id=options.get('audio_upload_id'),
                     mode=options.get('mode'), quality=options.get('quality', '540P'), ratio=options.get('ratio', '16:9'), duration=options.get('duration', '5s'))
    return create_task(data, user, session, idempotency_key)

@app.get('/api/tasks')
def list_tasks(user: User = Depends(current_user), session: DBSession = Depends(db), limit: int = 30, offset: int = 0, kind: Literal['image', 'video'] | None = None):
    query = select(Task).where(Task.user_id == user.id)
    if kind is not None:
        query = query.where(Task.kind == kind)
    rows = session.scalars(query.order_by(Task.created_at.desc(), Task.id.desc()).limit(max(1, min(limit, 100))).offset(max(offset, 0))).all()
    pending = {}
    if any(row.status == 'running' for row in rows):
        try:
            headers = {'Authorization': f'Bearer {cfg.comfyui_token}'} if cfg.comfyui_token else {}
            response = httpx.get(cfg.comfyui_url.rstrip('/') + '/queue', headers=headers, timeout=2)
            response.raise_for_status()
            queue = response.json()
            running = queue.get('queue_running', [])
            waiting = sorted(queue.get('queue_pending', []), key=lambda item: item[0])
            pending = {item[1]: len(running) + index for index, item in enumerate(waiting) if len(item) > 1}
        except (httpx.HTTPError, ValueError, TypeError, KeyError, IndexError):
            pass
    result = []
    for row in rows:
        item = serialize(row)
        if row.status == 'running' and row.comfy_prompt_id in pending:
            item['status'] = 'comfy_queued'
            item['queue_ahead'] = pending[row.comfy_prompt_id]
        result.append(item)
    return result

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
                snapshot['error'] = public_task_error(task.error, task.status)
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
    refund_task(session, task)
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
    if task.status not in ('completed', 'failed', 'unknown'):
        raise HTTPException(409, '只能删除已结束或待确认的任务')
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
    return [{'status': event.status, 'message': public_task_error(event.message, event.status), 'created_at': event.created_at.isoformat() + 'Z'} for event in events]

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


@app.post('/api/voice/clone')
async def clone_voice(text: str = Form(...), audio: UploadFile = File(...), voice_name: str = Form(""), user: User = Depends(current_user), session: DBSession = Depends(db)):
    text = text.strip()
    if not text or len(text) > 2000:
        raise HTTPException(400, '请输入不超过 2000 字的文本')
    voice_name = voice_name.strip()
    if len(voice_name) > 100:
        raise HTTPException(400, '音色名称不能超过 100 个字符')
    data = await audio.read(3 * 1024 * 1024 + 1)
    if not data or len(data) > 3 * 1024 * 1024:
        raise HTTPException(400, '音频不能为空且不能超过 3 MB')
    if data.startswith(b'RIFF') and data[8:12] == b'WAVE':
        filename, mime = 'sample.wav', 'audio/wav'
    elif data.startswith(b'ID3') or (len(data) > 1 and data[0] == 0xff and data[1] & 0xe0 == 0xe0):
        filename, mime = 'sample.mp3', 'audio/mpeg'
    elif data.startswith(b'\x1a\x45\xdf\xa3'):
        filename, mime = 'sample.webm', 'audio/webm'
    else:
        raise HTTPException(400, '请选择 WAV、MP3 或浏览器录制的 WebM 音频')
    if not cfg.tts_api_url:
        raise HTTPException(503, '声音生成服务尚未配置')
    try:
        async with httpx.AsyncClient(timeout=300, follow_redirects=False) as client:
            result = await client.post(cfg.tts_api_url, data={'text': text, 'emo_control_method': '2'}, files={'audio': (filename, data, mime)})
        if result.status_code != 200 or not result.content.startswith(b'RIFF') or result.content[8:12] != b'WAVE':
            raise HTTPException(502, '声音生成服务返回异常，请稍后重试')
        work_id = str(uuid.uuid4())
        path = cfg.path(cfg.upload_dir) / f'voice-work-{work_id}.wav'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(result.content)
        try:
            session.add(VoiceWork(id=work_id, user_id=user.id, text=text, voice_name=voice_name or None, path=path.name))
            session.commit()
        except Exception:
            path.unlink(missing_ok=True)
            raise
        return Response(result.content, media_type='audio/wav', headers={'Cache-Control': 'no-store'})
    except httpx.HTTPError:
        raise HTTPException(502, '声音生成服务暂时不可用，请稍后重试')


@app.get('/api/voice/works')
def voice_works(user: User = Depends(current_user), session: DBSession = Depends(db)):
    rows = session.scalars(select(VoiceWork).where(VoiceWork.user_id == user.id).order_by(VoiceWork.created_at.desc(), VoiceWork.id.desc()).limit(100)).all()
    return [{'id': row.id, 'text': row.text, 'voice_name': row.voice_name, 'created_at': row.created_at.isoformat() + 'Z', 'url': f'/api/voice/works/{row.id}/content'} for row in rows]

@app.get('/api/voice/works/{work_id}/content')
def voice_work_content(work_id: str, user: User = Depends(current_user), session: DBSession = Depends(db)):
    row = session.get(VoiceWork, work_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, '作品不存在')
    path = cfg.path(cfg.upload_dir) / Path(row.path).name
    if not path.is_file():
        raise HTTPException(404, '作品文件不存在')
    return FileResponse(path, media_type='audio/wav', headers={'Cache-Control': 'private, no-store'})

@app.delete('/api/voice/works/{work_id}')
def delete_voice_work(work_id: str, user: User = Depends(current_user), session: DBSession = Depends(db)):
    row = session.get(VoiceWork, work_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, '作品不存在')
    path = cfg.path(cfg.upload_dir) / Path(row.path).name
    session.delete(row)
    session.commit()
    path.unlink(missing_ok=True)
    return {'ok': True}


# Administrative access is opt-in and always checked on the server.
def current_admin(user: User = Depends(current_user)) -> User:
    if user.id not in {item.strip() for item in cfg.admin_user_ids.split(',') if item.strip()}:
        raise HTTPException(403, '无权访问管理后台')
    return user

@app.get('/api/admin/me')
def admin_me(user: User = Depends(current_admin)):
    return {'id': user.id, 'email': user.email}

class AdminCreditInput(BaseModel):
    amount: int = Field(strict=True, ge=1, le=1000000)
    request_id: uuid.UUID

@app.post('/api/admin/users/{user_id}/credits')
def admin_grant_credits(user_id: str, data: AdminCreditInput, admin: User = Depends(current_admin), session: DBSession = Depends(db)):
    target = session.scalar(select(User).where(User.id == user_id).with_for_update())
    if not target:
        raise HTTPException(404, '用户不存在')
    grant_id = str(data.request_id)
    existing = session.get(CreditGrant, grant_id)
    if existing:
        if existing.user_id != user_id or existing.admin_id != admin.id or existing.amount != data.amount:
            raise HTTPException(409, '请求编号已用于其他加分操作')
        return {'balance': existing.balance_after}
    wallet = locked_wallet(session, user_id)
    if wallet.day != today():
        wallet.day = today()
        wallet.balance = 1000 + wallet.pending_refund
        wallet.pending_refund = 0
    if wallet.balance > 2147483647 - data.amount:
        raise HTTPException(422, '积分余额超出上限')
    wallet.balance += data.amount
    session.add(CreditGrant(id=grant_id, user_id=user_id, admin_id=admin.id, amount=data.amount, balance_after=wallet.balance))
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, '请求编号已用于其他加分操作')
    return {'balance': wallet.balance}

@app.get('/api/admin/stats')
def admin_stats(user: User = Depends(current_admin), session: DBSession = Depends(db)):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    result = []
    for label, hours in [('24h', 24), ('7d', 168), ('30d', 720), ('all', None)]:
        since = now - timedelta(hours=hours) if hours else None
        def count(model, *conditions):
            q = select(func.count()).select_from(model).where(*conditions)
            if since: q = q.where(model.created_at >= since)
            return session.scalar(q) or 0
        activity = []
        for model in (Task, VoiceWork, Upload):
            q = select(model.user_id)
            if since: q = q.where(model.created_at >= since)
            activity.append(q)
        active_users = session.scalar(select(func.count()).select_from(union(*activity).subquery())) or 0
        charge_query = select(func.coalesce(func.sum(CreditCharge.amount), 0)).where(CreditCharge.refunded.is_(False))
        # Charges only retain a Shanghai calendar date, not an exact timestamp.
        days = {'24h': 1, '7d': 7, '30d': 30}.get(label)
        if days: charge_query = charge_query.where(CreditCharge.day >= (datetime.fromisoformat(today()).date() - timedelta(days=days - 1)).isoformat(), CreditCharge.day <= today())
        credits = session.scalar(charge_query) or 0
        result.append({'window': label, 'users': count(User), 'active_users': active_users, 'credits': credits, 'image': count(Task, Task.kind == 'image'), 'video': count(Task, Task.kind == 'video'), 'voice': count(VoiceWork), 'uploads': count(Upload), 'failed': count(Task, Task.status == 'failed')})
    return result

@app.get('/api/admin/items')
def admin_items(category: Literal['tasks', 'voice', 'uploads', 'users'] = 'tasks', kind: str = '', window: Literal['24h', '7d', '30d', 'all'] = 'all', offset: int = 0, limit: int = 24, user: User = Depends(current_admin), session: DBSession = Depends(db)):
    models = {'tasks': Task, 'voice': VoiceWork, 'uploads': Upload, 'users': User}
    model = models[category]
    query = select(model) if category == 'users' else select(model, User.email).join(User, model.user_id == User.id)
    hours = {'24h': 24, '7d': 168, '30d': 720}.get(window)
    if hours and category != 'users': query = query.where(model.created_at >= datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=hours))
    if category == 'tasks' and kind in ('image', 'video'): query = query.where(Task.kind == kind)
    if category == 'uploads' and kind in ('image', 'video', 'audio'): query = query.where(Upload.content_type.like(f'{kind}/%'))
    limit = max(1, min(limit, 100)); offset = max(0, offset)
    order = (case((User.id == user.id, 0), else_=1), User.created_at.desc(), User.id.desc()) if category == 'users' else (model.created_at.desc(), model.id.desc())
    rows = session.execute(query.order_by(*order).offset(offset).limit(limit + 1)).all()
    more = len(rows) > limit
    items = []
    for row in rows[:limit]:
        obj = row[0]; email = obj.email if category == 'users' else row[1]
        item = {'id': obj.id, 'email': email, 'created_at': obj.created_at.isoformat() + 'Z'}
        if category == 'tasks':
            item.update(kind=obj.kind, status=obj.status, model=obj.model, text=obj.prompt, media=[f'/api/admin/tasks/{obj.id}/outputs/{i}' for i in range(len(obj.outputs or []))])
        elif category == 'voice': item.update(kind='audio', text=obj.text, name=obj.voice_name, media=[f'/api/admin/voice/{obj.id}/content'])
        elif category == 'uploads': item.update(kind=obj.content_type.split('/')[0], name=obj.name, content_type=obj.content_type, media=[f'/api/admin/uploads/{obj.id}/content'])
        elif category == 'users':
            wallet = session.get(CreditWallet, obj.id)
            item['balance'] = wallet.balance if wallet and wallet.day == today() else 0
        items.append(item)
    return {'items': items, 'more': more}

@app.get('/api/admin/uploads/{upload_id}/content')
def admin_upload_content(upload_id: str, admin: User = Depends(current_admin), session: DBSession = Depends(db)):
    item = session.get(Upload, upload_id)
    if not item: raise HTTPException(404, '素材不存在')
    return upload_content(upload_id, session.get(User, item.user_id), session)

@app.get('/api/admin/voice/{work_id}/content')
def admin_voice_content(work_id: str, admin: User = Depends(current_admin), session: DBSession = Depends(db)):
    item = session.get(VoiceWork, work_id)
    if not item: raise HTTPException(404, '作品不存在')
    return voice_work_content(work_id, session.get(User, item.user_id), session)

@app.get('/api/admin/tasks/{task_id}/outputs/{index}')
async def admin_task_output(task_id: str, index: int, request: Request, admin: User = Depends(current_admin), session: DBSession = Depends(db)):
    item = session.get(Task, task_id)
    if not item: raise HTTPException(404, '作品不存在')
    return await output(task_id, index, request, False, session.get(User, item.user_id), session)

@app.delete('/api/admin/{category}/{item_id}')
def admin_delete(category: Literal['tasks', 'voice', 'uploads'], item_id: str, admin: User = Depends(current_admin), session: DBSession = Depends(db)):
    model = {'tasks': Task, 'voice': VoiceWork, 'uploads': Upload}[category]
    item = session.get(model, item_id)
    if not item: raise HTTPException(404, '内容不存在')
    owner = session.get(User, item.user_id)
    if category == 'tasks': return delete_task(item_id, owner, session)
    if category == 'uploads': return delete_upload(item_id, owner, session)
    return delete_voice_work(item_id, owner, session)

from .sso_routes import install as install_hits_sso
install_hits_sso(app)
