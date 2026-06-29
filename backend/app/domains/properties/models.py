from sqlalchemy import Column, DateTime, Integer, Numeric, String, Text
from sqlalchemy.sql import func

from app.db.base import Base


class Property(Base):
    """A building imported from CSV; the core entity Sunscout works with.

    One row per building. Feeds Results, Estimate and Leads. Numeric fields use
    numeric types; text fields are nullable. ``external_id`` (the id from the CSV)
    is indexed for lookups during import and cross-referencing.
    """

    __tablename__ = "properties"

    id = Column(Integer, primary_key=True, index=True)
    external_id = Column(String, index=True, nullable=True)
    address = Column(String, nullable=True)
    # CSV stores lat/lon combined; parsed into separate numeric columns at import.
    lat = Column(Numeric, nullable=True)
    lon = Column(Numeric, nullable=True)
    solar_rooftop_area = Column(Numeric, nullable=True)
    building_area = Column(Numeric, nullable=True)
    parcel_area = Column(Numeric, nullable=True)
    stories = Column(Integer, nullable=True)
    zoning = Column(String, nullable=True)
    parcel_use = Column(String, nullable=True)
    apn = Column(String, nullable=True)
    structure_year_built = Column(Integer, nullable=True)
    total_parcel_value = Column(Numeric, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
