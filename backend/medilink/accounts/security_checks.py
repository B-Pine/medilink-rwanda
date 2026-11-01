"""Account system checks: the staff lock delay stays within 5 to 30 minutes (S1 contract §2.5);
TOTP secret encryption keys are configured in deployments (R1, issue #12)."""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core.checks import CheckMessage, Error, Tags, register

LOCK_AFTER_RANGE = (300, 1800)


@register(Tags.security)
def check_staff_lock_after(app_configs: Any = None, **kwargs: Any) -> list[CheckMessage]:
    staff = settings.SESSION_AUDIENCES["staff"]
    lock_after = int(staff.get("LOCK_AFTER", 0))
    low, high = LOCK_AFTER_RANGE
    if lock_after >= int(staff["IDLE_TIMEOUT"]):
        return [
            Error(
                "STAFF_SESSION_IDLE_TIMEOUT must be longer than STAFF_SESSION_LOCK_AFTER, "
                "or sessions end before they can be unlocked.",
                id="medilink.E102",
            )
        ]
    if not low <= lock_after <= high:
        return [
            Error(
                f"STAFF_SESSION_LOCK_AFTER must be between {low} and {high} seconds "
                f"(got {lock_after}).",
                id="medilink.E101",
            )
        ]
    return []


@register(Tags.security, deploy=True)
def check_mfa_secret_keys(app_configs: Any = None, **kwargs: Any) -> list[CheckMessage]:
    """TOTP secrets need their own encryption keys in deployments (issue #12)."""
    from django.core.exceptions import ImproperlyConfigured

    from medilink.accounts import totp_crypto

    if not totp_crypto.keys_configured():
        return [Error("MFA_SECRET_KEYS must be set (TOTP secret encryption).", id="medilink.E110")]
    try:
        totp_crypto.keyring()
    except ImproperlyConfigured as exc:
        return [Error(str(exc), id="medilink.E111")]
    return []
