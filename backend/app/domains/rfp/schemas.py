"""Pydantic v2 schemas for the RFP persistence endpoints (EPIC 10).

These power ``POST /api/v1/rfp`` (create) and ``GET /api/v1/rfp/{id}`` (read).
An RFP stores its generated content in ``payload`` (an arbitrary JSON object)
together with the contact details for the recipient. In v1 there is no PDF or
email output — persistence is the deliverable.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict, EmailStr


class RfpCreate(BaseModel):
    """Inputs for creating an RFP.

    ``payload`` is the generated RFP content and is required. ``property_id`` is
    optional: an RFP may be drafted without being tied to a property. A supplied
    ``contact_email`` is validated as an email address.
    """

    property_id: Optional[int] = None
    payload: Dict[str, Any]
    contact_name: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None
    contact_company: Optional[str] = None
    status: str = "draft"


class RfpRead(BaseModel):
    """A persisted RFP as returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    property_id: Optional[int] = None
    payload: Dict[str, Any]
    contact_name: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None
    contact_company: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[datetime] = None
