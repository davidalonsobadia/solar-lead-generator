"""Tests for the canonical CSV import service (CSV-02).

These cover the acceptance criteria from the issue:

* a valid row (Costco) maps to property + company + stakeholder + leads,
* the combined ``"lat, lon"`` cell is split into separate numbers,
* a malformed ``lat, lon`` value and a non-numeric field are reported as
  per-row errors without aborting the batch,
* empty stakeholder blocks are skipped (no company / stakeholder / lead), and
* the same company appearing under two properties is reused, not duplicated.

CSV rows are built with :func:`csv.writer` so quoting/escaping (notably the
JSON ``Leads`` cell) matches the canonical template exactly.
"""

import csv
import io

from app.domains.companies.models import Company
from app.domains.imports.service import (
    EXPECTED_HEADER,
    PROPERTY_BLOCK_SIZE,
    STAKEHOLDER_BLOCK_SIZE,
    ImportsService,
)
from app.domains.leads.models import Lead
from app.domains.properties.models import Property
from app.domains.stakeholders.models import Stakeholder, StakeholderRole

EMPTY_BLOCK = [""] * STAKEHOLDER_BLOCK_SIZE

COSTCO_LEADS_JSON = (
    '[{"name": "Morgan Lee", "job_title": "VP of Real Estate", '
    '"email": "morgan.lee@costco.example", "phone": "+1-415-555-0111", '
    '"linkedin": "https://www.linkedin.com/in/morgan-lee-costco", '
    '"location": "San Francisco, CA"}]'
)


def _property_block(external_id="CSV-0001", address="1051 Market St", location="37.7806, -122.4109"):
    """A 13-cell property block; only the first three cells vary across tests."""
    block = [""] * PROPERTY_BLOCK_SIZE
    block[0] = external_id
    block[1] = address
    block[2] = location
    return block


def _owner_block(
    name="Costco Wholesale",
    website="https://www.costco.com",
    industry="Retail",
    annual_revenue="226954000000",
    leads="",
    phone="+1-415-555-0101",
    email="jordan.avery@costco.example",
    linkedin="https://www.linkedin.com/in/jordan-avery-costco",
):
    return [name, phone, email, linkedin, website, industry, annual_revenue, leads]


