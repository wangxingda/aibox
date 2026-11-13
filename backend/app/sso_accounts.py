"""Transactional account creation after a trusted external identity exchange."""
import hashlib
import secrets
import uuid
from datetime import timedelta
from sqlalchemy import select
from .db import User, utcnow
from .sso_models import ExternalIdentity, PendingExternalRegistration


class RegistrationError(ValueError):
    pass


def registration_digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def prepare_registration(session, provider, subject, email):
    """Only call with identity data verified by the provider's server API."""
    token = secrets.token_urlsafe(32)
    session.add(PendingExternalRegistration(token_hash=registration_digest(token),
        provider=provider, subject=subject, email=email.lower(),
        expires_at=utcnow() + timedelta(minutes=10)))
    session.flush()
    return token


def finish_registration(session, token, password, hash_password):
    """Caller must commit once; no account or binding exists before completion."""
    if not isinstance(password, str) or not 8 <= len(password) <= 128:
        raise RegistrationError('密码长度必须为 8 到 128 位')
    pending = session.scalar(select(PendingExternalRegistration).where(
        PendingExternalRegistration.token_hash == registration_digest(token)).with_for_update())
    if not pending or pending.expires_at <= utcnow():
        raise RegistrationError('授权已过期，请重新使用 点点网登录')
    if session.get(ExternalIdentity, (pending.provider, pending.subject)):
        raise RegistrationError('此 点点网账号已经绑定，请重新登录')
    if session.scalar(select(User.id).where(User.email == pending.email)):
        raise RegistrationError('该邮箱已有 AIBox 账号，请先登录原账号后绑定')
    user = User(id=str(uuid.uuid4()), email=pending.email,
                password_hash=hash_password(password))
    session.add(user)
    session.flush()
    session.add(ExternalIdentity(provider=pending.provider, subject=pending.subject,
                                 user_id=user.id))
    session.delete(pending)
    session.flush()
    return user
