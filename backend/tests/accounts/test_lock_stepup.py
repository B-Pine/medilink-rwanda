"""S1-B14 (idle lock), S1-B15 (PIN), S1-B16 (step-up), S1-B17 (flags in StaffMe)."""

from __future__ import annotations

import time
from typing import Any

import pytest
from django.contrib.auth.hashers import identify_hasher
from django.core import mail
from django.core.management import call_command
from django.core.management.base import SystemCheckError
from rest_framework.test import APIClient

from medilink.accounts import lock as lock_service
from medilink.accounts.models import User, UserSession
from medilink.accounts.session_store import SessionStore
from medilink.accounts.sessions import AUTH_AT_KEY, LAST_SEEN_KEY, MFA_AT_KEY
from medilink.audit.models import AuditEntry
from medilink.onboarding.models import FacilityFeatureFlag, FeatureFlag
from tests.conftest import error_code, login_staff, totp_code
from tests.factories import PASSWORD

ME = "/api/v1/staff/auth/me/"
LOCK = "/api/v1/staff/auth/lock/"
UNLOCK = "/api/v1/staff/auth/unlock/"
PIN = "/api/v1/staff/auth/pin/"
STEP_UP = "/api/v1/staff/auth/step-up/"


def _session(client: APIClient) -> SessionStore:
    return SessionStore(client.cookies["ml_staff"].value, audience="staff")


def _age(client: APIClient, *, seen_ago: int, mfa_ago: int | None = None) -> None:
    store = _session(client)
    now = int(time.time())
    store[AUTH_AT_KEY] = now - max(seen_ago, 60)
    store[LAST_SEEN_KEY] = now - seen_ago
    if mfa_ago is not None:
        store[MFA_AT_KEY] = now - mfa_ago
    store.save()


def _with_pin(user: User, pin: str = "4826") -> None:
    lock_service.set_pin(user, pin)


# ---- S1-B14: idle lock ---------------------------------------------------------------------


@pytest.mark.acceptance("S1-B14")
def test_idle_session_is_locked_not_ended(staff_client: APIClient, staff_user: User) -> None:
    key = staff_client.cookies["ml_staff"].value
    _age(staff_client, seen_ago=16 * 60)
    response = staff_client.get(ME)
    assert response.status_code == 401
    assert error_code(response) == "session_locked"
    assert UserSession.objects.filter(session_key=key).exists()
    # Every staff and platform endpoint answers session_locked; lock state still works.
    assert error_code(staff_client.get("/api/v1/staff/master-data/insurers/")) == "session_locked"
    state = staff_client.get(LOCK).json()
    assert state["is_locked"] is True and state["full_name"] == staff_user.full_name
    assert state["unlock_methods"] == ["password"] and state["attempts_remaining"] == 5
    # The failed request rolled back; the lock-state request writes the idle lock audit entry.
    assert (
        AuditEntry.objects.filter(action="auth.session.locked", metadata__trigger="idle").count()
        == 1
    )
    staff_client.get(LOCK)
    assert AuditEntry.objects.filter(action="auth.session.locked").count() == 1
    # Requests while locked don't count as activity.
    assert error_code(staff_client.get(ME)) == "session_locked"


@pytest.mark.acceptance("S1-B14")
def test_locked_session_still_ends_at_idle_timeout(staff_client: APIClient) -> None:
    _age(staff_client, seen_ago=4 * 3600 + 60)
    assert error_code(staff_client.get(ME)) == "not_authenticated"


@pytest.mark.acceptance("S1-B14")
def test_manual_lock_and_logout_while_locked(staff_client: APIClient) -> None:
    assert staff_client.post(LOCK).status_code == 204
    assert staff_client.post(LOCK).status_code == 204  # idempotent
    assert error_code(staff_client.get(ME)) == "session_locked"
    assert (
        AuditEntry.objects.filter(action="auth.session.locked", metadata__trigger="manual").count()
        == 1
    )
    assert staff_client.post("/api/v1/staff/auth/logout/").status_code == 204
    assert error_code(staff_client.get(LOCK)) == "not_authenticated"


@pytest.mark.acceptance("S1-B14")
def test_patient_sessions_never_lock(patient_client: APIClient) -> None:
    store = SessionStore(patient_client.cookies["ml_patient"].value, audience="patient")
    now = int(time.time())
    store[AUTH_AT_KEY] = now - 3 * 3600
    store[LAST_SEEN_KEY] = now - 2 * 3600
    store.save()
    assert patient_client.get("/api/v1/patient/auth/me/").status_code == 200


