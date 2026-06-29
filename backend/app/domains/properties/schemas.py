"""Pydantic v2 schemas for the properties list endpoint (BE-01).

These power ``GET /api/v1/properties``, the data behind the Results screen. A
list item flattens the data the UI needs per row: the property's area metrics,
its owner company (resolved via the ``owner`` stakeholder), the company's
industry, the property's city (derived from the address), the number of leads
reachable through the property's stakeholder companies, and whether a solar
estimate already exists.
"""

from __future__ import annotations

from decimal import Decimal
from enum import Enum
from typing import List, Optional

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
