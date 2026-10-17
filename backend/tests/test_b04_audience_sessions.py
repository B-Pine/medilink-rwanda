"""B4: separate staff/patient session cookies; neither authenticates the other audience."""

from __future__ import annotations

import time
from typing import Any

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from medilink.accounts.models import UserSession
from medilink.accounts.sessions import AUTH_AT_KEY, LAST_SEEN_KEY, audience_for_path, get_audiences
from tests.conftest import error_code, login_patient, login_staff
from tests.factories import make_patient_user, make_staff

pytestmark = [pytest.mark.acceptance("B4"), pytest.mark.django_db]


def test_b4_staff_login_sets_only_the_staff_cookie(api: APIClient, staff_user: Any) -> None:
    response = login_staff(api, staff_user)
    assert "ml_staff" in response.cookies
    assert "ml_patient" not in api.cookies
    cookie = response.cookies["ml_staff"]
    assert cookie["httponly"] is True
    assert cookie["samesite"] == "Lax"
    assert cookie["path"] == "/"
    assert not cookie["domain"]


def test_b4_patient_login_sets_only_the_patient_cookie(api: APIClient, patient_user: Any) -> None:
    response = login_patient(api, patient_user)
    assert "ml_patient" in response.cookies
    assert "ml_staff" not in api.cookies
    assert response.cookies["ml_patient"]["httponly"] is True


def test_b4_staff_session_cannot_use_patient_endpoints(staff_client: APIClient) -> None:
    response = staff_client.get("/api/v1/patient/auth/me/")
    assert response.status_code == 401
    assert error_code(response) == "not_authenticated"
    assert staff_client.get("/api/v1/staff/auth/me/").status_code == 200


def test_b4_patient_session_cannot_use_staff_endpoints(patient_client: APIClient) -> None:
    response = patient_client.get("/api/v1/staff/auth/me/")
    assert response.status_code == 401
    assert error_code(response) == "not_authenticated"


def test_b4_staff_session_id_in_patient_cookie_is_rejected(staff_client: APIClient) -> None:
    staff_key = staff_client.cookies["ml_staff"].value
    attacker = APIClient()
    attacker.cookies["ml_patient"] = staff_key  # swap the cookie into the other audience
    assert attacker.get("/api/v1/patient/auth/me/").status_code == 401
    attacker2 = APIClient()
    attacker2.cookies["ml_staff"] = staff_key
    assert attacker2.get("/api/v1/staff/auth/me/").status_code == 200


def test_b4_person_can_hold_both_sessions_and_logout_is_per_audience(
    api: APIClient, facility: Any
) -> None:
    user = make_staff(facility, email="doctor.patient@example.test")
    from medilink.patients.models import Patient, PatientLink

    PatientLink.objects.create(
        account=user, patient=Patient.objects.create(full_name=user.full_name), relationship="self"
    )
    login_staff(api, user)
    login_patient(api, user)
    assert api.cookies["ml_staff"].value != api.cookies["ml_patient"].value
    assert api.post("/api/v1/patient/auth/logout/").status_code == 204
    assert api.get("/api/v1/patient/auth/me/").status_code == 401
    assert api.get("/api/v1/staff/auth/me/").status_code == 200
    assert api.post("/api/v1/staff/auth/logout/").status_code == 204
    assert api.get("/api/v1/staff/auth/me/").status_code == 401


def test_b4_sessions_are_tagged_with_their_audience(api: APIClient, staff_user: Any) -> None:
    login_staff(api, staff_user)
    session = UserSession.objects.get(session_key=api.cookies["ml_staff"].value)
    assert session.audience == "staff"
    assert session.user_id == staff_user.pk
    assert session.created_at is not None


def test_b4_audiences_are_selected_by_path() -> None:
    assert audience_for_path("/api/v1/staff/auth/me/").name == "staff"
    assert audience_for_path("/api/v1/platform/facilities/").name == "staff"
    assert audience_for_path("/api/v1/patient/auth/me/").name == "patient"
    assert audience_for_path("/ws/v1/staff/ping/").name == "staff"
    assert audience_for_path("/api/v1/health/") is None
    assert audience_for_path("/api/v1/auth/password-reset/") is None


def test_b4_production_cookie_names_use_host_prefix() -> None:
    from config.settings.base import session_audiences

    audiences = session_audiences(cookie_prefix="__Host-")
    assert audiences["staff"]["COOKIE_NAME"] == "__Host-ml_staff"
    assert audiences["patient"]["COOKIE_NAME"] == "__Host-ml_patient"
    assert len({a.cookie_name for a in get_audiences()}) == len(get_audiences())


def test_b4_audience_timeouts_follow_security_03() -> None:
    staff = audience_for_path("/api/v1/staff/")
    patient = audience_for_path("/api/v1/patient/")
    assert (staff.idle_timeout, staff.absolute_timeout) == (15 * 60, 12 * 3600)
    assert (patient.idle_timeout, patient.absolute_timeout) == (12 * 3600, 30 * 86400)


def _age_session(key: str, *, auth_ago: int, seen_ago: int) -> None:
    from medilink.accounts.session_store import SessionStore

    store = SessionStore(key, audience="staff")
    now = int(time.time())
    store[AUTH_AT_KEY] = now - auth_ago
    store[LAST_SEEN_KEY] = now - seen_ago
    store.save()


def test_b4_staff_idle_timeout_ends_the_session(staff_client: APIClient) -> None:
    key = staff_client.cookies["ml_staff"].value
    _age_session(key, auth_ago=20 * 60, seen_ago=16 * 60)
    response = staff_client.get("/api/v1/staff/auth/me/")
    assert response.status_code == 401
    assert not UserSession.objects.filter(session_key=key).exists()


def test_b4_staff_absolute_timeout_ends_the_session(staff_client: APIClient) -> None:
    key = staff_client.cookies["ml_staff"].value
    _age_session(key, auth_ago=13 * 3600, seen_ago=10)
    assert staff_client.get("/api/v1/staff/auth/me/").status_code == 401


def test_b4_activity_refreshes_last_seen(staff_client: APIClient) -> None:
    from medilink.accounts.session_store import SessionStore

    key = staff_client.cookies["ml_staff"].value
    _age_session(key, auth_ago=10 * 60, seen_ago=5 * 60)
    assert staff_client.get("/api/v1/staff/auth/me/").status_code == 200
    assert int(time.time()) - SessionStore(key, audience="staff")[LAST_SEEN_KEY] < 5


@override_settings(MFA_PENDING_TIMEOUT=0)
def test_b4_pending_mfa_state_expires(api: APIClient, staff_user: Any) -> None:
    api.post(
        "/api/v1/staff/auth/login/",
        {"email": staff_user.email, "password": "a long synthetic test passphrase"},
    )
    time.sleep(1.1)
    response = api.get("/api/v1/staff/auth/me/")
    assert error_code(response) == "not_authenticated"


def test_b4_patient_without_profile_cannot_use_patient_login(
    api: APIClient, staff_user: Any
) -> None:
    response = api.post(
        "/api/v1/patient/auth/login/",
        {"email": staff_user.email, "password": "a long synthetic test passphrase"},
    )
    assert response.status_code == 401
    patient = make_patient_user(email="p2@example.test")
    response = api.post(
        "/api/v1/staff/auth/login/",
        {"email": patient.email, "password": "a long synthetic test passphrase"},
    )
    assert response.status_code == 401
    assert error_code(response) == "not_authenticated"
