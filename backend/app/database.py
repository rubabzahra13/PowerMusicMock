import os
import socket
from urllib.parse import urlparse

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()


class DatabaseConnectionError(Exception):
    """Raised when the database cannot be reached."""


def get_database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if not url:
        raise DatabaseConnectionError(
            "DATABASE_URL environment variable is not set. "
            "Add it to backend/.env (see python-dotenv)."
        )

    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    return url


def _is_network_unreachable(error: Exception) -> bool:
    message = str(error).lower()
    network_markers = (
        "could not translate host name",
        "name or service not known",
        "temporary failure in name resolution",
        "nodename nor servname provided",
        "network is unreachable",
        "connection refused",
        "timeout expired",
        "timed out",
    )
    if any(marker in message for marker in network_markers):
        return True

    cause = getattr(error, "__cause__", None)
    if isinstance(cause, (socket.gaierror, OSError, TimeoutError)):
        return True
    return False


def create_db_engine():
    try:
        return create_engine(get_database_url(), pool_pre_ping=True)
    except Exception as exc:
        if _is_network_unreachable(exc):
            host = urlparse(os.getenv("DATABASE_URL", "")).hostname or "unknown"
            raise DatabaseConnectionError(
                f"Cannot reach PostgreSQL host '{host}' (DNS or network error). "
                "Supabase direct connections often resolve to IPv6 only; if IPv6 is "
                "unavailable on your network, use the session pooler connection string "
                "from the Supabase dashboard (Connect → Session pooler) in DATABASE_URL."
            ) from exc
        raise


engine = create_db_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def verify_database_connection(db) -> None:
    try:
        db.execute(text("SELECT 1"))
    except OperationalError as exc:
        if _is_network_unreachable(exc):
            host = urlparse(os.getenv("DATABASE_URL", "")).hostname or "unknown"
            raise DatabaseConnectionError(
                f"Cannot reach PostgreSQL host '{host}' (DNS or network error). "
                "Supabase direct connections often resolve to IPv6 only; if IPv6 is "
                "unavailable on your network, use the session pooler connection string "
                "from the Supabase dashboard (Connect → Session pooler) in DATABASE_URL."
            ) from exc
        raise
