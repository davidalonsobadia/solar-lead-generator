"""Integration tests for the property leads CSV export (BE-04).

These exercise ``GET /api/v1/properties/{id}/leads/export`` end-to-end through
the FastAPI app (``TESTING=1`` disables the API-key middleware, see
``conftest``):

* the response is a ``text/csv`` attachment with the right download headers,
* the CSV carries the expected header row and one data row per resolved lead,
* the same BE-03 filters (``job_title``, ``role``, ``location``, ``q``) narrow
  the exported rows,
* an unknown property id responds ``404``.
"""

import csv
import io
from decimal import Decimal

import pytest

from app.domains.companies.models import Company
from app.domains.leads.models import Lead
from app.domains.leads.service import EXPORT_COLUMNS
from app.domains.properties.models import Property
from app.domains.stakeholders.models import Stakeholder, StakeholderRole


def _rows(resp):
    """Parse a CSV export response into a list of dict rows."""
    reader = csv.DictReader(io.StringIO(resp.text))
    return list(reader)


@pytest.fixture
def seeded(db_session):
    """Seed a property with an owner and a property-manager company with leads."""
    costco = Company(
        name="Costco Wholesale",
        website="https://costco.com",
        business_industry="Retail",
        annual_revenue=Decimal("249000000000"),
    )
    acme = Company(name="Acme Property Management", business_industry="Real Estate")
    # A company with a lead that is NOT a stakeholder of the property.
    zenith = Company(name="Zenith Logistics", business_industry="Logistics")
    db_session.add_all([costco, acme, zenith])
    db_session.flush()

    db_session.add_all(
        [
            Lead(
                company_id=costco.id,
                name="Morgan Lee",
                job_title="VP of Facilities",
                email="morgan@costco.com",
                lead_location="San Francisco, CA",
            ),
            Lead(
                company_id=costco.id,
                name="Jordan Avery",
                job_title="Facilities Manager",
                email="jordan@costco.com",
                lead_location="Seattle, WA",
            ),
            Lead(
                company_id=acme.id,
                name="Sam Rivera",
                job_title="Property Manager",
                email="sam@acme.com",
                lead_location="San Francisco, CA",
            ),
            Lead(company_id=zenith.id, name="Casey Stone", job_title="CEO"),
        ]
    )

    p_sf = Property(
        external_id="P-SF",
        address="1051 Market St, San Francisco, CA 94103",
    )
    p_bare = Property(external_id="P-BARE", address="9 Empty Rd, Reno, NV 89501")
    db_session.add_all([p_sf, p_bare])
    db_session.flush()

    db_session.add_all(
        [
            Stakeholder(
                property_id=p_sf.id, company_id=costco.id, role=StakeholderRole.owner
            ),
            Stakeholder(
                property_id=p_sf.id,
                company_id=acme.id,
                role=StakeholderRole.property_manager,
            ),
        ]
    )
    db_session.commit()

    return {
        "p_sf": p_sf.id,
        "p_bare": p_bare.id,
        "costco": costco.id,
        "acme": acme.id,
    }


def test_export_returns_csv_with_download_headers(client, seeded):
    resp = client.get(f"/api/v1/properties/{seeded['p_sf']}/leads/export")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    disposition = resp.headers["content-disposition"]
    assert "attachment" in disposition
    assert f"property-{seeded['p_sf']}-leads.csv" in disposition


def test_export_header_row_and_resolved_leads(client, seeded):
    resp = client.get(f"/api/v1/properties/{seeded['p_sf']}/leads/export")
    assert resp.status_code == 200

    reader = csv.reader(io.StringIO(resp.text))
    rows = list(reader)
    assert rows[0] == EXPORT_COLUMNS

    parsed = _rows(resp)
    names = {row["name"] for row in parsed}
    # Three leads resolve via stakeholders; the Zenith lead is excluded.
    assert names == {"Morgan Lee", "Jordan Avery", "Sam Rivera"}

    by_name = {row["name"]: row for row in parsed}
    morgan = by_name["Morgan Lee"]
    assert morgan["role"] == "owner"
    assert morgan["company_name"] == "Costco Wholesale"
    assert morgan["job_title"] == "VP of Facilities"
    assert by_name["Sam Rivera"]["role"] == "property_manager"


def test_export_honors_job_title_filter(client, seeded):
    resp = client.get(
        f"/api/v1/properties/{seeded['p_sf']}/leads/export",
        params={"job_title": "manager"},
    )
    assert resp.status_code == 200
    names = {row["name"] for row in _rows(resp)}
    assert names == {"Jordan Avery", "Sam Rivera"}


def test_export_honors_role_filter(client, seeded):
    resp = client.get(
        f"/api/v1/properties/{seeded['p_sf']}/leads/export",
        params={"role": "owner"},
    )
    assert resp.status_code == 200
    rows = _rows(resp)
    assert {row["name"] for row in rows} == {"Morgan Lee", "Jordan Avery"}
    assert all(row["role"] == "owner" for row in rows)


def test_export_honors_free_text_q(client, seeded):
    resp = client.get(
        f"/api/v1/properties/{seeded['p_sf']}/leads/export",
        params={"q": "costco"},
    )
    assert resp.status_code == 200
    names = {row["name"] for row in _rows(resp)}
    assert names == {"Morgan Lee", "Jordan Avery"}


def test_export_empty_property_has_only_header(client, seeded):
    resp = client.get(f"/api/v1/properties/{seeded['p_bare']}/leads/export")
    assert resp.status_code == 200
    rows = list(csv.reader(io.StringIO(resp.text)))
    assert rows[0] == EXPORT_COLUMNS
    assert len(rows) == 1


def test_export_unknown_property_returns_404(client, seeded):
    resp = client.get("/api/v1/properties/999999/leads/export")
    assert resp.status_code == 404
