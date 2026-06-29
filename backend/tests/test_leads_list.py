"""Integration tests for the property leads endpoint (BE-03).

These exercise ``GET /api/v1/properties/{id}/leads`` end-to-end through the
FastAPI app (``TESTING=1`` disables the API-key middleware, see ``conftest``):

* leads are resolved through stakeholders -> companies -> leads for the property,
* each lead carries its company and the resolving stakeholder role,
* the ``job_title``, ``role``, ``location`` and free-text ``q`` filters narrow
  the result set,
* pagination defaults to 25/page and splits the result set correctly,
* an unknown property id responds ``404``.
"""

from decimal import Decimal

import pytest

from app.domains.companies.models import Company
from app.domains.leads.models import Lead
from app.domains.properties.models import Property
from app.domains.stakeholders.models import Stakeholder, StakeholderRole


@pytest.fixture
def seeded(db_session):
    """Seed a property with an owner and a tenant company, each with leads.

    Returns the relevant ids so tests can target specific rows.
    """
    # Owner company with two leads, tenant company with one lead.
    costco = Company(
        name="Costco Wholesale",
        website="https://costco.com",
        business_industry="Retail",
        annual_revenue=Decimal("249000000000"),
    )
    acme = Company(name="Acme Property Management", business_industry="Real Estate")
    # A company with leads that is NOT a stakeholder of the property.
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
            # Lead on a company that is not a stakeholder -> must not resolve.
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


def test_resolves_leads_via_stakeholders_with_company_and_role(client, seeded):
    resp = client.get(f"/api/v1/properties/{seeded['p_sf']}/leads")
    assert resp.status_code == 200
    body = resp.json()

    # Three leads resolve (2 via owner Costco, 1 via property_manager Acme);
    # the Zenith lead is excluded because Zenith is not a stakeholder.
    assert body["total"] == 3
    assert body["page"] == 1
    assert body["page_size"] == 25
    assert len(body["items"]) == 3

    by_name = {item["name"]: item for item in body["items"]}
    assert set(by_name) == {"Morgan Lee", "Jordan Avery", "Sam Rivera"}

    morgan = by_name["Morgan Lee"]
    assert morgan["role"] == "owner"
    assert morgan["company"]["id"] == seeded["costco"]
    assert morgan["company"]["name"] == "Costco Wholesale"
    assert morgan["job_title"] == "VP of Facilities"

    sam = by_name["Sam Rivera"]
    assert sam["role"] == "property_manager"
    assert sam["company"]["id"] == seeded["acme"]


def test_property_with_no_stakeholders_returns_empty(client, seeded):
    resp = client.get(f"/api/v1/properties/{seeded['p_bare']}/leads")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 0
    assert body["items"] == []
    assert body["total_pages"] == 0


def test_unknown_property_returns_404(client, seeded):
    resp = client.get("/api/v1/properties/999999/leads")
    assert resp.status_code == 404


def test_job_title_filter_is_case_insensitive_substring(client, seeded):
    resp = client.get(
        f"/api/v1/properties/{seeded['p_sf']}/leads",
        params={"job_title": "manager"},
    )
    assert resp.status_code == 200
    names = {item["name"] for item in resp.json()["items"]}
    # "Facilities Manager" and "Property Manager" match; "VP of Facilities" not.
    assert names == {"Jordan Avery", "Sam Rivera"}


def test_role_filter(client, seeded):
    resp = client.get(
        f"/api/v1/properties/{seeded['p_sf']}/leads",
        params={"role": "owner"},
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert {item["name"] for item in items} == {"Morgan Lee", "Jordan Avery"}
    assert all(item["role"] == "owner" for item in items)


def test_location_filter(client, seeded):
    resp = client.get(
        f"/api/v1/properties/{seeded['p_sf']}/leads",
        params={"location": "san francisco"},
    )
    assert resp.status_code == 200
    names = {item["name"] for item in resp.json()["items"]}
    assert names == {"Morgan Lee", "Sam Rivera"}


def test_free_text_q_searches_across_fields(client, seeded):
    # Matches on email domain.
    resp = client.get(
        f"/api/v1/properties/{seeded['p_sf']}/leads",
        params={"q": "acme.com"},
    )
    assert resp.status_code == 200
    names = {item["name"] for item in resp.json()["items"]}
    assert names == {"Sam Rivera"}

    # Matches on company name.
    resp = client.get(
        f"/api/v1/properties/{seeded['p_sf']}/leads",
        params={"q": "costco"},
    )
    assert resp.status_code == 200
    names = {item["name"] for item in resp.json()["items"]}
    assert names == {"Morgan Lee", "Jordan Avery"}


def test_pagination_splits_results(client, db_session):
    """30 leads on the owner company paginate at 25/page."""
    company = Company(name="BigCo")
    db_session.add(company)
    db_session.flush()
    db_session.add_all(
        [Lead(company_id=company.id, name=f"Lead {i:02d}") for i in range(30)]
    )
    prop = Property(external_id="P-BIG", address="1 Big St, Reno, NV 89501")
    db_session.add(prop)
    db_session.flush()
    db_session.add(
        Stakeholder(
            property_id=prop.id, company_id=company.id, role=StakeholderRole.owner
        )
    )
    db_session.commit()

    page1 = client.get(f"/api/v1/properties/{prop.id}/leads").json()
    assert page1["total"] == 30
    assert page1["page_size"] == 25
    assert page1["total_pages"] == 2
    assert len(page1["items"]) == 25

    page2 = client.get(
        f"/api/v1/properties/{prop.id}/leads", params={"page": 2}
    ).json()
    assert page2["page"] == 2
    assert len(page2["items"]) == 5

    ids_page1 = {item["id"] for item in page1["items"]}
    ids_page2 = {item["id"] for item in page2["items"]}
    assert ids_page1.isdisjoint(ids_page2)
