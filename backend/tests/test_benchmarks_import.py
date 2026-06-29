"""Tests for the industry EUI benchmark CSV import (CSV-04).

Covers both the service (``ImportsService.import_benchmarks``) and the
``POST /api/v1/imports/benchmarks`` endpoint:

* valid rows upsert by ``(business_industry, region)``,
* a duplicate ``(industry, region)`` updates in place instead of duplicating,
* the same industry in two regions yields two distinct rows and ``region``
  defaults to ``us`` when blank,
* non-numeric, NaN/Infinity, negative, and zero EUI values are reported as
  per-row errors and do not abort the rest of the batch,
* a missing required column is a batch-level ``422``.
"""

import csv
import io

from app.domains.benchmarks.models import IndustryEnergyBenchmark
from app.domains.imports.service import (
    BENCHMARK_COLUMNS,
    DEFAULT_BENCHMARK_REGION,
    ImportsService,
)


def _make_csv(rows, header=BENCHMARK_COLUMNS):
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)
    for row in rows:
        writer.writerow(row)
    return buffer.getvalue()


# --- service-level tests --------------------------------------------------


def test_import_benchmarks_valid_rows_insert(db_session):
    content = _make_csv(
        [
            ["Retail", "14.5", "us", "CBECS 2018", "National average"],
            ["Warehouse", "7.2", "", "", ""],
        ]
    )
    summary = ImportsService(db_session).import_benchmarks(content)

    assert summary.rows_ok == 2
    assert summary.benchmarks_created == 2
    assert summary.benchmarks_updated == 0
    assert summary.errors == []

    rows = db_session.query(IndustryEnergyBenchmark).all()
    assert len(rows) == 2
    warehouse = (
        db_session.query(IndustryEnergyBenchmark)
        .filter_by(business_industry="Warehouse")
        .one()
    )
    # Blank region falls back to the default; blank source/notes stay NULL.
    assert warehouse.region == DEFAULT_BENCHMARK_REGION
    assert warehouse.source is None
    assert warehouse.notes is None
    assert float(warehouse.eui_kwh_per_sqft_year) == 7.2


def test_import_benchmarks_duplicate_pair_updates_not_duplicates(db_session):
    service = ImportsService(db_session)
    service.import_benchmarks(_make_csv([["Retail", "14.5", "us", "CBECS", "a"]]))
    summary = service.import_benchmarks(
        _make_csv([["Retail", "16.1", "us", "CEUS", "updated"]])
    )

    assert summary.rows_ok == 1
    assert summary.benchmarks_created == 0
    assert summary.benchmarks_updated == 1

    rows = (
        db_session.query(IndustryEnergyBenchmark)
        .filter_by(business_industry="Retail", region="us")
        .all()
    )
    assert len(rows) == 1
    assert float(rows[0].eui_kwh_per_sqft_year) == 16.1
    assert rows[0].source == "CEUS"
    assert rows[0].notes == "updated"


def test_import_benchmarks_same_industry_different_region(db_session):
    content = _make_csv(
        [
            ["Retail", "14.5", "us", "", ""],
            ["Retail", "16.1", "california", "", ""],
        ]
    )
    summary = ImportsService(db_session).import_benchmarks(content)

    assert summary.benchmarks_created == 2
    assert (
        db_session.query(IndustryEnergyBenchmark)
        .filter_by(business_industry="Retail")
        .count()
        == 2
    )


def test_import_benchmarks_invalid_eui_reported_per_row(db_session):
    content = _make_csv(
        [
            ["Retail", "14.5", "us", "", ""],  # ok
            ["Warehouse", "abc", "us", "", ""],  # non-numeric
            ["Office", "-3", "us", "", ""],  # negative
            ["School", "0", "us", "", ""],  # zero
            ["Hotel", "", "us", "", ""],  # missing
            ["", "5", "us", "", ""],  # missing industry
        ]
    )
    summary = ImportsService(db_session).import_benchmarks(content)

    # The one valid row imports; the five bad rows are reported, batch continues.
    assert summary.rows_ok == 1
    assert summary.benchmarks_created == 1
    assert len(summary.errors) == 5
    reasons = " ".join(e.reason for e in summary.errors)
    assert "not a valid number" in reasons
    assert "must be positive" in reasons
    assert "required" in reasons
    assert (
        db_session.query(IndustryEnergyBenchmark).count() == 1
    )


def test_import_benchmarks_nan_and_inf_are_errors_not_500(db_session):
    """NaN / Infinity are valid ``Decimal`` literals but must be rejected
    gracefully — never persisted, never an unhandled exception."""
    content = _make_csv(
        [
            ["A", "nan", "us", "", ""],
            ["B", "NaN", "us", "", ""],
            ["C", "inf", "us", "", ""],
            ["D", "-Infinity", "us", "", ""],
        ]
    )
    summary = ImportsService(db_session).import_benchmarks(content)

    assert summary.rows_ok == 0
    assert summary.benchmarks_created == 0
    assert len(summary.errors) == 4
    assert all("not a valid number" in e.reason for e in summary.errors)
    assert db_session.query(IndustryEnergyBenchmark).count() == 0


def test_import_benchmarks_missing_required_column_raises(db_session):
    content = _make_csv(
        [["Retail", "us"]],
        header=["business_industry", "region"],
    )
    try:
        ImportsService(db_session).import_benchmarks(content)
    except ValueError as exc:
        assert "eui_kwh_per_sqft_year" in str(exc)
    else:  # pragma: no cover - defensive
        raise AssertionError("expected ValueError for missing required column")


# --- endpoint-level tests -------------------------------------------------


def test_endpoint_valid_returns_summary(client, db_session):
    content = _make_csv([["Retail", "14.5", "us", "CBECS", "x"]]).encode("utf-8")
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


def test_endpoint_bad_eui_does_not_500(client, db_session):
    content = _make_csv(
        [
            ["Retail", "14.5", "us", "", ""],
            ["Warehouse", "nan", "us", "", ""],
        ]
    ).encode("utf-8")
    response = client.post(
        "/api/v1/imports/benchmarks",
        files={"file": ("benchmarks.csv", content, "text/csv")},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["rows_ok"] == 1
    assert len(body["errors"]) == 1
    assert db_session.query(IndustryEnergyBenchmark).count() == 1


def test_endpoint_missing_column_returns_422(client, db_session):
    content = _make_csv(
        [["Retail", "us"]],
        header=["business_industry", "region"],
    ).encode("utf-8")
    response = client.post(
        "/api/v1/imports/benchmarks",
        files={"file": ("benchmarks.csv", content, "text/csv")},
    )

    assert response.status_code == 422
    assert "eui_kwh_per_sqft_year" in response.json()["detail"]
    assert db_session.query(IndustryEnergyBenchmark).count() == 0


def test_endpoint_non_csv_extension_returns_422(client):
    response = client.post(
        "/api/v1/imports/benchmarks",
        files={"file": ("data.txt", b"anything", "text/plain")},
    )
    assert response.status_code == 422
    assert ".csv" in response.json()["detail"]
