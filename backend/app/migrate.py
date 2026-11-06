"""Additive, restartable schema upgrade for existing installations.

Stop API and workers, back up the database and uploads, then run `python -m app.migrate`.
No existing columns or rows are dropped. DDL is intentionally idempotent because
MySQL commits DDL independently of data transactions.
"""
import logging
import hashlib
import uuid
from pathlib import Path
from sqlalchemy import inspect, select, text, update
from sqlalchemy.orm import Session as DBSession
from sqlalchemy.schema import CreateColumn

from .config import settings
from .db import Base, SchemaMigration, Task, TaskEvent, TaskInputAsset, TaskOutput, Upload, engine

VERSION = '20261106_01_task_relations'
PROGRESS_VERSION = '20261106_02_task_progress'
UPLOAD_DEDUP_VERSION = '20261106_03_upload_dedup'
log = logging.getLogger(__name__)

def sync_additive_schema(connection, metadata):
    """Create new tables and safely add ordinary columns to existing tables."""
    metadata.create_all(connection)
    connection.commit()
    inspector = inspect(connection)
    preparer = connection.dialect.identifier_preparer
    for table in metadata.sorted_tables:
        existing = {column['name'] for column in inspector.get_columns(table.name, schema=table.schema)}
        for column in table.columns:
            if column.name in existing:
                continue
            if column.primary_key or column.foreign_keys or column.unique or column.index or any(column.name in index.columns for index in table.indexes) or any(column.name in constraint.columns for constraint in table.constraints if constraint.__class__.__name__ == 'UniqueConstraint'):
                raise RuntimeError(f'New column {table.fullname}.{column.name} has constraints or indexes; an explicit migration is required')
            if not column.nullable and column.server_default is None:
                raise RuntimeError(f'New non-null column {table.fullname}.{column.name} requires a server_default or an explicit migration')
            definition = str(CreateColumn(column).compile(dialect=connection.dialect))
            connection.exec_driver_sql(f'ALTER TABLE {preparer.format_table(table)} ADD COLUMN {definition}')
            connection.commit()
            log.info('Added column %s.%s', table.fullname, column.name)

def migrate(database=engine):
    with database.connect() as connection:
        locked = False
        if connection.dialect.name == 'mysql':
            locked = connection.execute(text("SELECT GET_LOCK('aireel_schema_migrate', 30)")).scalar() == 1
            if not locked:
                raise RuntimeError('Could not acquire schema migration lock')
            connection.commit()
        try:
            Base.metadata.create_all(connection)
            connection.commit()
            upload_columns = {item['name'] for item in inspect(connection).get_columns('uploads')}
            if 'sha256' not in upload_columns:
                connection.execute(text('ALTER TABLE uploads ADD COLUMN sha256 VARCHAR(64) NULL'))
                connection.commit()
            task_columns = {item['name'] for item in inspect(connection).get_columns('tasks')}
            if 'progress' not in task_columns:
                connection.execute(text('ALTER TABLE tasks ADD COLUMN progress INTEGER NULL DEFAULT 0'))
                connection.commit()
            sync_additive_schema(connection, Base.metadata)
            existing = {item['name'] for item in inspect(connection).get_indexes('tasks')}
            for index in Task.__table__.indexes:
                if index.name in {'ix_tasks_user_kind_created_id', 'ix_tasks_user_created_id'} and index.name not in existing:
                    index.create(connection, checkfirst=True)
            connection.commit()
            with DBSession(bind=connection) as session:
                if not session.get(SchemaMigration, VERSION):
                    for task in session.scalars(select(Task).order_by(Task.id)).yield_per(100):
                        for position, upload_id in enumerate([task.upload_id, (task.options or {}).get('second_upload_id')]):
                            if not upload_id or session.get(TaskInputAsset, (task.id, position)):
                                continue
                            upload = session.get(Upload, upload_id)
                            if upload and upload.user_id == task.user_id:
                                session.add(TaskInputAsset(task_id=task.id, position=position, upload_id=upload_id))
                            else:
                                log.warning('Task %s has a missing or mismatched input at position %s', task.id, position)
                        for position, item in enumerate(task.outputs or []):
                            if not isinstance(item, dict) or not isinstance(item.get('filename'), str):
                                log.warning('Task %s has invalid output at position %s', task.id, position)
                                continue
                            if not session.get(TaskOutput, (task.id, position)):
                                session.add(TaskOutput(task_id=task.id, position=position, filename=item['filename'], subfolder=item.get('subfolder') or '', storage_type=item.get('type') or 'output'))
                        event_id = str(uuid.uuid5(uuid.NAMESPACE_URL, 'aireel-legacy-task:' + task.id))
                        if not session.get(TaskEvent, event_id):
                            session.add(TaskEvent(id=event_id, task_id=task.id, status=task.status, message='迁移前的当前状态', created_at=task.updated_at))
                    session.add(SchemaMigration(version=VERSION))
                    session.commit()
                if not session.get(SchemaMigration, PROGRESS_VERSION):
                    session.execute(update(Task).where(Task.status == 'completed').values(progress=100))
                    session.execute(update(Task).where(Task.status.in_({'queued', 'submitting', 'running'})).values(progress=0))
                    session.add(SchemaMigration(version=PROGRESS_VERSION))
                    session.commit()
                if not session.get(SchemaMigration, UPLOAD_DEDUP_VERSION):
                    directory = settings().path(settings().upload_dir)
                    canonical = {}
                    duplicates = {}
                    duplicate_paths = set()
                    for upload in session.scalars(select(Upload).order_by(Upload.created_at, Upload.id)).yield_per(100):
                        path = directory / Path(upload.path).name
                        try:
                            with path.open('rb') as source:
                                digest = hashlib.file_digest(source, 'sha256').hexdigest()
                        except OSError:
                            log.warning('Cannot hash upload %s; preserving it without deduplication', upload.id)
                            continue
                        key = (upload.user_id, digest)
                        if key in canonical:
                            duplicates[upload.id] = canonical[key]
                            duplicate_paths.add(Path(upload.path).name)
                        else:
                            canonical[key] = upload.id
                            upload.sha256 = digest
                    for task in session.scalars(select(Task)).yield_per(100):
                        if task.upload_id in duplicates:
                            task.upload_id = duplicates[task.upload_id]
                        options = dict(task.options or {})
                        second_id = options.get('second_upload_id')
                        if second_id in duplicates:
                            options['second_upload_id'] = duplicates[second_id]
                            task.options = options
                    session.flush()
                    for duplicate_id, canonical_id in duplicates.items():
                        session.execute(update(TaskInputAsset).where(TaskInputAsset.upload_id == duplicate_id).values(upload_id=canonical_id))
                        session.delete(session.get(Upload, duplicate_id))
                    session.add(SchemaMigration(version=UPLOAD_DEDUP_VERSION))
                    session.commit()
                    retained_paths = {Path(path).name for path in session.scalars(select(Upload.path))}
                    for name in duplicate_paths - retained_paths:
                        try:
                            (directory / name).unlink(missing_ok=True)
                        except OSError:
                            log.warning('Could not remove duplicate upload file %s', name)
            upload_indexes = {item['name'] for item in inspect(connection).get_indexes('uploads')}
            if 'uq_uploads_user_sha256' not in upload_indexes:
                next(index for index in Upload.__table__.indexes if index.name == 'uq_uploads_user_sha256').create(connection, checkfirst=True)
            connection.commit()
        finally:
            if locked:
                connection.execute(text("SELECT RELEASE_LOCK('aireel_schema_migrate')"))
                connection.commit()

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    migrate()
    print('Database migration complete.')
