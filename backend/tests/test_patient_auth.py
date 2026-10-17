"""Patient register / login / logout / me (contract §2, FR-PAT-02, FR-SEC-04/05)."""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient

from medilink.accounts.models import User
from medilink.patients.models import ConsentRecord, PatientLink
from tests.conftest import error_code

pytestmark = pytest.mark.django_db

REGISTER = "/api/v1/patient/auth/register/"


def _body(**overrides: Any) -> dict[str, Any]:
    body = {
        "full_name": "  Uwimana   Claudine ",
        "email": "Claudine@Example.TEST",
        "password": "amashyamba meza ya nyungwe",
        "preferred_language": "fr",
        "accepted_terms_version": "2026-10",
        "accepted_privacy_version": "2026-10.1",
        "research_consent": False,
    }
    body.update(overrides)
    return body


def test_register_creates_account_profile_link_and_consents(api: APIClient) -> None:
    response = api.post(REGISTER, _body())
    assert response.status_code == 201, response.content
    data = response.json()
    assert data["email"] == "claudine@example.test"
    assert data["full_name"] == "Uwimana Claudine"
    assert data["preferred_language"] == "fr"
    assert data["email_verified"] is False
    assert len(data["profiles"]) == 1
    profile = data["profiles"][0]
    assert profile["relationship"] == "self" and profile["display_name"] == "Uwimana Claudine"

    user = User.objects.get(email="claudine@example.test")
    assert PatientLink.objects.get(account=user).patient_id.hex == profile["patient_id"].replace(
        "-", ""
    )
    consents = {c.kind: c for c in ConsentRecord.objects.filter(user=user)}
    assert set(consents) == {"terms", "privacy", "research"}
    assert consents["terms"].granted and consents["terms"].version == "2026-10"
    assert consents["privacy"].granted and consents["privacy"].version == "2026-10.1"
    assert consents["research"].granted is False
    assert all(c.channel == "web" for c in consents.values())
    # logged in straight away
    assert "ml_patient" in response.cookies
    assert api.get("/api/v1/patient/auth/me/").json()["id"] == data["id"]


def test_register_research_consent_true_is_recorded(api: APIClient) -> None:
    api.post(REGISTER, _body(research_consent=True))
    assert ConsentRecord.objects.get(kind="research").granted is True


def test_register_duplicate_email_is_400(api: APIClient, patient_user: Any) -> None:
    response = api.post(REGISTER, _body(email=patient_user.email.upper()))
    assert response.status_code == 400
    assert "email" in response.json()["error"]["fields"]


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("full_name", "   "),
        ("accepted_terms_version", ""),
        ("accepted_privacy_version", "v 1 with spaces"),
        ("preferred_language", "sw"),
        ("research_consent", None),
    ],
)
def test_register_validation(api: APIClient, field: str, value: Any) -> None:
    response = api.post(REGISTER, _body(**{field: value}))
    assert response.status_code == 400
    assert field in response.json()["error"]["fields"]


def test_register_race_on_email_is_400(api: APIClient) -> None:
    from unittest import mock

    from django.db import IntegrityError

    with mock.patch("medilink.accounts.views.register_patient", side_effect=IntegrityError("dup")):
        response = api.post(REGISTER, _body())
    assert response.status_code == 400
    assert "email" in response.json()["error"]["fields"]


def test_patient_login_me_logout(api: APIClient, patient_user: Any) -> None:
    response = api.post(
        "/api/v1/patient/auth/login/",
        {"email": "PATIENT@example.test", "password": "a long synthetic test passphrase"},
    )
    assert response.status_code == 200
    assert response.json()["email"] == "patient@example.test"
    assert api.get("/api/v1/patient/auth/me/").status_code == 200
    assert api.post("/api/v1/patient/auth/logout/").status_code == 204
    me = api.get("/api/v1/patient/auth/me/")
    assert me.status_code == 401 and error_code(me) == "not_authenticated"
    assert api.post("/api/v1/patient/auth/logout/").status_code == 204  # idempotent


def test_inactive_patient_cannot_login(api: APIClient, patient_user: Any) -> None:
    patient_user.is_active = False
    patient_user.save()
    response = api.post(
        "/api/v1/patient/auth/login/",
        {"email": patient_user.email, "password": "a long synthetic test passphrase"},
    )
    assert response.status_code == 401


def test_revoked_profile_is_hidden(patient_client: APIClient, patient_user: Any) -> None:
    from django.utils import timezone

    PatientLink.objects.filter(account=patient_user).update(revoked_at=timezone.now())
    assert patient_client.get("/api/v1/patient/auth/me/").json()["profiles"] == []
