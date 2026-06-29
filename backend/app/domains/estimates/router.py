"""HTTP routes for creating and recalculating estimates (SOLAR-03).

Two endpoints live in different path families, so each is wired to its own
prefixed ``APIRouter`` (per the CLAUDE.md convention) and both are exposed
through a combined ``router`` mounted under ``/api/v1`` by ``app.api.router``:

* ``POST /properties/{property_id}/estimate`` — create an estimate, doing at
  most one Google Solar lookup per property.
* ``PUT /estimates/{estimate_id}`` — recalculate with new slider inputs, without
  calling the Solar API again.

The routers are thin: they bind the path/body params and delegate to
:class:`EstimatesService`. Estimates are a shared resource, so there is no
per-user filtering — only a verified user is required.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Path
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.domains.auth.models import User
from app.domains.auth.utils import get_verified_user

from .schemas import EstimateInput, EstimateRead, EstimateUpdate
from .service import EstimatesService

property_estimates_router = APIRouter(
    prefix="/properties/{property_id}/estimate", tags=["estimates"]
)
estimates_router = APIRouter(prefix="/estimates", tags=["estimates"])


@property_estimates_router.post("", response_model=EstimateRead, status_code=201)
def create_estimate(
    property_id: int = Path(..., ge=1, description="Property id."),
    data: EstimateInput = EstimateInput(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_verified_user),
) -> EstimateRead:
    """Create a solar estimate for a property.

    Performs **one** Google Solar lookup per property (reusing the cached
    response when one already exists), runs the deterministic engine and
    persists the result. Consumption is auto-filled from the owner industry's
    EUI benchmark unless a manual value is supplied. Responds ``404`` for an
    unknown property and ``400`` for invalid inputs.
    """
    service = EstimatesService(db)
    return service.create_estimate(property_id, data)


@estimates_router.put("/{estimate_id}", response_model=EstimateRead)
def recalculate_estimate(
    estimate_id: int = Path(..., ge=1, description="Estimate id."),
    data: EstimateUpdate = EstimateUpdate(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_verified_user),
) -> EstimateRead:
    """Recalculate an existing estimate with new slider inputs.

    Reruns the engine over the persisted data and the cached Google Solar
    response **without** calling the Solar API again. Responds ``404`` for an
    unknown estimate and ``400`` for invalid inputs.
    """
    service = EstimatesService(db)
    return service.recalculate_estimate(estimate_id, data)


# Combined router exported to ``app.api.router``.
router = APIRouter()
router.include_router(property_estimates_router)
router.include_router(estimates_router)
