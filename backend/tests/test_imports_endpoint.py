"""Integration tests for the CSV import endpoint (CSV-03).

These exercise ``POST /api/v1/imports/csv`` end-to-end through the FastAPI app
(``TESTING=1`` disables the API-key middleware, see ``conftest``):

* a valid canonical CSV uploaded as ``multipart/form-data`` returns ``200`` and
  the CSV-02 summary, and the rows are persisted,
* an upload whose header does not match the template returns ``422`` with a
  clear detail and persists nothing,
* a non-``.csv`` upload and a missing file each return ``422``.

The CSV body is rendered with :func:`csv.writer` so quoting matches the
canonical template exactly (mirroring ``test_csv_import``).
"""

import csv
import io

from app.domains.imports.service import (
    EXPECTED_HEADER,
    PROPERTY_BLOCK_SIZE,
    STAKEHOLDER_BLOCK_SIZE,
)
from app.domains.properties.models import Property

EMPTY_BLOCK = [""] * STAKEHOLDER_BLOCK_SIZE


def _property_block(external_id="CSV-0001", address="1051 Market St", location="37.7806, -122.4109"):
    block = [""] * PROPERTY_BLOCK_SIZE
    block[0] = external_id
    block[1] = address
    block[2] = location
    return block


def _owner_block(
    name="Costco Wholesale",
    phone="+1-415-555-0101",
    email="jordan.avery@costco.example",
    linkedin="https://www.linkedin.com/in/jordan-avery-costco",
    website="https://www.costco.com",
    industry="Retail",
    annual_revenue="226954000000",
    leads="",
):
    return [name, phone, email, linkedin, website, industry, annual_revenue, leads]


def _make_csv(rows):
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(EXPECTED_HEADER)
    for row in rows:
        writer.writerow(row)
    return buffer.getvalue()


def _valid_csv_bytes():
    row = _property_block() + _owner_block() + EMPTY_BLOCK + EMPTY_BLOCK
    return _make_csv([row]).encode("utf-8")


def test_import_csv_valid_returns_summary(client, db_session):
    """A valid canonical CSV returns 200 with the summary and persists rows."""
    response = client.post(
        "/api/v1/imports/csv",
        files={"file": ("import.csv", _valid_csv_bytes(), "text/csv")},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["rows_ok"] == 1
    assert body["properties_created"] == 1
    assert body["companies_created"] == 1
    assert body["stakeholders_created"] == 1
    assert body["errors"] == []

    assert db_session.query(Property).filter_by(external_id="CSV-0001").count() == 1


def test_import_csv_bad_header_returns_422(client, db_session):
    """A file whose header is not the canonical template is a 422, persists nothing."""
    bad = "wrong,header,columns\n1,2,3\n".encode("utf-8")

    response = client.post(
        "/api/v1/imports/csv",
        files={"file": ("import.csv", bad, "text/csv")},
    )

    assert response.status_code == 422
    assert "header" in response.json()["detail"].lower()
    assert db_session.query(Property).count() == 0


def test_import_csv_non_csv_extension_returns_422(client):
    """A non-.csv upload is rejected with 422 before any parsing."""
    response = client.post(
        "/api/v1/imports/csv",
        files={"file": ("data.txt", b"anything", "text/plain")},
    )

    assert response.status_code == 422
    assert ".csv" in response.json()["detail"]


def test_import_csv_missing_file_returns_422(client):
    """Omitting the file entirely yields FastAPI's 422 validation error."""
    response = client.post("/api/v1/imports/csv")

    assert response.status_code == 422


def test_import_csv_empty_file_returns_422(client):
    """An empty upload is rejected with a clear 422 detail."""
    response = client.post(
        "/api/v1/imports/csv",
        files={"file": ("import.csv", b"", "text/csv")},
    )

    assert response.status_code == 422
    assert "empty" in response.json()["detail"].lower()
