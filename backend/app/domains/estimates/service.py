"""Business logic for creating and recalculating solar estimates (SOLAR-03).

:class:`EstimatesService` enforces the key cost rule: **one** Google Solar
lookup per property. The first ``POST`` for a property calls the Solar client
and persists the normalized result in ``google_solar_raw``; every later create
or recalculation reuses that cached blob, so the Solar API is never hit twice
for the same property. The slider inputs then recalculate over the persisted
data through the deterministic :mod:`~app.domains.estimates.engine`.

On create, ``annual_consumption_kwh`` is auto-filled from the owner industry's
EUI benchmark (``building_area`` x EUI). A user-supplied value always wins. When
no benchmark exists for the industry, consumption is left empty and the reason is
recorded in ``status``.
"""

from __future__ import annotations

import math
from decimal import Decimal
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.domains.benchmarks.models import IndustryEnergyBenchmark
from app.domains.companies.models import Company
from app.domains.properties.models import Property
from app.domains.stakeholders.models import Stakeholder, StakeholderRole

from . import engine
from .google_solar import GoogleSolarError, get_building_insights, no_data_result
from .models import Estimate
from .schemas import EstimateInput, EstimateUpdate

# Defaults applied when an input slider is not supplied, so a bare create still
# yields a complete estimate. Percentages are 0-100; rates are in $/kWh.
DEFAULT_PRICE_PER_WATT = 3.0
DEFAULT_SYSTEM_LOSSES_PCT = 14.0
DEFAULT_SHADING_PCT = 0.0
DEFAULT_BLENDED_UTILITY_RATE = 0.20
DEFAULT_RATE_ESCALATION_PCT = 2.5

# Discount rate used for the stored NPV figure.
DEFAULT_DISCOUNT_RATE = 0.08

# Status recorded when the estimate computed cleanly.
STATUS_COMPLETE = "complete"


def _f(value: Any) -> Optional[float]:
    """Coerce a stored ``Decimal``/number to ``float`` (``None`` passes through)."""
    if value is None:
        return None
    return float(value)


def _finite_or_none(value: Optional[float]) -> Optional[float]:
    """Return ``value`` only when finite, else ``None``.

    Keeps ``inf``/``nan`` (e.g. infinite payback or a non-existent IRR) out of
    the persisted columns and the JSON response, which cannot represent them.
    """
    if value is None or not math.isfinite(value):
        return None
    return value


