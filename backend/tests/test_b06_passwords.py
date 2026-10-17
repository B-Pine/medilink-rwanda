"""B6: Argon2id; patients >= 15, staff >= 12; breached/common lists; no composition rules."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

import pytest
from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.test import override_settings

from medilink.accounts.models import User
from medilink.accounts.validators import (
    BreachedPasswordValidator,
    ContextualMinimumLengthValidator,
    ContextWordsValidator,
    MaximumLengthValidator,
    requires_mfa,
)
from tests.factories import UserFactory, make_patient_user, make_staff, make_totp_device

pytestmark = [pytest.mark.acceptance("B6"), pytest.mark.django_db]


def _patient_candidate() -> User:
    user = User(email="new@example.test", full_name="Uwimana Claudine")
    user._password_audience = "patient"  # type: ignore[attr-defined]
    return user


def _messages(password: str, user: Any) -> list[str]:
    try:
        validate_password(password, user)
    except ValidationError as exc:
        return list(exc.messages)
    return []


def test_b6_argon2id_is_the_primary_hasher() -> None:
    from config.settings import base

    assert base.PASSWORD_HASHERS[0] == "django.contrib.auth.hashers.Argon2PasswordHasher"


def test_b6_stored_hashes_are_argon2id() -> None:
    user = UserFactory()
    assert user.password.startswith("argon2$argon2id$")
    assert user.check_password("a long synthetic test passphrase")


def test_b6_patient_minimum_length_is_15() -> None:
    patient = _patient_candidate()
    assert _messages("fourteen chars", patient)  # 14
    assert not _messages("fifteen chars!!", patient)  # 15


def test_b6_staff_minimum_length_is_12(facility: Any) -> None:
    staff = make_staff(facility)
    assert requires_mfa(staff)
    assert _messages("elevenchars", staff)  # 11
    assert not _messages("twelve chars", staff)  # 12


def test_b6_minimum_length_depends_on_mfa() -> None:
    validator = ContextualMinimumLengthValidator()
    assert validator.min_length_for(None) == 15
    patient = make_patient_user()
    assert validator.min_length_for(patient) == 15
    make_totp_device(patient)  # patient who turned on two-step verification
    assert validator.min_length_for(patient) == 12
    assert validator.min_length_for(UserFactory(is_platform_admin=True)) == 12
    assert "15" in validator.get_help_text()


def test_b6_no_composition_rules() -> None:
    patient = _patient_candidate()
    assert not _messages("amashyamba meza ya nyungwe", patient)  # lowercase words only
    assert not _messages("ikawa nziza cyane mu gitondo", patient)
    assert not _messages("4815162342108999", patient)  # digits only (no NumericPasswordValidator)
    names = [v["NAME"] for v in settings.AUTH_PASSWORD_VALIDATORS]
    assert "django.contrib.auth.password_validation.NumericPasswordValidator" not in names


def test_b6_common_passwords_are_rejected() -> None:
    staff_candidate = User(email="s@example.test", full_name="Staff")
    staff_candidate._password_audience = "staff"  # type: ignore[attr-defined]
    assert any("too common" in m for m in _messages("password1234", staff_candidate))


def test_b6_user_attribute_similarity_is_rejected() -> None:
    patient = User(email="nyiramana.clementine@example.test", full_name="Nyiramana Clementine")
    patient._password_audience = "patient"  # type: ignore[attr-defined]
    assert _messages("nyiramana.clementine", patient)


def test_b6_service_name_is_rejected() -> None:
    validator = ContextWordsValidator()
    with pytest.raises(ValidationError):
        validator.validate("MediLink-Rwanda-2026")
    validator.validate("medilink keeps my clinic queue moving")  # mostly other words: fine
    assert validator.get_help_text()


def test_b6_breached_list_is_checked(tmp_path: Path) -> None:
    breached = "this one leaked in a breach"
    digest = hashlib.sha1(breached.encode(), usedforsecurity=False).hexdigest().upper()
    hashes = tmp_path / "breached.txt"
    hashes.write_text(f"{digest}:1234\nNOT-A-HASH\n", encoding="ascii")
    validator = BreachedPasswordValidator(hashes_file=str(hashes))
    with pytest.raises(ValidationError) as exc:
        validator.validate(breached)
    assert exc.value.code == "password_breached"
    validator.validate("a different long passphrase")
    with override_settings(PASSWORD_BREACHED_HASHES_FILE=str(hashes)):
        assert _messages(breached, _patient_candidate())
    BreachedPasswordValidator().validate(breached)  # no file configured: only the common list
    assert validator.get_help_text()


def test_b6_long_passwords_accepted_up_to_256() -> None:
    patient = _patient_candidate()
    assert not _messages("correct horse " * 18, patient)  # 252 chars
    validator = MaximumLengthValidator(max_length=256)
    with pytest.raises(ValidationError):
        validator.validate("x" * 257)
    assert validator.get_help_text()


def test_b6_registration_enforces_patient_policy(api: Any) -> None:
    body = {
        "full_name": "Uwimana Claudine",
        "email": "claudine@example.test",
        "password": "short but 14ch",
        "preferred_language": "rw",
        "accepted_terms_version": "2026-10",
        "accepted_privacy_version": "2026-10",
        "research_consent": False,
    }
    response = api.post("/api/v1/patient/auth/register/", body)
    assert response.status_code == 400
    assert "password" in response.json()["error"]["fields"]
