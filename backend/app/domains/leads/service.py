"""Business logic for the property leads endpoint (BE-03).

:class:`LeadsService` resolves the contacts shown on the Generate Leads screen.
Leads hang off companies, not properties, so a property's leads are reached
through its stakeholders: ``stakeholders -> companies -> leads``. The same lead
can surface under more than one role when its company is a stakeholder of the
property in several roles; each returned item carries the resolving stakeholder
role so the UI can group by it.
"""

from __future__ import annotations

from math import ceil
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.pagination import paginate_query
from app.domains.companies.models import Company
from app.domains.leads.models import Lead
from app.domains.properties.models import Property
from app.domains.stakeholders.models import Stakeholder, StakeholderRole

from .schemas import LeadCompany, LeadItem, LeadListResponse


def _escape_like(value: str) -> str:
    """Escape LIKE wildcards so a text filter matches literally."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class LeadsService:
    """Read-side service that resolves a property's leads via its stakeholders."""

    def __init__(self, db: Session):
        self.db = db

    def list_property_leads(
        self,
        property_id: int,
        *,
        job_title: Optional[str] = None,
        role: Optional[StakeholderRole] = None,
        location: Optional[str] = None,
        q: Optional[str] = None,
        page: int = 1,
        page_size: int = 25,
    ) -> LeadListResponse:
        """Return a filtered, paginated page of leads for one property.

        Raises ``404`` when no property has the given id. Leads are resolved
        through the property's stakeholder companies; each item carries its
        company and the resolving stakeholder role.
        """
        property_exists = (
            self.db.query(Property.id)
            .filter(Property.id == property_id)
            .first()
        )
        if property_exists is None:
            raise HTTPException(status_code=404, detail="Property not found")

        # No ORM relationships are defined in this codebase, so join the graph
        # explicitly: stakeholders of the property -> their companies -> leads.
        query = (
            self.db.query(Lead, Company, Stakeholder.role.label("role"))
            .join(Stakeholder, Stakeholder.company_id == Lead.company_id)
            .join(Company, Company.id == Lead.company_id)
            .filter(Stakeholder.property_id == property_id)
        )

        if job_title:
            pattern = f"%{_escape_like(job_title.lower())}%"
            query = query.filter(
                func.lower(Lead.job_title).like(pattern, escape="\\")
            )

        if role is not None:
            query = query.filter(Stakeholder.role == role)

        if location:
            pattern = f"%{_escape_like(location.lower())}%"
            query = query.filter(
                func.lower(Lead.lead_location).like(pattern, escape="\\")
            )

        if q:
            pattern = f"%{_escape_like(q.lower())}%"
            query = query.filter(
                or_(
                    func.lower(Lead.name).like(pattern, escape="\\"),
                    func.lower(Lead.job_title).like(pattern, escape="\\"),
                    func.lower(Lead.email).like(pattern, escape="\\"),
                    func.lower(Lead.lead_location).like(pattern, escape="\\"),
                    func.lower(Company.name).like(pattern, escape="\\"),
                )
            )

        # Stable ordering so pagination is deterministic across pages: a lead
        # can appear once per stakeholder role, so tiebreak on the role too.
        query = query.order_by(Lead.id.asc(), Stakeholder.role.asc())

        rows, total = paginate_query(query, page, page_size)

        items = [
            LeadItem(
                id=lead.id,
                name=lead.name,
                job_title=lead.job_title,
                email=lead.email,
                phone=lead.phone,
                linkedin=lead.linkedin,
                lead_location=lead.lead_location,
                role=role_value.value
                if isinstance(role_value, StakeholderRole)
                else role_value,
                company=LeadCompany.model_validate(company),
                created_at=lead.created_at,
            )
            for lead, company, role_value in rows
        ]

        page = max(page, 1)
        page_size = max(page_size, 1)
        total_pages = ceil(total / page_size) if total > 0 else 0

        return LeadListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )
