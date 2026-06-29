"""Business logic for the estimate create/recalculate endpoints (SOLAR-03).

:class:`EstimatesService` turns slider inputs plus Google Solar data into a
persisted :class:`~app.domains.estimates.models.Estimate`. Two operations:

* :meth:`create_estimate` (``POST /properties/{id}/estimate``) runs **one**
  Google Solar lookup per property — it reuses the ``google_solar_raw`` already
  stored on a prior estimate when present, and only calls the Solar API when no
  property estimate has cached it yet. On create it auto-fills
  ``annual_consumption_kwh`` from the owner company's industry EUI (Building
  Area x EUI); a user-supplied value wins, and a missing EUI leaves consumption
  empty with the reason recorded in ``status``.
* :meth:`recalculate_estimate` (``PUT /estimates/{id}``) re-runs the engine over
  the persisted data with new slider inputs and **never** calls Google Solar.

The economics themselves come from the pure functions in
:mod:`app.domains.estimates.engine`; this service only resolves inputs, decides
when the Solar API may be called, and persists the result.
"""

from __future__ import annotations

import math
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import logger
from app.domains.benchmarks.models import IndustryEnergyBenchmark
from app.domains.companies.models import Company
from app.domains.estimates import engine
from app.domains.estimates.google_solar import GoogleSolarError, get_building_insights
from app.domains.estimates.incentives_ca import california_incentives
from app.domains.estimates.models import Estimate
from app.domains.properties.models import Property
from app.domains.stakeholders.models import Stakeholder, StakeholderRole

from .schemas import EstimateInput

# Engine input defaults applied when a slider value is not supplied on create.
# Percentages are whole numbers (converted to fractions before the engine runs).
DEFAULT_PRICE_PER_WATT = 3.0
DEFAULT_SYSTEM_LOSSES_PCT = 14.0
DEFAULT_SHADING_PCT = 0.0
DEFAULT_BLENDED_UTILITY_RATE = 0.20
DEFAULT_RATE_ESCALATION_PCT = 2.5
DEFAULT_INCLUDE_BESS = False
# Fallback system size when neither the caller nor Google Solar provides one.
DEFAULT_SYSTEM_SIZE_KW = 10.0

# Discount rate used for the project NPV (a representative cost of capital).
DISCOUNT_RATE = 0.06

# Status strings recording how annual consumption was resolved.
STATUS_COMPLETE = "complete"


def _to_float(value: Any) -> Optional[float]:
    """Coerce a Decimal/number to float, leaving ``None`` untouched."""
    return None if value is None else float(value)


def _finite_or_none(value: Optional[float]) -> Optional[float]:
    """Return ``value`` only when it is a finite number, else ``None``.

    Guards the persisted/serialized outputs against ``inf`` (e.g. an infinite
    simple payback) and ``nan``, which are not valid JSON.
    """
    if value is None or math.isinf(value) or math.isnan(value):
        return None
    return value


