import pytest
from app.credits import CreditPricingError, task_credit_cost


def test_prices_follow_work():
    assert task_credit_cost('Qwen Image 2.1 文生图', 'image') == 100
    assert task_credit_cost('Pika H3 参考图生视频', 'video', '5s') == 330
    assert task_credit_cost('Pika H3 参考图生视频', 'video', '10s') == 660
    assert task_credit_cost('Pika H3 参考图生视频', 'video', '15s') == 990
    assert task_credit_cost('Wan SCAIL2 角色替换', 'video', frames=81) == 165
    assert task_credit_cost('Wan SCAIL2 角色替换', 'video', frames=82) == 330
    with pytest.raises(CreditPricingError):
        task_credit_cost('unknown', 'video')


def test_old_schema_upgrade_preserves_users(tmp_path):
    from sqlalchemy import create_engine, text, inspect
    from app.migrate import sync_additive_schema
    from app.db import Base
    engine = create_engine(f'sqlite:///{tmp_path / "old.sqlite"}')
    with engine.begin() as conn:
        conn.execute(text('CREATE TABLE users (id VARCHAR(36) PRIMARY KEY, email VARCHAR(254), password_hash VARCHAR(255), created_at DATETIME)'))
        conn.execute(text("INSERT INTO users (id, email, password_hash) VALUES ('legacy', 'legacy@example.com', 'hash')"))
    with engine.connect() as conn:
        sync_additive_schema(conn, Base.metadata)
        sync_additive_schema(conn, Base.metadata)
        assert conn.execute(text('SELECT id FROM users')).scalar() == 'legacy'
        assert {'credit_wallets', 'credit_charges'} <= set(inspect(conn).get_table_names())
    engine.dispose()
