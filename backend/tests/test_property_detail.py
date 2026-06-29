"""Integration tests for the property detail endpoint (#18).

These exercise ``GET /api/v1/properties/{id}`` end-to-end through the FastAPI
app (``TESTING=1`` disables the API-key middleware, see ``conftest``):

* the response carries every property field, the property's stakeholders each
  with their associated company, and the most recent estimate,
* an unknown id responds ``404``,
* a property without an estimate exposes ``estimate: null``,
* when several estimates exist, the latest one is returned.
"""

from decimal import Decimal

import pytest

from app.domains.companies.models import Company
from app.domains.estimates.models import Estimate
from app.domains.properties.models import Property
from app.domains.stakeholders.models import Stakeholder, StakeholderRole


@pytest.fixture
def seeded(db_session):
    """Seed one property with an owner company and two estimates."""
    costco = Company(
        name="Costco Wholesale",
        website="https://costco.com",
        business_industry="Retail",
        annual_revenue=Decimal("249000000000"),
    )
    db_session.add(costco)
    db_session.flush()

    p_sf = Property(
        external_id="P-SF",
        address="1051 Market St, San Francisco, CA 94103",
        lat=Decimal("37.7825"),
        lon=Decimal("-122.4119"),
        solar_rooftop_area=Decimal("18500"),
        building_area=Decimal("42000"),
        parcel_area=Decimal("55000"),
        stories=4,
        zoning="C-3-G",
        notes="Flagship store.",
    )
    # A second property with no stakeholders and no estimate.
    p_bare = Property(external_id="P-BARE", address="9 Empty Rd, Reno, NV 89501")
    db_session.add_all([p_sf, p_bare])
    db_session.flush()

    db_session.add(
        Stakeholder(
            property_id=p_sf.id, company_id=costco.id, role=StakeholderRole.owner
        )
    )

    # Two estimates: the second (higher id) is the most recent.
    db_session.add_all(
        [
            Estimate(property_id=p_sf.id, status="old", system_size_kw=Decimal("100")),
            Estimate(
                property_id=p_sf.id, status="latest", system_size_kw=Decimal("250")
            ),
        ]
    )
    db_session.commit()

    return {
        "p_sf": p_sf.id,
        "p_bare": p_bare.id,
        "costco": costco.id,
    }


def test_detail_returns_property_stakeholders_and_latest_estimate(client, seeded):
    resp = client.get(f"/api/v1/properties/{seeded['p_sf']}")
    assert resp.status_code == 200
    body = resp.json()

    # All property fields are present.
    assert body["id"] == seeded["p_sf"]
    assert body["external_id"] == "P-SF"
    assert body["address"] == "1051 Market St, San Francisco, CA 94103"
    assert Decimal(body["lat"]) == Decimal("37.7825")
    assert Decimal(body["lon"]) == Decimal("-122.4119")
    assert Decimal(body["solar_rooftop_area"]) == Decimal("18500")
    assert Decimal(body["building_area"]) == Decimal("42000")
    assert Decimal(body["parcel_area"]) == Decimal("55000")
    assert body["stories"] == 4
    assert body["zoning"] == "C-3-G"
    assert body["notes"] == "Flagship store."

    # Stakeholders with the associated company.
    assert len(body["stakeholders"]) == 1
    owner = body["stakeholders"][0]
    assert owner["role"] == "owner"
    assert owner["company"]["id"] == seeded["costco"]
    assert owner["company"]["name"] == "Costco Wholesale"
    assert owner["company"]["website"] == "https://costco.com"
    assert owner["company"]["business_industry"] == "Retail"

    # The most recent estimate is returned.
    assert body["estimate"] is not None
    assert body["estimate"]["status"] == "latest"
    assert Decimal(body["estimate"]["system_size_kw"]) == Decimal("250")
    assert body["estimate"]["property_id"] == seeded["p_sf"]


def test_detail_without_estimate_or_stakeholders(client, seeded):
    resp = client.get(f"/api/v1/properties/{seeded['p_bare']}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["external_id"] == "P-BARE"
    assert body["stakeholders"] == []
    assert body["estimate"] is None


def test_detail_unknown_id_returns_404(client, seeded):
    resp = client.get("/api/v1/properties/999999")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Property not found"
