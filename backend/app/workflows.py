import copy
import json
import secrets
from functools import lru_cache
from pathlib import Path
from .config import settings

class WorkflowError(ValueError):
    pass

@lru_cache
def registry() -> dict:
    path = settings().path(settings().workflow_config)
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(data, dict):
        raise WorkflowError('Workflow registry must be an object')
    return data

def build_workflow(model: str, kind: str, prompt: str, options: dict, image: str | None, image2: str | None = None, video: str | None = None) -> dict:
    config = registry().get(model)
    if not config or config.get('kind') != kind:
        raise WorkflowError('没有配置此类型的工作流')
    if not isinstance(config.get('inputs'), dict) or not config['inputs'].get('prompt'):
        raise WorkflowError('工作流未配置提示词映射')
    if not isinstance(config.get('file'), str):
        raise WorkflowError('工作流未配置文件')
    path = (settings().path(settings().workflow_config).parent / config['file']).resolve()
    root = settings().path(settings().workflow_config).parent.resolve()
    if not path.is_relative_to(root):
        raise WorkflowError('Invalid workflow path')
    try:
        workflow = copy.deepcopy(json.loads(path.read_text(encoding='utf-8')))
    except (OSError, ValueError) as exc:
        raise WorkflowError('工作流文件不可用或格式错误') from exc
    if len(prompt) > config.get('max_prompt_length', 8000):
        raise WorkflowError(f"提示词不能超过 {config['max_prompt_length']} 个字符")
    for target, value in config.get('static_inputs', {}).items():
        try:
            node, field = target.split('.', 1)
            if field not in workflow[node]['inputs']:
                raise KeyError(field)
            workflow[node]['inputs'][field] = value
        except (KeyError, TypeError, ValueError) as exc:
            raise WorkflowError('工作流固定参数配置错误') from exc
    values = {'prompt': prompt or config.get('default_prompt'), 'image': image, 'image2': image2, 'video': video, 'seed': secrets.randbelow(2**31), **options}
    for key, default in config.get('optional_input_defaults', {}).items():
        if values.get(key) is None:
            values[key] = default
    for key, target in config.get('inputs', {}).items():
        if key not in values or values[key] is None:
            continue
        try:
            value = values[key]
            if key in config.get('value_maps', {}):
                try:
                    value = config['value_maps'][key][value]
                except (KeyError, TypeError) as exc:
                    raise WorkflowError(f'此工作流不支持该{key}设置') from exc
            for mapping in target if isinstance(target, list) else [target]:
                node, field = mapping.split('.', 1)
                if field not in workflow[node]['inputs']:
                    raise KeyError(field)
                workflow[node]['inputs'][field] = value
        except WorkflowError:
            raise
        except (KeyError, TypeError, ValueError) as exc:
            raise WorkflowError(f'Invalid workflow mapping for {key}') from exc
    if image and 'image' not in config.get('inputs', {}):
        raise WorkflowError('此工作流不支持图片输入')
    if image2 and 'image2' not in config.get('inputs', {}):
        raise WorkflowError('此工作流不支持第二张图片')
    if video and 'video' not in config.get('inputs', {}):
        raise WorkflowError('此工作流不支持视频输入')
    if config.get('requires_prompt', True) and not prompt.strip():
        raise WorkflowError('请输入提示词')
    if config.get('requires_image') and not image:
        raise WorkflowError('此工作流需要上传第一张参考图片')
    if config.get('requires_second_image') and not image2:
        raise WorkflowError('此工作流需要上传第二张参考图片')
    if config.get('requires_video') and not video:
        raise WorkflowError('此工作流需要上传驱动视频')
    return workflow
