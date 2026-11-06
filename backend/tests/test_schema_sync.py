import pytest
from sqlalchemy import Column, Integer, MetaData, String, Table, create_engine, inspect, select, text
from app.migrate import sync_additive_schema


def test_sync_adds_tables_and_columns_and_preserves_rows(tmp_path):
    db = create_engine(f'sqlite:///{tmp_path}/schema.sqlite')
    with db.begin() as connection:
        connection.exec_driver_sql('CREATE TABLE existing (id INTEGER PRIMARY KEY, name VARCHAR(40))')
        connection.exec_driver_sql("INSERT INTO existing (id, name) VALUES (1, 'kept')")
    metadata = MetaData()
    table = Table('existing', metadata, Column('id', Integer, primary_key=True),
                  Column('name', String(40)), Column('extra', String(100), nullable=True),
                  Column('counter', Integer, nullable=False, server_default=text('0')))
    Table('new_table', metadata, Column('id', Integer, primary_key=True))
    with db.connect() as connection:
        sync_additive_schema(connection, metadata)
        sync_additive_schema(connection, metadata)
        assert set(inspect(connection).get_table_names()) == {'existing', 'new_table'}
        assert connection.execute(select(table)).one()._mapping == {'id': 1, 'name': 'kept', 'extra': None, 'counter': 0}


def test_sync_rejects_unsafe_required_column(tmp_path):
    db = create_engine(f'sqlite:///{tmp_path}/schema.sqlite')
    with db.begin() as connection:
        connection.exec_driver_sql('CREATE TABLE existing (id INTEGER PRIMARY KEY)')
        connection.exec_driver_sql('INSERT INTO existing VALUES (1)')
    metadata = MetaData()
    Table('existing', metadata, Column('id', Integer, primary_key=True),
          Column('required', String(50), nullable=False))
    with db.connect() as connection:
        with pytest.raises(RuntimeError, match='requires a server_default'):
            sync_additive_schema(connection, metadata)
        assert [col['name'] for col in inspect(connection).get_columns('existing')] == ['id']
