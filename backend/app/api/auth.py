"""Supabase JWT verification and role-based API access control."""

from __future__ import annotations

import functools
import os
from dataclasses import dataclass

import jwt
from fastapi import Depends, Header, HTTPException
from jwt import PyJWKClient
from sqlalchemy.orm import Session

from app import models
from app.database import get_db

SUPABASE_URL = (
    os.getenv("SUPABASE_URL", "")
    or os.getenv("VITE_SUPABASE_URL", "")
).rstrip("/")
JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
JWT_KEY_ID = os.getenv("SUPABASE_JWT_KEY_ID", "")
JWT_AUDIENCE = "authenticated"
JWKS_ALGORITHMS = ["RS256", "ES256", "EdDSA"]
AUTH_DISABLED = os.getenv("DISABLE_API_AUTH", "").lower() in ("1", "true", "yes")


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    email: str
    role: str


def auth_is_configured() -> bool:
    return bool(SUPABASE_URL or JWT_SECRET)


def auth_is_required() -> bool:
    """Auth is always enforced in production; locally it can be disabled for dev."""
    if AUTH_DISABLED:
        return False
    if os.getenv("VERCEL") or os.getenv("ENVIRONMENT", "").lower() == "production":
        return True
    return auth_is_configured()


@functools.lru_cache(maxsize=1)
def _jwks_client() -> PyJWKClient | None:
    if not SUPABASE_URL:
        return None
    return PyJWKClient(
        f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json",
        cache_keys=True,
    )


def _decode_with_jwks(token: str) -> dict:
    client = _jwks_client()
    if client is None:
        raise jwt.PyJWTError("SUPABASE_URL is not configured for JWKS verification")

    signing_key = client.get_signing_key_from_jwt(token)
    if JWT_KEY_ID:
        header = jwt.get_unverified_header(token)
        token_kid = header.get("kid")
        if token_kid and token_kid != JWT_KEY_ID:
            raise jwt.PyJWTError("JWT key id does not match SUPABASE_JWT_KEY_ID")

    issuer = f"{SUPABASE_URL}/auth/v1"
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=JWKS_ALGORITHMS,
        audience=JWT_AUDIENCE,
        issuer=issuer,
    )


def _decode_with_legacy_secret(token: str) -> dict:
    if not JWT_SECRET:
        raise jwt.PyJWTError("SUPABASE_JWT_SECRET is not configured")
    return jwt.decode(token, JWT_SECRET, algorithms=["HS256"], audience=JWT_AUDIENCE)


def verify_bearer_token(authorization: str | None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.removeprefix("Bearer ").strip()
    if not auth_is_configured():
        raise HTTPException(
            status_code=503,
            detail=(
                "API authentication is not configured. Set SUPABASE_URL for JWKS "
                "(recommended) or SUPABASE_JWT_SECRET for legacy HS256 tokens."
            ),
        )

    jwks_error: jwt.PyJWTError | None = None
    if SUPABASE_URL:
        try:
            return _decode_with_jwks(token)
        except jwt.PyJWTError as exc:
            jwks_error = exc

    if JWT_SECRET:
        try:
            return _decode_with_legacy_secret(token)
        except jwt.PyJWTError as exc:
            detail = str(jwks_error or exc)
            raise HTTPException(status_code=401, detail=f"Invalid or expired token: {detail}") from exc

    raise HTTPException(
        status_code=401,
        detail=f"Invalid or expired token: {jwks_error}",
    ) from jwks_error


def get_authenticated_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> AuthenticatedUser:
    if not auth_is_required():
        return AuthenticatedUser(id="dev-bypass", email="dev@local", role="admin")

    claims = verify_bearer_token(authorization)
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    profile = db.query(models.Profile).filter(models.Profile.id == user_id).first()
    if profile is None:
        raise HTTPException(status_code=403, detail="User profile not found")

    return AuthenticatedUser(
        id=str(profile.id),
        email=profile.email,
        role=profile.role,
    )


def require_admin(
    user: AuthenticatedUser = Depends(get_authenticated_user),
) -> AuthenticatedUser:
    if auth_is_required() and user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_manager(
    user: AuthenticatedUser = Depends(get_authenticated_user),
) -> AuthenticatedUser:
    if not auth_is_required():
        return user
    if user.role != "manager":
        raise HTTPException(status_code=403, detail="Manager access required")
    return user
