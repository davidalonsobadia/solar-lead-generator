from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.sql import func

from app.db.base import Base


class Lead(Base):
    """A contact person you reach out to (call/email/phone/LinkedIn).

    Leads hang off the **company**, not the property: a company's
    decision-makers are the same across all its properties, so the Generate
    Leads screen resolves a property's leads via stakeholders -> companies ->
    leads. There is intentionally no property FK here — the property/role is
    derived through the stakeholder relation.

    The ``company_id`` FK cascades on delete: removing a company removes its
    leads, since a lead has no meaning without the company it belongs to.
    """

    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(
        Integer,
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String, nullable=True)
    job_title = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    linkedin = Column(String, nullable=True)
    lead_location = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
