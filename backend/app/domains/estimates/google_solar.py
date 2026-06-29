"""Google Solar ``buildingInsights`` client.

Thin wrapper over the Google Solar API's ``buildingInsights:findClosest``
endpoint. Given a latitude/longitude it returns a normalized dictionary with
the fields the estimate engine cares about: roof segments, panel capacity,
usable area, and estimated annual production.

Google reports no rooftop data for roughly 5% of buildings; the API answers
those with HTTP 404 and ``error.status == "NOT_FOUND"``. We translate that into
a typed "no data" result (``found=False``) instead of raising, so callers can
treat it as an ordinary outcome rather than an error.

Only ``buildingInsights`` is used here; ``dataLayers`` (GeoTIFF, more
expensive) is intentionally out of scope. Respect the Solar API's 600 qpm
limit at the call site — this module performs a single request per call.
"""

from typing import Any

import httpx

from app import logger
from app.core.config import settings

# ``findClosest`` returns the insights for the building nearest the location.
BUILDING_INSIGHTS_URL = "https://solar.googleapis.com/v1/buildingInsights:findClosest"

# Solar API calls are quick; fail fast rather than hang a request-scoped caller.
DEFAULT_TIMEOUT = 10.0


class GoogleSolarError(RuntimeError):
    """Raised when the Solar API fails for a reason other than ``NOT_FOUND``.

    Covers transport errors, unexpected status codes, and unparseable bodies.
    A ``NOT_FOUND`` building is *not* an error: it yields a normalized no-data
    result instead (see :func:`no_data_result`).
    """


def no_data_result() -> dict[str, Any]:
    """The typed "no rooftop data" result for a ``NOT_FOUND`` building."""
    return {
        "found": False,
        "roof_segments": [],
        "panel_capacity_watts": None,
        "usable_area_m2": None,
        "max_panels_count": None,
        "estimated_annual_production_kwh": None,
        "raw": None,
    }


def _normalize_roof_segments(solar_potential: dict[str, Any]) -> list[dict[str, Any]]:
    """Reduce ``roofSegmentStats`` to the orientation/area fields we use."""
    segments = []
    for segment in solar_potential.get("roofSegmentStats", []) or []:
        stats = segment.get("stats") or {}
        segments.append(
            {
                "pitch_degrees": segment.get("pitchDegrees"),
                "azimuth_degrees": segment.get("azimuthDegrees"),
                "area_m2": stats.get("areaMeters2"),
            }
        )
    return segments


def _estimated_annual_production_kwh(solar_potential: dict[str, Any]) -> float | None:
    """Best-case yearly DC production across the available panel configs.

    Each entry in ``solarPanelConfigs`` reports ``yearlyEnergyDcKwh`` for a
    given panel count; the configurations are ordered by size, so the largest
    represents the roof's full potential. We take the maximum defensively in
    case ordering ever changes.
    """
    configs = solar_potential.get("solarPanelConfigs") or []
    yearly = [
        c.get("yearlyEnergyDcKwh")
        for c in configs
        if c.get("yearlyEnergyDcKwh") is not None
    ]
    return max(yearly) if yearly else None


def _normalize(payload: dict[str, Any]) -> dict[str, Any]:
    """Map a successful ``buildingInsights`` response to our flat shape."""
    solar_potential = payload.get("solarPotential") or {}
    return {
        "found": True,
        "roof_segments": _normalize_roof_segments(solar_potential),
        "panel_capacity_watts": solar_potential.get("panelCapacityWatts"),
        "usable_area_m2": solar_potential.get("maxArrayAreaMeters2"),
        "max_panels_count": solar_potential.get("maxArrayPanelsCount"),
        "estimated_annual_production_kwh": _estimated_annual_production_kwh(
            solar_potential
        ),
        "raw": payload,
    }


def _is_not_found(response: httpx.Response) -> bool:
    """Whether a 404 response is Google's ``NOT_FOUND`` (no rooftop data)."""
    if response.status_code != 404:
        return False
    try:
        error = response.json().get("error") or {}
    except ValueError:
        # A 404 without a parseable body is still "no building here".
        return True
    return error.get("status") == "NOT_FOUND"


def get_building_insights(
    lat: float, lon: float, *, timeout: float = DEFAULT_TIMEOUT
) -> dict[str, Any]:
    """Fetch and normalize Google Solar ``buildingInsights`` for a location.

    Returns a dict with ``found`` plus the normalized rooftop fields
    (``roof_segments``, ``panel_capacity_watts``, ``usable_area_m2``,
    ``max_panels_count``, ``estimated_annual_production_kwh``) and the ``raw``
    response. A ``NOT_FOUND`` building returns the :func:`no_data_result`
    (``found=False``) rather than raising.

    Raises :class:`GoogleSolarError` on transport failures, unexpected status
    codes, or an unparseable success body.
    """
    if not settings.GOOGLE_SOLAR_API_KEY:
        raise GoogleSolarError("GOOGLE_SOLAR_API_KEY is not configured")

    params = {
        "location.latitude": lat,
        "location.longitude": lon,
        "key": settings.GOOGLE_SOLAR_API_KEY,
    }

    try:
        response = httpx.get(BUILDING_INSIGHTS_URL, params=params, timeout=timeout)
    except httpx.HTTPError as exc:
        raise GoogleSolarError(f"Google Solar request failed: {exc}") from exc

    if _is_not_found(response):
        logger.info("Google Solar: no rooftop data for (%s, %s)", lat, lon)
        return no_data_result()

    if response.status_code != 200:
        raise GoogleSolarError(
            f"Google Solar returned HTTP {response.status_code}: {response.text}"
        )

    try:
        payload = response.json()
    except ValueError as exc:
        raise GoogleSolarError("Google Solar returned a non-JSON body") from exc

    return _normalize(payload)
