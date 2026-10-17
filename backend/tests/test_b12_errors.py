"""B12: error envelope and codes (architecture 02 §4), request IDs, 404 for other-facility objects."""

from __future__ import annotations

import json
from typing import Any

import pytest
from django.test import Client, override_settings
from rest_framework import exceptions
from rest_framework.test import APIClient

from medilink.core.exceptions import (
    BusinessRuleViolation,
    Conflict,
    StepUpRequired,
    api_exception_handler,
)
from tests.conftest import login_staff
from tests.factories import make_note, make_staff

pytestmark = [pytest.mark.acceptance("B12"), pytest.mark.django_db]


def _assert_envelope(response: Any, status: int, code: str) -> dict[str, Any]:
    assert response.status_code == status, response.content
    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "fields", "request_id"}
    assert body["error"]["code"] == code
    assert body["error"]["message"]
    assert body["error"]["request_id"] == response["X-Request-ID"]
    return body["error"]


def test_b12_validation_error_lists_fields(api: APIClient) -> None:
    error = _assert_envelope(
        api.post("/api/v1/staff/auth/login/", {"email": "nope"}), 400, "validation_error"
    )
    assert error["message"] == "Some fields need attention."
    assert error["fields"]["email"] == ["Enter a valid email address."]
    assert error["fields"]["password"] == ["This field is required."]


def test_b12_unknown_fields_are_rejected(api: APIClient) -> None:
    response = api.post(
        "/api/v1/auth/password-reset/", {"email": "a@example.test", "is_platform_admin": True}
    )
    error = _assert_envelope(response, 400, "validation_error")
    assert "is_platform_admin" in error["fields"]


def test_b12_malformed_json_is_bad_request(api: APIClient) -> None:
    response = api.post(
        "/api/v1/staff/auth/login/", data="{not json", content_type="application/json"
    )
    _assert_envelope(response, 400, "bad_request")


def test_b12_not_authenticated_has_www_authenticate(api: APIClient) -> None:
    response = api.get("/api/v1/staff/auth/me/")
    error = _assert_envelope(response, 401, "not_authenticated")
    assert error["fields"] == {}
    assert response["WWW-Authenticate"] == 'Session realm="staff"'


def test_b12_mfa_required_code(api: APIClient, staff_user: Any) -> None:
    api.post(
        "/api/v1/staff/auth/login/",
        {"email": staff_user.email, "password": "a long synthetic test passphrase"},
    )
    _assert_envelope(api.get("/api/v1/staff/auth/me/"), 401, "mfa_required")


def test_b12_method_not_allowed(api: APIClient) -> None:
    _assert_envelope(api.delete("/api/v1/health/"), 405, "method_not_allowed")


def test_b12_unsupported_media_type(api: APIClient) -> None:
    response = api.post(
        "/api/v1/auth/password-reset/",
        data="email=a",
        content_type="application/x-www-form-urlencoded",
    )
    _assert_envelope(response, 415, "unsupported_media_type")


def test_b12_rate_limited_has_retry_after(api: APIClient) -> None:
    from unittest import mock

    from medilink.core.throttling import IPScopedRateThrottle

    with mock.patch.dict(IPScopedRateThrottle.THROTTLE_RATES, {"password_reset": "1/hour"}):
        api.post("/api/v1/auth/password-reset/", {"email": "a@example.test"})
        response = api.post("/api/v1/auth/password-reset/", {"email": "a@example.test"})
    _assert_envelope(response, 429, "rate_limited")
    assert int(response["Retry-After"]) > 0


def test_b12_unknown_api_url_is_json_404() -> None:
    with override_settings(DEBUG=False):
        response = Client().get("/api/v1/does-not-exist/")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


