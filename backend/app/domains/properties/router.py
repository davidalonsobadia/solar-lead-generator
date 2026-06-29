"""HTTP routes for the properties catalogue (BE-01).

Exposes ``GET /properties`` (mounted under ``/api/v1`` by ``app.api.router``),
the data behind the Results screen. The router is thin: it validates and binds
query params, then delegates to :class:`PropertiesService`. Properties are a
shared resource, so there is no per-user filtering — only a verified user is
required.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.domains.auth.models import User
from app.domains.auth.utils import get_verified_user

from .schemas import PropertyListResponse, PropertySortBy, SortOrder
from .service import PropertiesService

router = APIRouter(prefix="/properties", tags=["properties"])


@router.get("", response_model=PropertyListResponse)
def list_properties(
    industry: str | None = Query(
        default=None, description="Filter by owner company industry (exact, case-insensitive)."
    ),
    city: str | None = Query(
        default=None, description="Filter by city derived from the property address."
    ),
    sort_by: PropertySortBy | None = Query(
        default=None, description="Sort key: rooftop_area, building_area, leads or company_name."
    ),
    order: SortOrder = Query(default=SortOrder.asc, description="Sort direction."),
    page: int = Query(default=1, ge=1, description="1-based page number."),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_verified_user),
) -> PropertyListResponse:
    """List properties for the Results screen with filtering, sorting and paging.

    Each item carries the property's area metrics, its owner company, that
    company's industry, the derived city, the count of leads reachable through
    the property's stakeholder companies, and whether an estimate exists.
    """
    service = PropertiesService(db)
    return service.list_properties(
        industry=industry,
        city=city,
        sort_by=sort_by,
        order=order,
        page=page,
        page_size=page_size,
    )
