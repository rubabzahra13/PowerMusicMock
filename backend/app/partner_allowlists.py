"""Partner allowlists: manager login domains + automated roster senders."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, List, Optional, Sequence, Tuple

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


def normalize_partner_name(raw: str) -> str:
    name = " ".join((raw or "").strip().split())
    if not name:
        raise ValueError("Partner name is required.")
    if len(name) > 120:
        raise ValueError("Partner name is too long.")
    return name


def list_partners(db: Session) -> List[models.Partner]:
    return db.query(models.Partner).order_by(models.Partner.name.asc()).all()


def get_partner_or_404(db: Session, partner_id: str) -> models.Partner:
    partner = db.query(models.Partner).filter(models.Partner.id == partner_id).first()
    if partner is None:
        raise HTTPException(status_code=404, detail="Partner not found")
    return partner


def create_partner(db: Session, raw_name: str) -> models.Partner:
    name = normalize_partner_name(raw_name)
    existing = db.query(models.Partner).filter(models.Partner.name == name).first()
    if existing:
        raise HTTPException(status_code=409, detail="A partner with that name already exists.")
    now = datetime.now(timezone.utc)
    row = models.Partner(
        id=next_id(db, models.Partner, "partner"),
        name=name,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.flush()
    return row


def update_partner_name(db: Session, partner_id: str, raw_name: str) -> models.Partner:
    partner = get_partner_or_404(db, partner_id)
    name = normalize_partner_name(raw_name)
    existing = (
        db.query(models.Partner)
        .filter(models.Partner.name == name, models.Partner.id != partner_id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="A partner with that name already exists.")
    partner.name = name
    partner.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(partner)
    return partner


def list_manager_domains(db: Session, partner_id: Optional[str] = None) -> List[models.ManagerAllowedDomain]:
    query = db.query(models.ManagerAllowedDomain)
    if partner_id:
        query = query.filter(models.ManagerAllowedDomain.partner_id == partner_id)
    return query.order_by(models.ManagerAllowedDomain.created_at.desc()).all()


def list_manager_domain_strings(db: Session, partner_id: Optional[str] = None) -> List[str]:
    return [row.domain for row in list_manager_domains(db, partner_id=partner_id)]


def email_matches_manager_domains(email: str, domains: Sequence[str]) -> bool:
    addr = (email or "").strip().lower()
    if not addr or "@" not in addr:
        return False
    return any(addr.endswith(f"@{domain.lower().lstrip('@')}") for domain in domains)


def resolve_partner_for_manager_email(db: Session, email: str) -> Optional[str]:
    addr = (email or "").strip().lower()
    if not addr or "@" not in addr:
        return None
    domain = addr.rsplit("@", 1)[1]
    rows = (
        db.query(models.ManagerAllowedDomain)
        .filter(models.ManagerAllowedDomain.domain == domain)
        .all()
    )
    partner_ids = {row.partner_id for row in rows if row.partner_id}
    if len(partner_ids) > 1:
        raise HTTPException(
            status_code=409,
            detail=f"Allowed domain @{domain} belongs to multiple partners. Resolve this configuration conflict.",
        )
    return next(iter(partner_ids), None)


def assert_manager_email_allowed(db: Session, email: str) -> str:
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
    partner_id = resolve_partner_for_manager_email(db, email)
    if partner_id is None:
        raise HTTPException(
            status_code=409,
            detail="Manager domain is allowed but is not assigned to a partner.",
        )
    return partner_id


def create_manager_domain(db: Session, raw: str, partner_id: str) -> models.ManagerAllowedDomain:
    get_partner_or_404(db, partner_id)
    try:
        domain = normalize_manager_domain(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    existing = (
        db.query(models.ManagerAllowedDomain)
        .filter(models.ManagerAllowedDomain.domain == domain)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="That domain is already allowed.")
    row = models.ManagerAllowedDomain(
        id=next_id(db, models.ManagerAllowedDomain, "mad"),
        partner_id=partner_id,
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


def list_automated_sources(db: Session, partner_id: Optional[str] = None) -> List[models.AutomatedRosterSource]:
    query = db.query(models.AutomatedRosterSource)
    if partner_id:
        query = query.filter(models.AutomatedRosterSource.partner_id == partner_id)
    return query.order_by(models.AutomatedRosterSource.created_at.desc()).all()


def sender_matches_automated_sources(
    from_email: str,
    sources: Iterable[models.AutomatedRosterSource],
) -> bool:
    for source in sources:
        if sender_matches_rule(from_email, source.kind, source.pattern):
            return True
    return False


def matching_automated_source_partners(
    from_email: str,
    sources: Iterable[models.AutomatedRosterSource],
) -> set[str]:
    partner_ids: set[str] = set()
    for source in sources:
        if source.partner_id and sender_matches_rule(from_email, source.kind, source.pattern):
            partner_ids.add(source.partner_id)
    return partner_ids


def resolve_partner_for_automated_email(
    db: Session,
    *,
    from_email: str,
    inbox_email: Optional[str] = None,
    sources: Optional[Sequence[models.AutomatedRosterSource]] = None,
) -> Optional[str]:
    resolved_sources = list(sources) if sources is not None else list_automated_sources(db)
    source_partner_ids = matching_automated_source_partners(from_email, resolved_sources)
    if not source_partner_ids:
        return None
    inbox_partner_id = None
    if inbox_email:
        account = (
            db.query(models.EmailAccount)
            .filter(models.EmailAccount.email == inbox_email.strip().lower())
            .first()
        )
        if account and account.partner_id:
            inbox_partner_id = account.partner_id
    if len(source_partner_ids) > 1:
        raise HTTPException(
            status_code=409,
            detail="Automated source matches multiple partners. Resolve this configuration conflict.",
        )
    source_partner_id = next(iter(source_partner_ids))
    if inbox_partner_id and inbox_partner_id != source_partner_id:
        raise HTTPException(
            status_code=409,
            detail="Automated sender and destination inbox belong to different partners.",
        )
    return source_partner_id


def create_automated_source(db: Session, raw: str, partner_id: str) -> models.AutomatedRosterSource:
    get_partner_or_404(db, partner_id)
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
        partner_id=partner_id,
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
