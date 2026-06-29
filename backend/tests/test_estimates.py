"""Integration tests for the estimate create/recalculate endpoints (SOLAR-03).

These exercise ``POST /api/v1/properties/{id}/estimate`` and
``PUT /api/v1/estimates/{id}`` end-to-end through the FastAPI app (``TESTING=1``
disables the API-key middleware, see ``conftest``). The Google Solar client is
mocked with a call counter so the suite never touches the real API and can assert
the cost rule: **one** lookup per property.

Covers:

* the first create calls the Solar client once and persists ``google_solar_raw``,
* a second create for the same property reuses the cache (no second call),
* recalculation via ``PUT`` never calls the Solar client,
* consumption auto-fill from the EUI benchmark, with a manual value winning,
* the missing-EUI path records a reason in ``status``,
* an explicit consumption on recalc clears a stale missing-EUI ``status``,
* an unknown incentive type yields ``400``,
* invalid slider percentages yield ``422``,
* unknown property/estimate ids yield ``404``.
"""

from decimal import Decimal

import pytest

from app.domains.benchmarks.models import IndustryEnergyBenchmark
from app.domains.companies.models import Company
from app.domains.estimates import service as estimate_service
from app.domains.estimates.models import Estimate
from app.domains.properties.models import Property
from app.domains.stakeholders.models import Stakeholder, StakeholderRole

SOLAR_RESULT = {
    "found": True,
    "roof_segments": [],
    "panel_capacity_watts": 400.0,
    "usable_area_m2": 73.5,
    "max_panels_count": 42,
    "estimated_annual_production_kwh": 16500.0,
    "raw": {"name": "buildings/ChIJ"},
}


@pytest.fixture
def solar_calls(monkeypatch):
    """Mock the Solar client and count how many times it is called."""
    counter = {"count": 0}

    def fake_get_building_insights(lat, lon, **kwargs):
        counter["count"] += 1
        return dict(SOLAR_RESULT)

    monkeypatch.setattr(
        estimate_service, "get_building_insights", fake_get_building_insights
    )
    return counter


@pytest.fixture
def seeded(db_session):
    """A property with a Retail owner (which has an EUI benchmark) and one without."""
    retail = Company(name="Costco Wholesale", business_industry="Retail")
    mining = Company(name="Rio Tinto", business_industry="Mining")
    db_session.add_all([retail, mining])
    db_session.flush()

    p_retail = Property(
        external_id="P-RETAIL",
        address="1051 Market St, San Francisco, CA 94103",
        lat=Decimal("37.7825"),
        lon=Decimal("-122.4119"),
        building_area=Decimal("1000"),
    )
    p_mining = Property(
        external_id="P-MINING",
        address="9 Quarry Rd, Reno, NV 89501",
        lat=Decimal("39.5296"),
        lon=Decimal("-119.8138"),
        building_area=Decimal("2000"),
    )
    db_session.add_all([p_retail, p_mining])
    db_session.flush()

    db_session.add_all(
        [
            Stakeholder(
                property_id=p_retail.id,
                company_id=retail.id,
                role=StakeholderRole.owner,
            ),
            Stakeholder(
                property_id=p_mining.id,
                company_id=mining.id,
                role=StakeholderRole.owner,
            ),
        ]
    )
    # EUI exists for Retail (50 kWh/sqft/yr) but not for Mining.
    db_session.add(
        IndustryEnergyBenchmark(
            business_industry="Retail", eui_kwh_per_sqft_year=Decimal("50")
        )
    )
    db_session.commit()

    return {"p_retail": p_retail.id, "p_mining": p_mining.id}