def _make_csv(rows):
    """Render the canonical header plus ``rows`` (each a 37-cell list) as text."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(EXPECTED_HEADER)
    for row in rows:
        writer.writerow(row)
    return buffer.getvalue()


def _costco_row(leads=COSTCO_LEADS_JSON):
    return _property_block() + _owner_block(leads=leads) + EMPTY_BLOCK + EMPTY_BLOCK


def test_imports_valid_costco_row(db_session):
    """A valid row creates the property, owner company, stakeholder and leads."""
    content = _make_csv([_costco_row()])
    summary = ImportsService(db_session).import_csv(content)
    db_session.commit()

    assert summary.rows_ok == 1
    assert summary.errors == []

    prop = db_session.query(Property).filter_by(external_id="CSV-0001").one()
    company = db_session.query(Company).filter_by(name="Costco Wholesale").one()

    stakeholder = (
        db_session.query(Stakeholder)
        .filter_by(property_id=prop.id, role=StakeholderRole.owner)
        .one()
    )
    assert stakeholder.company_id == company.id

    leads = db_session.query(Lead).filter_by(company_id=company.id).all()
    # Primary lead (from the block columns) + one additional lead (from JSON).
    assert len(leads) == 2
    names = {lead.name for lead in leads}
    assert "Costco Wholesale" in names
    assert "Morgan Lee" in names


def test_parses_combined_location(db_session):
    """The combined ``"lat, lon"`` cell is split into separate numeric columns."""
    content = _make_csv([_costco_row()])
    ImportsService(db_session).import_csv(content)
    db_session.commit()

    prop = db_session.query(Property).filter_by(external_id="CSV-0001").one()
    assert float(prop.lat) == 37.7806
    assert float(prop.lon) == -122.4109


def test_malformed_location_reports_row_error(db_session):
    """A bad ``lat, lon`` value is a per-row error; the row is not persisted."""
    bad_row = (
        _property_block(location="not-a-coordinate")
        + _owner_block()
        + EMPTY_BLOCK
        + EMPTY_BLOCK
    )
    summary = ImportsService(db_session).import_csv(_make_csv([bad_row]))
    db_session.commit()

    assert summary.rows_ok == 0
    assert len(summary.errors) == 1
    assert summary.errors[0].line == 2
    assert "location" in summary.errors[0].reason
    assert db_session.query(Property).count() == 0
    assert db_session.query(Company).count() == 0


def test_non_numeric_value_reports_row_error(db_session):
    """A non-numeric value in a numeric column is reported as a row error."""
    row = _property_block() + _owner_block(annual_revenue="$226B") + EMPTY_BLOCK + EMPTY_BLOCK
    summary = ImportsService(db_session).import_csv(_make_csv([row]))
    db_session.commit()

    assert summary.rows_ok == 0
    assert len(summary.errors) == 1
    assert "annual_revenue" in summary.errors[0].reason
    assert db_session.query(Company).count() == 0


def test_bad_row_does_not_abort_batch(db_session):
    """A malformed row is skipped while valid rows in the same batch import."""
    good = _costco_row(leads="")
    bad = (
        _property_block(external_id="CSV-9999", location="garbage")
        + _owner_block(name="Broken Co", website="https://broken.example")
        + EMPTY_BLOCK
        + EMPTY_BLOCK
    )
    summary = ImportsService(db_session).import_csv(_make_csv([good, bad]))
    db_session.commit()

    assert summary.rows_ok == 1
    assert len(summary.errors) == 1
    assert summary.errors[0].line == 3
    # The good row persisted; the bad row left nothing behind.
    assert db_session.query(Property).filter_by(external_id="CSV-0001").count() == 1
    assert db_session.query(Property).filter_by(external_id="CSV-9999").count() == 0


def test_empty_stakeholder_blocks_are_skipped(db_session):
    """A row with only an Owner block creates no PM / Tenant rows."""
    content = _make_csv([_costco_row(leads="")])
    summary = ImportsService(db_session).import_csv(content)
    db_session.commit()

    assert summary.rows_ok == 1
    # Only the owner stakeholder and its single company exist.
    assert db_session.query(Stakeholder).count() == 1
    assert db_session.query(Company).count() == 1
    stakeholder = db_session.query(Stakeholder).one()
    assert stakeholder.role == StakeholderRole.owner


def test_company_reused_across_two_properties(db_session):
    """The same company under two properties is reused, not duplicated."""
    row_a = (
        _property_block(external_id="CSV-0001", address="1051 Market St")
        + _owner_block(leads="")
        + EMPTY_BLOCK
        + EMPTY_BLOCK
    )
    row_b = (
        _property_block(external_id="CSV-0002", address="999 Other Ave", location="34.0, -118.0")
        + _owner_block(leads="")
        + EMPTY_BLOCK
        + EMPTY_BLOCK
    )
    summary = ImportsService(db_session).import_csv(_make_csv([row_a, row_b]))
    db_session.commit()

    assert summary.rows_ok == 2
    assert summary.companies_created == 1
    assert db_session.query(Property).count() == 2
    # A single companies row is shared by both properties' owner stakeholders.
    assert db_session.query(Company).filter_by(name="Costco Wholesale").count() == 1
    company = db_session.query(Company).filter_by(name="Costco Wholesale").one()
    stakeholders = (
        db_session.query(Stakeholder).filter_by(company_id=company.id).all()
    )
    assert len(stakeholders) == 2


def test_invalid_leads_json_reports_row_error(db_session):
    """A non-empty ``Leads`` cell that is not valid JSON is a row error."""
    row = _property_block() + _owner_block(leads="not json") + EMPTY_BLOCK + EMPTY_BLOCK
    summary = ImportsService(db_session).import_csv(_make_csv([row]))
    db_session.commit()

    assert summary.rows_ok == 0
    assert len(summary.errors) == 1
    assert "leads" in summary.errors[0].reason
    assert db_session.query(Company).count() == 0


def test_import_is_idempotent(db_session):
    """Re-importing the same file creates no duplicates."""
    content = _make_csv([_costco_row()])
    service = ImportsService(db_session)

    service.import_csv(content)
    db_session.commit()
    first = (
        db_session.query(Property).count(),
        db_session.query(Company).count(),
        db_session.query(Stakeholder).count(),
        db_session.query(Lead).count(),
    )

    second = service.import_csv(content)
    db_session.commit()
    after = (
        db_session.query(Property).count(),
        db_session.query(Company).count(),
        db_session.query(Stakeholder).count(),
        db_session.query(Lead).count(),
    )

    assert first == after
    assert second.properties_created == 0
    assert second.companies_created == 0
    assert second.stakeholders_created == 0
    assert second.leads_created == 0


def test_bad_header_raises(db_session):
    """A file whose header is not the canonical template raises ValueError."""
    bad = "a,b,c\n1,2,3\n"
    service = ImportsService(db_session)
    try:
        service.import_csv(bad)
    except ValueError as exc:
        assert "header" in str(exc)
    else:  # pragma: no cover - defensive
        raise AssertionError("expected ValueError for a bad header")


def test_imports_template_file(db_session):
    """The shipped canonical template parses cleanly (Owner + Property Manager)."""
    from pathlib import Path

    template = (
        Path(__file__).resolve().parent.parent / "data" / "template.csv"
    )
    content = template.read_text(encoding="utf-8")
    summary = ImportsService(db_session).import_csv(content)
    db_session.commit()

    assert summary.rows_ok == 1
    assert summary.errors == []
    # Costco (owner) + CBRE (property manager) => two companies, two stakeholders.
    assert db_session.query(Company).count() == 2
    assert db_session.query(Stakeholder).count() == 2
    roles = {s.role for s in db_session.query(Stakeholder).all()}
    assert roles == {StakeholderRole.owner, StakeholderRole.property_manager}
