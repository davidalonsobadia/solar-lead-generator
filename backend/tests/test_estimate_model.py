"""Tests for the ``Estimate`` model (EPIC 1, estimates table).

An estimate persists a generated solar estimate per property: the inputs the
engine ran with, the financial/production outputs it produced, and the raw
Google Solar ``buildingInsights`` response (cached so the API is called once
per property). The model enforces, at the database level: a clean round-trip
of inputs/outputs and the JSON columns, an index on ``property_id``, and a
cascade delete from properties.
"""

from decimal import Decimal

from sqlalchemy import inspect, text

from app.domains.estimates.models import Estimate
from app.domains.properties.models import Property


def _enable_sqlite_fk_enforcement(db_session):
    """SQLite ignores foreign keys unless ``PRAGMA foreign_keys`` is on."""
    db_session.execute(text("PRAGMA foreign_keys=ON"))


def _make_property(db_session):
    prop = Property(address="123 Solar Ave")
    db_session.add(prop)
    db_session.commit()
    db_session.refresh(prop)
    return prop


def test_estimate_round_trip(db_session):
    """An Estimate persists and reads back with its values and property link."""
    prop = _make_property(db_session)

    estimate = Estimate(
        property_id=prop.id,
        system_size_kw=Decimal("125.5"),
        price_per_watt=Decimal("2.75"),
        system_losses_pct=Decimal("14.0"),
        shading_pct=Decimal("5.0"),
        annual_consumption_kwh=Decimal("180000"),
        blended_utility_rate=Decimal("0.18"),
        rate_escalation_pct=Decimal("2.5"),
        include_bess=True,
        annual_production_kwh=Decimal("190000"),
        system_cost=Decimal("345125"),
        net_cost=Decimal("241587.5"),
        annual_savings=Decimal("34200"),
        savings_20yr=Decimal("855000"),
        irr=Decimal("0.142"),
        npv=Decimal("210000"),
        simple_payback_years=Decimal("7.1"),
        co2_offset_20yr=Decimal("2680"),
        status="live",
    )
    db_session.add(estimate)
    db_session.commit()
    db_session.refresh(estimate)

    assert estimate.id is not None
    assert estimate.created_at is not None
    assert estimate.updated_at is not None

    fetched = db_session.query(Estimate).filter_by(property_id=prop.id).one()
    assert fetched.system_size_kw == Decimal("125.5")
    assert fetched.include_bess is True
    assert fetched.annual_production_kwh == Decimal("190000")
    assert fetched.simple_payback_years == Decimal("7.1")
    assert fetched.status == "live"


def test_json_columns_round_trip(db_session):
    """``incentives`` and ``google_solar_raw`` JSON survive a DB round-trip."""
    prop = _make_property(db_session)

    incentives = {"itc": 0.3, "rebates": [{"name": "state", "amount": 5000}]}
    google_solar_raw = {
        "name": "buildings/abc123",
        "solarPotential": {
            "maxArrayPanelsCount": 420,
            "roofSegmentStats": [{"pitchDegrees": 12.3, "azimuthDegrees": 180.0}],
        },
        "nested": {"list": [1, 2, 3], "flag": True, "missing": None},
    }

    db_session.add(
        Estimate(
            property_id=prop.id,
            incentives=incentives,
            google_solar_raw=google_solar_raw,
        )
    )
    db_session.commit()
    db_session.expire_all()

    fetched = db_session.query(Estimate).filter_by(property_id=prop.id).one()
    assert fetched.incentives == incentives
    assert fetched.google_solar_raw == google_solar_raw
    assert fetched.google_solar_raw["solarPotential"]["maxArrayPanelsCount"] == 420
    assert fetched.google_solar_raw["nested"]["missing"] is None


def test_property_id_is_indexed(db_session):
    """``property_id`` is indexed so a property's estimate resolves quickly."""
    indexes = inspect(db_session.get_bind()).get_indexes("estimates")
    indexed_columns = {tuple(ix["column_names"]) for ix in indexes}
    assert ("property_id",) in indexed_columns


def test_deleting_property_cascades_to_estimates(db_session):
    """Deleting a property removes its estimates (FK ondelete=CASCADE)."""
    _enable_sqlite_fk_enforcement(db_session)
    prop = _make_property(db_session)

    db_session.add(Estimate(property_id=prop.id, status="live"))
    db_session.commit()

    db_session.execute(
        text("DELETE FROM properties WHERE id = :pid"), {"pid": prop.id}
    )
    db_session.commit()

    assert db_session.query(Estimate).count() == 0
