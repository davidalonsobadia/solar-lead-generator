"""Tests for the ``Company`` model (EPIC 1, companies table).

Companies are reusable across properties, so the dedup contract the import
pipeline relies on is enforced at the database level: a row round-trips through
the SQLite test session, optional columns are nullable, ``name`` is indexed for
import lookups, and the unique constraint on ``(name, website)`` rejects a
duplicate company.
"""

from decimal import Decimal

import pytest
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError

from app.domains.companies.models import Company


def test_company_round_trip(db_session):
    """A Company persists and reads back with its values intact."""
    company = Company(
        name="Costco",
        website="https://costco.com",
        business_industry="Retail",
        annual_revenue=Decimal("249000000000.00"),
    )
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)

    assert company.id is not None
    assert company.created_at is not None
    assert company.updated_at is not None

    fetched = db_session.query(Company).filter_by(name="Costco").one()
    assert fetched.website == "https://costco.com"
    assert fetched.business_industry == "Retail"
    assert fetched.annual_revenue == Decimal("249000000000.00")


def test_company_optional_fields_nullable(db_session):
    """Only ``name`` is required; website/industry/revenue may be omitted."""
    company = Company(name="Acme Corp")
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)

    assert company.id is not None
    assert company.website is None
    assert company.business_industry is None
    assert company.annual_revenue is None


def test_name_is_indexed(db_session):
    """``name`` is indexed for fast import/upsert lookups."""
    indexes = inspect(db_session.get_bind()).get_indexes("companies")
    indexed_columns = {tuple(ix["column_names"]) for ix in indexes}
    assert ("name",) in indexed_columns


def test_duplicate_name_and_website_rejected(db_session):
    """The unique constraint rejects a duplicate ``name``/``website`` pair."""
    db_session.add(Company(name="Costco", website="https://costco.com"))
    db_session.commit()

    db_session.add(Company(name="Costco", website="https://costco.com"))
    with pytest.raises(IntegrityError):
        db_session.commit()
