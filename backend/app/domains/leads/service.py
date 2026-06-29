"""Business logic for the property leads endpoint (BE-03).

:class:`LeadsService` resolves the contacts shown on the Generate Leads screen.
Leads hang off companies, not properties, so a property's leads are reached
through its stakeholders: ``stakeholders -> companies -> leads``. The same lead
can surface under more than one role when its company is a stakeholder of the
property in several roles; each returned item carries the resolving stakeholder
role so the UI can group by it.
"""

from __future__ import annotations

import csv
import io
from math import ceil
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Query, Session

from app.core.pagination import paginate_query
from app.domains.companies.models import Company
from app.domains.leads.models import Lead
from app.domains.properties.models import Property
from app.domains.stakeholders.models import Stakeholder, StakeholderRole

from .schemas import LeadCompany, LeadItem, LeadListResponse

# Header row and field order for the leads CSV export. Kept in one place so the
# header and each row stay in sync.
EXPORT_COLUMNS = [
    "id",
    "name",
    "job_title",
    "email",
    "phone",
    "linkedin",
    "lead_location",
    "role",
    "company_id",
    "company_name",
    "company_website",
    "company_business_industry",
    "company_annual_revenue",
    "created_at",
]


def _escape_like(value: str) -> str:
    """Escape LIKE wildcards so a text filter matches literally."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class LeadsService:
    """Read-side service that resolves a property's leads via its stakeholders."""

    def __init__(self, db: Session):
        self.db = db

    def _build_property_leads_query(
        self,
        property_id: int,
        *,
        job_title: Optional[str] = None,
        role: Optional[StakeholderRole] = None,
        location: Optional[str] = None,
        q: Optional[str] = None,
    ) -> Query:
        """Build the filtered, ordered ``(Lead, Company, role)`` query.

        Raises ``404`` when no property has the given id. Shared by the list and
        export endpoints so both honor the same BE-03 filters.
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
        return query.order_by(Lead.id.asc(), Stakeholder.role.asc())

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
        query = self._build_property_leads_query(
            property_id,
            job_title=job_title,
            role=role,
            location=location,
            q=q,
        )

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

    def export_property_leads_csv(
        self,
        property_id: int,
        *,
        job_title: Optional[str] = None,
        role: Optional[StakeholderRole] = None,
        location: Optional[str] = None,
        q: Optional[str] = None,
    ) -> str:
        """Render a property's filtered leads as a CSV document.

        Honors the same BE-03 filters as :meth:`list_property_leads` but returns
        every matching row (no pagination). Raises ``404`` for an unknown
        property id. The output always carries the header row, even when empty.
        """
        query = self._build_property_leads_query(
            property_id,
            job_title=job_title,
            role=role,
            location=location,
            q=q,
        )

        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(EXPORT_COLUMNS)

        for lead, company, role_value in query.all():
            role_str = (
                role_value.value
                if isinstance(role_value, StakeholderRole)
                else role_value
            )
            writer.writerow(
                [
                    lead.id,
                    lead.name,
                    lead.job_title,
                    lead.email,
                    lead.phone,
                    lead.linkedin,
                    lead.lead_location,
                    role_str,
                    company.id,
                    company.name,
                    company.website,
                    company.business_industry,
                    company.annual_revenue,
                    lead.created_at.isoformat() if lead.created_at else None,
                ]
            )

        return buffer.getvalue()
