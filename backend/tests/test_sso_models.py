"""Identity uniqueness must prevent external account takeover by rebinding."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.db import Base, User
from app.sso_models import ExternalIdentity


def test_identity_cannot_be_bound_twice():
    engine = create_engine('sqlite:///:memory:')
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        session.add_all([User(id='one', email='one@example.com', password_hash='hash'),
                         User(id='two', email='two@example.com', password_hash='hash')])
        session.commit()
        session.add(ExternalIdentity(provider='hits', subject='123', user_id='one'))
        session.commit()
        session.add(ExternalIdentity(provider='hits', subject='123', user_id='two'))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()
        assert session.get(ExternalIdentity, ('hits', '123')).user_id == 'one'
    engine.dispose()


def test_registration_requires_password_and_is_single_use():
    from app.sso_accounts import prepare_registration, finish_registration, RegistrationError
    engine = create_engine('sqlite:///:memory:')
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        token = prepare_registration(session, 'hits', '123', 'TEST@example.com')
        session.commit()
        with pytest.raises(RegistrationError):
            finish_registration(session, token, 'short', lambda value: 'hash')
        session.rollback()
        assert session.query(User).count() == 0
        user = finish_registration(session, token, 'independent-password', lambda value: 'hashed:' + value)
        session.commit()
        assert user.email == 'test@example.com'
        assert session.get(ExternalIdentity, ('hits', '123')).user_id == user.id
        with pytest.raises(RegistrationError):
            finish_registration(session, token, 'another-password', lambda value: 'hash')
    engine.dispose()


def test_expired_registration_and_email_collision():
    from datetime import timedelta
    from app.db import utcnow
    from app.sso_models import PendingExternalRegistration
    from app.sso_accounts import prepare_registration, finish_registration, registration_digest, RegistrationError
    engine=create_engine('sqlite:///:memory:');Base.metadata.create_all(engine)
    with Session(engine) as session:
        token=prepare_registration(session,'hits','123','test@example.com');session.commit()
        session.get(PendingExternalRegistration,registration_digest(token)).expires_at=utcnow()-timedelta(seconds=1);session.commit()
        with pytest.raises(RegistrationError):finish_registration(session,token,'new-password',lambda p:'hash')
        session.rollback()
        token=prepare_registration(session,'hits','123','test@example.com')
        session.add(User(id='existing',email='test@example.com',password_hash='hash'));session.commit()
        with pytest.raises(RegistrationError):finish_registration(session,token,'new-password',lambda p:'hash')
        assert session.query(User).count()==1
    engine.dispose()


def test_additive_upgrade_from_old_database(tmp_path):
    from sqlalchemy import text, inspect
    from app.migrate import sync_additive_schema
    engine=create_engine(f'sqlite:///{tmp_path / "legacy.sqlite"}')
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE users (id VARCHAR(36) PRIMARY KEY, email VARCHAR(254), password_hash VARCHAR(255), created_at DATETIME)'))
        connection.execute(text("INSERT INTO users (id,email,password_hash) VALUES ('legacy','legacy@example.com','hash')"))
    with engine.connect() as connection:
        sync_additive_schema(connection,Base.metadata);sync_additive_schema(connection,Base.metadata)
        assert connection.execute(text('SELECT id FROM users')).scalar()=='legacy'
        assert {'external_identities','pending_external_registrations'} <= set(inspect(connection).get_table_names())
        from app.migrate import migrate_hits_identities, HITS_IDENTITY_VERSION
        migrate_hits_identities(connection);migrate_hits_identities(connection)
        assert connection.execute(text('SELECT count(*) FROM schema_migrations WHERE version=:v'), {'v':HITS_IDENTITY_VERSION}).scalar()==1
    engine.dispose()