@pytest.mark.urls("tests.demo_views")
def test_b12_other_facility_object_is_404(
    api: APIClient, facility: Any, other_facility: Any
) -> None:
    own = make_note(facility, "own")
    foreign = make_note(other_facility, "foreign")
    login_staff(api, make_staff(facility, roles=("receptionist",)))
    assert api.get(f"/api/v1/staff/demo/notes/{own.pk}/").json()["title"] == "own"
    _assert_envelope(api.get(f"/api/v1/staff/demo/notes/{foreign.pk}/"), 404, "not_found")
    _assert_envelope(api.get("/api/v1/staff/demo/notes/not-a-uuid/"), 404, "not_found")
    missing = api.get("/api/v1/staff/demo/notes/01a14a5e-0000-7000-8000-000000000000/")
    assert (
        missing.json()["error"]["message"]
        == api.get(f"/api/v1/staff/demo/notes/{foreign.pk}/").json()["error"]["message"]
    )


@pytest.mark.urls("tests.demo_views")
def test_b12_missing_permission_is_403(api: APIClient, facility: Any) -> None:
    login_staff(api, make_staff(facility, roles=("receptionist",)))
    _assert_envelope(api.post("/api/v1/staff/demo/configure/"), 403, "permission_denied")
    admin_client = APIClient()
    login_staff(admin_client, make_staff(facility, roles=("facility_admin",)))
    assert admin_client.post("/api/v1/staff/demo/configure/").status_code == 200


@pytest.mark.urls("tests.demo_views")
def test_b12_unexpected_error_is_generic_500(api: APIClient, facility: Any, caplog: Any) -> None:
    login_staff(api, make_staff(facility))
    error = _assert_envelope(api.get("/api/v1/staff/demo/boom/"), 500, "server_error")
    assert "patient@example.test" not in error["message"]
    assert "Something went wrong" in error["message"]


def test_b12_request_id_is_echoed_or_generated(api: APIClient) -> None:
    echoed = api.get("/api/v1/health/", HTTP_X_REQUEST_ID="client-req-0001")
    assert echoed["X-Request-ID"] == "client-req-0001"
    replaced = api.get("/api/v1/health/", HTTP_X_REQUEST_ID="bad id\nwith newline")
    assert replaced["X-Request-ID"] != "bad id\nwith newline"
    assert len(replaced["X-Request-ID"]) == 26
    assert api.get("/api/v1/health/")["X-Request-ID"] != replaced["X-Request-ID"]


@pytest.mark.parametrize(
    ("exc", "status", "code"),
    [
        (Conflict(), 409, "conflict"),
        (BusinessRuleViolation(), 422, "business_rule_violation"),
        (StepUpRequired(), 403, "step_up_required"),
        (exceptions.NotAcceptable(), 406, "not_acceptable"),
        (exceptions.PermissionDenied("Custom reason"), 403, "permission_denied"),
        (exceptions.ValidationError(["one", "two"]), 400, "validation_error"),
        (
            exceptions.ValidationError({"items": [{"qty": ["bad"]}], "a": {"b": ["c"]}}),
            400,
            "validation_error",
        ),
    ],
)
def test_b12_exception_mapping(exc: Exception, status: int, code: str) -> None:
    response = api_exception_handler(exc, {})
    assert response is not None
    assert response.status_code == status
    assert response.data["error"]["code"] == code


def test_b12_nested_validation_fields_are_flattened() -> None:
    exc = exceptions.ValidationError({"items": [{"qty": ["bad"]}], "a": {"b": ["c"]}})
    fields = api_exception_handler(exc, {}).data["error"]["fields"]
    assert fields == {"items.0.qty": ["bad"], "a.b": ["c"]}
    lst = api_exception_handler(exceptions.ValidationError(["x"]), {}).data["error"]["fields"]
    assert lst == {"non_field_errors": ["x"]}
    custom = api_exception_handler(exceptions.PermissionDenied("Custom reason"), {})
    assert custom.data["error"]["message"] == "Custom reason"


def test_b12_django_handlers_return_envelopes() -> None:
    from django.test import RequestFactory

    from medilink.core import exceptions as exc_module

    request = RequestFactory().get("/x")
    assert exc_module.handler_bad_request(request).status_code == 400
    assert exc_module.handler_permission_denied(request).status_code == 403
    assert exc_module.handler_server_error(request).status_code == 500
    not_found = exc_module.handler_not_found(request)
    assert json.loads(not_found.content)["error"]["code"] == "not_found"
