"""B8: the session ID rotates on login, on MFA success and on facility switch."""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient

from medilink.accounts.models import UserSession
from tests.conftest import code_for_secret, login_patient, totp_code
from tests.factories import FacilityFactory, make_membership, make_staff

pytestmark = [pytest.mark.acceptance("B8"), pytest.mark.django_db]


def _key(client: APIClient, cookie: str = "ml_staff") -> str:
    return client.cookies[cookie].value


def test_b8_rotation_on_login_mfa_and_facility_switch(api: APIClient, facility: Any) -> None:
    second = FacilityFactory()
    user = make_staff(facility, roles=("facility_admin",))
    make_membership(user, second, roles=("doctor",))

    # A pre-existing (e.g. planted) staff session is replaced at login.
    api.post(
        "/api/v1/staff/auth/login/",
        {"email": user.email, "password": "a long synthetic test passphrase"},
    )
    login_key = _key(api)
    api.post(
        "/api/v1/staff/auth/login/",
        {"email": user.email, "password": "a long synthetic test passphrase"},
    )
    relogin_key = _key(api)
    assert relogin_key != login_key
    assert not UserSession.objects.filter(session_key=login_key).exists()

    api.post("/api/v1/staff/auth/mfa/verify/", {"code": totp_code(user)})
    mfa_key = _key(api)
    assert mfa_key != relogin_key
    assert not UserSession.objects.filter(session_key=relogin_key).exists()

    response = api.post("/api/v1/staff/auth/active-facility/", {"facility_id": str(second.pk)})
    assert response.status_code == 200
    assert response.json()["active_facility_id"] == str(second.pk)
    assert response.json()["permissions"] == sorted(response.json()["permissions"])
    assert "clinical.write" in response.json()["permissions"]
    switch_key = _key(api)
    assert switch_key != mfa_key
    assert not UserSession.objects.filter(session_key=mfa_key).exists()

    stale = APIClient()
    stale.cookies["ml_staff"] = mfa_key
    assert stale.get("/api/v1/staff/auth/me/").status_code == 401


def test_b8_rotation_on_mfa_enrolment(api: APIClient, facility: Any) -> None:
    user = make_staff(facility, enrolled=False)
    api.post(
        "/api/v1/staff/auth/login/",
        {"email": user.email, "password": "a long synthetic test passphrase"},
    )
    before = _key(api)
    secret = api.post("/api/v1/staff/auth/mfa/setup/").json()["secret"]
    api.post("/api/v1/staff/auth/mfa/confirm/", {"code": code_for_secret(secret)})
    assert _key(api) != before


def test_b8_rotation_on_patient_login(api: APIClient, patient_user: Any) -> None:
    api.cookies["ml_patient"] = "planted-session-id-from-an-attacker"
    login_patient(api, patient_user)
    assert _key(api, "ml_patient") != "planted-session-id-from-an-attacker"
