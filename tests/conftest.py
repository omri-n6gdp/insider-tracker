"""Shared pytest fixtures. Each test gets a fresh, isolated SQLite file."""
import pytest

from backend import db


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    """Point the db module at a throwaway file and reset its connection."""
    path = tmp_path / "test.db"
    monkeypatch.setattr(db, "DB_PATH", str(path))
    db._conn = None
    db.init_db()
    yield db
    if db._conn is not None:
        db._conn.close()
    db._conn = None
