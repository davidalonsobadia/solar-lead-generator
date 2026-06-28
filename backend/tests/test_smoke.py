"""Smoke tests proving the test harness boots and wires app + auth + DB.

These intentionally cover only baseline behavior (the app boots and the public
health endpoint responds). Domain-specific tests belong with the feature that
adds them.
"""

from app.domains.auth.models import User


def test_health_ok(client):
    """The app boots and the public health endpoint responds without an API key."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200


def test_seeded_user_is_persisted(db_session, test_user):
    """The shared fixtures seed a verified user into the throwaway database."""
    fetched = db_session.query(User).filter(User.email == "test@example.com").one()
    assert fetched.id == test_user.id
    assert fetched.is_verified is True
