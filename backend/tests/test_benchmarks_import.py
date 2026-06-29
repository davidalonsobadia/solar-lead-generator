"""Tests for the industry EUI benchmarks CSV import (CSV-05).

These cover the acceptance criteria from the issue, both at the service layer
(:meth:`ImportsService.import_benchmarks`) and end-to-end through
``POST /api/v1/imports/benchmarks``:

* valid rows upsert into ``industry_energy_benchmarks``,
* a duplicate ``(business_industry, region)`` pair updates the existing row
  instead of inserting a second one,
* a negative or non-numeric EUI (and a missing industry) is reported as a
  per-row error without aborting the batch,
* ``region`` defaults to ``us`` when the cell is blank,
* a header that does not match the benchmarks template is a batch-level 422.

CSV bodies are rendered with :func:`csv.writer` so quoting matches the
canonical template exactly (mirroring ``test_csv_import``).
"""

import csv
import io
from decimal import Decimal

from app.domains.benchmarks.models import IndustryEnergyBenchmark
from app.domains.imports.service import BENCHMARK_COLUMNS, ImportsService


def _make_csv(rows):
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(BENCHMARK_COLUMNS)
    for row in rows:
        writer.writerow(row)
    return buffer.getvalue()


def test_valid_rows_upsert(db_session):
    """Valid rows insert one benchmark each with their values intact."""
    content = _make_csv(
        [
            ["Retail", "14.3", "california", "CBECS 2018", "Electrical only."],
            ["Warehouse", "8.5", "", "", ""],
        ]
    )

    summary = ImportsService(db_session).import_benchmarks(content)
    db_session.commit()

    assert summary.rows_ok == 2
    assert summary.benchmarks_created == 2
    assert summary.benchmarks_updated == 0
    assert summary.errors == []

    retail = (
        db_session.query(IndustryEnergyBenchmark)
        .filter_by(business_industry="Retail", region="california")
        .one()
    )
    assert retail.eui_kwh_per_sqft_year == Decimal("14.3")
    assert retail.source == "CBECS 2018"
    assert retail.notes == "Electrical only."

    # Blank region falls back to the default.
    warehouse = (
        db_session.query(IndustryEnergyBenchmark)
        .filter_by(business_industry="Warehouse")
        .one()
    )
    assert warehouse.region == "us"
    assert warehouse.eui_kwh_per_sqft_year == Decimal("8.5")
    assert warehouse.source is None


def test_duplicate_industry_region_updates_not_duplicates(db_session):
    """A repeated ``(industry, region)`` pair updates the existing row in place."""
    service = ImportsService(db_session)
    service.import_benchmarks(
        _make_csv([["Retail", "14.3", "us", "CBECS 2012", "old"]])
    )
    db_session.commit()

    summary = service.import_benchmarks(
        _make_csv([["Retail", "16.1", "us", "CBECS 2018", "new"]])
    )
    db_session.commit()

    assert summary.rows_ok == 1
    assert summary.benchmarks_created == 0
    assert summary.benchmarks_updated == 1

    rows = (
        db_session.query(IndustryEnergyBenchmark)
        .filter_by(business_industry="Retail", region="us")
        .all()
    )
    assert len(rows) == 1
    assert rows[0].eui_kwh_per_sqft_year == Decimal("16.1")
    assert rows[0].source == "CBECS 2018"
    assert rows[0].notes == "new"


def test_same_industry_different_region_inserts_both(db_session):
    """The same industry may hold one figure per region."""
    summary = ImportsService(db_session).import_benchmarks(
        _make_csv(
            [
                ["Retail", "14.3", "us", "", ""],
                ["Retail", "15.0", "california", "", ""],
            ]
        )
    )
    db_session.commit()

    assert summary.benchmarks_created == 2
    regions = {
        row.region
        for row in db_session.query(IndustryEnergyBenchmark).filter_by(
            business_industry="Retail"
        )
    }
    assert regions == {"us", "california"}


def test_invalid_eui_and_missing_industry_reported(db_session):
    """Negative, non-numeric, missing EUI, and missing industry are per-row errors."""
    content = _make_csv(
        [
            ["Retail", "-3", "us", "", ""],
            ["Warehouse", "not-a-number", "us", "", ""],
            ["Office", "", "us", "", ""],
            ["", "10", "us", "", ""],
            ["Hospital", "12.0", "us", "", ""],
        ]
    )

    summary = ImportsService(db_session).import_benchmarks(content)
    db_session.commit()

    assert summary.rows_ok == 1
    assert summary.benchmarks_created == 1
    assert len(summary.errors) == 4

    reasons = {err.line: err.reason for err in summary.errors}
    assert "must be positive" in reasons[2]
    assert "not a valid number" in reasons[3]
    assert "required" in reasons[4]  # missing EUI
    assert "business_industry: required" in reasons[5]

    # Only the valid row persisted.
    assert db_session.query(IndustryEnergyBenchmark).count() == 1


def test_endpoint_valid_returns_summary(client, db_session):
    """A valid benchmarks CSV returns 200 with the summary and persists rows."""
    content = _make_csv([["Retail", "14.3", "us", "CBECS 2018", ""]]).encode("utf-8")

    response = client.post(
        "/api/v1/imports/benchmarks",
        files={"file": ("benchmarks.csv", content, "text/csv")},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["rows_ok"] == 1
    assert body["benchmarks_created"] == 1
    assert body["benchmarks_updated"] == 0
    assert body["errors"] == []

    assert db_session.query(IndustryEnergyBenchmark).count() == 1


def test_endpoint_bad_header_returns_422(client, db_session):
    """A file whose header is not the benchmarks template is a 422, persists nothing."""
    bad = b"wrong,header\n1,2\n"

    response = client.post(
        "/api/v1/imports/benchmarks",
        files={"file": ("benchmarks.csv", bad, "text/csv")},
    )

    assert response.status_code == 422
    assert "header" in response.json()["detail"].lower()
    assert db_session.query(IndustryEnergyBenchmark).count() == 0


def test_endpoint_non_csv_extension_returns_422(client):
    """A non-.csv upload is rejected with 422 before any parsing."""
    response = client.post(
        "/api/v1/imports/benchmarks",
        files={"file": ("data.txt", b"anything", "text/plain")},
    )

    assert response.status_code == 422
    assert ".csv" in response.json()["detail"]
