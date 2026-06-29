"""Pydantic v2 schemas for the estimate create/recalculate endpoints (SOLAR-03).

``EstimateInput`` carries the slider inputs shared by both endpoints; every
field is optional so a create can run on defaults and a recalculate can patch a
subset. ``EstimateRead`` is the persisted estimate (inputs + engine outputs)
returned by both endpoints, mirroring the property detail's estimate block.

Percentage inputs (``*_pct``) are whole percentages (e.g. ``14`` for 14%); the
service converts them to the ``[0, 1]`` fractions the engine expects.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict


class EstimateInput(BaseModel):
    """Slider inputs for creating or recalculating an estimate.

    All fields are optional: on create, missing values fall back to engine
    defaults (and ``annual_consumption_kwh`` is auto-filled from the owner's
    industry EUI when not given); on recalculate, only the provided fields are
    overwritten and the rest keep their persisted values.
    """

    system_size_kw: Optional[float] = None
    price_per_watt: Optional[float] = None
    system_losses_pct: Optional[float] = None
    shading_pct: Optional[float] = None
    annual_consumption_kwh: Optional[float] = None
    blended_utility_rate: Optional[float] = None
    rate_escalation_pct: Optional[float] = None
    include_bess: Optional[bool] = None
    incentives: Optional[List[dict]] = None


class EstimateRead(BaseModel):
    """A persisted estimate: the inputs it ran with and the engine outputs."""

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
    incentives: Optional[Any] = None

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
