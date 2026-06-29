"""HTTP routes for creating and recalculating solar estimates (SOLAR-03).

Two endpoints, both mounted under ``/api/v1`` by ``app.api.router``:

* ``POST /properties/{property_id}/estimate`` creates an estimate, doing at most
  one Google Solar lookup per property (reusing the cached raw response when one
  already exists).
* ``PUT /estimates/{estimate_id}`` recalculates an existing estimate with new
  slider inputs, without ever calling Google Solar again.

The router is thin: it binds path/body params and delegates to
:class:`EstimatesService`. Estimates are a shared resource, so there is no
per-user filtering — only a verified user is required.
"""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends, Path
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.domains.auth.models import User
from app.domains.auth.utils import get_verified_user

from .schemas import EstimateInput, EstimateRead
from .service import EstimatesService

router = APIRouter(tags=["estimates"])


@router.post(
    "/properties/{property_id}/estimate",
    response_model=EstimateRead,
    status_code=201,
)
def create_estimate(
    property_id: int = Path(..., ge=1, description="Property id."),
    data: EstimateInput = Body(default_factory=EstimateInput),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_verified_user),
) -> EstimateRead:
    """Create a solar estimate for a property.

    Runs **one** Google Solar lookup per property: the cached
    ``google_solar_raw`` from a prior estimate is reused when present, otherwise
    the Solar API is called once and cached. Consumption is auto-filled from the
    owner industry's EUI unless a manual value is given. Responds ``404`` for an
    unknown property id.
    """
    service = EstimatesService(db)
    return service.create_estimate(property_id, data)


@router.put("/estimates/{estimate_id}", response_model=EstimateRead)
def recalculate_estimate(
    estimate_id: int = Path(..., ge=1, description="Estimate id."),
    data: EstimateInput = Body(default_factory=EstimateInput),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_verified_user),
) -> EstimateRead:
    """Recalculate an existing estimate with new slider inputs.

    Re-runs the engine over the persisted Solar data and inputs, overwriting
    only the fields provided in the body. Does **not** call Google Solar.
    Responds ``404`` for an unknown estimate id.
    """
    service = EstimatesService(db)
    return service.recalculate_estimate(estimate_id, data)
