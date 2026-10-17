"""Password reset (contract §2, security 03 §6): single-use 30-minute token, all sessions revoked."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import parse_qs, urlsplit

import pytest
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient

from medilink.accounts.models import User, UserSession
from medilink.accounts.tasks import (
    build_reset_link,
    send_password_changed_email,
    send_password_reset_email,
)
from medilink.audit import actions
from medilink.audit.models import AuditEntry
from tests.conftest import login_patient, login_staff

pytestmark = pytest.mark.django_db

RESET = "/api/v1/auth/password-reset/"
CONFIRM = "/api/v1/auth/password-reset/confirm/"
NEW_PASSWORD = "a brand new passphrase for 2026"


def _link_params(body: str) -> dict[str, str]:
    url = re.search(r"https?://\S+", body).group(0)  # type: ignore[union-attr]
    query = parse_qs(urlsplit(url).query)
    return {"uid": query["uid"][0], "token": query["token"][0], "base": url.split("?")[0]}


def test_reset_flow_revokes_all_sessions(
    api: APIClient, staff_user: Any, mailoutbox: Any, django_capture_on_commit_callbacks: Any
) -> None:
    from medilink.patients.models import Patient, PatientLink

    PatientLink.objects.create(
        account=staff_user, patient=Patient.objects.create(full_name="x"), relationship="self"
    )
    staff_session = APIClient()
    login_staff(staff_session, staff_user)
    patient_session = APIClient()
    login_patient(patient_session, staff_user)
    assert UserSession.objects.filter(user=staff_user).count() == 2

    with django_capture_on_commit_callbacks(execute=True):
        assert api.post(RESET, {"email": staff_user.email}).status_code == 202
    params = _link_params(mailoutbox[0].body)
    assert params["base"] == "http://localhost:5173/reset-password"  # staff -> staff app

    with django_capture_on_commit_callbacks(execute=True):
        response = api.post(
            CONFIRM, {"uid": params["uid"], "token": params["token"], "new_password": NEW_PASSWORD}
        )
    assert response.status_code == 204
    assert UserSession.objects.filter(user=staff_user).count() == 0
    assert staff_session.get("/api/v1/staff/auth/me/").status_code == 401
    assert patient_session.get("/api/v1/patient/auth/me/").status_code == 401
    staff_user.refresh_from_db()
    assert staff_user.check_password(NEW_PASSWORD)
    assert mailoutbox[-1].subject == "Your MediLink password was changed"
    entry = AuditEntry.objects.get(action=actions.PASSWORD_RESET_COMPLETED)
    assert entry.metadata == {"sessions_revoked": 2}
    requested = AuditEntry.objects.get(action=actions.PASSWORD_RESET_REQUESTED)
    assert requested.metadata == {"matched": True}

    reused = api.post(
        CONFIRM,
        {
            "uid": params["uid"],
            "token": params["token"],
            "new_password": "yet another long passphrase",
        },
    )
    assert reused.status_code == 400
    assert "token" in reused.json()["error"]["fields"]


def test_patient_reset_link_points_to_patient_app(patient_user: Any) -> None:
    assert build_reset_link(patient_user).startswith("http://localhost:5174/reset-password?uid=")


def test_reset_rejects_weak_new_password(api: APIClient, patient_user: Any) -> None:
    uid = urlsafe_base64_encode(force_bytes(str(patient_user.pk)))
    token = default_token_generator.make_token(patient_user)
    response = api.post(CONFIRM, {"uid": uid, "token": token, "new_password": "too short"})
    assert response.status_code == 400
    assert "new_password" in response.json()["error"]["fields"]


@pytest.mark.parametrize(
    "uid",
    [
        "!!!",
        urlsafe_base64_encode(b"not-a-uuid"),
        urlsafe_base64_encode(b"01a14a5e-0000-7000-8000-000000000000"),
    ],
)
def test_reset_invalid_uid_is_generic_400(api: APIClient, uid: str) -> None:
    response = api.post(CONFIRM, {"uid": uid, "token": "abc-123", "new_password": NEW_PASSWORD})
    assert response.status_code == 400
    assert response.json()["error"]["fields"] == {
        "token": ["This link is invalid or has expired. Ask for a new link."]
    }


def test_unknown_email_is_audited_without_personal_data(api: APIClient) -> None:
    api.post(RESET, {"email": "ghost@example.test"})
    entry = AuditEntry.objects.get(action=actions.PASSWORD_RESET_REQUESTED)
    assert entry.actor_id is None and entry.metadata == {"matched": False}


def test_email_tasks_ignore_unknown_users(mailoutbox: Any) -> None:
    send_password_reset_email("01a14a5e-0000-7000-8000-000000000000")
    send_password_changed_email("01a14a5e-0000-7000-8000-000000000000")
    assert mailoutbox == []


def test_inactive_user_gets_no_reset_email(
    api: APIClient, patient_user: Any, mailoutbox: Any, django_capture_on_commit_callbacks: Any
) -> None:
    User.objects.filter(pk=patient_user.pk).update(is_active=False)
    with django_capture_on_commit_callbacks(execute=True):
        assert api.post(RESET, {"email": patient_user.email}).status_code == 202
    assert mailoutbox == []
