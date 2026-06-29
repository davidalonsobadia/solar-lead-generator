"""Integration tests for the RFP persistence endpoints (EPIC 10).

These exercise ``POST /api/v1/rfp`` and ``GET /api/v1/rfp/{id}`` end-to-end
through the FastAPI app (``TESTING=1`` disables the API-key middleware, see
``conftest``).

Covers:

* create then fetch an RFP round-trips the payload and contact fields,
* an RFP can be created without a property (``property_id`` is nullable),
* a supplied but unknown ``property_id`` yields ``404`` on create,
* a missing ``payload`` and an invalid ``contact_email`` yield ``422``,
* ``GET`` for an unknown id yields ``404``.
"""

from decimal import Decimal

import pytest

from app.domains.properties.models import Property


@pytest.fixture
def seeded_property(db_session) -> Property:
    """A persisted property an RFP can be attached to."""
    prop = Property(
        external_id="P-RFP",
        address="1051 Market St, San Francisco, CA 94103",
        lat=Decimal("37.7825"),
        lon=Decimal("-122.4119"),
    )
    db_session.add(prop)
    db_session.commit()
    db_session.refresh(prop)
    return prop


def test_create_then_fetch_rfp(client, seeded_property):
    payload = {
        "property_id": seeded_property.id,
        "payload": {"system_size_kw": 120, "notes": "Rooftop array"},
        "contact_name": "Jane Doe",
        "contact_email": "jane@example.com",
        "contact_phone": "+1-555-0100",
        "contact_company": "Acme Solar",
        "status": "draft",
    }

    create = client.post("/api/v1/rfp", json=payload)
    assert create.status_code == 201, create.text
    created = create.json()
    assert created["id"] >= 1
    assert created["property_id"] == seeded_property.id
    assert created["payload"] == payload["payload"]
    assert created["contact_email"] == "jane@example.com"
    assert created["status"] == "draft"
    assert created["created_at"] is not None

    fetch = client.get(f"/api/v1/rfp/{created['id']}")
    assert fetch.status_code == 200, fetch.text
    assert fetch.json() == created


def test_create_rfp_without_property(client):
    resp = client.post(
        "/api/v1/rfp",
        json={"payload": {"summary": "Standalone draft"}},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["property_id"] is None
    assert body["status"] == "draft"


def test_create_rfp_unknown_property_returns_404(client):
    resp = client.post(
        "/api/v1/rfp",
        json={"property_id": 99999, "payload": {"summary": "x"}},
    )
    assert resp.status_code == 404


def test_create_rfp_missing_payload_returns_422(client):
    resp = client.post("/api/v1/rfp", json={"contact_name": "Jane"})
    assert resp.status_code == 422


def test_create_rfp_invalid_email_returns_422(client):
    resp = client.post(
        "/api/v1/rfp",
        json={"payload": {}, "contact_email": "not-an-email"},
    )
    assert resp.status_code == 422


def test_get_rfp_unknown_id_returns_404(client):
    resp = client.get("/api/v1/rfp/99999")
    assert resp.status_code == 404
