"""Integration tests for the estimate PDF export endpoint (EPIC 11 · export).

Exercises ``GET /api/v1/estimates/{id}/pdf`` end-to-end through the FastAPI app
(``TESTING=1`` disables the API-key middleware, see ``conftest``).

Covers:

* a seeded estimate renders an ``application/pdf`` with a non-empty body,
* an unknown estimate id yields ``404``.
"""

from decimal import Decimal

import pytest

from app.domains.estimates.models import Estimate
from app.domains.properties.models import Property


@pytest.fixture
def seeded_estimate(db_session):
    """A property with one fully-computed estimate to render."""
    prop = Property(
        external_id="P-PDF",
        address="1051 Market St, San Francisco, CA 94103",
        lat=Decimal("37.7825"),
        lon=Decimal("-122.4119"),
        building_area=Decimal("1000"),
        solar_rooftop_area=Decimal("800"),
        stories=2,
        structure_year_built=1998,
        zoning="C-3",
    )
    db_session.add(prop)
    db_session.flush()

    estimate = Estimate(
        property_id=prop.id,
        system_size_kw=Decimal("16.8"),
        price_per_watt=Decimal("3.0"),
        annual_production_kwh=Decimal("16500"),
        system_cost=Decimal("50400"),
        net_cost=Decimal("35280"),
        annual_savings=Decimal("3300"),
        savings_20yr=Decimal("82000"),
        irr=Decimal("0.123"),
        npv=Decimal("21000"),
        simple_payback_years=Decimal("10.7"),
        co2_offset_20yr=Decimal("231000"),
        status="complete",
    )
    db_session.add(estimate)
    db_session.commit()
    db_session.refresh(estimate)
    return estimate.id


def test_export_pdf_returns_pdf(client, seeded_estimate):
    resp = client.get(f"/api/v1/estimates/{seeded_estimate}/pdf")

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    # A real PDF starts with the %PDF- magic and has a non-empty body.
    assert resp.content.startswith(b"%PDF-")
    assert len(resp.content) > 0


def test_export_pdf_unknown_estimate_returns_404(client):
    resp = client.get("/api/v1/estimates/999999/pdf")

    assert resp.status_code == 404
