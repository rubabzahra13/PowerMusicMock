"""Vercel serverless entrypoint. Exposes the FastAPI ASGI app with the
backend/ directory as the import root so `app.*` imports resolve."""

from app.main import app  # noqa: F401
