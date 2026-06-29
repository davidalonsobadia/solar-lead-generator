from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.db.base import Base

# JSONB on PostgreSQL (indexable, binary) but plain JSON on SQLite so the test
# suite round-trips without a Postgres-only type.
JSONType = JSON().with_variant(JSONB, "postgresql")


class Rfp(Base):
    """A persisted Request For Proposal generated for a property.

    In v1 the RFP "output" is persistence only: the generated content is stored
    in ``payload`` (a JSON blob) together with the contact details to reach out
    to. PDF rendering and email delivery are deliberately deferred.

    The ``property_id`` FK is **nullable** — an RFP can be drafted without being
    tied to a specific property — and is set to ``NULL`` when its property is
    deleted, so removing a property never deletes the RFP history.
    """

    __tablename__ = "rfps"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(
        Integer,
        ForeignKey("properties.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    payload = Column(JSONType, nullable=False)

    # Contact details for the proposal recipient.
    contact_name = Column(String, nullable=True)
    contact_email = Column(String, nullable=True)
    contact_phone = Column(String, nullable=True)
    contact_company = Column(String, nullable=True)

    status = Column(String, nullable=False, server_default="draft")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
