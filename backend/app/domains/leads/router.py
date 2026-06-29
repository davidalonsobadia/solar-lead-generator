"""HTTP routes for the property leads list (BE-03).

Exposes ``GET /properties/{property_id}/leads`` (mounted under ``/api/v1`` by
``app.api.router``), the data behind the Generate Leads screen. The router is
thin: it validates and binds the path/query params, then delegates to
:class:`LeadsService`. Leads are a shared resource, so there is no per-user
filtering — only a verified user is required.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.domains.auth.models import User
from app.domains.auth.utils import get_verified_user
from app.domains.stakeholders.models import StakeholderRole

from .schemas import LeadListResponse
from .service import LeadsService

router = APIRouter(prefix="/properties/{property_id}/leads", tags=["leads"])


@router.get("", response_model=LeadListResponse)
def list_property_leads(
    property_id: int = Path(..., ge=1, description="Property id."),
    job_title: str | None = Query(
        default=None, description="Filter by lead job title (substring, case-insensitive)."
    ),
    role: StakeholderRole | None = Query(
        default=None,
        description="Filter by stakeholder role: owner, tenant or property_manager.",
    ),
    location: str | None = Query(
        default=None, description="Filter by lead location (substring, case-insensitive)."
    ),
    q: str | None = Query(
        default=None,
        description="Free-text search over name, job title, email, location and company.",
    ),
    page: int = Query(default=1, ge=1, description="1-based page number."),
    page_size: int = Query(default=25, ge=1, le=100, description="Items per page."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_verified_user),
) -> LeadListResponse:
    """List the leads reachable for a property, with filtering and paging.

    Leads are resolved through the property's stakeholders -> companies ->
    leads. Each item carries its company and the resolving stakeholder role.
    Responds ``404`` for an unknown property id.
    """
    service = LeadsService(db)
    return service.list_property_leads(
        property_id,
        job_title=job_title,
        role=role,
        location=location,
        q=q,
        page=page,
        page_size=page_size,
    )
