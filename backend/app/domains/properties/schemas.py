"""Pydantic v2 schemas for the properties list endpoint (BE-01).

These power ``GET /api/v1/properties``, the data behind the Results screen. A
list item flattens the data the UI needs per row: the property's area metrics,
its owner company (resolved via the ``owner`` stakeholder), the company's
industry, the property's city (derived from the address), the number of leads
reachable through the property's stakeholder companies, and whether a solar
estimate already exists.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict


class PropertySortBy(str, Enum):
    """Sortable keys exposed by the list endpoint."""

    rooftop_area = "rooftop_area"
    building_area = "building_area"
    leads = "leads"
    company_name = "company_name"


class SortOrder(str, Enum):
    """Sort direction."""

    asc = "asc"
    desc = "desc"


class PropertyListItem(BaseModel):
    """A single row on the Results screen."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    external_id: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    industry: Optional[str] = None
    owner_company_id: Optional[int] = None
    owner_company_name: Optional[str] = None
    solar_rooftop_area: Optional[Decimal] = None
    building_area: Optional[Decimal] = None
    parcel_area: Optional[Decimal] = None
    leads: int = 0
    has_estimate: bool = False


class PropertyListResponse(BaseModel):
    """A page of property rows plus pagination metadata."""

    items: List[PropertyListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class CompanyDetail(BaseModel):
    """A stakeholder's company as shown on the property detail screen."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    website: Optional[str] = None
    business_industry: Optional[str] = None
    annual_revenue: Optional[Decimal] = None


class StakeholderDetail(BaseModel):
    """A property's stakeholder (its role) plus the associated company."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    company: CompanyDetail


class EstimateDetail(BaseModel):
    """The most recent solar estimate for a property, if one exists."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    property_id: int

    # Inputs the estimate was generated with.
    system_size_kw: Optional[Decimal] = None
    price_per_watt: Optional[Decimal] = None
    system_losses_pct: Optional[Decimal] = None
    shading_pct: Optional[Decimal] = None
    annual_consumption_kwh: Optional[Decimal] = None
    blended_utility_rate: Optional[Decimal] = None
    rate_escalation_pct: Optional[Decimal] = None
    include_bess: Optional[bool] = None
    incentives: Optional[Any] = None

    # Outputs the engine produced.
    annual_production_kwh: Optional[Decimal] = None
    system_cost: Optional[Decimal] = None
    net_cost: Optional[Decimal] = None
    annual_savings: Optional[Decimal] = None
    savings_20yr: Optional[Decimal] = None
    irr: Optional[Decimal] = None
    npv: Optional[Decimal] = None
    simple_payback_years: Optional[Decimal] = None
    co2_offset_20yr: Optional[Decimal] = None

    status: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class PropertyDetail(BaseModel):
    """A single property with its stakeholders and most recent estimate.

    Powers ``GET /api/v1/properties/{id}`` (the Estimate/RFP screens): every
    property field, the property's stakeholders each with their company (only
    the ``owner`` is materialized in v1), and the latest estimate when one
    exists.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    external_id: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[Decimal] = None
    lon: Optional[Decimal] = None
    solar_rooftop_area: Optional[Decimal] = None
    building_area: Optional[Decimal] = None
    parcel_area: Optional[Decimal] = None
    stories: Optional[int] = None
    zoning: Optional[str] = None
    parcel_use: Optional[str] = None
    apn: Optional[str] = None
    structure_year_built: Optional[int] = None
    total_parcel_value: Optional[Decimal] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    leads_count: int = 0
    stakeholders: List[StakeholderDetail] = []
    estimate: Optional[EstimateDetail] = None
