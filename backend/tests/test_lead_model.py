"""Tests for the ``Lead`` model (EPIC 1, leads table).

A lead is a contact person that hangs off a **company** (not a property): the
same decision-makers serve all of a company's properties. The model enforces,
at the database level: a clean round-trip linking a lead to its company, an
index on ``company_id``, and a cascade delete from companies.
"""

from sqlalchemy import inspect, text

from app.domains.companies.models import Company
from app.domains.leads.models import Lead


def _enable_sqlite_fk_enforcement(db_session):
    """SQLite ignores foreign keys unless ``PRAGMA foreign_keys`` is on."""
    db_session.execute(text("PRAGMA foreign_keys=ON"))


def _make_company(db_session):
    company = Company(name="Costco")
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)
    return company


def test_lead_round_trip(db_session):
    """A Lead persists and reads back with its values and company link intact."""
    company = _make_company(db_session)

    lead = Lead(
        company_id=company.id,
        name="Jane Doe",
        job_title="Head of Facilities",
        email="jane@costco.com",
        phone="+1-555-0100",
        linkedin="https://linkedin.com/in/janedoe",
        lead_location="Seattle, WA",
    )
    db_session.add(lead)
    db_session.commit()
    db_session.refresh(lead)

    assert lead.id is not None
    assert lead.created_at is not None

    fetched = db_session.query(Lead).filter_by(company_id=company.id).one()
    assert fetched.name == "Jane Doe"
    assert fetched.job_title == "Head of Facilities"
    assert fetched.email == "jane@costco.com"
    assert fetched.phone == "+1-555-0100"
    assert fetched.linkedin == "https://linkedin.com/in/janedoe"
    assert fetched.lead_location == "Seattle, WA"


def test_company_id_is_indexed(db_session):
    """``company_id`` is indexed so a company's leads resolve quickly."""
    indexes = inspect(db_session.get_bind()).get_indexes("leads")
    indexed_columns = {tuple(ix["column_names"]) for ix in indexes}
    assert ("company_id",) in indexed_columns


def test_deleting_company_cascades_to_leads(db_session):
    """Deleting a company removes its leads (FK ondelete=CASCADE)."""
    _enable_sqlite_fk_enforcement(db_session)
    company = _make_company(db_session)

    db_session.add(Lead(company_id=company.id, name="Jane Doe"))
    db_session.commit()

    db_session.execute(
        text("DELETE FROM companies WHERE id = :cid"), {"cid": company.id}
    )
    db_session.commit()

    assert db_session.query(Lead).count() == 0
