"""Tests for the development seed script (DB-06).

The seed populates a handful of California properties, each with an owner
company and at least one lead, from ``backend/data/sample_properties.csv``.
These tests assert the acceptance criteria: at least five properties with the
full relationship wired (property -> owner stakeholder -> company -> lead), and
idempotency — running the seed twice creates nothing the second time.
"""

from app.domains.companies.models import Company
from app.domains.leads.models import Lead
from app.domains.properties.models import Property
from app.domains.stakeholders.models import Stakeholder, StakeholderRole
from app.seed import DATA_FILE, seed


def _counts(db_session) -> tuple[int, int, int, int]:
    return (
        db_session.query(Property).count(),
        db_session.query(Company).count(),
        db_session.query(Stakeholder).count(),
        db_session.query(Lead).count(),
    )


def test_seed_inserts_minimum_dataset(db_session):
    """A first seed creates >=5 properties, each with an owner company and a lead."""
    summary = seed(db_session)
    db_session.commit()

    properties, companies, stakeholders, leads = _counts(db_session)
    assert properties >= 5
    assert companies >= 5
    # Every property gets exactly one owner stakeholder.
    assert stakeholders == properties
    # At least one lead per company.
    assert leads >= companies

    assert summary.properties_created == properties
    assert summary.companies_created == companies
    assert summary.leads_created == leads
    assert summary.errors == []


def test_seed_is_idempotent(db_session):
    """Running the seed twice does not create duplicates."""
    seed(db_session)
    db_session.commit()
    first = _counts(db_session)

    second_summary = seed(db_session)
    db_session.commit()
    second = _counts(db_session)

    assert first == second
    assert second_summary.properties_created == 0
    assert second_summary.companies_created == 0
    assert second_summary.stakeholders_created == 0
    assert second_summary.leads_created == 0


def test_seed_wires_property_to_owner_company_and_lead(db_session):
    """The Costco property resolves to its owner company and that company's leads."""
    seed(db_session)
    db_session.commit()

    company = db_session.query(Company).filter_by(name="Costco Wholesale").one()
    prop = db_session.query(Property).filter_by(external_id="CSV-0001").one()

    stakeholder = (
        db_session.query(Stakeholder)
        .filter_by(property_id=prop.id, role=StakeholderRole.owner)
        .one()
    )
    assert stakeholder.company_id == company.id

    # property -> stakeholder -> company -> leads is fully populated.
    leads = db_session.query(Lead).filter_by(company_id=company.id).all()
    assert len(leads) >= 1
    assert all(lead.company_id == company.id for lead in leads)


def test_seed_parses_combined_location(db_session):
    """The combined ``"lat, lon"`` CSV cell is split into separate numbers."""
    seed(db_session)
    db_session.commit()

    prop = db_session.query(Property).filter_by(external_id="CSV-0001").one()
    assert prop.lat is not None
    assert prop.lon is not None
    assert float(prop.lon) < 0  # western hemisphere longitude


def test_sample_csv_exists():
    """The seed ships its data file alongside the script."""
    assert DATA_FILE.exists()
