"""Tests for the ``IndustryEnergyBenchmark`` model (EPIC 1, benchmarks table).

Electrical energy-use intensity (EUI) figures are keyed by industry and region.
A row round-trips through the SQLite test session, ``region`` defaults to ``us``
when omitted, ``business_industry`` is indexed for join lookups, and the unique
constraint on ``(business_industry, region)`` rejects a duplicate pair while
still allowing the same industry to hold one figure per region.
"""

from decimal import Decimal

import pytest
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError

from app.domains.benchmarks.models import IndustryEnergyBenchmark


def test_benchmark_round_trip(db_session):
    """An IndustryEnergyBenchmark persists and reads back with its values intact."""
    benchmark = IndustryEnergyBenchmark(
        business_industry="Retail",
        eui_kwh_per_sqft_year=Decimal("14.30"),
        region="california",
        source="CBECS 2018",
        notes="Electrical only.",
    )
    db_session.add(benchmark)
    db_session.commit()
    db_session.refresh(benchmark)

    assert benchmark.id is not None
    assert benchmark.created_at is not None
    assert benchmark.updated_at is not None

    fetched = db_session.query(IndustryEnergyBenchmark).filter_by(
        business_industry="Retail"
    ).one()
    assert fetched.eui_kwh_per_sqft_year == Decimal("14.30")
    assert fetched.region == "california"
    assert fetched.source == "CBECS 2018"
    assert fetched.notes == "Electrical only."


def test_region_defaults_to_us(db_session):
    """``region`` defaults to ``us`` when not provided."""
    benchmark = IndustryEnergyBenchmark(business_industry="Warehouse")
    db_session.add(benchmark)
    db_session.commit()
    db_session.refresh(benchmark)

    assert benchmark.region == "us"
    assert benchmark.eui_kwh_per_sqft_year is None
    assert benchmark.source is None
    assert benchmark.notes is None


def test_business_industry_is_indexed(db_session):
    """``business_industry`` is indexed for fast join lookups against companies."""
    indexes = inspect(db_session.get_bind()).get_indexes("industry_energy_benchmarks")
    indexed_columns = {tuple(ix["column_names"]) for ix in indexes}
    assert ("business_industry",) in indexed_columns


def test_duplicate_industry_and_region_rejected(db_session):
    """The unique constraint rejects a duplicate ``(business_industry, region)`` pair."""
    db_session.add(
        IndustryEnergyBenchmark(business_industry="Retail", region="us")
    )
    db_session.commit()

    db_session.add(
        IndustryEnergyBenchmark(business_industry="Retail", region="us")
    )
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_same_industry_different_region_allowed(db_session):
    """The same industry may hold one figure per region."""
    db_session.add(
        IndustryEnergyBenchmark(business_industry="Retail", region="us")
    )
    db_session.add(
        IndustryEnergyBenchmark(business_industry="Retail", region="california")
    )
    db_session.commit()

    rows = (
        db_session.query(IndustryEnergyBenchmark)
        .filter_by(business_industry="Retail")
        .all()
    )
    assert {row.region for row in rows} == {"us", "california"}
