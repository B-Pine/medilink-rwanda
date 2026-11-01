"""Email verification for patient self sign-up (security 03 §6, issue #14).

Sign-up answers the same way whether or not the email already has an account. A new account is
created with `email_verification_pending=True` and can't sign in until the emailed link is opened;
an existing account gets an "account exists" email instead. The link carries a signed,
time-limited token that only works while the account is still pending (single use).
"""

from __future__ import annotations

from uuid import UUID

from django.conf import settings
from django.core import signing
from django.utils import timezone

from medilink.accounts.models import User

TOKEN_SALT = "medilink.accounts.verify_email"  # noqa: S105 (signing salt, not a secret)
VERIFY_PATH = "/verify-email"


def make_token(user: User) -> str:
    return signing.dumps({"u": str(user.pk)}, salt=TOKEN_SALT, compress=True)


def user_for_token(token: str) -> User | None:
    """The pending account the token was issued for, or None (tampered, expired or used)."""
    try:
        payload = signing.loads(
            token, salt=TOKEN_SALT, max_age=int(settings.EMAIL_VERIFICATION_TIMEOUT)
        )
    except (signing.BadSignature, ValueError, TypeError):
        return None
    if not isinstance(payload, dict):
        return None
    try:
        user_id = UUID(str(payload.get("u")))
    except ValueError:
        return None
    return User.objects.filter(pk=user_id, is_active=True, email_verification_pending=True).first()


def build_link(user: User) -> str:
    from urllib.parse import urlencode

    base = str(settings.PATIENT_APP_URL).rstrip("/")
    return f"{base}{VERIFY_PATH}?{urlencode({'token': make_token(user)})}"


def mark_verified(user: User) -> None:
    user.email_verification_pending = False
    user.email_verified_at = user.email_verified_at or timezone.now()
    user.save(update_fields=["email_verification_pending", "email_verified_at", "updated_at"])
