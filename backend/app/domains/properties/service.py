"""Business logic for the properties list endpoint (BE-01).

:class:`PropertiesService` builds the Results screen feed: it joins each
property to its ``owner`` stakeholder company, counts the leads reachable
through *all* of the property's stakeholder companies, and flags whether a
solar estimate exists — all at the database level so filtering, sorting and
pagination stay correct across pages.

The ``city`` shown per row is derived from the free-text ``address`` because
the data model has no dedicated city column (the canonical CSV stores a full
address such as ``"1051 Market St, San Francisco, CA 94103"``). We treat the
comma-separated segment before the trailing ``"State ZIP"`` part as the city,
and the ``city`` filter matches that same comma-bounded segment.
"""

from __future__ import annotations

from math import ceil
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session, aliased

from app.core.pagination import paginate_query
from app.domains.companies.models import Company
from app.domains.estimates.models import Estimate
from app.domains.leads.models import Lead
from app.domains.properties.models import Property
from app.domains.stakeholders.models import Stakeholder, StakeholderRole

from .schemas import (
    PropertyListItem,
    PropertyListResponse,
    PropertySortBy,
    SortOrder,
)


def _derive_city(address: Optional[str]) -> Optional[str]:
    """Pull the city out of a canonical ``"Street, City, State ZIP"`` address.

    Returns ``None`` when the address is missing or has too few comma-separated
    parts to locate a city (the segment before the trailing state/ZIP part).
    """
    if not address:
        return None
    parts = [part.strip() for part in address.split(",")]
    if len(parts) >= 3:
        return parts[-2] or None
    return None


def _escape_like(value: str) -> str:
    """Escape LIKE wildcards so a city filter matches literally."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class PropertiesService:
    """Read-side service for the shared properties catalogue."""

    def __init__(self, db: Session):
        self.db = db

    def list_properties(
        self,
        *,
        industry: Optional[str] = None,
        city: Optional[str] = None,
        sort_by: Optional[PropertySortBy] = None,
        order: SortOrder = SortOrder.asc,
        page: int = 1,
        page_size: int = 20,
    ) -> PropertyListResponse:
        """Return a filtered, sorted, paginated page of property rows."""
        owner_company = aliased(Company)

        # Leads reachable through any of a property's stakeholder companies.
        leads_subq = (
            self.db.query(
                Stakeholder.property_id.label("property_id"),
                func.count(func.distinct(Lead.id)).label("leads_count"),
            )
            .join(Lead, Lead.company_id == Stakeholder.company_id)
            .group_by(Stakeholder.property_id)
            .subquery()
        )

        # Properties that already have at least one estimate.
        estimate_subq = (
            self.db.query(Estimate.property_id.label("property_id"))
            .distinct()
            .subquery()
        )

        leads_count = func.coalesce(leads_subq.c.leads_count, 0)

        query = (
            self.db.query(
                Property.id,
                Property.external_id,
                Property.address,
                Property.solar_rooftop_area,
                Property.building_area,
                Property.parcel_area,
                owner_company.id.label("owner_company_id"),
                owner_company.name.label("owner_company_name"),
                owner_company.business_industry.label("industry"),
                leads_count.label("leads_count"),
                estimate_subq.c.property_id.label("estimate_property_id"),
            )
            .outerjoin(
                Stakeholder,
                (Stakeholder.property_id == Property.id)
                & (Stakeholder.role == StakeholderRole.owner),
            )
            .outerjoin(owner_company, owner_company.id == Stakeholder.company_id)
            .outerjoin(leads_subq, leads_subq.c.property_id == Property.id)
            .outerjoin(
                estimate_subq, estimate_subq.c.property_id == Property.id
            )
        )

        if industry:
            query = query.filter(
                func.lower(owner_company.business_industry) == industry.lower()
            )

        if city:
            pattern = f"%, {_escape_like(city.lower())},%"
            query = query.filter(
                func.lower(Property.address).like(pattern, escape="\\")
            )

        sort_columns = {
            PropertySortBy.rooftop_area: Property.solar_rooftop_area,
            PropertySortBy.building_area: Property.building_area,
            PropertySortBy.leads: leads_count,
            PropertySortBy.company_name: owner_company.name,
        }
        if sort_by is not None:
            column = sort_columns[sort_by]
            query = query.order_by(
                column.desc() if order == SortOrder.desc else column.asc()
            )
        # Stable tiebreaker so pagination is deterministic across pages.
        query = query.order_by(Property.id.asc())

        rows, total = paginate_query(query, page, page_size)

        items = [
            PropertyListItem(
                id=row.id,
                external_id=row.external_id,
                address=row.address,
                city=_derive_city(row.address),
                industry=row.industry,
                owner_company_id=row.owner_company_id,
                owner_company_name=row.owner_company_name,
                solar_rooftop_area=row.solar_rooftop_area,
                building_area=row.building_area,
                parcel_area=row.parcel_area,
                leads=row.leads_count or 0,
                has_estimate=row.estimate_property_id is not None,
            )
            for row in rows
        ]

        page = max(page, 1)
        page_size = max(page_size, 1)
        total_pages = ceil(total / page_size) if total > 0 else 0

        return PropertyListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )
