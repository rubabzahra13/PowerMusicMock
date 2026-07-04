"""Simple in-memory rate limiting (per IP / user). Best-effort on serverless."""

from __future__ import annotations

import os
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Callable

from fastapi import Depends, HTTPException, Request

from app.api.auth import AuthenticatedUser, auth_is_required, get_authenticated_user


@dataclass
class _Bucket:
    hits: list[float] = field(default_factory=list)


_store: dict[str, _Bucket] = defaultdict(_Bucket)
_MAX_BUCKETS = 20_000


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _rate_key(request: Request, user: AuthenticatedUser | None, scope: str) -> str:
    if user and user.id != "dev-bypass":
        return f"user:{user.id}:{scope}"
    return f"ip:{_client_ip(request)}:{scope}"


def _prune_store() -> None:
    if len(_store) <= _MAX_BUCKETS:
        return
    _store.clear()


def rate_limit(
    scope: str,
    *,
    max_requests: int,
    window_seconds: int,
    user_dep: Callable = get_authenticated_user,
) -> Callable:
    """FastAPI dependency — enforces limit then returns the authenticated user."""

    def dependency(
        request: Request,
        user: AuthenticatedUser = Depends(user_dep),
    ) -> AuthenticatedUser:
        if not auth_is_required() and os.getenv("DISABLE_RATE_LIMIT", "").lower() in ("1", "true", "yes"):
            return user

        key = _rate_key(request, user, scope)
        now = time.time()
        bucket = _store[key]
        bucket.hits = [t for t in bucket.hits if now - t < window_seconds]
        if len(bucket.hits) >= max_requests:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please wait a moment and try again.",
            )
        bucket.hits.append(now)
        _prune_store()
        return user

    return dependency
