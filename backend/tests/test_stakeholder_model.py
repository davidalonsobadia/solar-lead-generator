"""Tests for the ``Stakeholder`` model (EPIC 1, stakeholders table).

A stakeholder records the role a company plays for a property. These tests pin
the contract the import pipeline relies on: a row round-trips, the FK columns
are indexed, the unique constraint on ``(property_id, role)`` rejects a second
stakeholder in the same role, and deleting a property cascades to its
stakeholders.

SQLite does not enforce foreign keys unless ``PRAGMA foreign_keys=ON`` is set
per connection, so the cascade test enables it explicitly.
"""

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from app.domains.companies.models import Company
from app.domains.properties.models import Property
from app.domains.stakeholders.models import Stakeholder, StakeholderRole


def _make_property_and_company(db_session):
    """Persist a property and a company and return them."""
    prop = Property(address="123 Main St")
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


def test_fk_columns_indexed(db_session):
    """``property_id`` and ``company_id`` are indexed for lookups."""
    indexes = inspect(db_session.get_bind()).get_indexes("stakeholders")
    indexed_columns = {tuple(ix["column_names"]) for ix in indexes}
    assert ("property_id",) in indexed_columns
    assert ("company_id",) in indexed_columns


def test_duplicate_property_role_rejected(db_session):
    """The unique constraint rejects a second stakeholder in the same role."""
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


def test_same_property_different_roles_allowed(db_session):
    """A property may have one stakeholder per distinct role."""
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
    """Deleting a property removes its stakeholders via the FK cascade."""
    db_session.execute(text("PRAGMA foreign_keys=ON"))
    prop, company = _make_property_and_company(db_session)

    db_session.add(
        Stakeholder(
            property_id=prop.id, company_id=company.id, role=StakeholderRole.owner
        )
    )
    db_session.commit()

    db_session.delete(prop)
    db_session.commit()

    assert db_session.query(Stakeholder).filter_by(property_id=prop.id).count() == 0
