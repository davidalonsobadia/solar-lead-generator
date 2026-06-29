"""HTTP routes for RFP persistence (EPIC 10).

Exposes ``POST /rfp`` (create) and ``GET /rfp/{rfp_id}`` (read), mounted under
``/api/v1`` by ``app.api.router``. The router is thin: it binds the path/body
params and delegates to :class:`RfpService`. RFPs are a shared resource, so
there is no per-user filtering — only a verified user is required.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Path
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.domains.auth.models import User
from app.domains.auth.utils import get_verified_user

from .schemas import RfpCreate, RfpRead
from .service import RfpService

router = APIRouter(prefix="/rfp", tags=["rfp"])


@router.post("", response_model=RfpRead, status_code=201)
def create_rfp(
    data: RfpCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_verified_user),
) -> RfpRead:
    """Create and persist an RFP.

    Validates the body and stores the generated ``payload`` with its contact
    details. Responds ``404`` when ``property_id`` is supplied but unknown.
    """
    service = RfpService(db)
    return service.create_rfp(data)


@router.get("/{rfp_id}", response_model=RfpRead)
def get_rfp(
    rfp_id: int = Path(..., ge=1, description="RFP id."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_verified_user),
) -> RfpRead:
    """Retrieve a persisted RFP by id. Responds ``404`` for an unknown id."""
    service = RfpService(db)
    return service.get_rfp(rfp_id)
