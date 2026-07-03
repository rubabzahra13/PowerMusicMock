"""Background jobs: Gmail polling (live mode) and the nightly distillation.

APScheduler runs in-process with the API. On serverless hosting (Vercel),
set PILOT2_SCHEDULER_ENABLED=false and drive the same work through Vercel
cron hitting POST /api/pilot2/learning/distill and the poll endpoint instead.
"""

import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.database import SessionLocal
from app.pilot2 import config, pipeline
from app.pilot2.ai.distiller import run_distillation

logger = logging.getLogger(__name__)

_scheduler = None


def _poll_job():
    db = SessionLocal()
    try:
        processed = pipeline.poll_all_accounts(db)
        if processed:
            logger.info("Gmail poll processed %d new emails", processed)
    except Exception:
        logger.exception("Gmail poll job failed")
    finally:
        db.close()


def _distill_job():
    db = SessionLocal()
    try:
        result = run_distillation(db)
        logger.info(
            "Distillation: %d edits, intents %s, %d suggestions",
            result.edits_processed, result.intents_updated, result.suggestions_created,
        )
    except Exception:
        logger.exception("Distillation job failed")
    finally:
        db.close()


def start() -> None:
    global _scheduler
    if not config.SCHEDULER_ENABLED or _scheduler is not None:
        return
    _scheduler = BackgroundScheduler(timezone="UTC")
    if config.GMAIL_MODE == "live":
        _scheduler.add_job(_poll_job, "interval", minutes=config.POLL_INTERVAL_MINUTES)
    _scheduler.add_job(_distill_job, "cron", hour=config.DISTILL_HOUR_UTC, minute=0)
    _scheduler.start()


def shutdown() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
