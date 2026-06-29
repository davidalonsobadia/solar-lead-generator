"""Tests for the deterministic estimate engine (SOLAR-02).

Pure-function checks: every test runs against known values with no DB or HTTP.
Covers each engine function plus the documented edge cases — missing EUI,
infinite payback, and an IRR with no solution.
"""

import math

import pytest

from app.domains.estimates import engine, incentives_ca

# --- estimated_annual_consumption ------------------------------------------


def test_estimated_annual_consumption_multiplies_area_by_eui():
    assert engine.estimated_annual_consumption(100.0, 50.0) == 5000.0


def test_estimated_annual_consumption_missing_eui_raises():
    with pytest.raises(ValueError):
        engine.estimated_annual_consumption(100.0, None)


# --- annual_production ------------------------------------------------------


def test_annual_production_applies_yield_and_derates():
    # 10 kW * 1600 kWh/kW * (1 - 0.14) * (1 - 0.0) = 13760.
    assert engine.annual_production(10.0, 0.14, 0.0) == pytest.approx(13760.0)


def test_annual_production_applies_both_derates():
    # 10 * 1600 * 0.86 * 0.90 = 12384.
    assert engine.annual_production(10.0, 0.14, 0.10) == pytest.approx(12384.0)


# --- system_cost ------------------------------------------------------------


def test_system_cost_converts_kw_to_watts():
    assert engine.system_cost(10.0, 3.0) == pytest.approx(30000.0)


# --- apply_incentives -------------------------------------------------------


def test_apply_incentives_percentage_and_fixed():
    incentives = [
        {"type": "percentage", "value": 0.30},
        {"type": "fixed", "value": 1000.0},
    ]
    # 30000 - (0.30 * 30000) - 1000 = 20000.
    assert engine.apply_incentives(30000.0, incentives) == pytest.approx(20000.0)


def test_apply_incentives_none_is_noop():
    assert engine.apply_incentives(30000.0, None) == pytest.approx(30000.0)


def test_apply_incentives_floored_at_zero():
    incentives = [{"type": "fixed", "value": 50000.0}]
    assert engine.apply_incentives(30000.0, incentives) == 0.0


def test_apply_incentives_unknown_type_raises():
    with pytest.raises(ValueError):
        engine.apply_incentives(30000.0, [{"type": "bogus", "value": 1.0}])


# --- annual_savings ---------------------------------------------------------


def test_annual_savings_values_all_production_without_consumption():
    assert engine.annual_savings(13760.0, 0.25) == pytest.approx(3440.0)


def test_annual_savings_capped_at_consumption():
    # Offset capped at 10000 kWh consumed; 10000 * 0.25 = 2500.
    assert engine.annual_savings(13760.0, 0.25, consumption=10000.0) == pytest.approx(
        2500.0
    )


# --- cashflows_20yr ---------------------------------------------------------


def test_cashflows_20yr_shape_and_year_zero():
    flows = engine.cashflows_20yr(20000.0, 2500.0)
    assert len(flows) == 21
    assert flows[0] == -20000.0
    assert flows[1] == pytest.approx(2500.0)
    assert flows[20] == pytest.approx(2500.0)


def test_cashflows_20yr_applies_escalation():
    flows = engine.cashflows_20yr(20000.0, 1000.0, rate_escalation=0.10, years=3)
    assert flows == pytest.approx([-20000.0, 1000.0, 1100.0, 1210.0])


# --- npv --------------------------------------------------------------------


def test_npv_known_value():
    # -1000 + 600/1.1 + 600/1.1^2 = 41.32...
    flows = [-1000.0, 600.0, 600.0]
    assert engine.npv(0.10, flows) == pytest.approx(41.3223, abs=1e-3)


def test_npv_at_zero_rate_is_plain_sum():
    assert engine.npv(0.0, [-1000.0, 600.0, 600.0]) == pytest.approx(200.0)


# --- irr_bisection ----------------------------------------------------------


def test_irr_bisection_recovers_known_rate():
    # -1000 followed by 500 for three years has IRR ~= 23.375%.
    flows = [-1000.0, 500.0, 500.0, 500.0]
    irr = engine.irr_bisection(flows)
    assert irr is not None
    # The bracket converges to IRR_TOLERANCE on the *rate*; the residual NPV is
    # the rate error scaled by the NPV slope, so a cent of slack is generous.
    assert engine.npv(irr, flows) == pytest.approx(0.0, abs=1e-2)
    assert irr == pytest.approx(0.23375, abs=1e-3)


def test_irr_bisection_no_solution_returns_sentinel():
    # Outlay never recovered (no positive cashflows): no IRR exists.
    flows = [-10000.0] + [0.0] * 20
    assert engine.irr_bisection(flows) is engine.IRR_NO_SOLUTION


def test_irr_bisection_all_negative_returns_sentinel():
    flows = [-10000.0, -500.0, -500.0]
    assert engine.irr_bisection(flows) is None


# --- simple_payback ---------------------------------------------------------


def test_simple_payback_known_value():
    assert engine.simple_payback(20000.0, 2500.0) == pytest.approx(8.0)


def test_simple_payback_infinite_when_no_savings():
    assert engine.simple_payback(20000.0, 0.0) == math.inf
    assert engine.simple_payback(20000.0, -100.0) == math.inf


# --- co2_offset -------------------------------------------------------------


def test_co2_offset_uses_grid_factor():
    assert engine.co2_offset(13760.0) == pytest.approx(13760.0 * 0.35)


# --- incentives_ca ----------------------------------------------------------


def test_california_incentives_solar_only_is_itc_only():
    incentives = incentives_ca.california_incentives()
    assert len(incentives) == 1
    assert incentives[0]["type"] == "percentage"
    assert incentives[0]["value"] == incentives_ca.FEDERAL_ITC_RATE


def test_california_incentives_with_storage_adds_sgip():
    incentives = incentives_ca.california_incentives(storage_kwh=10.0)
    assert len(incentives) == 2
    sgip = incentives[1]
    assert sgip["type"] == "fixed"
    assert sgip["value"] == pytest.approx(incentives_ca.SGIP_REBATE_PER_KWH * 10.0)


def test_california_incentives_apply_to_cost():
    incentives = incentives_ca.california_incentives()
    # 30% ITC on a $30,000 system -> $21,000 net.
    assert engine.apply_incentives(30000.0, incentives) == pytest.approx(21000.0)
