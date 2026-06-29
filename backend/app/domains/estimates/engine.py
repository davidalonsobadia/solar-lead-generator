"""Deterministic solar estimate engine (SOLAR-02).

A collection of **pure** functions that turn inputs plus solar data into
production and economics. They perform no I/O — no database, no HTTP — so the
same logic can run server-side and be mirrored by the frontend sliders to
recalculate locally.

Conventions used throughout:

* Energy is in kWh, power in kW, money in dollars.
* Loss and shading fractions are decimals in ``[0, 1]`` (e.g. ``0.14`` for a
  14% derate), not percentages.
* The EUI (Energy Use Intensity) value is supplied by the service layer; it is
  never looked up here.
"""

from collections.abc import Sequence

# Baseline specific yield: kWh produced per kW of installed DC capacity per
# year, before system losses and shading are applied. A representative value
# for California's solar resource; the service layer can refine it per site.
PRODUCTION_KWH_PER_KW_YEAR = 1600.0

# Average grid emissions factor used to convert avoided generation into avoided
# CO2, in kg of CO2 per kWh.
CO2_KG_PER_KWH = 0.35

# Bisection tolerance for :func:`irr_bisection`: the search stops once the NPV
# at the candidate rate is within this many dollars of zero (or the bracket
# narrows below this width). 1e-6 is far tighter than any meaningful dollar
# amount, so the returned rate is effectively exact for reporting purposes.
IRR_TOLERANCE = 1e-6

# Bracket for the IRR search. The lower bound approaches -100% (a total loss)
# without dividing by zero; the upper bound (1000%) comfortably exceeds any
# realistic solar IRR.
IRR_RATE_LOW = -0.9999
IRR_RATE_HIGH = 10.0

# Sentinel returned by :func:`irr_bisection` when no IRR exists (the cashflows
# never change sign, e.g. a project that never turns a profit).
IRR_NO_SOLUTION = None

# Default project horizon, in years.
DEFAULT_HORIZON_YEARS = 20


def estimated_annual_consumption(building_area: float, eui: float | None) -> float:
    """Estimate annual electrical consumption from floor area and EUI.

    ``= building_area * eui``, where ``eui`` is the electrical Energy Use
    Intensity (kWh per unit area per year). Raises ``ValueError`` when ``eui``
    is missing, since consumption cannot be derived without it.
    """
    if eui is None:
        raise ValueError("EUI is required to estimate annual consumption")
    return building_area * eui


def annual_production(size: float, losses: float, shading: float) -> float:
    """Estimated annual AC production for a ``size`` kW system.

    Applies the baseline specific yield, then derates for system ``losses`` and
    ``shading`` (both fractions in ``[0, 1]``)::

        size * PRODUCTION_KWH_PER_KW_YEAR * (1 - losses) * (1 - shading)
    """
    return size * PRODUCTION_KWH_PER_KW_YEAR * (1.0 - losses) * (1.0 - shading)


def system_cost(size: float, price_per_watt: float) -> float:
    """Gross system cost: ``size`` kW * 1000 W/kW * ``price_per_watt``."""
    return size * 1000.0 * price_per_watt


def apply_incentives(cost: float, incentives: Sequence[dict] | None) -> float:
    """Net cost after applying incentives, floored at zero.

    Each incentive is a dict with ``type`` of ``"percentage"`` (a fraction of
    the gross ``cost``) or ``"fixed"`` (an absolute dollar amount). Percentage
    incentives are computed against the gross ``cost``, so stacking them does
    not compound. An unknown ``type`` raises ``ValueError``.
    """
    total_reduction = 0.0
    for incentive in incentives or []:
        kind = incentive.get("type")
        value = incentive.get("value", 0.0) or 0.0
        if kind == "percentage":
            total_reduction += cost * value
        elif kind == "fixed":
            total_reduction += value
        else:
            raise ValueError(f"Unknown incentive type: {kind!r}")
    return max(cost - total_reduction, 0.0)


def annual_savings(
    production: float,
    utility_rate: float,
    consumption: float | None = None,
) -> float:
    """First-year bill savings from offsetting grid consumption.

    Savings are the offset energy times the blended ``utility_rate``. When
    ``consumption`` is given, the offset is capped at it (you cannot save more
    than you would have spent); otherwise all production is valued at the rate.
    """
    offset_kwh = production
    if consumption is not None:
        offset_kwh = min(production, consumption)
    return offset_kwh * utility_rate


def cashflows_20yr(
    net_cost: float,
    first_year_savings: float,
    rate_escalation: float = 0.0,
    years: int = DEFAULT_HORIZON_YEARS,
) -> list[float]:
    """Project cashflows over ``years``, with year 0 as the up-front outlay.

    Returns a list of length ``years + 1``: index 0 is ``-net_cost`` and each
    subsequent year is the prior year's savings grown by ``rate_escalation``
    (a fraction, e.g. ``0.025`` for 2.5% annual utility inflation).
    """
    flows = [-net_cost]
    savings = first_year_savings
    for _ in range(years):
        flows.append(savings)
        savings *= 1.0 + rate_escalation
    return flows


def npv(rate: float, cashflows: Sequence[float]) -> float:
    """Net present value of ``cashflows`` discounted at ``rate``.

    ``cashflows[t]`` occurs at period ``t`` (period 0 is undiscounted).
    """
    return sum(cf / (1.0 + rate) ** t for t, cf in enumerate(cashflows))


def irr_bisection(
    cashflows: Sequence[float],
    tol: float = IRR_TOLERANCE,
    low: float = IRR_RATE_LOW,
    high: float = IRR_RATE_HIGH,
) -> float | None:
    """Internal rate of return via bisection on :func:`npv`.

    Searches for the discount rate where NPV is zero within the
    ``[low, high]`` bracket, to a tolerance of ``tol`` dollars. Returns
    :data:`IRR_NO_SOLUTION` (``None``) when the NPV does not change sign across
    the bracket — i.e. there is no IRR (for example, a project whose cashflows
    are never net positive).
    """
    npv_low = npv(low, cashflows)
    npv_high = npv(high, cashflows)
    if npv_low == 0.0:
        return low
    if npv_high == 0.0:
        return high
    # No sign change means no root in the bracket -> no IRR exists.
    if npv_low * npv_high > 0.0:
        return IRR_NO_SOLUTION

    mid = (low + high) / 2.0
    while (high - low) / 2.0 > tol:
        mid = (low + high) / 2.0
        npv_mid = npv(mid, cashflows)
        if abs(npv_mid) < tol:
            return mid
        if npv_low * npv_mid < 0.0:
            high = mid
        else:
            low = mid
            npv_low = npv_mid
    return mid


def simple_payback(net_cost: float, annual_savings_amount: float) -> float:
    """Years to recover ``net_cost`` from level annual savings.

    Returns ``float("inf")`` when ``annual_savings_amount`` is zero or negative
    (the cost is never recovered) — the documented infinite-payback case.
    """
    if annual_savings_amount <= 0.0:
        return float("inf")
    return net_cost / annual_savings_amount


def co2_offset(production: float) -> float:
    """CO2 avoided (kg) for ``production`` kWh, at :data:`CO2_KG_PER_KWH`."""
    return production * CO2_KG_PER_KWH
