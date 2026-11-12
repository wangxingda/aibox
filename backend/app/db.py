from datetime import datetime, timezone
from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from .config import settings

class Base(DeclarativeBase):
    pass

def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)

class User(Base):
    __tablename__ = 'users'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

class Upload(Base):
    __tablename__ = 'uploads'
    __table_args__ = (Index('uq_uploads_user_sha256', 'user_id', 'sha256', unique=True),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    path: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(50))
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

class Task(Base):
    __tablename__ = 'tasks'
    __table_args__ = (Index('ix_tasks_status_created', 'status', 'created_at'), Index('ix_tasks_user_kind_created_id', 'user_id', 'kind', 'created_at', 'id'), Index('ix_tasks_user_created_id', 'user_id', 'created_at', 'id'))
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    kind: Mapped[str] = mapped_column(String(10))
    model: Mapped[str] = mapped_column(String(100))
    prompt: Mapped[str] = mapped_column(Text)
    options: Mapped[dict] = mapped_column(JSON, default=dict)
    upload_id: Mapped[str | None] = mapped_column(ForeignKey('uploads.id'), nullable=True)
    status: Mapped[str] = mapped_column(String(24), default='queued')
    progress: Mapped[int | None] = mapped_column(Integer, nullable=True, default=0)
    comfy_prompt_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    outputs: Mapped[list] = mapped_column(JSON, default=list)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

class TaskInputAsset(Base):
    __tablename__ = 'task_input_assets'
    task_id: Mapped[str] = mapped_column(ForeignKey('tasks.id', ondelete='CASCADE'), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, primary_key=True)
    upload_id: Mapped[str] = mapped_column(ForeignKey('uploads.id'), index=True)

class TaskOutput(Base):
    __tablename__ = 'task_outputs'
    task_id: Mapped[str] = mapped_column(ForeignKey('tasks.id', ondelete='CASCADE'), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, primary_key=True)
    filename: Mapped[str] = mapped_column(String(512))
    subfolder: Mapped[str] = mapped_column(String(512), default='')
    storage_type: Mapped[str] = mapped_column(String(32), default='output')

class TaskEvent(Base):
    __tablename__ = 'task_events'
    __table_args__ = (Index('ix_task_events_task_created', 'task_id', 'created_at'),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    task_id: Mapped[str] = mapped_column(ForeignKey('tasks.id', ondelete='CASCADE'))
    status: Mapped[str] = mapped_column(String(24))
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

class TaskRequest(Base):
    __tablename__ = 'task_requests'
    __table_args__ = (UniqueConstraint('user_id', 'request_key', name='uq_task_requests_user_key'),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    request_key: Mapped[str] = mapped_column(String(128))
    payload_hash: Mapped[str] = mapped_column(String(64))
    task_id: Mapped[str] = mapped_column(ForeignKey('tasks.id', ondelete='CASCADE'), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

class TaskWorkflowSnapshot(Base):
    __tablename__ = 'task_workflow_snapshots'
    task_id: Mapped[str] = mapped_column(ForeignKey('tasks.id', ondelete='CASCADE'), primary_key=True)
    workflow: Mapped[dict] = mapped_column(JSON)
    image_inputs: Mapped[dict] = mapped_column(JSON)

class SchemaMigration(Base):
    __tablename__ = 'schema_migrations'
    version: Mapped[str] = mapped_column(String(64), primary_key=True)
    applied_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

engine = create_engine(settings().database_url, pool_pre_ping=True)
Session = sessionmaker(bind=engine, expire_on_commit=False)

class CreditWallet(Base):
    __tablename__ = 'credit_wallets'
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), primary_key=True)
    day: Mapped[str] = mapped_column(String(10), default='')
    balance: Mapped[int] = mapped_column(Integer, default=0)
    pending_refund: Mapped[int] = mapped_column(Integer, default=0)

class CreditCharge(Base):
    __tablename__ = 'credit_charges'
    task_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    day: Mapped[str] = mapped_column(String(10))
    amount: Mapped[int] = mapped_column(Integer)
    refunded: Mapped[bool] = mapped_column(default=False)
