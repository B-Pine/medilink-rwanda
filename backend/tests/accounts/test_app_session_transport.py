"""Upgrade 15: the patient mobile app carries its session in a header, never in a cookie."""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient

from medilink.accounts.middleware import SESSION_TOKEN_HEADER
from medilink.accounts.models import UserSession
from medilink.accounts.sessions import APP_SESSION_KEY
from tests.conftest import error_code
from tests.factories import PASSWORD

pytestmark = pytest.mark.django_db

APP = {"HTTP_X_MEDILINK_CLIENT": "app"}


def _app_login(client: APIClient, user: Any) -> str:
    response = client.post(
        "/api/v1/patient/auth/login/",
        {"email": user.email, "password": PASSWORD},
        format="json",
        **APP,
    )
    assert response.status_code == 200, response.content
    assert "ml_patient" not in response.cookies
    key = response[SESSION_TOKEN_HEADER]
    assert key
    assert "no-store" in response["Cache-Control"]
    return key


def _bearer(key: str) -> dict[str, str]:
    return {**APP, "HTTP_AUTHORIZATION": f"Bearer {key}"}


def test_app_login_returns_the_session_key_in_a_header(patient_user: Any) -> None:
    client = APIClient(enforce_csrf_checks=True)  # no CSRF token: the app has no cookie
    key = _app_login(client, patient_user)
    session = UserSession.objects.get(session_key=key)
    assert session.audience == "patient"
    assert session.get_decoded()[APP_SESSION_KEY] is True

    me = APIClient(enforce_csrf_checks=True).get("/api/v1/patient/auth/me/", **_bearer(key))
    assert me.status_code == 200
    assert me.json()["email"] == patient_user.email
    assert SESSION_TOKEN_HEADER not in me  # unchanged key: nothing to send back


def test_app_logout_tells_the_app_to_forget_its_key(patient_user: Any) -> None:
    client = APIClient(enforce_csrf_checks=True)
    key = _app_login(client, patient_user)
    response = client.post("/api/v1/patient/auth/logout/", **_bearer(key))
    assert response.status_code == 204
    assert response[SESSION_TOKEN_HEADER] == ""
    assert not UserSession.objects.filter(session_key=key).exists()
    assert client.get("/api/v1/patient/auth/me/", **_bearer(key)).status_code == 401


def test_unknown_key_is_anonymous_and_cleared(api: APIClient) -> None:
    response = api.get("/api/v1/patient/auth/me/", **_bearer("not-a-session"))
    assert response.status_code == 401
    assert error_code(response) == "not_authenticated"
    assert response[SESSION_TOKEN_HEADER] == ""


def test_bearer_without_the_app_header_is_ignored(patient_user: Any) -> None:
    key = _app_login(APIClient(), patient_user)
    response = APIClient().get("/api/v1/patient/auth/me/", HTTP_AUTHORIZATION=f"Bearer {key}")
    assert response.status_code == 401


def test_app_requests_ignore_the_cookie(patient_client: APIClient) -> None:
    # A browser cookie session is not ambient authority for app-marked requests.
    assert patient_client.get("/api/v1/patient/auth/me/").status_code == 200
    assert patient_client.get("/api/v1/patient/auth/me/", **APP).status_code == 401


def test_patient_app_key_never_opens_staff_endpoints(patient_user: Any) -> None:
    key = _app_login(APIClient(), patient_user)
    response = APIClient().get("/api/v1/staff/auth/me/", **_bearer(key))
    assert response.status_code == 401


def test_browser_requests_still_need_csrf(csrf_api: APIClient, patient_user: Any) -> None:
    response = csrf_api.post(
        "/api/v1/patient/auth/login/",
        {"email": patient_user.email, "password": PASSWORD},
        format="json",
    )
    assert response.status_code == 403
    assert error_code(response) == "csrf_failed"


def test_cors_preflight_refuses_the_app_header(settings: Any) -> None:
    origin = "https://patient.example.test"
    settings.CORS_ALLOWED_ORIGINS = [origin]
    response = APIClient().options(
        "/api/v1/patient/auth/login/",
        HTTP_ORIGIN=origin,
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
        HTTP_ACCESS_CONTROL_REQUEST_HEADERS="x-medilink-client",
    )
    allowed = response.get("Access-Control-Allow-Headers", "").lower()
    assert "x-medilink-client" not in allowed
