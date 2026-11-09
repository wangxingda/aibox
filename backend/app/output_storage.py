"""Durable, private copies of generation results on the website server."""
import hashlib
import os
import tempfile
from pathlib import Path
from typing import Any

import httpx

from .config import settings

MEDIA_TYPES = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4',
    '.webm': 'video/webm',
}


def output_path(task_id: str, index: int, item: dict[str, Any]) -> tuple[Path, str]:
    filename = item.get('filename')
    if not isinstance(filename, str):
        raise ValueError('Invalid output filename')
    suffix = Path(filename).suffix.lower()
    if suffix not in MEDIA_TYPES:
        raise ValueError('Unsupported output format')
    key = hashlib.sha256(f'{task_id}:{index}'.encode()).hexdigest()
    return settings().path(settings().upload_dir) / '_outputs' / f'{key}{suffix}', MEDIA_TYPES[suffix]


def persist_output(task_id: str, index: int, item: dict[str, Any]) -> tuple[Path, str]:
    path, media_type = output_path(task_id, index, item)
    if path.is_file() and path.stat().st_size:
        return path, media_type
    path.parent.mkdir(parents=True, exist_ok=True)
    cfg = settings()
    headers = {'Authorization': f'Bearer {cfg.comfyui_token}'} if cfg.comfyui_token else {}
    temporary = None
    try:
        with httpx.Client(timeout=60, headers=headers) as client:
            with client.stream('GET', cfg.comfyui_url.rstrip('/') + '/view', params={
                'filename': item['filename'], 'subfolder': item.get('subfolder', ''),
                'type': item.get('type') or 'output',
            }) as response:
                response.raise_for_status()
                content_type = response.headers.get('content-type', '').split(';', 1)[0].lower()
                if content_type and content_type not in {media_type, 'application/octet-stream'}:
                    raise ValueError('Unexpected generation output type')
                with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.partial-', delete=False) as out:
                    temporary = Path(out.name)
                    for chunk in response.iter_bytes():
                        out.write(chunk)
                if temporary.stat().st_size == 0:
                    raise ValueError('Empty generation output')
                os.replace(temporary, path)
                temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return path, media_type


def local_output(task_id: str, index: int, item: dict[str, Any]) -> tuple[Path, str] | None:
    """Return an already persisted output without fetching legacy files."""
    path, media_type = output_path(task_id, index, item)
    return (path, media_type) if path.is_file() and path.stat().st_size else None
