"""TOTP (django-otp) enrolment/verification and hashed single-use recovery codes."""

from __future__ import annotations

import base64
import secrets
from typing import Any

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.utils import timezone
from django_otp.plugins.otp_totp.models import TOTPDevice

from medilink.accounts.models import RecoveryCode

# Unambiguous lowercase alphabet (no 0/o, 1/l/i): 31 symbols, 8 per code ~ 39.6 bits.
RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


def confirmed_totp_device(user: Any) -> TOTPDevice | None:
    return TOTPDevice.objects.filter(user=user, confirmed=True).order_by("-id").first()


def has_confirmed_mfa(user: Any) -> bool:
    return TOTPDevice.objects.filter(user=user, confirmed=True).exists()


def start_totp_enrolment(user: Any) -> tuple[TOTPDevice, str]:
    """Replace any unconfirmed device with a fresh one. Returns (device, base32 secret)."""
    TOTPDevice.objects.filter(user=user, confirmed=False).delete()
    device = TOTPDevice.objects.create(user=user, name="Authenticator app", confirmed=False)
    secret = base64.b32encode(device.bin_key).decode("ascii").rstrip("=")
    return device, secret


def confirm_totp_enrolment(user: Any, code: str) -> bool:
    device = TOTPDevice.objects.filter(user=user, confirmed=False).order_by("-id").first()
    if device is None or not device.verify_token(code):
        return False
    device.confirmed = True
    device.save(update_fields=["confirmed"])
    TOTPDevice.objects.filter(user=user).exclude(pk=device.pk).delete()  # one device per user
    return True


def verify_totp(user: Any, code: str) -> bool:
    device = confirmed_totp_device(user)
    return bool(device is not None and device.verify_token(code))


def _normalize_recovery_code(code: str) -> str:
    return "".join(ch for ch in code.lower() if ch in RECOVERY_ALPHABET)


def generate_recovery_codes(user: Any, count: int | None = None) -> list[str]:
    """Create a new set of recovery codes (old ones are invalidated). Plaintext is returned once
    and never stored: only Argon2 hashes are kept."""
    count = count or settings.MFA_RECOVERY_CODE_COUNT
    codes = []
    for _ in range(count):
        raw = "".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(8))
        codes.append(f"{raw[:4]}-{raw[4:]}")
    RecoveryCode.objects.filter(user=user).delete()
    RecoveryCode.objects.bulk_create(
        [
            RecoveryCode(user=user, code_hash=make_password(_normalize_recovery_code(c)))
            for c in codes
        ]
    )
    return codes


def use_recovery_code(user: Any, code: str) -> bool:
    normalized = _normalize_recovery_code(code)
    if len(normalized) != 8:
        return False
    with transaction.atomic():
        candidates = RecoveryCode.objects.select_for_update().filter(
            user=user, used_at__isnull=True
        )
        for candidate in candidates:
            if check_password(normalized, candidate.code_hash):
                candidate.used_at = timezone.now()
                candidate.save(update_fields=["used_at"])
                return True
    return False
