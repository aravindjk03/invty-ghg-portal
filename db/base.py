"""Database engine, session management, and declarative base.

Supports PostgreSQL in production and SQLite for local development and testing.
Enforces SQLite foreign key constraints via connect events.
"""
from __future__ import annotations

import json
import os
from decimal import Decimal
from enum import Enum
from typing import Any, Generator
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


def _json_boundary_default(obj: Any) -> Any:
    """Serialize Decimal as string and Enum as value per Rule 48."""
    if isinstance(obj, Decimal):
        return str(obj)
    if isinstance(obj, Enum):
        return obj.value
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def json_dumps(obj: Any) -> str:
    """JSON serializer for engine dialect."""
    return json.dumps(obj, default=_json_boundary_default)


class Base(DeclarativeBase):
    """Base declarative class for all GHG Accounting Portal models."""
    pass


@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Ensure foreign key constraints are enforced in SQLite."""
    # Only apply to SQLite connections
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
    except Exception:
        # Not a SQLite connection or PRAGMA not supported
        pass


def get_database_url() -> str:
    """Retrieve database URL from environment, defaulting to local SQLite."""
    return os.getenv("DATABASE_URL", "sqlite:///ghg_accounting.db")


def create_db_engine(url: str | None = None, echo: bool = False) -> Engine:
    """Create a configured SQLAlchemy engine."""
    db_url = url or get_database_url()
    connect_args = {}
    if db_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
    return create_engine(
        db_url,
        echo=echo,
        connect_args=connect_args,
        json_serializer=json_dumps,
    )


def create_session_factory(engine: Engine | None = None) -> sessionmaker[Session]:
    """Create a thread-safe sessionmaker bound to the given engine."""
    eng = engine or create_db_engine()
    return sessionmaker(bind=eng, autoflush=False, autocommit=False, expire_on_commit=False)


def init_db(engine: Engine) -> None:
    """Create all registered database tables."""
    Base.metadata.create_all(bind=engine)
