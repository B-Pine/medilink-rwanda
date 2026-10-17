"""Shared fixtures.

The whole suite runs as the runtime database role (DATABASE_APP_ROLE, NOSUPERUSER NOBYPASSRLS,
not the table owner): after pytest-django has created and migrated the test database as the
owner, every new connection does `SET ROLE medilink_app`. Row-level security, the audit table
privileges and triggers therefore behave exactly as in production.

Avoid `transaction=True` tests: flushing would need TRUNCATE, which the app role doesn't have and
the audit trigger forbids.
"""

from __future__ import annotations

import base64
from collections.abc import Iterator
from typing import Any

import pytest
from django.conf import settings
from django.core.cache import cache
from django.db import connections
from django.db.backends.signals import connection_created
from django_otp.oath import totp
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.test import APIClient

from medilink.accounts.models import User
from tests.factories import PASSWORD, FacilityFactory, make_patient_user, make_staff

_APP_ROLE = {"enabled": False}


def _switch_to_app_role(sender: Any, connection: Any, **kwargs: Any) -> None:
    if _APP_ROLE["enabled"] and connection.vendor == "postgresql":
        with connection.cursor() as cursor:
            cursor.execute(f"SET ROLE {connection.ops.quote_name(settings.DATABASE_APP_ROLE)}")


@pytest.fixture(scope="session")
def django_db_setup(django_db_setup: Any, django_db_blocker: Any) -> Iterator[None]:
    connection_created.connect(_switch_to_app_role, dispatch_uid="medilink-tests-app-role")
    with django_db_blocker.unblock():
        connections.close_all()
    _APP_ROLE["enabled"] = True
    yield
    _APP_ROLE["enabled"] = False
    with django_db_blocker.unblock():
        connections.close_all()


@pytest.fixture(autouse=True)
def _clear_cache() -> Iterator[None]:
    cache.clear()  # throttles and lockouts live in the cache
    yield
    cache.clear()


@pytest.fixture
def api() -> APIClient:
    return APIClient()


@pytest.fixture
def csrf_api() -> APIClient:
    return APIClient(enforce_csrf_checks=True)


@pytest.fixture
def facility(db: Any) -> Any:
    return FacilityFactory(name="Kigali Test Clinic", slug="kigali-test-clinic")


@pytest.fixture
def other_facility(db: Any) -> Any:
    return FacilityFactory(name="Huye Test Clinic", slug="huye-test-clinic")


@pytest.fixture
def staff_user(facility: Any) -> User:
    return make_staff(facility, roles=("receptionist",), email="reception@example.test")


@pytest.fixture
def patient_user(db: Any) -> User:
    return make_patient_user(email="patient@example.test", full_name="Mukamana Jeanne")


def totp_code(user: User) -> str:
    """Current TOTP code for the user's device; resets replay/throttle state so it can be reused."""
    device = TOTPDevice.objects.get(user=user)
    TOTPDevice.objects.filter(pk=device.pk).update(
        last_t=-1, throttling_failure_count=0, throttling_failure_timestamp=None
    )
    return f"{totp(device.bin_key):06d}"


def code_for_secret(secret: str) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    return f"{totp(key):06d}"


def login_staff(client: APIClient, user: User, password: str = PASSWORD) -> Any:
    """Full staff sign-in (password + TOTP). Returns the verify response."""
    response = client.post(
        "/api/v1/staff/auth/login/", {"email": user.email, "password": password}, format="json"
    )
    assert response.status_code == 200, response.content
    assert response.json()["status"] == "mfa_required"
    response = client.post(
        "/api/v1/staff/auth/mfa/verify/", {"code": totp_code(user)}, format="json"
    )
    assert response.status_code == 200, response.content
    return response


def login_patient(client: APIClient, user: User, password: str = PASSWORD) -> Any:
    response = client.post(
        "/api/v1/patient/auth/login/", {"email": user.email, "password": password}, format="json"
    )
    assert response.status_code == 200, response.content
    return response


def error_code(response: Any) -> str:
    return str(response.json()["error"]["code"])


@pytest.fixture
def staff_client(api: APIClient, staff_user: User) -> APIClient:
    login_staff(api, staff_user)
    return api


@pytest.fixture
def patient_client(api: APIClient, patient_user: User) -> APIClient:
    login_patient(api, patient_user)
    return api