@pytest.mark.acceptance("S1-B14")
def test_lock_after_range_check(settings: Any) -> None:
    staff = {**settings.SESSION_AUDIENCES["staff"], "LOCK_AFTER": 60}
    settings.SESSION_AUDIENCES = {**settings.SESSION_AUDIENCES, "staff": staff}
    with pytest.raises(SystemCheckError, match=r"medilink.E101"):
        call_command("check")
    staff["LOCK_AFTER"], staff["IDLE_TIMEOUT"] = 900, 600
    with pytest.raises(SystemCheckError, match=r"medilink.E102"):
        call_command("check")


# ---- S1-B15: PIN ---------------------------------------------------------------------------------


@pytest.mark.acceptance("S1-B15")
@pytest.mark.parametrize(
    ("pin", "ok"),
    [
        ("4826", True),
        ("905173", True),
        ("123", False),
        ("1234567", False),
        ("12a4", False),
        ("1111", False),
        ("1234", False),
        ("987654", False),
        ("2580", False),
    ],
)
def test_pin_rules(pin: str, ok: bool) -> None:
    assert (lock_service.pin_problem(pin) is None) is ok


@pytest.mark.acceptance("S1-B15")
def test_set_change_remove_pin(staff_client: APIClient, staff_user: User) -> None:
    assert staff_client.put(PIN, {"pin": "1111"}, format="json").status_code == 400
    assert staff_client.put(PIN, {"pin": "4826"}, format="json").status_code == 204
    staff_user.refresh_from_db()
    assert identify_hasher(staff_user.pin_hash).algorithm == "argon2"
    assert "4826" not in staff_user.pin_hash
    assert staff_client.get(ME).json()["security"]["pin_set"] is True
    assert [m.subject for m in mail.outbox] == []  # sent on commit (none in this test transaction)
    assert AuditEntry.objects.filter(action="auth.pin.set").exists()
    assert staff_client.delete(PIN).status_code == 204
    staff_user.refresh_from_db()
    assert staff_user.pin_hash is None
    assert AuditEntry.objects.filter(action="auth.pin.removed").exists()


@pytest.mark.acceptance("S1-B15")
def test_setting_a_pin_needs_step_up(staff_client: APIClient) -> None:
    _age(staff_client, seen_ago=60, mfa_ago=600)
    response = staff_client.put(PIN, {"pin": "4826"}, format="json")
    assert response.status_code == 403 and error_code(response) == "step_up_required"
    assert staff_client.delete(PIN).status_code == 204  # removing doesn't need step-up


@pytest.mark.acceptance("S1-B15")
def test_pin_and_password_unlock_restore_the_same_session(
    staff_client: APIClient, staff_user: User
) -> None:
    _with_pin(staff_user)
    key = staff_client.cookies["ml_staff"].value
    staff_client.post(LOCK)
    assert staff_client.get(LOCK).json()["unlock_methods"] == ["pin", "password"]
    response = staff_client.post(UNLOCK, {"pin": "4826"}, format="json")
    assert response.status_code == 200, response.content
    assert response.json()["email"] == staff_user.email
    assert staff_client.cookies["ml_staff"].value == key  # not rotated
    assert staff_client.get(ME).status_code == 200
    staff_client.post(LOCK)
    assert staff_client.post(UNLOCK, {"password": PASSWORD}, format="json").status_code == 200
    methods = list(
        AuditEntry.objects.filter(action="auth.session.unlocked").values_list(
            "metadata__method", flat=True
        )
    )
    assert methods == ["pin", "password"]


@pytest.mark.acceptance("S1-B15")
def test_five_failures_end_the_session(staff_client: APIClient, staff_user: User) -> None:
    _with_pin(staff_user)
    staff_client.post(LOCK)
    for left in (4, 3, 2, 1):
        response = staff_client.post(UNLOCK, {"pin": "9999"}, format="json")
        assert response.status_code == 400 and "pin" in response.json()["error"]["fields"]
        assert staff_client.get(LOCK).json()["attempts_remaining"] == left
    response = staff_client.post(UNLOCK, {"pin": "9999"}, format="json")
    assert response.status_code == 401
    assert AuditEntry.objects.filter(action="auth.unlock.exhausted").exists()
    assert staff_client.get(LOCK).status_code == 401
    assert AuditEntry.objects.filter(action="auth.unlock.failure").count() == 5


@pytest.mark.acceptance("S1-B15")
def test_ten_pin_failures_in_an_hour_disable_pin_unlock(
    staff_user: User, django_capture_on_commit_callbacks: Any
) -> None:
    _with_pin(staff_user)
    with django_capture_on_commit_callbacks(execute=True):
        for _ in range(2):  # two sessions, 5 wrong PINs each
            client = APIClient()
            login_staff(client, staff_user)
            client.post(LOCK)
            for _ in range(5):
                client.post(UNLOCK, {"pin": "9999"}, format="json")
    assert lock_service.pin_unlock_blocked(staff_user)
    assert [m.subject for m in mail.outbox] == ["Too many wrong PINs on your MediLink account"]
    client = APIClient()
    login_staff(client, staff_user)
    client.post(LOCK)
    assert client.get(LOCK).json()["unlock_methods"] == ["password"]
    assert client.post(UNLOCK, {"pin": "4826"}, format="json").status_code == 422
    assert client.post(UNLOCK, {"password": PASSWORD}, format="json").status_code == 200


