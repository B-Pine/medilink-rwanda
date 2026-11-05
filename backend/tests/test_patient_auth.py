"""Patient register / login / logout / me (contract §2, FR-PAT-02, FR-SEC-04/05)."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import unquote

import pytest
from rest_framework.test import APIClient

from medilink.accounts.models import User
from medilink.patients.models import ConsentRecord, PatientLink
from tests.conftest import error_code

pytestmark = pytest.mark.django_db

REGISTER = "/api/v1/patient/auth/register/"
VERIFY = "/api/v1/patient/auth/verify-email/"
LOGIN = "/api/v1/patient/auth/login/"


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


def _verify_link_token(message: Any) -> str:
    match = re.search(r"/verify-email\?token=(\S+)", message.body)
    assert match, message.body
    return unquote(match.group(1))


def test_register_creates_account_profile_link_and_consents(
    api: APIClient, mailoutbox: Any, django_capture_on_commit_callbacks: Any
) -> None:
    with django_capture_on_commit_callbacks(execute=True):
        response = api.post(REGISTER, _body())
    assert response.status_code == 202, response.content
    assert response.json() == {
        "detail": "Check your email to finish creating your account.",
        "email_verification": True,
    }
    assert "ml_patient" not in response.cookies  # not signed in until the email is confirmed

    user = User.objects.get(email="claudine@example.test")
    assert user.full_name == "Uwimana Claudine" and user.preferred_language == "fr"
    assert user.email_verification_pending is True and user.email_verified_at is None
    link = PatientLink.objects.get(account=user)
    assert link.relationship == "self"
    consents = {c.kind: c for c in ConsentRecord.objects.filter(user=user)}
    assert set(consents) == {"terms", "privacy", "research"}
    assert consents["terms"].granted and consents["terms"].version == "2026-10"
    assert consents["privacy"].granted and consents["privacy"].version == "2026-10.1"
    assert consents["research"].granted is False
    assert all(c.channel == "web" for c in consents.values())

    # the password works only after the emailed link is opened
    login = {"email": "claudine@example.test", "password": "amashyamba meza ya nyungwe"}
    assert api.post(LOGIN, login).status_code == 401
    assert len(mailoutbox) == 1 and mailoutbox[0].to == ["claudine@example.test"]
    token = _verify_link_token(mailoutbox[0])
    verified = api.post(VERIFY, {"token": token})
    assert verified.status_code == 200, verified.content
    data = verified.json()
    assert data["email"] == "claudine@example.test" and data["email_verified"] is True
    assert data["profiles"][0]["patient_id"] == str(link.patient_id)
    assert api.get("/api/v1/patient/auth/me/").json()["id"] == str(user.pk)
    # single use
    assert api.post(VERIFY, {"token": token}).status_code == 400
    api.post("/api/v1/patient/auth/logout/")
    assert api.post(LOGIN, login).status_code == 200


def test_register_research_consent_true_is_recorded(api: APIClient) -> None:
    api.post(REGISTER, _body(research_consent=True))
    assert ConsentRecord.objects.get(kind="research").granted is True


def test_register_existing_email_looks_the_same_and_emails_the_owner(
    api: APIClient, patient_user: Any, mailoutbox: Any, django_capture_on_commit_callbacks: Any
) -> None:
    new = api.post(REGISTER, _body(email="someone-new@example.test"))
    with django_capture_on_commit_callbacks(execute=True):
        taken = api.post(REGISTER, _body(email=patient_user.email.upper()))
    assert taken.status_code == new.status_code == 202
    assert taken.json() == new.json()
    assert User.objects.filter(email=patient_user.email).count() == 1
    patient_user.refresh_from_db()
    assert patient_user.full_name != "Uwimana Claudine"  # nothing about the account changed
    assert patient_user.email_verification_pending is False
    assert len(mailoutbox) == 1 and mailoutbox[0].to == [patient_user.email]
    assert "already have an account" in mailoutbox[0].body
    assert "/verify-email" not in mailoutbox[0].body


def test_register_again_before_confirming_resends_the_link(
    api: APIClient, mailoutbox: Any, django_capture_on_commit_callbacks: Any
) -> None:
    with django_capture_on_commit_callbacks(execute=True):
        api.post(REGISTER, _body())
        again = api.post(REGISTER, _body(full_name="Somebody Else"))
    assert again.status_code == 202
    assert len(mailoutbox) == 2
    assert all("/verify-email?token=" in m.body for m in mailoutbox)
    assert User.objects.get(email="claudine@example.test").full_name == "Uwimana Claudine"


def test_register_without_email_verification_signs_in_straight_away(
    api: APIClient, mailoutbox: Any, django_capture_on_commit_callbacks: Any
) -> None:
    from django.test import override_settings

    login = {"email": "claudine@example.test", "password": "amashyamba meza ya nyungwe"}
    with override_settings(PATIENT_SIGNUP_EMAIL_VERIFICATION=False):
        with django_capture_on_commit_callbacks(execute=True):
            response = api.post(REGISTER, _body())
            again = api.post(REGISTER, _body())  # existing email: no "account exists" email
        assert response.status_code == again.status_code == 202
        assert response.json() == {
            "detail": "Your account is ready. Sign in with your email and password.",
            "email_verification": False,
        }
        assert mailoutbox == []
        user = User.objects.get(email="claudine@example.test")
        assert user.email_verification_pending is False and user.email_verified_at is None
        assert api.post(LOGIN, login).status_code == 200


def test_turning_email_verification_off_lets_pending_sign_ups_sign_in(api: APIClient) -> None:
    from django.test import override_settings

    api.post(REGISTER, _body())
    login = {"email": "claudine@example.test", "password": "amashyamba meza ya nyungwe"}
    assert api.post(LOGIN, login).status_code == 401
    with override_settings(PATIENT_SIGNUP_EMAIL_VERIFICATION=False):
        assert api.post(LOGIN, login).status_code == 200


def test_verify_email_rejects_bad_and_expired_tokens(
    api: APIClient, mailoutbox: Any, django_capture_on_commit_callbacks: Any
) -> None:
    from django.test import override_settings

    assert api.post(VERIFY, {"token": "not-a-token"}).status_code == 400
    with django_capture_on_commit_callbacks(execute=True):
        api.post(REGISTER, _body())
    token = _verify_link_token(mailoutbox[0])
    with override_settings(EMAIL_VERIFICATION_TIMEOUT=-1):
        expired = api.post(VERIFY, {"token": token})
    assert expired.status_code == 400 and "token" in expired.json()["error"]["fields"]
    assert User.objects.get(email="claudine@example.test").email_verification_pending is True


def test_password_reset_also_confirms_a_pending_sign_up(api: APIClient) -> None:
    from django.contrib.auth.tokens import default_token_generator
    from django.utils.encoding import force_bytes
    from django.utils.http import urlsafe_base64_encode

    api.post(REGISTER, _body())
    user = User.objects.get(email="claudine@example.test")
    response = api.post(
        "/api/v1/auth/password-reset/confirm/",
        {
            "uid": urlsafe_base64_encode(force_bytes(str(user.pk))),
            "token": default_token_generator.make_token(user),
            "new_password": "another long synthetic passphrase",
        },
    )
    assert response.status_code == 204, response.content
    user.refresh_from_db()
    assert user.email_verification_pending is False and user.email_verified_at is not None


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


def test_register_race_on_email_is_still_202(api: APIClient) -> None:
    from unittest import mock

    from django.db import IntegrityError

    with mock.patch("medilink.accounts.views.register_patient", side_effect=IntegrityError("dup")):
        response = api.post(REGISTER, _body())
    assert response.status_code == 202


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
