from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.db.base import Base

# JSONB on PostgreSQL (indexable, binary) but plain JSON on SQLite so the test
# suite round-trips without a Postgres-only type.
JSONType = JSON().with_variant(JSONB, "postgresql")


class Estimate(Base):
    """A generated solar estimate for a property.

    One "live" estimate per property: it stores the inputs the engine ran with,
    the financial/production outputs it produced, and the raw Google Solar
    ``buildingInsights`` response so the Solar API is called only once per
    property. The engine and endpoints that populate these columns arrive in
    later tasks (SOLAR-02/03).

    The ``property_id`` FK cascades on delete: an estimate has no meaning
    without the property it describes.
    """

    __tablename__ = "estimates"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(
        Integer,
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Inputs the estimate was generated with.
    system_size_kw = Column(Numeric, nullable=True)
    price_per_watt = Column(Numeric, nullable=True)
    system_losses_pct = Column(Numeric, nullable=True)
    shading_pct = Column(Numeric, nullable=True)
    annual_consumption_kwh = Column(Numeric, nullable=True)
    blended_utility_rate = Column(Numeric, nullable=True)
    rate_escalation_pct = Column(Numeric, nullable=True)
    include_bess = Column(Boolean, nullable=True)
    incentives = Column(JSONType, nullable=True)

    # Outputs the engine produced.
    annual_production_kwh = Column(Numeric, nullable=True)
    system_cost = Column(Numeric, nullable=True)
    net_cost = Column(Numeric, nullable=True)
    annual_savings = Column(Numeric, nullable=True)
    savings_20yr = Column(Numeric, nullable=True)
    irr = Column(Numeric, nullable=True)
    npv = Column(Numeric, nullable=True)
    simple_payback_years = Column(Numeric, nullable=True)
    co2_offset_20yr = Column(Numeric, nullable=True)

    # Cached raw Google Solar buildingInsights response.
    google_solar_raw = Column(JSONType, nullable=True)

    status = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
