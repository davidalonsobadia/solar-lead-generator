"""Tests for the ``Property`` model (EPIC 1, properties table).

Cover the persistence contract the import pipeline relies on: a row round-trips
through the SQLite test session, numeric/text columns hold the expected values,
text fields are nullable, and ``external_id`` is indexed.
"""

from decimal import Decimal

from sqlalchemy import inspect

from app.domains.properties.models import Property


def test_property_round_trip(db_session):
    """A Property persists and reads back with its values intact."""
    prop = Property(
        external_id="csv-123",
        address="123 Sunny St",
        lat=Decimal("40.7128"),
        lon=Decimal("-74.0060"),
        solar_rooftop_area=Decimal("150.5"),
        building_area=Decimal("200.0"),
        parcel_area=Decimal("500.0"),
        stories=2,
        zoning="R1",
        parcel_use="residential",
        apn="APN-001",
        structure_year_built=1998,
        total_parcel_value=Decimal("350000.00"),
        notes="south-facing roof",
    )
    db_session.add(prop)
    db_session.commit()
    db_session.refresh(prop)

    assert prop.id is not None
    assert prop.created_at is not None
    assert prop.updated_at is not None

    fetched = db_session.query(Property).filter_by(external_id="csv-123").one()
    assert fetched.address == "123 Sunny St"
    assert fetched.lat == Decimal("40.7128")
    assert fetched.lon == Decimal("-74.0060")
    assert fetched.stories == 2
    assert fetched.structure_year_built == 1998
    assert fetched.notes == "south-facing roof"


def test_property_text_fields_nullable(db_session):
    """Only ``id`` is required; text/numeric fields may be omitted."""
    prop = Property()
    db_session.add(prop)
    db_session.commit()
    db_session.refresh(prop)

    assert prop.id is not None
    assert prop.external_id is None
    assert prop.address is None
    assert prop.lat is None
    assert prop.notes is None


def test_external_id_is_indexed(db_session):
    """``external_id`` is indexed for fast import lookups."""
    indexes = inspect(db_session.get_bind()).get_indexes("properties")
    indexed_columns = {tuple(ix["column_names"]) for ix in indexes}
    assert ("external_id",) in indexed_columns
