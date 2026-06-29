"""Tests for the typed application settings in ``app.core.config``.

Covers the Google API keys added for Sunscout: they must exist with safe
empty defaults and be overridable from the environment.
"""

from app.core.config import Settings, settings


def test_google_keys_default_empty():
    """The Google API keys default to empty strings (no secrets baked in)."""
    assert settings.GOOGLE_SOLAR_API_KEY == ""
    assert settings.GOOGLE_MAPS_API_KEY == ""


def test_google_keys_load_from_env(monkeypatch):
    """The Google API keys are read from environment variables."""
    monkeypatch.setenv("GOOGLE_SOLAR_API_KEY", "solar-test-key")
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "maps-test-key")

    # Build a fresh Settings instance so it re-reads the patched environment.
    fresh = Settings(_env_file=None)

    assert fresh.GOOGLE_SOLAR_API_KEY == "solar-test-key"
    assert fresh.GOOGLE_MAPS_API_KEY == "maps-test-key"
