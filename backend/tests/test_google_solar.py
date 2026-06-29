"""Tests for the Google Solar ``buildingInsights`` client (SOLAR-01).

Every test mocks the HTTP layer (``httpx.get``) so the suite never touches the
real Solar API. Covers:

* a successful response is normalized (segments, capacity, usable area, max
  panels, best-case annual production),
* a ``NOT_FOUND`` building (HTTP 404 + ``error.status``) returns the typed
  no-data result instead of raising,
* a 404 without a parseable body is also treated as no-data,
* transport errors and unexpected status codes raise ``GoogleSolarError``,
* a missing API key raises before any request is made.
"""

import httpx
import pytest

from app.domains.estimates import google_solar
from app.domains.estimates.google_solar import (
    GoogleSolarError,
    get_building_insights,
)

# A trimmed but representative ``buildingInsights:findClosest`` payload.
SAMPLE_PAYLOAD = {
    "name": "buildings/ChIJ",
    "solarPotential": {
        "maxArrayPanelsCount": 42,
        "maxArrayAreaMeters2": 73.5,
        "panelCapacityWatts": 400.0,
        "roofSegmentStats": [
            {
                "pitchDegrees": 15.0,
                "azimuthDegrees": 180.0,
                "stats": {"areaMeters2": 40.0},
            },
            {
                "pitchDegrees": 20.0,
                "azimuthDegrees": 90.0,
                "stats": {"areaMeters2": 33.5},
            },
        ],
        "solarPanelConfigs": [
            {"panelsCount": 10, "yearlyEnergyDcKwh": 4000.0},
            {"panelsCount": 42, "yearlyEnergyDcKwh": 16500.0},
        ],
    },
}


class _FakeResponse:
    """Minimal stand-in for ``httpx.Response`` for the success/NOT_FOUND paths."""

    def __init__(self, status_code, json_data=None, text="", raise_on_json=False):
        self.status_code = status_code
        self._json_data = json_data
        self.text = text
        self._raise_on_json = raise_on_json

    def json(self):
        if self._raise_on_json:
            raise ValueError("no json")
        return self._json_data


@pytest.fixture(autouse=True)
def _set_api_key(monkeypatch):
    """Configure a dummy key so the client builds requests (never sent)."""
    monkeypatch.setattr(google_solar.settings, "GOOGLE_SOLAR_API_KEY", "test-key")


def test_success_is_normalized(monkeypatch):
    captured = {}

    def fake_get(url, params=None, timeout=None):
        captured["url"] = url
        captured["params"] = params
        return _FakeResponse(200, json_data=SAMPLE_PAYLOAD)

    monkeypatch.setattr(google_solar.httpx, "get", fake_get)

    result = get_building_insights(40.0, -3.7)

    assert captured["url"] == google_solar.BUILDING_INSIGHTS_URL
    assert captured["params"] == {
        "location.latitude": 40.0,
        "location.longitude": -3.7,
        "key": "test-key",
    }
    assert result["found"] is True
    assert result["panel_capacity_watts"] == 400.0
    assert result["usable_area_m2"] == 73.5
    assert result["max_panels_count"] == 42
    # Best-case config (largest yearlyEnergyDcKwh).
    assert result["estimated_annual_production_kwh"] == 16500.0
    assert result["roof_segments"] == [
        {"pitch_degrees": 15.0, "azimuth_degrees": 180.0, "area_m2": 40.0},
        {"pitch_degrees": 20.0, "azimuth_degrees": 90.0, "area_m2": 33.5},
    ]
    assert result["raw"] == SAMPLE_PAYLOAD


def test_not_found_returns_no_data(monkeypatch):
    not_found_body = {
        "error": {
            "code": 404,
            "message": "Requested entity was not found.",
            "status": "NOT_FOUND",
        }
    }

    def fake_get(url, params=None, timeout=None):
        return _FakeResponse(404, json_data=not_found_body)

    monkeypatch.setattr(google_solar.httpx, "get", fake_get)

    result = get_building_insights(0.0, 0.0)

    assert result == {
        "found": False,
        "roof_segments": [],
        "panel_capacity_watts": None,
        "usable_area_m2": None,
        "max_panels_count": None,
        "estimated_annual_production_kwh": None,
        "raw": None,
    }


def test_404_without_body_is_no_data(monkeypatch):
    def fake_get(url, params=None, timeout=None):
        return _FakeResponse(404, raise_on_json=True, text="")

    monkeypatch.setattr(google_solar.httpx, "get", fake_get)

    assert get_building_insights(0.0, 0.0)["found"] is False


def test_transport_error_raises(monkeypatch):
    def fake_get(url, params=None, timeout=None):
        raise httpx.ConnectError("boom")

    monkeypatch.setattr(google_solar.httpx, "get", fake_get)

    with pytest.raises(GoogleSolarError):
        get_building_insights(40.0, -3.7)


def test_unexpected_status_raises(monkeypatch):
    def fake_get(url, params=None, timeout=None):
        return _FakeResponse(500, text="internal error")

    monkeypatch.setattr(google_solar.httpx, "get", fake_get)

    with pytest.raises(GoogleSolarError):
        get_building_insights(40.0, -3.7)


def test_missing_api_key_raises(monkeypatch):
    monkeypatch.setattr(google_solar.settings, "GOOGLE_SOLAR_API_KEY", "")

    # No httpx.get patch needed: the guard fires before any request.
    with pytest.raises(GoogleSolarError):
        get_building_insights(40.0, -3.7)


def test_empty_solar_potential_normalizes_to_nones(monkeypatch):
    def fake_get(url, params=None, timeout=None):
        return _FakeResponse(200, json_data={"name": "buildings/x"})

    monkeypatch.setattr(google_solar.httpx, "get", fake_get)

    result = get_building_insights(40.0, -3.7)
    assert result["found"] is True
    assert result["roof_segments"] == []
    assert result["estimated_annual_production_kwh"] is None
    assert result["usable_area_m2"] is None
