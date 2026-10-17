"""B5: staff login without a confirmed second factor never yields an authenticated session."""

from __future__ import annotations

from typing import Any

import pytest
from django.contrib.auth import SESSION_KEY
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.test import APIClient

from medilink.accounts.models import RecoveryCode
from medilink.accounts.session_store import SessionStore
from tests.conftest import code_for_secret, error_code, totp_code
from tests.factories import PASSWORD, FacilityFactory, UserFactory, make_membership, make_staff

pytestmark = [pytest.mark.acceptance("B5"), pytest.mark.django_db]

LOGIN = "/api/v1/staff/auth/login/"
ME = "/api/v1/staff/auth/me/"


def _login(client: APIClient, user: Any, password: str = PASSWORD) -> Any:
    return client.post(LOGIN, {"email": user.email, "password": password})


def _session(client: APIClient) -> SessionStore:
    return SessionStore(client.cookies["ml_staff"].value, audience="staff")


def _enrol(client: APIClient) -> Any:
    secret = client.post("/api/v1/staff/auth/mfa/setup/").json()["secret"]
    return client.post("/api/v1/staff/auth/mfa/confirm/", {"code": code_for_secret(secret)})


def test_b5_staff_without_mfa_not_authenticated(api: APIClient, facility: Any) -> None:
    user = make_staff(facility, enrolled=False)
    response = _login(api, user)
    assert response.status_code == 200
    assert response.json() == {"status": "mfa_setup_required", "user": None}
    session = _session(api)
    assert SESSION_KEY not in session  # Django never logged the user in
    me = api.get(ME)
    assert me.status_code == 401
    assert error_code(me) == "mfa_required"
    assert (
        api.post(
            "/api/v1/staff/auth/active-facility/", {"facility_id": str(facility.pk)}
        ).status_code
        == 401
    )


def test_b5_enrolled_staff_gets_mfa_required_and_no_session(
    api: APIClient, staff_user: Any
) -> None:
    response = _login(api, staff_user)
    assert response.json() == {"status": "mfa_required", "user": None}
    assert SESSION_KEY not in _session(api)
    assert error_code(api.get(ME)) == "mfa_required"


def test_b5_mfa_setup_confirm_returns_recovery_codes_and_authenticates(
    api: APIClient, facility: Any
) -> None:
    user = make_staff(facility, enrolled=False)
    _login(api, user)
    setup = api.post("/api/v1/staff/auth/mfa/setup/")
    assert setup.status_code == 200
    body = setup.json()
    assert body["otpauth_uri"].startswith("otpauth://totp/")
    assert f"secret={body['secret']}" in body["otpauth_uri"]
    assert not TOTPDevice.objects.filter(user=user, confirmed=True).exists()

    wrong = api.post("/api/v1/staff/auth/mfa/confirm/", {"code": "000000"})
    assert wrong.status_code == 400
    assert error_code(wrong) == "validation_error"
    assert "code" in wrong.json()["error"]["fields"]
    assert error_code(api.get(ME)) == "mfa_required"

    TOTPDevice.objects.filter(user=user).update(
        throttling_failure_count=0, throttling_failure_timestamp=None
    )
    confirm = api.post("/api/v1/staff/auth/mfa/confirm/", {"code": code_for_secret(body["secret"])})
    assert confirm.status_code == 200, confirm.content
    data = confirm.json()
    assert data["status"] == "authenticated"
    assert data["user"]["mfa_enabled"] is True
    assert data["user"]["active_facility_id"] == str(facility.pk)  # single membership auto-selected
    codes = data["recovery_codes"]
    assert len(codes) == 10 and len(set(codes)) == 10
    assert all(len(code) == 9 and code[4] == "-" for code in codes)
    stored = list(RecoveryCode.objects.filter(user=user).values_list("code_hash", flat=True))
    assert len(stored) == 10
    assert all(h.startswith("argon2$argon2id$") for h in stored)
    assert not any(code.replace("-", "") in h or code in h for code in codes for h in stored)
    assert api.get(ME).status_code == 200


def test_b5_mfa_setup_only_in_setup_state(api: APIClient, staff_user: Any) -> None:
    assert api.post("/api/v1/staff/auth/mfa/setup/").status_code == 401  # no session at all
    _login(api, staff_user)  # enrolled user -> mfa_required, not setup
    response = api.post("/api/v1/staff/auth/mfa/setup/")
    assert response.status_code == 401
    assert error_code(response) == "not_authenticated"
    assert api.post("/api/v1/staff/auth/mfa/confirm/", {"code": "123456"}).status_code == 401


def test_b5_verify_requires_mfa_required_state(api: APIClient, facility: Any) -> None:
    assert api.post("/api/v1/staff/auth/mfa/verify/", {"code": "123456"}).status_code == 401
    user = make_staff(facility, enrolled=False)
    _login(api, user)
    assert api.post("/api/v1/staff/auth/mfa/verify/", {"code": "123456"}).status_code == 401