class EstimatesService:
    """Create and recalculate solar estimates for a property."""

    def __init__(self, db: Session):
        self.db = db

    # -- lookups -----------------------------------------------------------

    def _get_property(self, property_id: int) -> Property:
        property_obj = (
            self.db.query(Property)
            .filter(Property.id == property_id)
            .one_or_none()
        )
        if property_obj is None:
            raise HTTPException(status_code=404, detail="Property not found")
        return property_obj

    def _owner_industry(self, property_id: int) -> Optional[str]:
        """The owner company's ``business_industry`` for a property, if any."""
        row = (
            self.db.query(Company.business_industry)
            .join(Stakeholder, Stakeholder.company_id == Company.id)
            .filter(
                Stakeholder.property_id == property_id,
                Stakeholder.role == StakeholderRole.owner,
            )
            .first()
        )
        return row[0] if row else None

    def _industry_eui(self, industry: Optional[str]) -> Optional[float]:
        """The EUI (kWh/sqft/year) benchmark for ``industry``, if one exists."""
        if not industry:
            return None
        row = (
            self.db.query(IndustryEnergyBenchmark.eui_kwh_per_sqft_year)
            .filter(
                func.lower(IndustryEnergyBenchmark.business_industry)
                == industry.lower(),
                IndustryEnergyBenchmark.eui_kwh_per_sqft_year.isnot(None),
            )
            .order_by(IndustryEnergyBenchmark.id.asc())
            .first()
        )
        return _to_float(row[0]) if row else None

    def _cached_solar(self, property_id: int) -> Optional[dict]:
        """The ``google_solar_raw`` cached on any prior estimate, if present.

        Enforces the one-lookup-per-property cost rule: when this returns a
        value, the Solar API must not be called again.
        """
        row = (
            self.db.query(Estimate.google_solar_raw)
            .filter(
                Estimate.property_id == property_id,
                Estimate.google_solar_raw.isnot(None),
            )
            .order_by(Estimate.id.asc())
            .first()
        )
        return row[0] if row else None

    # -- consumption resolution -------------------------------------------

    def _resolve_consumption(
        self, property_obj: Property, manual_value: Optional[float]
    ) -> tuple[Optional[float], str]:
        """Resolve annual consumption and the status describing how.

        A manual value wins. Otherwise it is auto-filled as Building Area x EUI
        using the owner industry's benchmark. When no EUI is available (no
        owner, no benchmark, or no building area) consumption stays ``None`` and
        the returned status records the reason.
        """
        if manual_value is not None:
            return manual_value, STATUS_COMPLETE

        industry = self._owner_industry(property_obj.id)
        eui = self._industry_eui(industry)
        building_area = _to_float(property_obj.building_area)

        if eui is None:
            reason = (
                f"no EUI benchmark for industry '{industry}'"
                if industry
                else "no owner industry to look up EUI"
            )
            return None, reason
        if building_area is None:
            return None, "no building area to estimate consumption"

        return engine.estimated_annual_consumption(building_area, eui), STATUS_COMPLETE

    # -- engine wiring -----------------------------------------------------

    def _default_system_size_kw(self, solar: Optional[dict]) -> float:
        """System size (kW) implied by the cached Solar data, else the default."""
        if solar:
            capacity_w = solar.get("panel_capacity_watts")
            panels = solar.get("max_panels_count")
            if capacity_w and panels:
                return (capacity_w * panels) / 1000.0
        return DEFAULT_SYSTEM_SIZE_KW

    def _compute_outputs(self, estimate: Estimate, solar: Optional[dict]) -> None:
        """Run the engine over an estimate's stored inputs and fill its outputs.

        Mutates ``estimate`` in place. Non-finite results (e.g. an infinite
        payback or a missing IRR) are stored as ``None``.
        """
        size = _to_float(estimate.system_size_kw)
        if size is None:
            size = self._default_system_size_kw(solar)
            estimate.system_size_kw = size

        price_per_watt = _to_float(estimate.price_per_watt) or 0.0
        losses = (_to_float(estimate.system_losses_pct) or 0.0) / 100.0
        shading = (_to_float(estimate.shading_pct) or 0.0) / 100.0
        utility_rate = _to_float(estimate.blended_utility_rate) or 0.0
        escalation = (_to_float(estimate.rate_escalation_pct) or 0.0) / 100.0
        consumption = _to_float(estimate.annual_consumption_kwh)
        incentives = estimate.incentives or []

        production = engine.annual_production(size, losses, shading)
        gross_cost = engine.system_cost(size, price_per_watt)
        net_cost = engine.apply_incentives(gross_cost, incentives)
        first_year_savings = engine.annual_savings(production, utility_rate, consumption)
        cashflows = engine.cashflows_20yr(net_cost, first_year_savings, escalation)

        estimate.annual_production_kwh = production
        estimate.system_cost = gross_cost
        estimate.net_cost = net_cost
        estimate.annual_savings = first_year_savings
        estimate.savings_20yr = sum(cashflows[1:])
        estimate.irr = _finite_or_none(engine.irr_bisection(cashflows))
        estimate.npv = _finite_or_none(engine.npv(DISCOUNT_RATE, cashflows))
        estimate.simple_payback_years = _finite_or_none(
            engine.simple_payback(net_cost, first_year_savings)
        )
        estimate.co2_offset_20yr = engine.co2_offset(
            production * engine.DEFAULT_HORIZON_YEARS
        )

    # -- public API --------------------------------------------------------

    def create_estimate(
        self, property_id: int, data: EstimateInput
    ) -> Estimate:
        """Create an estimate for a property, doing at most one Solar lookup.

        Reuses the ``google_solar_raw`` cached on a prior estimate when present;
        otherwise calls Google Solar once (using the property's lat/lon) and
        caches the normalized result. Auto-fills consumption from the owner
        industry EUI unless a manual value is supplied. Raises ``404`` for an
        unknown property.
        """
        property_obj = self._get_property(property_id)

        solar = self._cached_solar(property_id)
        if solar is None:
            solar = self._fetch_solar(property_obj)

        consumption, status = self._resolve_consumption(
            property_obj, data.annual_consumption_kwh
        )

        incentives = (
            data.incentives
            if data.incentives is not None
            else california_incentives()
        )

        estimate = Estimate(
            property_id=property_id,
            system_size_kw=data.system_size_kw,
            price_per_watt=data.price_per_watt
            if data.price_per_watt is not None
            else DEFAULT_PRICE_PER_WATT,
            system_losses_pct=data.system_losses_pct
            if data.system_losses_pct is not None
            else DEFAULT_SYSTEM_LOSSES_PCT,
            shading_pct=data.shading_pct
            if data.shading_pct is not None
            else DEFAULT_SHADING_PCT,
            annual_consumption_kwh=consumption,
            blended_utility_rate=data.blended_utility_rate
            if data.blended_utility_rate is not None
            else DEFAULT_BLENDED_UTILITY_RATE,
            rate_escalation_pct=data.rate_escalation_pct
            if data.rate_escalation_pct is not None
            else DEFAULT_RATE_ESCALATION_PCT,
            include_bess=data.include_bess
            if data.include_bess is not None
            else DEFAULT_INCLUDE_BESS,
            incentives=incentives,
            google_solar_raw=solar,
            status=status,
        )

        self._compute_outputs(estimate, solar)

        self.db.add(estimate)
        self.db.commit()
        self.db.refresh(estimate)
        return estimate

    def recalculate_estimate(
        self, estimate_id: int, data: EstimateInput
    ) -> Estimate:
        """Recalculate an existing estimate with new inputs, no Solar lookup.

        Overwrites only the inputs provided in ``data`` (the rest keep their
        persisted values), re-runs the engine over the persisted Solar data and
        consumption, and saves. Raises ``404`` for an unknown estimate.
        """
        estimate = (
            self.db.query(Estimate)
            .filter(Estimate.id == estimate_id)
            .one_or_none()
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
            "incentives",
        ):
            if field in updates:
                setattr(estimate, field, updates[field])

        # Reuse the persisted Solar data; never call the Solar API on recalc.
        self._compute_outputs(estimate, estimate.google_solar_raw)

        self.db.add(estimate)
        self.db.commit()
        self.db.refresh(estimate)
        return estimate

    # -- internals ---------------------------------------------------------

    def _fetch_solar(self, property_obj: Property) -> Optional[dict]:
        """Fetch and normalize Google Solar data for a property's location.

        Returns ``None`` when the property has no coordinates (nothing to look
        up). Raises ``502`` when the Solar API call itself fails, so the cost
        rule is never silently violated by a retry.
        """
        lat = _to_float(property_obj.lat)
        lon = _to_float(property_obj.lon)
        if lat is None or lon is None:
            logger.info(
                "Property %s has no coordinates; skipping Solar lookup",
                property_obj.id,
            )
            return None
        try:
            return get_building_insights(lat, lon)
        except GoogleSolarError as exc:
            raise HTTPException(
                status_code=502, detail=f"Google Solar lookup failed: {exc}"
            ) from exc
