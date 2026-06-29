"""Idempotent development seed for sample California properties.

Run with ``python -m app.seed`` to populate the database with a handful of
realistic California buildings — each with an owner company and at least one
lead — so the Results/Estimate/Leads screens have data to render before the
real CSV import pipeline (EPIC 2) exists.

The data lives in ``backend/data/sample_properties.csv`` (one row per
property + its owner company + a representative lead). Seeding is **idempotent**:
re-running upserts instead of duplicating. The dedup contracts are:

* properties — by ``external_id`` (the id from the CSV),
* companies — by ``(name, website)`` (matches the DB unique constraint),
* stakeholders — by ``(property_id, role=owner)`` (matches the DB unique constraint),
* leads — by ``(company_id, email)``.

This is a direct dev seed, not the CSV import service (CSV-02). It defines its
own simple, fully-populated CSV layout rather than the canonical import template.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path

from sqlalchemy.orm import Session

from app import logger
from app.db.session import SessionLocal
from app.domains.companies.models import Company
from app.domains.leads.models import Lead
from app.domains.properties.models import Property
from app.domains.stakeholders.models import Stakeholder, StakeholderRole

# backend/data/sample_properties.csv, resolved relative to this file so the
# script works regardless of the current working directory.
DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "sample_properties.csv"


@dataclass
class SeedSummary:
    """Counts of rows created during a seed run (zero on a no-op re-run)."""

    properties_created: int = 0
    companies_created: int = 0
    stakeholders_created: int = 0
    leads_created: int = 0
    errors: list[str] = field(default_factory=list)

    def __str__(self) -> str:  # pragma: no cover - convenience only
        return (
            f"properties={self.properties_created} companies={self.companies_created} "
            f"stakeholders={self.stakeholders_created} leads={self.leads_created} "
            f"errors={len(self.errors)}"
        )


def _clean(value: str | None) -> str | None:
    """Trim a CSV cell, treating empty strings as missing values."""
    if value is None:
        return None
    value = value.strip()
    return value or None


def _to_decimal(value: str | None) -> Decimal | None:
    value = _clean(value)
    if value is None:
        return None
    try:
        return Decimal(value)
    except (InvalidOperation, ValueError):
        return None


def _to_int(value: str | None) -> int | None:
    value = _clean(value)
    if value is None:
        return None
    try:
        return int(Decimal(value))
    except (InvalidOperation, ValueError):
        return None


def _parse_location(value: str | None) -> tuple[Decimal | None, Decimal | None]:
    """Split the CSV's combined ``"lat, lon"`` cell into separate numbers."""
    value = _clean(value)
    if value is None:
        return None, None
    parts = [p.strip() for p in value.split(",")]
    if len(parts) != 2:
        return None, None
    return _to_decimal(parts[0]), _to_decimal(parts[1])


def _get_or_create_company(db: Session, row: dict[str, str], summary: SeedSummary) -> Company:
    name = _clean(row.get("company_name"))
    website = _clean(row.get("company_website"))
    company = (
        db.query(Company)
        .filter(Company.name == name, Company.website == website)
        .one_or_none()
    )
    if company is None:
        company = Company(
            name=name,
            website=website,
            business_industry=_clean(row.get("company_business_industry")),
            annual_revenue=_to_decimal(row.get("company_annual_revenue")),
        )
        db.add(company)
        db.flush()
        summary.companies_created += 1
    return company


def _get_or_create_property(db: Session, row: dict[str, str], summary: SeedSummary) -> Property:
    external_id = _clean(row.get("external_id"))
    prop = (
        db.query(Property).filter(Property.external_id == external_id).one_or_none()
    )
    if prop is None:
        lat, lon = _parse_location(row.get("location"))
        prop = Property(
            external_id=external_id,
            address=_clean(row.get("address")),
            lat=lat,
            lon=lon,
            solar_rooftop_area=_to_decimal(row.get("solar_rooftop_area")),
            building_area=_to_decimal(row.get("building_area")),
            parcel_area=_to_decimal(row.get("parcel_area")),
            stories=_to_int(row.get("stories")),
            zoning=_clean(row.get("zoning")),
            parcel_use=_clean(row.get("parcel_use")),
            apn=_clean(row.get("apn")),
            structure_year_built=_to_int(row.get("structure_year_built")),
            total_parcel_value=_to_decimal(row.get("total_parcel_value")),
            notes=_clean(row.get("notes")),
        )
        db.add(prop)
        db.flush()
        summary.properties_created += 1
    return prop


def _ensure_owner_stakeholder(
    db: Session, prop: Property, company: Company, summary: SeedSummary
) -> None:
    existing = (
        db.query(Stakeholder)
        .filter_by(property_id=prop.id, role=StakeholderRole.owner)
        .one_or_none()
    )
    if existing is None:
        db.add(
            Stakeholder(
                property_id=prop.id,
                company_id=company.id,
                role=StakeholderRole.owner,
            )
        )
        db.flush()
        summary.stakeholders_created += 1


def _ensure_lead(
    db: Session, company: Company, row: dict[str, str], summary: SeedSummary
) -> None:
    email = _clean(row.get("lead_email"))
    existing = (
        db.query(Lead).filter_by(company_id=company.id, email=email).one_or_none()
    )
    if existing is None:
        db.add(
            Lead(
                company_id=company.id,
                name=_clean(row.get("lead_name")),
                job_title=_clean(row.get("lead_job_title")),
                email=email,
                phone=_clean(row.get("lead_phone")),
                linkedin=_clean(row.get("lead_linkedin")),
                lead_location=_clean(row.get("lead_location")),
            )
        )
        db.flush()
        summary.leads_created += 1


def seed(db: Session, csv_path: Path | None = None) -> SeedSummary:
    """Upsert the sample properties (and their owner company + lead) into ``db``.

    Returns a :class:`SeedSummary` of what was created; a second call with the
    same data creates nothing. The caller owns the transaction lifecycle —
    ``seed`` flushes but does not commit.
    """
    path = csv_path or DATA_FILE
    summary = SeedSummary()

    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for line_no, row in enumerate(reader, start=2):
            if not _clean(row.get("external_id")):
                summary.errors.append(f"line {line_no}: missing external_id, skipped")
                continue
            company = _get_or_create_company(db, row, summary)
            prop = _get_or_create_property(db, row, summary)
            _ensure_owner_stakeholder(db, prop, company, summary)
            _ensure_lead(db, company, row, summary)

    return summary


def main() -> None:
    """Entry point for ``python -m app.seed``: seed the configured database."""
    db = SessionLocal()
    try:
        summary = seed(db)
        db.commit()
        logger.info("Seed complete: %s", summary)
        for error in summary.errors:
            logger.warning("Seed warning: %s", error)
    except Exception:
        db.rollback()
        logger.exception("Seed failed; rolled back")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