def test_b5_verify_with_totp_code(api: APIClient, staff_user: Any) -> None:
    _login(api, staff_user)
    response = api.post("/api/v1/staff/auth/mfa/verify/", {"code": totp_code(staff_user)})
    assert response.status_code == 200
    assert response.json()["status"] == "authenticated"
    assert response.json()["user"]["email"] == staff_user.email
    assert api.get(ME).status_code == 200


def test_b5_verify_wrong_code_is_400(api: APIClient, staff_user: Any) -> None:
    _login(api, staff_user)
    response = api.post("/api/v1/staff/auth/mfa/verify/", {"code": "000000"})
    assert response.status_code == 400
    assert response.json()["error"]["fields"] == {
        "code": ["That code didn't work. Check your authenticator app and try again."]
    }
    assert error_code(api.get(ME)) == "mfa_required"


def test_b5_verify_needs_exactly_one_factor(api: APIClient, staff_user: Any) -> None:
    _login(api, staff_user)
    assert api.post("/api/v1/staff/auth/mfa/verify/", {}).status_code == 400
    both = api.post(
        "/api/v1/staff/auth/mfa/verify/", {"code": "123456", "recovery_code": "abcd-efgh"}
    )
    assert both.status_code == 400
    assert "non_field_errors" in both.json()["error"]["fields"]


def test_b5_recovery_code_works_once(api: APIClient, facility: Any) -> None:
    user = make_staff(facility, enrolled=False)
    _login(api, user)
    codes = _enrol(api).json()["recovery_codes"]
    api.post("/api/v1/staff/auth/logout/")

    other = APIClient()
    _login(other, user)
    response = other.post("/api/v1/staff/auth/mfa/verify/", {"recovery_code": codes[0].upper()})
    assert response.status_code == 200, response.content
    assert RecoveryCode.objects.filter(user=user, used_at__isnull=False).count() == 1

    third = APIClient()
    _login(third, user)
    reused = third.post("/api/v1/staff/auth/mfa/verify/", {"recovery_code": codes[0]})
    assert reused.status_code == 400
    assert "recovery_code" in reused.json()["error"]["fields"]
    assert third.post("/api/v1/staff/auth/mfa/verify/", {"recovery_code": "zz"}).status_code == 400


def test_b5_mfa_lockout_after_repeated_failures(api: APIClient, staff_user: Any) -> None:
    _login(api, staff_user)
    for _ in range(5):
        TOTPDevice.objects.filter(user=staff_user).update(throttling_failure_count=0)
        assert api.post("/api/v1/staff/auth/mfa/verify/", {"code": "000000"}).status_code == 400
    response = api.post("/api/v1/staff/auth/mfa/verify/", {"code": totp_code(staff_user)})
    assert response.status_code == 429
    assert error_code(response) == "rate_limited"
    assert int(response["Retry-After"]) > 0


def test_b5_confirm_lockout_after_repeated_failures(api: APIClient, facility: Any) -> None:
    user = make_staff(facility, enrolled=False)
    _login(api, user)
    api.post("/api/v1/staff/auth/mfa/setup/")
    for _ in range(5):
        TOTPDevice.objects.filter(user=user).update(throttling_failure_count=0)
        api.post("/api/v1/staff/auth/mfa/confirm/", {"code": "000000"})
    assert api.post("/api/v1/staff/auth/mfa/confirm/", {"code": "000000"}).status_code == 429


def test_b5_platform_admin_without_membership_is_staff(api: APIClient) -> None:
    admin = UserFactory(is_platform_admin=True, email="root@example.test")
    _login(api, admin)
    response = _enrol(api)
    assert response.status_code == 200
    me = response.json()["user"]
    assert me["is_platform_admin"] is True
    assert me["memberships"] == [] and me["active_facility_id"] is None and me["permissions"] == []


def test_b5_deactivated_membership_loses_staff_access(api: APIClient, facility: Any) -> None:
    user = UserFactory(email="former@example.test")
    make_membership(user, facility, is_active=False)
    response = _login(api, user)
    assert response.status_code == 401
    assert error_code(response) == "not_authenticated"


def test_b5_membership_ended_mid_session_drops_access(
    staff_client: APIClient, staff_user: Any, facility: Any
) -> None:
    from medilink.tenancy.context import rls_context
    from medilink.tenancy.models import FacilityMembership

    with rls_context(facility_id=facility.pk):
        FacilityMembership.objects.filter(user=staff_user).update(is_active=False)
    assert staff_client.get(ME).status_code == 401


def test_b5_multi_facility_user_has_no_active_facility_until_chosen(
    api: APIClient, facility: Any
) -> None:
    user = make_staff(facility, roles=("doctor",))
    make_membership(user, FacilityFactory(), roles=("doctor",))
    _login(api, user)
    me = api.post("/api/v1/staff/auth/mfa/verify/", {"code": totp_code(user)}).json()["user"]
    assert len(me["memberships"]) == 2
    assert me["active_facility_id"] is None
    assert me["permissions"] == []
