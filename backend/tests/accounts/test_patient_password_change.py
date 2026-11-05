"""A signed-in patient changes their password (security 03 §6, decision 2026-11-05)."""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient

from medilink.audit.models import AuditEntry
from tests.conftest import error_code, login_patient
from tests.factories import PASSWORD

pytestmark = pytest.mark.django_db

CHANGE = "/api/v1/patient/auth/password/"
ME = "/api/v1/patient/auth/me/"
NEW = "ikawa nziza"


def test_change_password_ends_other_sessions_and_keeps_this_one(
    patient_client: APIClient,
    patient_user: Any,
    mailoutbox: Any,
    django_capture_on_commit_callbacks: Any,
) -> None:
    other = APIClient()
    login_patient(other, patient_user)

    with django_capture_on_commit_callbacks(execute=True):
        response = patient_client.post(
            CHANGE, {"current_password": PASSWORD, "new_password": NEW}, format="json"
        )
    assert response.status_code == 200, response.content
    assert response.json()["email"] == patient_user.email

    assert patient_client.get(ME).status_code == 200  # this device stays signed in
    assert other.get(ME).status_code == 401  # every other session ended
    patient_user.refresh_from_db()
    assert patient_user.check_password(NEW)
    assert len(mailoutbox) == 1 and mailoutbox[0].to == [patient_user.email]
    assert AuditEntry.objects.filter(action="auth.password.changed").count() == 1


def test_wrong_current_password_is_refused_and_counted(
    patient_client: APIClient, patient_user: Any
) -> None:
    response = patient_client.post(
        CHANGE, {"current_password": "not my password", "new_password": NEW}, format="json"
    )
    assert response.status_code == 400
    assert "current_password" in response.json()["error"]["fields"]
    patient_user.refresh_from_db()
    assert patient_user.check_password(PASSWORD)
    assert AuditEntry.objects.filter(
        action="auth.login.failure", metadata__reason="password_change_wrong_current"
    ).exists()


def test_new_password_follows_the_patient_policy(patient_client: APIClient) -> None:
    response = patient_client.post(
        CHANGE, {"current_password": PASSWORD, "new_password": "short7!"}, format="json"
    )
    assert response.status_code == 400
    assert "new_password" in response.json()["error"]["fields"]


def test_signed_out_cannot_change_password(api: APIClient) -> None:
    response = api.post(CHANGE, {"current_password": PASSWORD, "new_password": NEW}, format="json")
    assert response.status_code in (401, 403)
    assert error_code(response) in ("not_authenticated", "permission_denied")
