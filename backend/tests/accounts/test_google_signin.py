"""Sign in with Google for patients (upgrade 17, decisions 2026-11-05).

Tokens are signed here with a throwaway RSA key standing in for Google's, so the real signature,
issuer, audience and expiry checks run; only the key lookup is replaced.
"""

from __future__ import annotations

import time
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from rest_framework.test import APIClient

from medilink.accounts import google
from medilink.accounts.models import GoogleIdentity, User
from medilink.audit.models import AuditEntry
from medilink.patients.models import ConsentRecord, PatientLink
from tests.conftest import error_code
from tests.factories import make_patient_user, make_staff

pytestmark = pytest.mark.django_db

URL = "/api/v1/patient/auth/google/"
ME = "/api/v1/patient/auth/me/"
CLIENT_ID = "1234-web.apps.googleusercontent.com"
CONSENTS = {"accepted_terms_version": "2026-11", "accepted_privacy_version": "2026-11"}

_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class _Key:
    key = _KEY.public_key()


class _FakeJwks:
    def get_signing_key_from_jwt(self, token: str) -> _Key:
        return _Key()


@pytest.fixture(autouse=True)
def google_on(settings: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    settings.GOOGLE_OAUTH_WEB_CLIENT_ID = CLIENT_ID
    settings.GOOGLE_OAUTH_CLIENT_IDS = []
    monkeypatch.setattr(google, "_jwks_client", lambda: _FakeJwks())


def token(
    *,
    sub: str = "g-111",
    email: str = "keza@gmail.com",
    verified: bool = True,
    aud: str = CLIENT_ID,
    iss: str = "https://accounts.google.com",
    key: Any = _KEY,
    expires_in: int = 600,
    name: str = "Keza Uwase",
) -> str:
    now = int(time.time())
    claims = {
        "iss": iss,
        "aud": aud,
        "sub": sub,
        "email": email,
        "email_verified": verified,
        "name": name,
        "iat": now,
        "exp": now + expires_in,
    }
    return jwt.encode(claims, key, algorithm="RS256")


def test_config_says_whether_it_is_on(api: APIClient, settings: Any) -> None:
    assert api.get(URL).json() == {"enabled": True, "client_id": CLIENT_ID}
    settings.GOOGLE_OAUTH_WEB_CLIENT_ID = ""
    assert api.get(URL).json() == {"enabled": False, "client_id": ""}
    assert api.post(URL, {"id_token": token()}, format="json").status_code == 404


def test_new_person_is_asked_for_consent_then_gets_an_account(api: APIClient) -> None:
    first = api.post(URL, {"id_token": token()}, format="json")
    assert first.status_code == 409
    assert first.json()["error"]["code"] == "consent_required"
    assert first.json()["error"]["current"] == {
        "email": "keza@gmail.com",
        "full_name": "Keza Uwase",
    }
    assert not User.objects.filter(email="keza@gmail.com").exists()

    second = api.post(
        URL, {"id_token": token(), "preferred_language": "en", **CONSENTS}, format="json"
    )
    assert second.status_code == 200, second.content
    body = second.json()
    assert body["email"] == "keza@gmail.com" and body["full_name"] == "Keza Uwase"
    assert body["email_verified"] is True and body["preferred_language"] == "en"
    user = User.objects.get(email="keza@gmail.com")
    assert not user.has_usable_password()
    assert GoogleIdentity.objects.get(user=user).subject == "g-111"
    assert PatientLink.objects.filter(account=user, relationship="self").exists()
    assert ConsentRecord.objects.filter(user=user, kind="terms", version="2026-11").exists()
    assert api.get(ME).status_code == 200
    assert AuditEntry.objects.filter(action="auth.google.linked").count() == 1


def test_existing_patient_with_the_same_email_is_linked(api: APIClient) -> None:
    user = make_patient_user(email="keza@gmail.com", full_name="Uwase Keza")
    response = api.post(URL, {"id_token": token(email="Keza@Gmail.com")}, format="json")
    assert response.status_code == 200, response.content
    assert response.json()["id"] == str(user.pk)
    assert GoogleIdentity.objects.get(user=user).subject == "g-111"
    user.refresh_from_db()
    assert user.has_usable_password()  # their password keeps working too
    # next time the Google account ID alone opens it, even after the Gmail address changed
    api.post("/api/v1/patient/auth/logout/")
    again = api.post(URL, {"id_token": token(email="new@gmail.com")}, format="json")
    assert again.status_code == 200 and again.json()["id"] == str(user.pk)


def test_unconfirmed_sign_up_is_confirmed_by_google(api: APIClient) -> None:
    user = make_patient_user(email="keza@gmail.com", email_verification_pending=True)
    assert api.post(URL, {"id_token": token()}, format="json").status_code == 200
    user.refresh_from_db()
    assert user.email_verification_pending is False and user.email_verified_at is not None


def test_staff_accounts_are_refused(api: APIClient, facility: Any) -> None:
    make_staff(facility, email="keza@gmail.com")
    response = api.post(URL, {"id_token": token()}, format="json")
    assert response.status_code == 403 and error_code(response) == "staff_account"
    assert not GoogleIdentity.objects.exists()
    assert api.get(ME).status_code == 401


def test_unverified_google_email_never_links_or_creates(api: APIClient) -> None:
    make_patient_user(email="keza@gmail.com")
    response = api.post(URL, {"id_token": token(verified=False), **CONSENTS}, format="json")
    assert response.status_code == 400 and error_code(response) == "google_unverified_email"
    assert not GoogleIdentity.objects.exists()


def test_an_account_tied_to_another_google_account_is_not_repointed(api: APIClient) -> None:
    user = make_patient_user(email="keza@gmail.com")
    GoogleIdentity.objects.create(user=user, subject="g-original")
    response = api.post(URL, {"id_token": token(sub="g-intruder")}, format="json")
    assert response.status_code == 401
    assert GoogleIdentity.objects.get(user=user).subject == "g-original"


@pytest.mark.parametrize(
    "bad",
    [
        {"aud": "someone-else.apps.googleusercontent.com"},
        {"iss": "https://evil.example"},
        {"key": _OTHER_KEY},
        {"expires_in": -600},
    ],
    ids=["wrong-audience", "wrong-issuer", "forged-signature", "expired"],
)
def test_tokens_not_from_google_for_us_are_refused(api: APIClient, bad: dict[str, Any]) -> None:
    response = api.post(URL, {"id_token": token(**bad), **CONSENTS}, format="json")
    assert response.status_code == 401 and error_code(response) == "not_authenticated"
    assert not User.objects.filter(email="keza@gmail.com").exists()
    assert AuditEntry.objects.filter(action="auth.google.refused").exists()
