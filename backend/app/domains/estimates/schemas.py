"""Pydantic v2 schemas for the estimate create/recalculate endpoints (SOLAR-03).

These power ``POST /api/v1/properties/{id}/estimate`` (create) and
``PUT /api/v1/estimates/{id}`` (recalculate). The inputs mirror the deterministic
engine's parameters; the read model exposes the persisted inputs and outputs but
deliberately omits ``google_solar_raw`` (a large cached blob consumers never need).
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class IncentiveInput(BaseModel):
    """A single incentive applied to the gross system cost.

    ``type`` is ``"percentage"`` (a fraction of the gross cost) or ``"fixed"``
    (an absolute dollar amount). The value is validated against the engine when
    the estimate is computed; an unknown ``type`` yields a ``400``.
    """

    name: Optional[str] = None
    type: str
    value: float = 0.0


class EstimateInput(BaseModel):
    """Inputs for creating an estimate.

    Every field is optional: the service falls back to documented defaults so a
    bare ``POST`` produces a complete estimate. ``annual_consumption_kwh`` left
    unset is auto-filled from the owner industry's EUI benchmark; a supplied
    value takes precedence.
    """

    system_size_kw: Optional[float] = Field(default=None, ge=0.0)
    price_per_watt: Optional[float] = Field(default=None, ge=0.0)
    system_losses_pct: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    shading_pct: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    annual_consumption_kwh: Optional[float] = Field(default=None, ge=0.0)
    blended_utility_rate: Optional[float] = Field(default=None, ge=0.0)
    rate_escalation_pct: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    include_bess: Optional[bool] = None
    incentives: Optional[List[IncentiveInput]] = None


class EstimateUpdate(BaseModel):
    """Partial inputs for recalculating an existing estimate.

    Only the fields present in the request are applied; the rest keep their
    persisted values. Recalculation never calls the Solar API again — it reuses
    the cached ``google_solar_raw``.
    """

    system_size_kw: Optional[float] = Field(default=None, ge=0.0)
    price_per_watt: Optional[float] = Field(default=None, ge=0.0)
    system_losses_pct: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    shading_pct: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    annual_consumption_kwh: Optional[float] = Field(default=None, ge=0.0)
    blended_utility_rate: Optional[float] = Field(default=None, ge=0.0)
    rate_escalation_pct: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    include_bess: Optional[bool] = None
    incentives: Optional[List[IncentiveInput]] = None


class EstimateRead(BaseModel):
    """An estimate's persisted inputs and engine outputs.

    Mirrors the ``estimates`` table but intentionally omits ``google_solar_raw``:
    it is a large internal cache, not part of the public contract.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    property_id: int

    # Inputs the estimate was generated with.
    system_size_kw: Optional[Decimal] = None
    price_per_watt: Optional[Decimal] = None
    system_losses_pct: Optional[Decimal] = None
    shading_pct: Optional[Decimal] = None
    annual_consumption_kwh: Optional[Decimal] = None
    blended_utility_rate: Optional[Decimal] = None
    rate_escalation_pct: Optional[Decimal] = None
    include_bess: Optional[bool] = None
    incentives: Optional[list] = None

    # Outputs the engine produced.
    annual_production_kwh: Optional[Decimal] = None
    system_cost: Optional[Decimal] = None
    net_cost: Optional[Decimal] = None
    annual_savings: Optional[Decimal] = None
    savings_20yr: Optional[Decimal] = None
    irr: Optional[Decimal] = None
    npv: Optional[Decimal] = None
    simple_payback_years: Optional[Decimal] = None
    co2_offset_20yr: Optional[Decimal] = None

    status: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
