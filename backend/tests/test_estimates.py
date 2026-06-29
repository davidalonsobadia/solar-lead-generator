"""Integration tests for the estimate create/recalculate endpoints (SOLAR-03).

These exercise ``POST /api/v1/properties/{id}/estimate`` and
``PUT /api/v1/estimates/{id}`` end-to-end through the FastAPI app
(``TESTING=1`` disables the API-key middleware, see ``conftest``). The Google
Solar client is mocked so the suite never touches the real API; a call counter
proves the one-lookup-per-property cost rule:

* the first ``POST`` calls the Solar client once and caches ``google_solar_raw``,
* a second ``POST`` reuses the cached raw and does **not** call the client,
* a ``PUT`` recalculation never calls the client,
* consumption auto-fills from the owner industry's EUI, a manual value wins, and
  a missing EUI leaves consumption empty with the reason recorded.
"""

from decimal import Decimal

import pytest

from app.domains.benchmarks.models import IndustryEnergyBenchmark
from app.domains.companies.models import Company
from app.domains.estimates import service as estimates_service
from app.domains.estimates.models import Estimate
from app.domains.properties.models import Property
from app.domains.stakeholders.models import Stakeholder, StakeholderRole

# A normalized Google Solar result, as the client would return it.
SOLAR_RESULT = {
    "found": True,
    "roof_segments": [],
    "panel_capacity_watts": 400.0,
    "usable_area_m2": 100.0,
    "max_panels_count": 50,
    "estimated_annual_production_kwh": 16500.0,
    "raw": {"name": "buildings/Test"},
}


@pytest.fixture
def solar_calls(monkeypatch):
    """Patch the Solar client with a counting stub; returns the call counter."""
    calls = {"n": 0}

    def fake_get_building_insights(lat, lon, **kwargs):
        calls["n"] += 1
        return dict(SOLAR_RESULT)

    monkeypatch.setattr(
        estimates_service, "get_building_insights", fake_get_building_insights
    )
    return calls


@pytest.fixture
def retail_property(db_session):
    """A property owned by a Retail company, with a Retail EUI benchmark."""
    company = Company(name="Costco Wholesale", business_industry="Retail")
    db_session.add(company)
    db_session.flush()

    prop = Property(
        external_id="P-1",
        address="1051 Market St, San Francisco, CA 94103",
        lat=Decimal("37.7825"),
        lon=Decimal("-122.4119"),
        building_area=Decimal("1000"),
    )
    db_session.add(prop)
    db_session.flush()

    db_session.add(
        Stakeholder(
            property_id=prop.id, company_id=company.id, role=StakeholderRole.owner
        )
    )
    db_session.add(
        IndustryEnergyBenchmark(
            business_industry="Retail", eui_kwh_per_sqft_year=Decimal("5")
        )
    )
    db_session.commit()
    return prop


def test_first_post_calls_solar_once_and_caches_raw(
    client, db_session, solar_calls, retail_property
):
    """First POST calls the Solar client once and persists google_solar_raw."""
    resp = client.post(f"/api/v1/properties/{retail_property.id}/estimate", json={})

    assert resp.status_code == 201
    assert solar_calls["n"] == 1

    body = resp.json()
    assert body["property_id"] == retail_property.id
    # The engine ran: outputs are populated.
    assert body["annual_production_kwh"] is not None
    assert body["system_cost"] is not None

    stored = db_session.query(Estimate).filter_by(id=body["id"]).one()
    assert stored.google_solar_raw is not None
    assert stored.google_solar_raw["panel_capacity_watts"] == 400.0


def test_second_post_reuses_cached_raw_without_calling_solar(
    client, solar_calls, retail_property
):
    """A second POST reuses the cached raw and does not call the Solar client."""
    first = client.post(f"/api/v1/properties/{retail_property.id}/estimate", json={})
    assert first.status_code == 201
    assert solar_calls["n"] == 1

    second = client.post(f"/api/v1/properties/{retail_property.id}/estimate", json={})
    assert second.status_code == 201
    # No additional lookup: still exactly one call across both estimates.
    assert solar_calls["n"] == 1


def test_put_recalculates_without_calling_solar(
    client, solar_calls, retail_property
):
    """PUT recalculates with new inputs and never calls the Solar client."""
    created = client.post(
        f"/api/v1/properties/{retail_property.id}/estimate",
        json={"system_size_kw": 100},
    ).json()
    assert solar_calls["n"] == 1
    before = created["annual_production_kwh"]

    resp = client.put(
        f"/api/v1/estimates/{created['id']}", json={"system_size_kw": 200}
    )
    assert resp.status_code == 200
    # Recalculation must not hit the Solar API again.
    assert solar_calls["n"] == 1

    after = resp.json()
    assert after["id"] == created["id"]
    assert Decimal(after["system_size_kw"]) == Decimal("200")
    # Doubling the system size doubles production.
    assert Decimal(after["annual_production_kwh"]) == Decimal(before) * 2


def test_consumption_autofills_from_industry_eui(
    client, solar_calls, retail_property
):
    """Consumption auto-fills as Building Area x EUI when not supplied."""
    resp = client.post(f"/api/v1/properties/{retail_property.id}/estimate", json={})

    body = resp.json()
    # building_area (1000) * eui (5) = 5000 kWh.
    assert Decimal(body["annual_consumption_kwh"]) == Decimal("5000")
    assert body["status"] == "complete"


def test_manual_consumption_overrides_eui(client, solar_calls, retail_property):
    """A user-supplied consumption value wins over the EUI auto-fill."""
    resp = client.post(
        f"/api/v1/properties/{retail_property.id}/estimate",
        json={"annual_consumption_kwh": 12345},
    )

    body = resp.json()
    assert Decimal(body["annual_consumption_kwh"]) == Decimal("12345")
    assert body["status"] == "complete"


def test_missing_eui_leaves_consumption_empty_with_reason(
    client, db_session, solar_calls
):
    """No EUI benchmark for the owner industry leaves consumption empty."""
    company = Company(name="Acme Mining", business_industry="Mining")
    db_session.add(company)
    db_session.flush()
    prop = Property(
        external_id="P-2",
        lat=Decimal("37.0"),
        lon=Decimal("-122.0"),
        building_area=Decimal("2000"),
    )
    db_session.add(prop)
    db_session.flush()
    db_session.add(
        Stakeholder(
            property_id=prop.id, company_id=company.id, role=StakeholderRole.owner
        )
    )
    db_session.commit()

    resp = client.post(f"/api/v1/properties/{prop.id}/estimate", json={})

    body = resp.json()
    assert body["annual_consumption_kwh"] is None
    assert "EUI" in body["status"]
    assert "Mining" in body["status"]


def test_post_unknown_property_returns_404(client, solar_calls):
    """POST for an unknown property id responds 404 and never calls Solar."""
    resp = client.post("/api/v1/properties/999999/estimate", json={})
    assert resp.status_code == 404
    assert solar_calls["n"] == 0


def test_put_unknown_estimate_returns_404(client, solar_calls):
    """PUT for an unknown estimate id responds 404."""
    resp = client.put("/api/v1/estimates/999999", json={"system_size_kw": 10})
    assert resp.status_code == 404
