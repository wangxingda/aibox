"""Server-side estimates for the currently supported generation workflows."""
import math


class CreditPricingError(ValueError):
    pass


def task_credit_cost(model: str, kind: str, duration: str | None = None,
                     frames: int | None = None) -> int:
    """Return a deterministic estimate; driving-video cost uses 81-frame windows."""
    if kind == 'image' and model in ('Qwen Image 2.1 文生图', 'Qwen Image 2.1 图片编辑'):
        return 100
    if kind == 'video' and model == 'Pika H3 参考图生视频':
        if duration not in ('5s', '10s', '15s'):
            raise CreditPricingError('请选择支持的视频时长')
        return {'5s': 330, '10s': 660, '15s': 990}[duration]
    if kind == 'video' and model == 'InfiniTalk 音频驱动':
        if frames is None or not 1 <= frames <= 3750:
            raise CreditPricingError('请先选择不超过 150 秒的驱动音频')
        return 165 * max(1, math.ceil(frames / 75))
    if kind == 'video' and model in ('Wan SCAIL2 角色替换', 'Wan Animate2 动作迁移'):
        if frames is None or not 1 <= frames <= 3805:
            raise CreditPricingError('请先选择有效的驱动视频')
        return 165 * (1 + max(0, math.ceil((frames - 81) / 76)))
    raise CreditPricingError('此模型暂未配置积分价格')

from datetime import datetime
from zoneinfo import ZoneInfo
from sqlalchemy import select
from .db import User, CreditWallet, CreditCharge


def today():
    return datetime.now(ZoneInfo('Asia/Shanghai')).date().isoformat()


def locked_wallet(session, user_id):
    session.scalar(select(User).where(User.id == user_id).with_for_update())
    wallet = session.get(CreditWallet, user_id)
    if wallet is None:
        wallet = CreditWallet(user_id=user_id, day='', balance=0, pending_refund=0)
        session.add(wallet)
        session.flush()
    return wallet


def refund_task(session, task):
    charge = session.get(CreditCharge, task.id)
    if not charge or charge.refunded:
        return
    wallet = locked_wallet(session, task.user_id)
    if wallet.day == today():
        wallet.balance += charge.amount
    else:
        wallet.pending_refund += charge.amount
    charge.refunded = True
