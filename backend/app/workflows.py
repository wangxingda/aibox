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

def extend_driving_video(workflow: dict, model: str, frame_count: int) -> dict:
    """Expand the captured workflow before submission, keeping the graph in the task snapshot."""
    if not 1 <= frame_count <= 3805:
        raise WorkflowError('驱动视频须包含 1 到 3805 帧')
    count = 1 + max(0, (frame_count - 81 + 75) // 76)
    replacement = model == 'Wan SCAIL2 角色替换'
    if replacement and '33' in workflow:
        workflow['full_last'] = {'class_type': 'ImageFromBatch', 'inputs': {'image': ['33', 0], 'batch_index': -1, 'length': 1}}
        workflow['full_padding'] = {'class_type': 'RepeatImageBatch', 'inputs': {'image': ['full_last', 0], 'amount': 81}}
        workflow['full_source'] = {'class_type': 'ImageBatch', 'inputs': {'image1': ['33', 0], 'image2': ['full_padding', 0]}}
        workflow['89']['inputs']['image'] = ['full_source', 0]
        parts = [['6', 0]]
        previous_image, previous_offset = '6', '114'
        for index in range(1, count):
            prefix = f'full_scail_{index}:'
            for node in ('115', '63', '66', '73'):
                workflow[prefix + node] = copy.deepcopy(workflow[node])
            continuation = workflow[prefix + '115']['inputs']
            continuation['previous_frames'] = [previous_image, 0]
            continuation['video_frame_offset'] = [previous_offset, 3]
            workflow[prefix + '63']['inputs'].update(positive=[prefix + '115', 0], negative=[prefix + '115', 1], latent_image=[prefix + '115', 2])
            workflow[prefix + '66']['inputs']['samples'] = [prefix + '63', 1]
            workflow[prefix + '73']['inputs']['images'] = [prefix + '66', 0]
            parts.append([prefix + '73', 0])
            previous_image, previous_offset = prefix + '66', prefix + '115'
        workflow['full_join'] = {'class_type': 'BatchImagesNode', 'inputs': {f'images.image{i}': part for i, part in enumerate(parts)}}
        workflow['full_crop'] = {'class_type': 'ImageFromBatch', 'inputs': {'image': ['full_join', 0], 'batch_index': 0, 'length': frame_count}}
        workflow['236']['inputs']['images'] = ['full_crop', 0]
        return workflow
    source = '215' if replacement else '288'
    # Padding guarantees a full final window; the output is cropped back to the input frame count.
    workflow['full_last'] = {'class_type': 'ImageFromBatch', 'inputs': {'image': [source, 0], 'batch_index': -1, 'length': 1}}
    workflow['full_padding'] = {'class_type': 'RepeatImageBatch', 'inputs': {'image': ['full_last', 0], 'amount': 81}}
    workflow['full_source'] = {'class_type': 'ImageBatch', 'inputs': {'image1': [source, 0], 'image2': ['full_padding', 0]}}

    def clone_prefix(old: str, new: str):
        def remap(value):
            if isinstance(value, list):
                if len(value) == 2 and isinstance(value[0], str) and value[0].startswith(old) and isinstance(value[1], int):
                    return [new + value[0][len(old):], value[1]]
                return [remap(item) for item in value]
            if isinstance(value, dict):
                return {key: remap(item) for key, item in value.items()}
            return value
        for key, node in list(workflow.items()):
            if key.startswith(old):
                workflow[new + key[len(old):]] = remap(copy.deepcopy(node))

    parts = []
    if replacement:
        workflow['213:177']['inputs']['image'] = ['full_source', 0]
        parts.append(['213:6', 0])
        previous = '213:6'
        for index in range(1, count):
            prefix = f'full_scail_{index}:'
            clone_prefix('262:', prefix)
            workflow[prefix + '235']['inputs']['image'] = ['full_source', 0]
            workflow[prefix + '240']['inputs']['value'] = index + 1
            workflow[prefix + '259']['inputs']['previous_frames'] = [previous, 0]
            workflow[prefix + '253']['inputs']['image'] = [previous, 0]
            parts.append([prefix + '252', 0])
            previous = prefix + '250'
        output = '270'
    else:
        workflow['261:243']['inputs']['input'] = ['full_source', 0]
        parts.append(['261:6', 0])
        previous = '261:'
        for index in range(1, count):
            prefix = f'full_animate_{index}:'
            clone_prefix('261:', prefix)
            node = workflow[prefix + '247']['inputs']
            node['continue_motion'] = [previous + '6', 0]
            node['video_frame_offset'] = [previous + '247', 5]
            trimmed = f'full_animate_trim_{index}'
            workflow[trimmed] = {'class_type': 'ImageFromBatch', 'inputs': {'image': [prefix + '6', 0], 'batch_index': [prefix + '247', 4], 'length': 4096}}
            parts.append([trimmed, 0])
            previous = prefix
        output = '245'
    workflow['full_join'] = {'class_type': 'BatchImagesNode', 'inputs': {f'images.image{i}': part for i, part in enumerate(parts)}}
    workflow['full_crop'] = {'class_type': 'ImageFromBatch', 'inputs': {'image': ['full_join', 0], 'batch_index': 0, 'length': frame_count}}
    workflow[output]['inputs']['images'] = ['full_crop', 0]
    return workflow

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
