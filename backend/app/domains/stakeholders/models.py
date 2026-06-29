import enum

from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.db.base import Base


class StakeholderRole(str, enum.Enum):
    """The role a company plays for a property.

    v1 only materializes ``owner``, but the model supports all three roles so
    later imports can attach property managers and tenants without a migration.
    """

    owner = "owner"
    property_manager = "property_manager"
    tenant = "tenant"


class Stakeholder(Base):
    """The relation between a property and a company, plus the company's role.

    A stakeholder is *just* the relation + role: company data lives in
    ``companies`` and contacts live in ``leads``. The unique constraint on
    ``(property_id, role)`` enforces one stakeholder per role per property.

    The ``property_id`` FK cascades on delete — removing a property removes its
    stakeholders. The ``company_id`` FK intentionally has no cascade: deleting a
    company that still references properties is blocked at the database level
    (a FK violation), since companies are reusable across many properties.
    """

    __tablename__ = "stakeholders"
    __table_args__ = (
        UniqueConstraint("property_id", "role", name="uq_stakeholders_property_role"),
    )

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(
        Integer,
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    company_id = Column(
        Integer,
        ForeignKey("companies.id"),
        nullable=False,
        index=True,
    )
    role = Column(
        Enum(StakeholderRole, name="stakeholder_role"),
        nullable=False,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())
