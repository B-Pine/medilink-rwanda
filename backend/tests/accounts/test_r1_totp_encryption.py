"""R1 / issue #12: TOTP secrets are encrypted at rest, migrated, and rotatable."""

from __future__ import annotations

import base64
import os
from io import StringIO
from typing import Any

import pytest
from django.apps import apps
from django.core.exceptions import ImproperlyConfigured
from django.core.management import call_command
from django.db import connection
from django.test import override_settings
from django_otp.oath import totp
from django_otp.plugins.otp_totp.models import TOTPDevice

from medilink.accounts import mfa, totp_crypto
from medilink.accounts.security_checks import check_mfa_secret_keys
from tests.factories import UserFactory

pytestmark = pytest.mark.django_db


def _column(device: TOTPDevice) -> str:
    with connection.cursor() as cursor:
        cursor.execute("SELECT key FROM otp_totp_totpdevice WHERE id = %s", [device.pk])
        return str(cursor.fetchone()[0])


def _key() -> str:
    return base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")


def test_enrolment_stores_ciphertext_and_codes_still_verify() -> None:
    user = UserFactory()
    device, secret = mfa.start_totp_enrolment(user)
    stored = _column(device)
    assert stored.startswith("enc1:") and len(stored) <= 80
    raw = base64.b32decode(secret + "=" * (-len(secret) % 8))
    assert raw.hex() not in stored
    reloaded = TOTPDevice.objects.get(pk=device.pk)
    assert reloaded.bin_key == raw
    assert mfa.confirm_totp_enrolment(user, f"{totp(raw):06d}")
    assert _column(device) == stored  # later saves (last_t, confirmed) keep the same ciphertext


def test_ciphertext_is_bound_to_its_user() -> None:
    owner, other = UserFactory(), UserFactory()
    device = TOTPDevice.objects.create(user=owner, name="x", confirmed=True)
    stolen = _column(device)
    with pytest.raises(totp_crypto.SecretDecryptionError):
        totp_crypto.decrypt_secret(stolen, other.pk)


def test_legacy_plaintext_is_migrated_and_rotation_reencrypts() -> None:
    user = UserFactory()
    device = TOTPDevice.objects.create(user=user, name="x", confirmed=True)
    secret = device.bin_key
    TOTPDevice.objects.filter(pk=device.pk).update(key=secret.hex())  # a pre-#12 row
    assert TOTPDevice.objects.get(pk=device.pk).bin_key == secret  # still readable

    migration = __import__(
        "medilink.accounts.migrations.0005_encrypt_totp_secrets", fromlist=["encrypt"]
    )
    migration.encrypt(apps, None)
    encrypted = _column(device)
    assert encrypted.startswith("enc1:") and totp_crypto.key_id_of(encrypted) == 1
    migration.decrypt(apps, None)
    assert _column(device) == secret.hex()  # reversible
    migration.encrypt(apps, None)

    from django.conf import settings

    rotated = f"{settings.MFA_SECRET_KEYS},2:{_key()}"
    with override_settings(MFA_SECRET_KEYS=rotated, MFA_SECRET_ACTIVE_KEY_ID="2"):
        assert TOTPDevice.objects.get(pk=device.pk).bin_key == secret  # old key still works
        out = StringIO()
        call_command("rotate_mfa_secrets", stdout=out)
        assert "1 of 1 re-encrypted" in out.getvalue()
        assert totp_crypto.key_id_of(_column(device)) == 2
        assert TOTPDevice.objects.get(pk=device.pk).bin_key == secret
        call_command("rotate_mfa_secrets", stdout=out)
        assert "0 of 1 re-encrypted" in out.getvalue()


@pytest.mark.parametrize(
    ("keys", "active", "expected"),
    [
        ("", "", ["medilink.E110"]),
        ("1:short", "", ["medilink.E111"]),
        (f"1:{_key()}", "3", ["medilink.E111"]),
        (f"1:{_key()}", "", []),
    ],
)
def test_deploy_check_requires_mfa_keys(keys: str, active: str, expected: list[str]) -> None:
    with override_settings(MFA_SECRET_KEYS=keys, MFA_SECRET_ACTIVE_KEY_ID=active):
        assert [m.id for m in check_mfa_secret_keys()] == expected


def test_no_keys_outside_debug_refuses_to_run() -> None:
    with override_settings(MFA_SECRET_KEYS="", DEBUG=False), pytest.raises(ImproperlyConfigured):
        totp_crypto.keyring()
    with override_settings(MFA_SECRET_KEYS="", DEBUG=True):
        assert totp_crypto.keyring()[0] == 1


def test_any_device_save_encrypts(staff_user: Any) -> None:
    device = TOTPDevice.objects.get(user=staff_user)
    assert _column(device).startswith("enc1:")