class EstimatesService:
    """Create and recalculate estimates with a single Solar lookup per property."""

    def __init__(self, db: Session):
        self.db = db

    # -- public API ---------------------------------------------------------

    def create_estimate(self, property_id: int, data: EstimateInput) -> Estimate:
        """Create an estimate for a property, doing at most one Solar lookup.

        Reuses any cached ``google_solar_raw`` for the property; only fetches
        from the Solar API when none exists yet. Auto-fills consumption from the
        owner industry's EUI benchmark unless a manual value is supplied.
        Raises ``404`` for an unknown property and ``400`` for invalid inputs.
        """
        property_obj = (
            self.db.query(Property).filter(Property.id == property_id).one_or_none()
        )
        if property_obj is None:
            raise HTTPException(status_code=404, detail="Property not found")

        # One lookup per property: reuse the cached result if present, otherwise
        # fetch once and let this estimate persist it.
        solar = self._cached_solar(property_id)
        if solar is None:
            solar = self._fetch_solar(property_obj)

        estimate = Estimate(property_id=property_id, google_solar_raw=solar)

        estimate.system_size_kw = data.system_size_kw
        estimate.price_per_watt = (
            data.price_per_watt
            if data.price_per_watt is not None
            else DEFAULT_PRICE_PER_WATT
        )
        estimate.system_losses_pct = (
            data.system_losses_pct
            if data.system_losses_pct is not None
            else DEFAULT_SYSTEM_LOSSES_PCT
        )
        estimate.shading_pct = (
            data.shading_pct if data.shading_pct is not None else DEFAULT_SHADING_PCT
        )
        estimate.blended_utility_rate = (
            data.blended_utility_rate
            if data.blended_utility_rate is not None
            else DEFAULT_BLENDED_UTILITY_RATE
        )
        estimate.rate_escalation_pct = (
            data.rate_escalation_pct
            if data.rate_escalation_pct is not None
            else DEFAULT_RATE_ESCALATION_PCT
        )
        estimate.include_bess = bool(data.include_bess)
        estimate.incentives = (
            [inc.model_dump() for inc in data.incentives]
            if data.incentives is not None
            else None
        )

        # Consumption: a manual value wins; otherwise auto-fill from the EUI
        # benchmark. ``status`` records why consumption was left empty.
        status = STATUS_COMPLETE
        if data.annual_consumption_kwh is not None:
            estimate.annual_consumption_kwh = data.annual_consumption_kwh
        else:
            consumption, reason = self._auto_consumption(property_obj)
            estimate.annual_consumption_kwh = consumption
            if reason is not None:
                status = reason

        self._compute_outputs(estimate, solar)
        estimate.status = status

        self.db.add(estimate)
        self.db.commit()
        self.db.refresh(estimate)
        return estimate

    def recalculate_estimate(self, estimate_id: int, data: EstimateUpdate) -> Estimate:
        """Recalculate an existing estimate with new inputs, no Solar call.

        Applies only the supplied fields, reruns the engine over the cached
        ``google_solar_raw`` and persisted inputs, and returns the updated
        estimate. Raises ``404`` for an unknown id and ``400`` for invalid
        inputs.
        """
        estimate = (
            self.db.query(Estimate).filter(Estimate.id == estimate_id).one_or_none()
        )
        if estimate is None:
            raise HTTPException(status_code=404, detail="Estimate not found")

        updates = data.model_dump(exclude_unset=True)
        for field in (
            "system_size_kw",
            "price_per_watt",
            "system_losses_pct",
            "shading_pct",
            "annual_consumption_kwh",
            "blended_utility_rate",
            "rate_escalation_pct",
            "include_bess",
        ):
            if field in updates:
                setattr(estimate, field, updates[field])

        if "incentives" in updates and data.incentives is not None:
            estimate.incentives = [inc.model_dump() for inc in data.incentives]

        # An explicit consumption supersedes any earlier "missing EUI" status,
        # so the recalculated row no longer reports a stale error reason.
        if "annual_consumption_kwh" in updates:
            estimate.status = STATUS_COMPLETE

        self._compute_outputs(estimate, estimate.google_solar_raw)

        self.db.add(estimate)
        self.db.commit()
        self.db.refresh(estimate)
        return estimate

    # -- internals ----------------------------------------------------------

    def _cached_solar(self, property_id: int) -> Optional[dict]:
        """The earliest persisted Solar result for the property, if any."""
        row = (
            self.db.query(Estimate.google_solar_raw)
            .filter(
                Estimate.property_id == property_id,
                Estimate.google_solar_raw.isnot(None),
            )
            .order_by(Estimate.id.asc())
            .first()
        )
        return row[0] if row is not None else None

    def _fetch_solar(self, property_obj: Property) -> dict:
        """Fetch and normalize Solar data for the property (one call).

        Returns the typed no-data result when the property lacks coordinates or
        the Solar API reports no rooftop data, so a create still succeeds.
        Raises ``502`` when the Solar API errors for any other reason.
        """
        lat, lon = _f(property_obj.lat), _f(property_obj.lon)
        if lat is None or lon is None:
            return no_data_result()
        try:
            return get_building_insights(lat, lon)
        except GoogleSolarError as exc:
            raise HTTPException(
                status_code=502, detail=f"Google Solar lookup failed: {exc}"
            ) from exc

    def _auto_consumption(
        self, property_obj: Property
    ) -> tuple[Optional[Decimal], Optional[str]]:
        """Auto-fill consumption from the owner industry's EUI benchmark.

        Returns ``(consumption, None)`` on success or ``(None, reason)`` when it
        cannot be derived (no owner industry, no benchmark, or no building area).
        """
        industry = self._owner_industry(property_obj.id)
        if not industry:
            return None, "no owner industry to derive consumption"

        eui = (
            self.db.query(IndustryEnergyBenchmark.eui_kwh_per_sqft_year)
            .filter(
                func.lower(IndustryEnergyBenchmark.business_industry) == industry.lower()
            )
            .order_by(IndustryEnergyBenchmark.id.asc())
            .first()
        )
        if eui is None or eui[0] is None:
            return None, f"no EUI benchmark for industry {industry!r}"

        building_area = _f(property_obj.building_area)
        if building_area is None:
            return None, "no building area to derive consumption"

        consumption = engine.estimated_annual_consumption(building_area, float(eui[0]))
        return Decimal(str(consumption)), None

    def _owner_industry(self, property_id: int) -> Optional[str]:
        """The owner company's industry for the property, if resolvable."""
        row = (
            self.db.query(Company.business_industry)
            .join(Stakeholder, Stakeholder.company_id == Company.id)
            .filter(
                Stakeholder.property_id == property_id,
                Stakeholder.role == StakeholderRole.owner,
            )
            .first()
        )
        return row[0] if row is not None else None

    def _compute_outputs(self, estimate: Estimate, solar: Optional[dict]) -> None:
        """Run the engine over the estimate's inputs and persist the outputs."""
        size = _f(estimate.system_size_kw)
        if size is None:
            size = self._default_system_size_kw(solar)
        size = size or 0.0

        losses = (_f(estimate.system_losses_pct) or 0.0) / 100.0
        shading = (_f(estimate.shading_pct) or 0.0) / 100.0
        price_per_watt = _f(estimate.price_per_watt) or 0.0
        utility_rate = _f(estimate.blended_utility_rate) or 0.0
        escalation = (_f(estimate.rate_escalation_pct) or 0.0) / 100.0
        consumption = _f(estimate.annual_consumption_kwh)

        production = engine.annual_production(size, losses, shading)
        gross_cost = engine.system_cost(size, price_per_watt)

        try:
            net_cost = engine.apply_incentives(gross_cost, estimate.incentives)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        first_year_savings = engine.annual_savings(production, utility_rate, consumption)
        cashflows = engine.cashflows_20yr(net_cost, first_year_savings, escalation)
        savings_20yr = sum(cashflows[1:])
        irr = engine.irr_bisection(cashflows)
        npv = engine.npv(DEFAULT_DISCOUNT_RATE, cashflows)
        payback = engine.simple_payback(net_cost, first_year_savings)
        co2 = engine.co2_offset(production * engine.DEFAULT_HORIZON_YEARS)

        estimate.annual_production_kwh = _finite_or_none(production)
        estimate.system_cost = _finite_or_none(gross_cost)
        estimate.net_cost = _finite_or_none(net_cost)
        estimate.annual_savings = _finite_or_none(first_year_savings)
        estimate.savings_20yr = _finite_or_none(savings_20yr)
        estimate.irr = _finite_or_none(irr)
        estimate.npv = _finite_or_none(npv)
        estimate.simple_payback_years = _finite_or_none(payback)
        estimate.co2_offset_20yr = _finite_or_none(co2)

    @staticmethod
    def _default_system_size_kw(solar: Optional[dict]) -> Optional[float]:
        """Derive a default system size (kW) from cached Solar panel data."""
        if not solar:
            return None
        capacity = solar.get("panel_capacity_watts")
        panels = solar.get("max_panels_count")
        if capacity is None or panels is None:
            return None
        return (float(capacity) * float(panels)) / 1000.0
