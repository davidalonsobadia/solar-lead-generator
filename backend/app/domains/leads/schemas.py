"""Pydantic v2 schemas for the property leads endpoint (BE-03).

These power ``GET /api/v1/properties/{id}/leads``, the data behind the Generate
Leads screen. A property has no leads of its own: they are resolved through the
property's stakeholders -> companies -> leads. Each item therefore flattens a
lead with the company it belongs to and the role that company plays for the
property (the stakeholder role).
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class LeadCompany(BaseModel):
    """The company a lead belongs to, as shown on the Generate Leads screen."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    website: Optional[str] = None
    business_industry: Optional[str] = None
    annual_revenue: Optional[Decimal] = None


class LeadItem(BaseModel):
    """A single contact resolved for a property, with its company and role."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: Optional[str] = None
    job_title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin: Optional[str] = None
    lead_location: Optional[str] = None
    # The role the lead's company plays for the property (owner|tenant|
    # property_manager), carried from the resolving stakeholder.
    role: str
    company: LeadCompany
    created_at: Optional[datetime] = None


class LeadListResponse(BaseModel):
    """A page of leads for a property plus pagination metadata."""

    items: List[LeadItem]
    total: int
    page: int
    page_size: int
    total_pages: int
