"""California solar incentive constants and builders (SOLAR-02).

Pure data and helpers — no I/O. These produce the generic incentive
descriptors consumed by :func:`app.domains.estimates.engine.apply_incentives`,
where each descriptor is a dict::

    {"name": str, "type": "percentage" | "fixed", "value": float}

* ``percentage`` values are a fraction of the *gross* system cost (e.g.
  ``0.30`` for 30%).
* ``fixed`` values are an absolute dollar amount subtracted from the cost.

Only the two incentives relevant to a residential California install are
modeled here: the federal Investment Tax Credit (ITC) and the state
Self-Generation Incentive Program (SGIP) storage rebate.
"""

# Federal Investment Tax Credit: 30% of the system cost, in effect through
# 2032 under the Inflation Reduction Act before it begins stepping down.
FEDERAL_ITC_RATE = 0.30

# California SGIP general-market rebate for battery storage, expressed per kWh
# of usable storage capacity. SGIP only applies when storage (BESS) is part of
# the system; a solar-only install receives no SGIP rebate.
SGIP_REBATE_PER_KWH = 150.0


def federal_itc() -> dict[str, object]:
    """The federal ITC as a percentage incentive on the gross system cost."""
    return {
        "name": "Federal Solar ITC",
        "type": "percentage",
        "value": FEDERAL_ITC_RATE,
    }


def sgip_storage_rebate(storage_kwh: float) -> dict[str, object]:
    """SGIP rebate as a fixed amount for ``storage_kwh`` of usable capacity."""
    return {
        "name": "California SGIP storage rebate",
        "type": "fixed",
        "value": SGIP_REBATE_PER_KWH * storage_kwh,
    }


def california_incentives(storage_kwh: float = 0.0) -> list[dict[str, object]]:
    """Build the California incentive list for a system.

    Always includes the federal ITC. Adds the SGIP storage rebate only when
    ``storage_kwh`` is positive, since SGIP applies exclusively to storage.
    """
    incentives: list[dict[str, object]] = [federal_itc()]
    if storage_kwh and storage_kwh > 0:
        incentives.append(sgip_storage_rebate(storage_kwh))
    return incentives
