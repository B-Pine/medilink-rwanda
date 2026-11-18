"""Flag security.staff_mfa: a platform admin can turn staff two-step sign-in off (for testing).

On by default; off, staff sign in and step up with the password alone, and the login audit entry
says so. A missing flag counts as on.
"""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient

from medilink.audit.models import AuditEntry
from medilink.onboarding.flags import STAFF_MFA_FLAG, staff_mfa_off
from medilink.onboarding.models import FeatureFlag
from tests.factories import PASSWORD, make_staff

pytestmark = pytest.mark.django_db

LOGIN = "/api/v1/staff/auth/login/"
ME = "/api/v1/staff/auth/me/"
STEP_UP = "/api/v1/staff/auth/step-up/"


def _turn(on: bool) -> None:
    FeatureFlag.objects.filter(code=STAFF_MFA_FLAG).update(default_enabled=on)


def test_flag_is_seeded_on() -> None:
    flag = FeatureFlag.objects.get(code=STAFF_MFA_FLAG)
    assert flag.default_enabled is True
    assert staff_mfa_off() is False


def test_missing_flag_keeps_two_step(api: APIClient, facility: Any) -> None:
    FeatureFlag.objects.filter(code=STAFF_MFA_FLAG).delete()
    assert staff_mfa_off() is False
    user = make_staff(facility, enrolled=False)
    response = api.post(LOGIN, {"email": user.email, "password": PASSWORD})
    assert response.json()["status"] == "mfa_setup_required"


def test_on_requires_the_code(api: APIClient, facility: Any) -> None:
    user = make_staff(facility)
    response = api.post(LOGIN, {"email": user.email, "password": PASSWORD})
    assert response.json() == {"status": "mfa_required", "user": None}
    assert api.get(ME).status_code == 401


def test_off_signs_in_with_password_alone(api: APIClient, facility: Any) -> None:
    _turn(False)
    user = make_staff(facility, enrolled=False)
    response = api.post(LOGIN, {"email": user.email, "password": PASSWORD})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "authenticated"
    assert "security.staff_mfa" not in body["user"]["feature_flags"]
    assert api.get(ME).status_code == 200
    entry = AuditEntry.objects.filter(action="auth.login.success").latest("occurred_at")
    assert entry.metadata["mfa_method"] == "off_by_admin"


def test_off_still_checks_the_password(api: APIClient, facility: Any) -> None:
    _turn(False)
    user = make_staff(facility, enrolled=False)
    response = api.post(LOGIN, {"email": user.email, "password": "not the password"})
    assert response.status_code == 401
    assert api.get(ME).status_code == 401


def test_off_steps_up_with_password_alone(api: APIClient, facility: Any) -> None:
    _turn(False)
    user = make_staff(facility, enrolled=False)
    api.post(LOGIN, {"email": user.email, "password": PASSWORD})
    response = api.post(STEP_UP, {"method": "password_totp", "password": PASSWORD}, format="json")
    assert response.status_code == 200, response.content
    wrong = api.post(STEP_UP, {"method": "password_totp", "password": "nope"}, format="json")
    assert wrong.status_code == 400
