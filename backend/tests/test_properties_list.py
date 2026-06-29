"""Integration tests for the properties list endpoint (BE-01).

These exercise ``GET /api/v1/properties`` end-to-end through the FastAPI app
(``TESTING=1`` disables the API-key middleware, see ``conftest``):

* the response carries ``items``/``total``/``page`` and each item exposes area
  metrics, the owner company, industry, the derived city, the leads count and
  ``has_estimate``,
* ``industry`` and ``city`` filters narrow the result set,
* every sort key works in both directions,
* pagination splits the result set correctly,
* ``leads`` and ``has_estimate`` are computed from the relational graph.
"""

from decimal import Decimal

import pytest

from app.domains.companies.models import Company
from app.domains.estimates.models import Estimate
from app.domains.leads.models import Lead
from app.domains.properties.models import Property
from app.domains.stakeholders.models import Stakeholder, StakeholderRole


@pytest.fixture
def seeded(db_session):
    """Seed three properties with owners, leads and one estimate.

    Returns a dict of created ids so tests can assert against specific rows.
    """
    # Companies (owners) in two industries.
    costco = Company(name="Costco Wholesale", business_industry="Retail")
    acme = Company(name="Acme Manufacturing", business_industry="Manufacturing")
    zenith = Company(name="Zenith Logistics", business_industry="Logistics")
    db_session.add_all([costco, acme, zenith])
    db_session.flush()

    # Leads: Costco has 2, Acme has 1, Zenith has 0.
    db_session.add_all(
        [
            Lead(company_id=costco.id, name="Morgan Lee"),
            Lead(company_id=costco.id, name="Jordan Avery"),
            Lead(company_id=acme.id, name="Sam Rivera"),
        ]
    )

    # Properties with addresses in two cities.
    p_sf = Property(
        external_id="P-SF",
        address="1051 Market St, San Francisco, CA 94103",
        solar_rooftop_area=Decimal("18500"),
        building_area=Decimal("42000"),
        parcel_area=Decimal("55000"),
    )
    p_la = Property(
        external_id="P-LA",
        address="200 Spring St, Los Angeles, CA 90012",
        solar_rooftop_area=Decimal("9000"),
        building_area=Decimal("60000"),
        parcel_area=Decimal("70000"),
    )
    p_sf2 = Property(
        external_id="P-SF2",
        address="1 Ferry Building, San Francisco, CA 94111",
        solar_rooftop_area=Decimal("3000"),
        building_area=Decimal("12000"),
        parcel_area=Decimal("15000"),
    )
    db_session.add_all([p_sf, p_la, p_sf2])
    db_session.flush()

    # Owners: SF -> Costco (Retail, 2 leads), LA -> Acme (Manufacturing, 1 lead),
    # SF2 -> Zenith (Logistics, 0 leads).
    db_session.add_all(
        [
            Stakeholder(
                property_id=p_sf.id, company_id=costco.id, role=StakeholderRole.owner
            ),
            Stakeholder(
                property_id=p_la.id, company_id=acme.id, role=StakeholderRole.owner
            ),
            Stakeholder(
                property_id=p_sf2.id, company_id=zenith.id, role=StakeholderRole.owner
            ),
        ]
    )

    # Only the SF property has an estimate.
    db_session.add(Estimate(property_id=p_sf.id, status="complete"))
    db_session.commit()

    return {
        "p_sf": p_sf.id,
        "p_la": p_la.id,
        "p_sf2": p_sf2.id,
    }


def test_list_returns_items_total_page_and_computed_fields(client, seeded):
    resp = client.get("/api/v1/properties")
    assert resp.status_code == 200
    body = resp.json()

    assert body["total"] == 3
    assert body["page"] == 1
    assert len(body["items"]) == 3

    by_external = {item["external_id"]: item for item in body["items"]}

    sf = by_external["P-SF"]
    assert sf["city"] == "San Francisco"
    assert sf["industry"] == "Retail"
    assert sf["owner_company_name"] == "Costco Wholesale"
    assert sf["leads"] == 2
    assert sf["has_estimate"] is True
    assert Decimal(sf["solar_rooftop_area"]) == Decimal("18500")
    assert Decimal(sf["building_area"]) == Decimal("42000")
    assert Decimal(sf["parcel_area"]) == Decimal("55000")

    la = by_external["P-LA"]
    assert la["city"] == "Los Angeles"
    assert la["industry"] == "Manufacturing"
    assert la["leads"] == 1
    assert la["has_estimate"] is False

    sf2 = by_external["P-SF2"]
    assert sf2["leads"] == 0
    assert sf2["has_estimate"] is False


def test_filter_by_industry(client, seeded):
    resp = client.get("/api/v1/properties", params={"industry": "retail"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["external_id"] == "P-SF"


def test_filter_by_city(client, seeded):
    resp = client.get("/api/v1/properties", params={"city": "San Francisco"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    externals = {item["external_id"] for item in body["items"]}
    assert externals == {"P-SF", "P-SF2"}


def test_sort_by_rooftop_area(client, seeded):
    asc = client.get(
        "/api/v1/properties", params={"sort_by": "rooftop_area", "order": "asc"}
    ).json()
    order_asc = [item["external_id"] for item in asc["items"]]
    assert order_asc == ["P-SF2", "P-LA", "P-SF"]

    desc = client.get(
        "/api/v1/properties", params={"sort_by": "rooftop_area", "order": "desc"}
    ).json()
    order_desc = [item["external_id"] for item in desc["items"]]
    assert order_desc == ["P-SF", "P-LA", "P-SF2"]


def test_sort_by_building_area(client, seeded):
    desc = client.get(
        "/api/v1/properties", params={"sort_by": "building_area", "order": "desc"}
    ).json()
    order_desc = [item["external_id"] for item in desc["items"]]
    assert order_desc == ["P-LA", "P-SF", "P-SF2"]


def test_sort_by_leads(client, seeded):
    desc = client.get(
        "/api/v1/properties", params={"sort_by": "leads", "order": "desc"}
    ).json()
    order_desc = [item["external_id"] for item in desc["items"]]
    assert order_desc == ["P-SF", "P-LA", "P-SF2"]


def test_sort_by_company_name(client, seeded):
    asc = client.get(
        "/api/v1/properties", params={"sort_by": "company_name", "order": "asc"}
    ).json()
    order_asc = [item["owner_company_name"] for item in asc["items"]]
    assert order_asc == [
        "Acme Manufacturing",
        "Costco Wholesale",
        "Zenith Logistics",
    ]


def test_pagination(client, seeded):
    first = client.get(
        "/api/v1/properties",
        params={"sort_by": "company_name", "order": "asc", "page": 1, "page_size": 2},
    ).json()
    assert first["total"] == 3
    assert first["page"] == 1
    assert first["page_size"] == 2
    assert first["total_pages"] == 2
    assert [i["owner_company_name"] for i in first["items"]] == [
        "Acme Manufacturing",
        "Costco Wholesale",
    ]

    second = client.get(
        "/api/v1/properties",
        params={"sort_by": "company_name", "order": "asc", "page": 2, "page_size": 2},
    ).json()
    assert second["page"] == 2
    assert [i["owner_company_name"] for i in second["items"]] == ["Zenith Logistics"]


def test_invalid_sort_key_is_rejected(client, seeded):
    resp = client.get("/api/v1/properties", params={"sort_by": "nonsense"})
    assert resp.status_code == 422
