from sqlalchemy import (
    Column,
    DateTime,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.db.base import Base


class IndustryEnergyBenchmark(Base):
    """Electrical energy-use intensity (EUI) per industry, used to estimate
    Class-5 annual electrical consumption from a building's area.

    Figures are loaded later from CSV (loader CSV-05); this table may stay
    empty until the client supplies them. ``business_industry`` is the join
    key matching ``companies.business_industry``. The unique constraint on
    ``(business_industry, region)`` lets a single industry hold one figure per
    region (e.g. a California-specific value and a national fallback). EUI is
    electrical kWh per square foot per year — not total energy.
    """

    __tablename__ = "industry_energy_benchmarks"
    __table_args__ = (
        UniqueConstraint(
            "business_industry",
            "region",
            name="uq_industry_energy_benchmarks_industry_region",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    business_industry = Column(String, nullable=False, index=True)
    eui_kwh_per_sqft_year = Column(Numeric, nullable=True)
    region = Column(String, nullable=False, server_default="us", default="us")
    source = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
