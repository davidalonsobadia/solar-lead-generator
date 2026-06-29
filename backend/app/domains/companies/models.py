from sqlalchemy import Column, DateTime, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.sql import func

from app.db.base import Base


class Company(Base):
    """A company that can act as a stakeholder across many properties.

    Companies are reusable: the same company (e.g. Costco) may be a stakeholder
    of multiple properties, so it must not be duplicated per property. Import
    upserts by ``name`` (plus ``website`` when present) — the unique constraint
    on ``(name, website)`` enforces that dedup contract at the database level.
    Leads and stakeholders reference companies in later tasks.
    """

    __tablename__ = "companies"
    __table_args__ = (
        UniqueConstraint("name", "website", name="uq_companies_name_website"),
    )

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    website = Column(String, nullable=True)
    business_industry = Column(String, nullable=True)
    annual_revenue = Column(Numeric, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
