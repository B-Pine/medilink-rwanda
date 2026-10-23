"""B2: every Sprint 0 endpoint exists, matches the schema and appears in /api/v1/schema/."""

from __future__ import annotations

from typing import Any

import pytest
import yaml
from drf_spectacular.generators import SchemaGenerator

pytestmark = [pytest.mark.acceptance("B2"), pytest.mark.django_db]

CONTRACT = {
    ("/api/v1/health/", "get"): "200",
    ("/api/v1/csrf/", "get"): "200",
    ("/api/v1/staff/auth/login/", "post"): "200",
    ("/api/v1/staff/auth/mfa/setup/", "post"): "200",
    ("/api/v1/staff/auth/mfa/confirm/", "post"): "200",
    ("/api/v1/staff/auth/mfa/verify/", "post"): "200",
    ("/api/v1/staff/auth/logout/", "post"): "204",
    ("/api/v1/staff/auth/me/", "get"): "200",
    ("/api/v1/staff/auth/active-facility/", "post"): "200",
    ("/api/v1/patient/auth/register/", "post"): "201",
    ("/api/v1/patient/auth/login/", "post"): "200",
    ("/api/v1/patient/auth/logout/", "post"): "204",
    ("/api/v1/patient/auth/me/", "get"): "200",
    ("/api/v1/auth/password-reset/", "post"): "202",
    ("/api/v1/auth/password-reset/confirm/", "post"): "204",
}  # GET /api/v1/schema/ itself is checked over HTTP below (it doesn't list itself)


@pytest.fixture(scope="module")
def schema() -> dict[str, Any]:
    return SchemaGenerator().get_schema(request=None, public=True)


def _props(schema: dict[str, Any], component: str) -> dict[str, Any]:
    return schema["components"]["schemas"][component]["properties"]


def test_b2_every_contract_endpoint_is_in_the_schema(schema: dict[str, Any]) -> None:
    for (path, method), success in CONTRACT.items():
        assert path in schema["paths"], path
        operation = schema["paths"][path].get(method)
        assert operation is not None, f"{method.upper()} {path}"
        assert success in operation["responses"], f"{method.upper()} {path} -> {success}"


def test_b2_schema_endpoint_serves_openapi(api: Any) -> None:
    response = api.get("/api/v1/schema/")
    assert response.status_code == 200
    document = yaml.safe_load(response.content)
    assert document["openapi"].startswith("3.")
    assert "/api/v1/staff/auth/login/" in document["paths"]


def test_b2_staff_me_schema_matches_contract(schema: dict[str, Any]) -> None:
    props = _props(schema, "StaffMe")
    assert set(props) == {
        "id",
        "email",
        "full_name",
        "preferred_language",
        "is_platform_admin",
        "mfa_enabled",
        "memberships",
        "active_facility_id",
        "permissions",
        "feature_flags",  # S1 contract §3.1
        "security",  # S1 contract §3.1
    }
    assert props["active_facility_id"].get("nullable") is True
    membership = _props(schema, "Membership")
    assert set(membership) == {"facility", "roles"}
    assert set(_props(schema, "FacilitySummary")) == {"id", "name", "slug", "facility_type"}


def test_b2_patient_me_schema_matches_contract(schema: dict[str, Any]) -> None:
    assert set(_props(schema, "PatientMe")) == {
        "id",
        "email",
        "full_name",
        "preferred_language",
        "email_verified",
        "profiles",
    }
    assert set(_props(schema, "PatientProfile")) == {"patient_id", "display_name", "relationship"}


def test_b2_login_result_schema_matches_contract(schema: dict[str, Any]) -> None:
    props = _props(schema, "LoginResult")
    assert set(props) == {"status", "user"}
    status_enum = schema["components"]["schemas"]["LoginStatusEnum"]["enum"]
    assert set(status_enum) == {"authenticated", "mfa_required", "mfa_setup_required"}
    assert set(_props(schema, "MfaConfirmResult")) == {"status", "user", "recovery_codes"}
    assert set(_props(schema, "MfaSetup")) == {"otpauth_uri", "secret"}


def test_b2_request_bodies_match_contract(schema: dict[str, Any]) -> None:
    assert set(_props(schema, "StaffLoginRequest")) == {"email", "password"}
    assert set(_props(schema, "MfaVerifyRequest")) == {"code", "recovery_code"}
    assert set(_props(schema, "ActiveFacilityRequest")) == {"facility_id"}
    assert set(_props(schema, "PatientRegisterRequest")) == {
        "full_name",
        "email",
        "password",
        "preferred_language",
        "accepted_terms_version",
        "accepted_privacy_version",
        "research_consent",
    }
    assert set(_props(schema, "PasswordResetRequest")) == {"email"}
    assert set(_props(schema, "PasswordResetConfirmRequest")) == {"uid", "token", "new_password"}


def test_b2_error_envelope_is_documented(schema: dict[str, Any]) -> None:
    assert set(_props(schema, "ErrorDetail")) == {"code", "message", "fields", "request_id"}
    login = schema["paths"]["/api/v1/staff/auth/login/"]["post"]["responses"]
    assert login["401"]["content"]["application/json"]["schema"]["$ref"].endswith("/Error")


def test_b2_health_and_csrf(api: Any) -> None:
    assert api.get("/api/v1/health/").json() == {"status": "ok", "version": "0.1.0"}
    response = api.get("/api/v1/csrf/")
    assert response.status_code == 200
    assert len(response.json()["csrf_token"]) == 64
    assert "ml_csrf" in response.cookies