@pytest.mark.acceptance("S1-B15")
def test_pin_unlock_flag_off_means_password_only(
    staff_client: APIClient, staff_user: User, facility: Any
) -> None:
    _with_pin(staff_user)
    FacilityFeatureFlag.objects.create(
        flag=FeatureFlag.objects.get(code="security.pin_unlock"),
        facility=facility,
        is_enabled=False,
    )
    staff_client.post(LOCK)
    assert staff_client.get(LOCK).json()["unlock_methods"] == ["password"]
    assert staff_client.post(UNLOCK, {"pin": "4826"}, format="json").status_code == 422


def test_unlock_needs_exactly_one_method(staff_client: APIClient) -> None:
    staff_client.post(LOCK)
    assert staff_client.post(UNLOCK, {}, format="json").status_code == 400
    both = staff_client.post(UNLOCK, {"pin": "4826", "password": PASSWORD}, format="json")
    assert both.status_code == 400
    assert APIClient().post(UNLOCK, {"pin": "4826"}, format="json").status_code == 401


def test_unlock_when_not_locked_returns_me(staff_client: APIClient) -> None:
    assert staff_client.post(UNLOCK, {"password": "wrong"}, format="json").status_code == 200


# ---- S1-B16: step-up -----------------------------------------------------------------------------


@pytest.mark.acceptance("S1-B16")
def test_step_up_opens_a_five_minute_window(staff_client: APIClient, staff_user: User) -> None:
    _age(staff_client, seen_ago=60, mfa_ago=600)
    assert staff_client.get(ME).json()["security"]["step_up_valid_until"] is None
    assert error_code(staff_client.put(PIN, {"pin": "4826"}, format="json")) == "step_up_required"
    response = staff_client.post(
        STEP_UP,
        {"method": "password_totp", "password": PASSWORD, "code": totp_code(staff_user)},
        format="json",
    )
    assert response.status_code == 200, response.content
    assert response.json()["step_up_valid_until"]
    assert staff_client.get(ME).json()["security"]["step_up_valid_until"]
    assert staff_client.put(PIN, {"pin": "4826"}, format="json").status_code == 204
    assert AuditEntry.objects.filter(action="auth.step_up.success").exists()


@pytest.mark.acceptance("S1-B16")
def test_login_mfa_counts_for_five_minutes(staff_client: APIClient) -> None:
    assert staff_client.get(ME).json()["security"]["step_up_valid_until"] is not None
    assert staff_client.put(PIN, {"pin": "4826"}, format="json").status_code == 204


@pytest.mark.acceptance("S1-B16")
def test_five_step_up_failures_end_the_session(staff_client: APIClient, staff_user: User) -> None:
    body = {"method": "password_totp", "password": "wrong password", "code": "000000"}
    for _ in range(4):
        response = staff_client.post(STEP_UP, body, format="json")
        assert response.status_code == 400
    assert staff_client.post(STEP_UP, body, format="json").status_code == 401
    assert staff_client.get(ME).status_code == 401
    assert AuditEntry.objects.filter(action="auth.step_up.failure").count() == 5


def test_step_up_needs_both_factors(staff_client: APIClient, staff_user: User) -> None:
    wrong_code = staff_client.post(
        STEP_UP, {"method": "password_totp", "password": PASSWORD, "code": "000000"}, format="json"
    )
    assert wrong_code.status_code == 400
    bad_method = staff_client.post(
        STEP_UP,
        {"method": "pin", "password": PASSWORD, "code": totp_code(staff_user)},
        format="json",
    )
    assert bad_method.status_code == 400


# ---- S1-B17: flags in StaffMe ---------------------------------------------------------------------


@pytest.mark.acceptance("S1-B17")
def test_staff_me_flags_and_security(staff_client: APIClient, facility: Any) -> None:
    me = staff_client.get(ME).json()
    assert me["feature_flags"] == ["security.pin_unlock"]
    assert me["security"]["pin_set"] is False and me["security"]["lock_after_seconds"] == 900
    FacilityFeatureFlag.objects.create(
        flag=FeatureFlag.objects.get(code="security.pin_unlock"),
        facility=facility,
        is_enabled=False,
    )
    assert staff_client.get(ME).json()["feature_flags"] == []
