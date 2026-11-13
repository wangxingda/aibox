"""External identities and short-lived, single-use registration grants."""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base, utcnow


class ExternalIdentity(Base):
    __tablename__ = 'external_identities'
    __table_args__ = (UniqueConstraint('provider', 'user_id', name='uq_external_identity_user'),)
    provider: Mapped[str] = mapped_column(String(32), primary_key=True)
    subject: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class PendingExternalRegistration(Base):
    __tablename__ = 'pending_external_registrations'
    failed_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default='0')
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    provider: Mapped[str] = mapped_column(String(32))
    subject: Mapped[str] = mapped_column(String(128))
    email: Mapped[str] = mapped_column(String(254))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
