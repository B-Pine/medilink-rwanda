"""B9: CORS allowlist from env with credentials and no wildcard; CSRF trusted origins from env;
CSRF enforced on every unsafe API request (including anonymous login/register/reset)."""

from __future__ import annotations

import os
from typing import Any
from unittest import mock

import pytest
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from rest_framework.test import APIClient

from tests.conftest import error_code, totp_code

pytestmark = [pytest.mark.acceptance("B9"), pytest.mark.django_db]

ALLOWED = "http://localhost:5173"


def test_b9_preflight_from_allowed_origin(api: APIClient) -> None:
    response = api.options(
        "/api/v1/staff/auth/login/",
        HTTP_ORIGIN=ALLOWED,
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
        HTTP_ACCESS_CONTROL_REQUEST_HEADERS="content-type,x-csrftoken,accept-language",
    )
    assert response.status_code == 200
    assert response["Access-Control-Allow-Origin"] == ALLOWED
    assert response["Access-Control-Allow-Credentials"] == "true"
    assert "x-csrftoken" in response["Access-Control-Allow-Headers"]


def test_b9_disallowed_origin_gets_no_cors_headers(api: APIClient) -> None:
    response = api.get("/api/v1/health/", HTTP_ORIGIN="https://evil.example")
    assert "Access-Control-Allow-Origin" not in response
    preflight = api.options(
        "/api/v1/staff/auth/login/",
        HTTP_ORIGIN="https://evil.example",
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
    )
    assert "Access-Control-Allow-Origin" not in preflight


def test_b9_exposes_request_id_and_retry_after(api: APIClient) -> None:
    response = api.get("/api/v1/health/", HTTP_ORIGIN=ALLOWED)
    assert response["Access-Control-Allow-Origin"] == ALLOWED
    assert "X-Request-ID" in response["Access-Control-Expose-Headers"]
    assert "Retry-After" in response["Access-Control-Expose-Headers"]


def test_b9_no_wildcard_configuration() -> None:
    assert settings.CORS_ALLOW_ALL_ORIGINS is False
    assert settings.CORS_ALLOW_CREDENTIALS is True
    assert all("*" not in origin for origin in settings.CORS_ALLOWED_ORIGINS)
    assert settings.CSRF_TRUSTED_ORIGINS == ["http://localhost:5173", "http://localhost:5174"]


def _origin_env(**values: str) -> Any:
    """os.environ without any origin variables (e.g. from a local .env), plus `values`."""
    names = ("CORS_ALLOWED_ORIGINS", "CSRF_TRUSTED_ORIGINS", "WS_ALLOWED_ORIGINS")
    clean = {k: v for k, v in os.environ.items() if k not in names}
    return mock.patch.dict(os.environ, {**clean, **values}, clear=True)


def test_b9_origins_come_from_env_and_wildcards_are_refused() -> None:
    from config.settings.base import origin_settings

    origins = "https://staff.medilink.rw,https://medilink.rw"
    with _origin_env(CORS_ALLOWED_ORIGINS=origins):
        cors, csrf, ws = origin_settings([])
    assert cors == csrf == ws == ["https://staff.medilink.rw", "https://medilink.rw"]
    with _origin_env(
        CORS_ALLOWED_ORIGINS=origins, CSRF_TRUSTED_ORIGINS="https://staff.medilink.rw"
    ):
        assert origin_settings([])[1] == ["https://staff.medilink.rw"]
    with _origin_env(), pytest.raises(ImproperlyConfigured):
        origin_settings(["*"])
    with _origin_env(CORS_ALLOWED_ORIGINS="*"), pytest.raises(ImproperlyConfigured):
        origin_settings([])
    with (
        _origin_env(CORS_ALLOWED_ORIGINS="https://*.medilink.rw"),
        pytest.raises(ImproperlyConfigured),
    ):
        origin_settings([])
    with (
        _origin_env(CORS_ALLOWED_ORIGINS="http://staff.medilink.rw"),
        pytest.raises(ImproperlyConfigured),
    ):
        origin_settings([], require_https=True)


@pytest.mark.parametrize(
    ("url", "body"),
    [
        ("/api/v1/staff/auth/login/", {"email": "a@example.test", "password": "x"}),
        ("/api/v1/patient/auth/login/", {"email": "a@example.test", "password": "x"}),
        ("/api/v1/patient/auth/register/", {}),
        ("/api/v1/auth/password-reset/", {"email": "a@example.test"}),
        ("/api/v1/staff/auth/logout/", {}),
    ],
)
def test_b9_unsafe_requests_without_csrf_token_are_rejected(
    csrf_api: APIClient, url: str, body: dict[str, Any]
) -> None:
    response = csrf_api.post(url, body, HTTP_ORIGIN=ALLOWED)
    assert response.status_code == 403
    assert error_code(response) == "csrf_failed"
    assert response.json()["error"]["request_id"] == response["X-Request-ID"]


def test_b9_csrf_token_from_endpoint_is_accepted(csrf_api: APIClient, staff_user: Any) -> None:
    token = csrf_api.get("/api/v1/csrf/").json()["csrf_token"]
    response = csrf_api.post(
        "/api/v1/staff/auth/login/",
        {"email": staff_user.email, "password": "a long synthetic test passphrase"},
        HTTP_X_CSRFTOKEN=token,
        HTTP_ORIGIN=ALLOWED,
    )
    assert response.status_code == 200
    # Signing in rotates the CSRF secret: the client fetches a new token after each login step.
    token = csrf_api.get("/api/v1/csrf/").json()["csrf_token"]
    verify = csrf_api.post(
        "/api/v1/staff/auth/mfa/verify/",
        {"code": totp_code(staff_user)},
        HTTP_X_CSRFTOKEN=token,
        HTTP_ORIGIN=ALLOWED,
    )
    assert verify.status_code == 200
    stale = csrf_api.post("/api/v1/staff/auth/logout/", HTTP_X_CSRFTOKEN=token, HTTP_ORIGIN=ALLOWED)
    assert stale.status_code == 403  # token from before the rotation
    fresh = csrf_api.get("/api/v1/csrf/").json()["csrf_token"]
    assert (
        csrf_api.post(
            "/api/v1/staff/auth/logout/", HTTP_X_CSRFTOKEN=fresh, HTTP_ORIGIN=ALLOWED
        ).status_code
        == 204
    )


def test_b9_untrusted_origin_fails_csrf_even_with_token(csrf_api: APIClient) -> None:
    token = csrf_api.get("/api/v1/csrf/").json()["csrf_token"]
    response = csrf_api.post(
        "/api/v1/auth/password-reset/",
        {"email": "a@example.test"},
        HTTP_X_CSRFTOKEN=token,
        HTTP_ORIGIN="https://evil.example",
        secure=True,
    )
    assert response.status_code == 403
    assert error_code(response) == "csrf_failed"


def test_b9_safe_methods_do_not_need_csrf(csrf_api: APIClient) -> None:
    assert csrf_api.get("/api/v1/health/").status_code == 200
    assert csrf_api.get("/api/v1/staff/auth/me/").status_code == 401
