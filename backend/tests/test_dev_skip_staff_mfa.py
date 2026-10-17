"""DEV_SKIP_STAFF_MFA: local-testing switch that skips the staff second factor.

It must only work with DEBUG on, and system checks must refuse it everywhere else.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.core.checks import run_checks
from django.test import override_settings
from rest_framework.test import APIClient

from medilink.audit.models import AuditEntry
from medilink.core.checks import check_deploy_mfa, check_session_audiences
from tests.factories import PASSWORD, make_staff

pytestmark = pytest.mark.django_db

LOGIN = "/api/v1/staff/auth/login/"
ME = "/api/v1/staff/auth/me/"


def _login(client: APIClient, user: Any) -> Any:
    return client.post(LOGIN, {"email": user.email, "password": PASSWORD})


@override_settings(DEBUG=True, DEV_SKIP_STAFF_MFA=True)
def test_dev_skip_logs_staff_in_without_second_factor(api: APIClient, facility: Any) -> None:
    user = make_staff(facility, enrolled=False)
    response = _login(api, user)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "authenticated"
    assert body["user"]["email"] == user.email
    assert body["user"]["active_facility_id"] == str(facility.pk)  # single membership
    assert api.get(ME).status_code == 200
    entry = AuditEntry.objects.filter(action="auth.login.success").latest("occurred_at")
    assert entry.metadata["mfa_method"] == "dev_skip"  # the bypass is visible in the audit log


@override_settings(DEBUG=False, DEV_SKIP_STAFF_MFA=True)
def test_dev_skip_is_ignored_without_debug(api: APIClient, facility: Any) -> None:
    user = make_staff(facility, enrolled=False)
    assert _login(api, user).json() == {"status": "mfa_setup_required", "user": None}
    assert api.get(ME).status_code == 401


@override_settings(DEBUG=True, DEV_SKIP_STAFF_MFA=False)
def test_mfa_still_required_by_default(api: APIClient, facility: Any) -> None:
    user = make_staff(facility, enrolled=False)
    assert _login(api, user).json()["status"] == "mfa_setup_required"


@override_settings(DEBUG=False, DEV_SKIP_STAFF_MFA=True)
def test_check_refuses_dev_skip_without_debug() -> None:
    assert "medilink.E003" in [m.id for m in check_session_audiences()]


@override_settings(DEBUG=True, DEV_SKIP_STAFF_MFA=True)
def test_deploy_check_refuses_dev_skip() -> None:
    assert [m.id for m in check_deploy_mfa()] == ["medilink.E004"]
    assert "medilink.E004" in [m.id for m in run_checks(include_deployment_checks=True)]


def test_dev_skip_is_off_in_test_and_base_settings(settings: Any) -> None:
    assert settings.DEV_SKIP_STAFF_MFA is False