def test_first_create_calls_solar_once_and_persists_raw(
    client, db_session, seeded, solar_calls
):
    resp = client.post(
        f"/api/v1/properties/{seeded['p_retail']}/estimate", json={}
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["property_id"] == seeded["p_retail"]
    assert body["status"] == "complete"
    # The cached raw blob is internal — not exposed on the read model.
    assert "google_solar_raw" not in body

    assert solar_calls["count"] == 1
    stored = (
        db_session.query(Estimate)
        .filter(Estimate.id == body["id"])
        .one()
    )
    assert stored.google_solar_raw is not None
    assert stored.google_solar_raw["panel_capacity_watts"] == 400.0


def test_second_create_reuses_cached_solar(client, seeded, solar_calls):
    first = client.post(f"/api/v1/properties/{seeded['p_retail']}/estimate", json={})
    assert first.status_code == 201
    second = client.post(f"/api/v1/properties/{seeded['p_retail']}/estimate", json={})
    assert second.status_code == 201
    # Only the first create hit the Solar API.
    assert solar_calls["count"] == 1


def test_recalculate_does_not_call_solar(client, seeded, solar_calls):
    created = client.post(
        f"/api/v1/properties/{seeded['p_retail']}/estimate", json={}
    ).json()
    assert solar_calls["count"] == 1

    resp = client.put(
        f"/api/v1/estimates/{created['id']}",
        json={"system_size_kw": 120, "shading_pct": 10},
    )
    assert resp.status_code == 200
    assert Decimal(resp.json()["system_size_kw"]) == Decimal("120")
    # Recalculation must never call the Solar API again.
    assert solar_calls["count"] == 1


def test_consumption_autofill_from_eui(client, seeded, solar_calls):
    resp = client.post(
        f"/api/v1/properties/{seeded['p_retail']}/estimate", json={}
    )
    assert resp.status_code == 201
    body = resp.json()
    # building_area 1000 * EUI 50 = 50000 kWh.
    assert Decimal(body["annual_consumption_kwh"]) == Decimal("50000")
    assert body["status"] == "complete"


def test_manual_consumption_overrides_autofill(client, seeded, solar_calls):
    resp = client.post(
        f"/api/v1/properties/{seeded['p_retail']}/estimate",
        json={"annual_consumption_kwh": 12345},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert Decimal(body["annual_consumption_kwh"]) == Decimal("12345")
    assert body["status"] == "complete"


def test_missing_eui_records_reason(client, seeded, solar_calls):
    resp = client.post(
        f"/api/v1/properties/{seeded['p_mining']}/estimate", json={}
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["annual_consumption_kwh"] is None
    assert body["status"] == "no EUI benchmark for industry 'Mining'"


def test_recalc_with_consumption_clears_stale_status(client, seeded, solar_calls):
    created = client.post(
        f"/api/v1/properties/{seeded['p_mining']}/estimate", json={}
    ).json()
    assert created["status"] == "no EUI benchmark for industry 'Mining'"

    resp = client.put(
        f"/api/v1/estimates/{created['id']}",
        json={"annual_consumption_kwh": 50000},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert Decimal(body["annual_consumption_kwh"]) == Decimal("50000")
    assert body["status"] == "complete"


def test_unknown_incentive_type_returns_400(client, seeded, solar_calls):
    resp = client.post(
        f"/api/v1/properties/{seeded['p_retail']}/estimate",
        json={"incentives": [{"type": "unknown", "value": 1000}]},
    )
    assert resp.status_code == 400


def test_unknown_incentive_type_on_recalc_returns_400(client, seeded, solar_calls):
    created = client.post(
        f"/api/v1/properties/{seeded['p_retail']}/estimate", json={}
    ).json()
    resp = client.put(
        f"/api/v1/estimates/{created['id']}",
        json={"incentives": [{"type": "bogus", "value": 5}]},
    )
    assert resp.status_code == 400


def test_negative_shading_is_rejected(client, seeded, solar_calls):
    resp = client.post(
        f"/api/v1/properties/{seeded['p_retail']}/estimate",
        json={"shading_pct": -10},
    )
    assert resp.status_code == 422
    # No Solar call should have happened on a validation failure.
    assert solar_calls["count"] == 0


def test_create_unknown_property_returns_404(client, seeded, solar_calls):
    resp = client.post("/api/v1/properties/999999/estimate", json={})
    assert resp.status_code == 404


def test_recalculate_unknown_estimate_returns_404(client, seeded, solar_calls):
    resp = client.put("/api/v1/estimates/999999", json={"system_size_kw": 10})
    assert resp.status_code == 404
