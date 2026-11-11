import io
from types import SimpleNamespace

import httpx
import pytest
from PIL import Image

from app import output_storage


@pytest.mark.parametrize('mode', ['RGB', 'RGBA', 'P'])
def test_png_is_saved_as_real_jpeg(tmp_path, monkeypatch, mode):
    source = io.BytesIO()
    Image.new(mode, (32, 24)).save(source, format='PNG')
    cfg = SimpleNamespace(upload_dir=str(tmp_path), path=lambda value: tmp_path,
                          comfyui_url='http://comfy.invalid', comfyui_token='')
    monkeypatch.setattr(output_storage, 'settings', lambda: cfg)
    requests = []

    def respond(request):
        requests.append(request)
        return httpx.Response(200, content=source.getvalue(), headers={'content-type': 'image/png'})

    client_class = httpx.Client
    monkeypatch.setattr(output_storage.httpx, 'Client',
                        lambda **kwargs: client_class(transport=httpx.MockTransport(respond), **kwargs))
    item = {'filename': 'result.png'}
    path, media_type = output_storage.persist_output('task', 0, item)
    assert path.suffix == '.jpg'
    assert media_type == 'image/jpeg'
    with Image.open(path) as image:
        assert image.format == 'JPEG'
        assert image.size == (32, 24)
        if mode == 'RGBA':
            assert image.getpixel((0, 0)) == (255, 255, 255)
    assert output_storage.local_output('task', 0, item) == (path, media_type)
    assert output_storage.persist_output('task', 0, item) == (path, media_type)
    assert len(requests) == 1


def test_existing_png_remains_readable(tmp_path, monkeypatch):
    cfg = SimpleNamespace(upload_dir=str(tmp_path), path=lambda value: tmp_path)
    monkeypatch.setattr(output_storage, 'settings', lambda: cfg)
    item = {'filename': 'old.png'}
    path, media_type = output_storage.output_path('old', 0, item)
    path.parent.mkdir(parents=True)
    Image.new('RGB', (4, 4)).save(path)
    assert output_storage.local_output('old', 0, item) == (path, media_type)
    assert output_storage.persist_output('old', 0, item) == (path, media_type)
