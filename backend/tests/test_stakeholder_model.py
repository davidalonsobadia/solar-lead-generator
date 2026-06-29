"""Tests for the ``Stakeholder`` model (EPIC 1, stakeholders table).

A stakeholder is the relation between a property and a company, plus the role
the company plays for that property. The model enforces, at the database level:
a clean round-trip, one stakeholder per ``(property_id, role)`` pair, indexes on
both foreign keys, a cascade delete from properties, and FK protection that
blocks deleting a company still referenced by a stakeholder.
"""

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from app.domains.companies.models import Company
from app.domains.properties.models import Property
from app.domains.stakeholders.models import Stakeholder, StakeholderRole


def _enable_sqlite_fk_enforcement(db_session):
    """SQLite ignores foreign keys unless ``PRAGMA foreign_keys`` is on."""
    db_session.execute(text("PRAGMA foreign_keys=ON"))


def _make_property_and_company(db_session):
    prop = Property(address="123 Solar Ave")
    company = Company(name="Costco")
    db_session.add_all([prop, company])
    db_session.commit()
    db_session.refresh(prop)
    db_session.refresh(company)
    return prop, company


def test_stakeholder_round_trip(db_session):
    """A Stakeholder persists and reads back with its values intact."""
    prop, company = _make_property_and_company(db_session)

    stakeholder = Stakeholder(
        property_id=prop.id,
        company_id=company.id,
        role=StakeholderRole.owner,
    )
    db_session.add(stakeholder)
    db_session.commit()
    db_session.refresh(stakeholder)

    assert stakeholder.id is not None
    assert stakeholder.created_at is not None

    fetched = db_session.query(Stakeholder).filter_by(property_id=prop.id).one()
    assert fetched.company_id == company.id
    assert fetched.role == StakeholderRole.owner


def test_foreign_keys_are_indexed(db_session):
    """Both ``property_id`` and ``company_id`` are indexed for lookups."""
    indexes = inspect(db_session.get_bind()).get_indexes("stakeholders")
    indexed_columns = {tuple(ix["column_names"]) for ix in indexes}
    assert ("property_id",) in indexed_columns
    assert ("company_id",) in indexed_columns


def test_duplicate_property_role_rejected(db_session):
    """The unique constraint allows only one stakeholder per role per property."""
    prop, company = _make_property_and_company(db_session)

    db_session.add(
        Stakeholder(
            property_id=prop.id, company_id=company.id, role=StakeholderRole.owner
        )
    )
    db_session.commit()

    db_session.add(
        Stakeholder(
            property_id=prop.id, company_id=company.id, role=StakeholderRole.owner
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_distinct_roles_allowed_per_property(db_session):
    """The same property may have stakeholders in different roles."""
    prop, company = _make_property_and_company(db_session)

    db_session.add_all(
        [
            Stakeholder(
                property_id=prop.id,
                company_id=company.id,
                role=StakeholderRole.owner,
            ),
            Stakeholder(
                property_id=prop.id,
                company_id=company.id,
                role=StakeholderRole.property_manager,
            ),
        ]
    )
    db_session.commit()

    assert db_session.query(Stakeholder).filter_by(property_id=prop.id).count() == 2


def test_deleting_property_cascades_to_stakeholders(db_session):
    """Deleting a property removes its stakeholders (FK ondelete=CASCADE)."""
    _enable_sqlite_fk_enforcement(db_session)
    prop, company = _make_property_and_company(db_session)

    db_session.add(
        Stakeholder(
            property_id=prop.id, company_id=company.id, role=StakeholderRole.owner
        )
    )
    db_session.commit()

    db_session.execute(
        text("DELETE FROM properties WHERE id = :pid"), {"pid": prop.id}
    )
    db_session.commit()

    assert db_session.query(Stakeholder).count() == 0


def test_deleting_referenced_company_is_blocked(db_session):
    """Deleting a company still referenced by a stakeholder raises an error."""
    _enable_sqlite_fk_enforcement(db_session)
    prop, company = _make_property_and_company(db_session)

    db_session.add(
        Stakeholder(
            property_id=prop.id, company_id=company.id, role=StakeholderRole.owner
        )
    )
    db_session.commit()

    with pytest.raises(IntegrityError):
        db_session.execute(
            text("DELETE FROM companies WHERE id = :cid"), {"cid": company.id}
        )
        db_session.commit()
