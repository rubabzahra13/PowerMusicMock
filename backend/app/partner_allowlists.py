"""Partner allowlists: manager login domains + automated roster senders."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, List, Sequence, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models
from app.pilot2.ignore_list import parse_ignore_pattern, sender_matches_rule
from app.pilot2.pipeline import next_id


def normalize_manager_domain(raw: str) -> str:
    value = (raw or "").strip().lower()
    if value.startswith("@"):
        value = value[1:].strip()
    value = value.lstrip("@").strip().rstrip(".")
    if not value or "@" in value or " " in value or "/" in value:
        raise ValueError("Enter a valid domain like activegym.com or @activegym.com.")
    if "." not in value:
        raise ValueError("Enter a valid domain like activegym.com.")
    return value


def parse_automated_source_pattern(raw: str) -> Tuple[str, str]:
    """Reuse ignore-list parsing for email | domain patterns."""
    return parse_ignore_pattern(raw)


def list_manager_domains(db: Session) -> List[models.ManagerAllowedDomain]:
    return (
        db.query(models.ManagerAllowedDomain)
        .order_by(models.ManagerAllowedDomain.created_at.desc())
        .all()
    )


def list_manager_domain_strings(db: Session) -> List[str]:
    return [row.domain for row in list_manager_domains(db)]


def email_matches_manager_domains(email: str, domains: Sequence[str]) -> bool:
    addr = (email or "").strip().lower()
    if not addr or "@" not in addr:
        return False
    return any(addr.endswith(f"@{domain.lower().lstrip('@')}") for domain in domains)


def assert_manager_email_allowed(db: Session, email: str) -> None:
    domains = list_manager_domain_strings(db)
    if not domains:
        raise HTTPException(
            status_code=403,
            detail="Manager portal access is not configured. Contact your administrator.",
        )
    if not email_matches_manager_domains(email, domains):
        labels = ", ".join(domains[:-1] + [f"or {domains[-1]}"]) if len(domains) > 1 else domains[0]
        raise HTTPException(
            status_code=403,
            detail=f"Manager accounts must use an allowed partner domain ({labels}).",
        )


def create_manager_domain(db: Session, raw: str) -> models.ManagerAllowedDomain:
    domain = normalize_manager_domain(raw)
    existing = (
        db.query(models.ManagerAllowedDomain)
        .filter(models.ManagerAllowedDomain.domain == domain)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="That domain is already allowed.")
    row = models.ManagerAllowedDomain(
        id=next_id(db, models.ManagerAllowedDomain, "mad"),
        domain=domain,
        created_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def delete_manager_domain(db: Session, domain_id: str) -> str:
    row = (
        db.query(models.ManagerAllowedDomain)
        .filter(models.ManagerAllowedDomain.id == domain_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Domain not found")
    db.delete(row)
    db.commit()
    return domain_id


def list_automated_sources(db: Session) -> List[models.AutomatedRosterSource]:
    return (
        db.query(models.AutomatedRosterSource)
        .order_by(models.AutomatedRosterSource.created_at.desc())
        .all()
    )


def sender_matches_automated_sources(
    from_email: str,
    sources: Iterable[models.AutomatedRosterSource],
) -> bool:
    for source in sources:
        if sender_matches_rule(from_email, source.kind, source.pattern):
            return True
    return False


def create_automated_source(db: Session, raw: str) -> models.AutomatedRosterSource:
    try:
        kind, pattern = parse_automated_source_pattern(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    existing = (
        db.query(models.AutomatedRosterSource)
        .filter(
            models.AutomatedRosterSource.kind == kind,
            models.AutomatedRosterSource.pattern == pattern,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="That sender is already allowed.")

    row = models.AutomatedRosterSource(
        id=next_id(db, models.AutomatedRosterSource, "ars"),
        kind=kind,
        pattern=pattern,
        created_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def delete_automated_source(db: Session, source_id: str) -> str:
    row = (
        db.query(models.AutomatedRosterSource)
        .filter(models.AutomatedRosterSource.id == source_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Source not found")
    db.delete(row)
    db.commit()
    return source_id
