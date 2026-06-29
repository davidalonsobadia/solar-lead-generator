"""Business logic for RFP persistence (EPIC 10).

:class:`RfpService` creates and retrieves RFPs. When an RFP is tied to a
property the service verifies the property exists before persisting, so a
dangling FK can never be stored. RFPs are a shared resource, so no per-user
filtering is applied — the router only requires a verified user.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.domains.properties.models import Property

from .models import Rfp
from .schemas import RfpCreate


class RfpService:
    """Service that persists and retrieves RFPs."""

    def __init__(self, db: Session):
        self.db = db

    def create_rfp(self, data: RfpCreate) -> Rfp:
        """Validate and persist a new RFP.

        Raises ``404`` when ``property_id`` is supplied but no such property
        exists, so an RFP never references a missing property.
        """
        if data.property_id is not None:
            property_exists = (
                self.db.query(Property.id)
                .filter(Property.id == data.property_id)
                .first()
            )
            if property_exists is None:
                raise HTTPException(status_code=404, detail="Property not found")

        rfp = Rfp(**data.model_dump())
        self.db.add(rfp)
        self.db.commit()
        self.db.refresh(rfp)
        return rfp

    def get_rfp(self, rfp_id: int) -> Rfp:
        """Return the RFP with the given id, or raise ``404`` if none exists."""
        rfp = self.db.query(Rfp).filter(Rfp.id == rfp_id).first()
        if rfp is None:
            raise HTTPException(status_code=404, detail="RFP not found")
        return rfp
