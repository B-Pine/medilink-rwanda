"""Password validators following NIST SP 800-63B-4 (security 03 §2).

Length and blocklists only. No composition rules (no "must contain a symbol"), no expiry.
"""

from __future__ import annotations

import hashlib
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils.translation import gettext as _
from django.utils.translation import ngettext


def requires_mfa(user: Any) -> bool:
    """Accounts with mandatory MFA (staff, platform admins) or a confirmed TOTP device may use a
    12-character minimum; password-only accounts need 15."""
    if user is None:
        return False
    audience = getattr(user, "_password_audience", None)
    if audience == "staff":
        return True
    if audience == "patient":
        return False
    if getattr(user, "is_platform_admin", False):
        return True
    if not getattr(user, "pk", None) or getattr(user._state, "adding", True):
        return False
    from django_otp.plugins.otp_totp.models import TOTPDevice

    from medilink.accounts.principal import is_staff_member
    from medilink.tenancy.context import rls_context

    if TOTPDevice.objects.filter(user=user, confirmed=True).exists():
        return True
    with rls_context(user_id=user.pk):
        return is_staff_member(user)


class ContextualMinimumLengthValidator:
    def __init__(self, staff_min_length: int = 12, patient_min_length: int = 15) -> None:
        self.staff_min_length = staff_min_length
        self.patient_min_length = patient_min_length

    def min_length_for(self, user: Any) -> int:
        return self.staff_min_length if requires_mfa(user) else self.patient_min_length

    def validate(self, password: str, user: Any = None) -> None:
        min_length = self.min_length_for(user)
        if len(password) < min_length:
            raise ValidationError(
                ngettext(
                    "Use at least %(min_length)d character. Words you can remember work well.",
                    "Use at least %(min_length)d characters. Words you can remember work well.",
                    min_length,
                )
                % {"min_length": min_length},
                code="password_too_short",
                params={"min_length": min_length},
            )

    def get_help_text(self) -> str:
        return _(
            "Use at least %(patient)d characters (%(staff)d for accounts with two-step "
            "verification). A few words you can remember work well."
        ) % {"patient": self.patient_min_length, "staff": self.staff_min_length}


class MaximumLengthValidator:
    """NIST: accept at least 64 characters. The cap only protects the hasher from huge inputs."""

    def __init__(self, max_length: int = 256) -> None:
        self.max_length = max_length

    def validate(self, password: str, user: Any = None) -> None:
        if len(password) > self.max_length:
            raise ValidationError(
                _("Use at most %(max_length)d characters.") % {"max_length": self.max_length},
                code="password_too_long",
            )

    def get_help_text(self) -> str:
        return _("Use at most %(max_length)d characters.") % {"max_length": self.max_length}


@lru_cache(maxsize=4)
def _load_breached_hashes(path: str) -> frozenset[str]:
    hashes: set[str] = set()
    with Path(path).open(encoding="ascii", errors="ignore") as handle:
        for line in handle:
            value = line.strip().split(":", 1)[0].upper()
            if len(value) == 40:
                hashes.add(value)
    return frozenset(hashes)


class BreachedPasswordValidator:
    """Offline breached-password check against PASSWORD_BREACHED_HASHES_FILE (SHA-1 per line,
    Have I Been Pwned "HASH:count" format accepted). Django's CommonPasswordValidator (20,000
    passwords from breach corpora) always runs as well."""

    def __init__(self, hashes_file: str | None = None) -> None:
        self.hashes_file = hashes_file

    def _path(self) -> str:
        return str(self.hashes_file or getattr(settings, "PASSWORD_BREACHED_HASHES_FILE", ""))

    def validate(self, password: str, user: Any = None) -> None:
        path = self._path()
        if not path:
            return
        digest = hashlib.sha1(password.encode("utf-8"), usedforsecurity=False).hexdigest().upper()
        if digest in _load_breached_hashes(path):
            raise ValidationError(
                _("This password has appeared in a data breach. Choose a different one."),
                code="password_breached",
            )

    def get_help_text(self) -> str:
        return _("Your password can't be one that has appeared in a data breach.")


class ContextWordsValidator:
    """Rejects passwords that are mostly the service name (NIST "context-specific words")."""

    words = ("medilink", "medilinkrwanda")
    min_remaining = 8

    def validate(self, password: str, user: Any = None) -> None:
        normalized = re.sub(r"[^a-z0-9]", "", password.lower())
        remaining = normalized
        for word in sorted(self.words, key=len, reverse=True):
            remaining = remaining.replace(word, "")
        if remaining != normalized and len(remaining) < self.min_remaining:
            raise ValidationError(
                _("Your password is too close to the name of this service."),
                code="password_context_word",
            )

    def get_help_text(self) -> str:
        return _("Your password can't be based on the name of this service.")
