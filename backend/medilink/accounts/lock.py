"""Idle lock and PIN unlock for staff sessions (contract §2.5, security 03 §5).

- A staff session is locked (not ended) after STAFF_SESSION_LOCK_AFTER idle seconds, or at once
  by POST /staff/auth/lock/. While locked, only lock state, unlock and logout work.
- Unlock: same user, same session, by PIN or password. 5 failures in one lock end the session.
  10 failed PINs for a user within an hour (all sessions) disable PIN unlock for an hour
  (password still works) and email the user. Facility flag `security.pin_unlock` off: password.
- The session is not rotated on unlock (no privilege change).
"""

from __future__ import annotations

import re
import time
from itertools import pairwise
from typing import Any

from django.contrib.auth.hashers import check_password, make_password
from django.contrib.sessions.backends.base import SessionBase
from django.core.cache import cache
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from medilink.accounts.models import User
from medilink.accounts.sessions import LAST_SEEN_KEY, LOCK_TRIGGER_KEY, LOCKED_AT_KEY

UNLOCK_FAILURES_KEY = "_ml_unlock_failures"
MAX_UNLOCK_FAILURES = 5  # per lock, then the session ends
PIN_FAILURES_PER_HOUR = 10  # per user, all sessions, then PIN unlock is off for an hour
PIN_BLOCK_SECONDS = 3600
PIN_FLAG = "security.pin_unlock"

_PIN_RE = re.compile(r"^\d{4,6}$")
COMMON_PINS = frozenset(
    {
        "1212", "1122", "1313", "2000", "2001", "2020", "2580", "0852", "1004", "6969", "7777",
        "1010", "0007", "4444", "1984", "1987", "1990", "2468", "1357", "0101", "1100",
        "112233", "121212", "123123", "131313", "159753", "147258", "101010", "696969",
        "007007", "102030", "111222", "520520", "000123",
    }
)  # fmt: skip

PIN_FORMAT = _("Use 4 to 6 digits.")
PIN_TOO_SIMPLE = _("This PIN is too easy to guess. Avoid repeated digits and sequences.")


def pin_problem(pin: str) -> Any:
    """None if the PIN is acceptable, else the message."""
    if not _PIN_RE.fullmatch(pin or ""):
        return PIN_FORMAT
    if len(set(pin)) == 1 or pin in COMMON_PINS:
        return PIN_TOO_SIMPLE
    steps = {int(b) - int(a) for a, b in pairwise(pin)}
    if steps in ({1}, {-1}):
        return PIN_TOO_SIMPLE
    return None


def set_pin(user: User, pin: str) -> None:
    user.pin_hash = make_password(pin)  # Argon2id (PASSWORD_HASHERS[0])
    user.pin_set_at = timezone.now()
    user.save(update_fields=["pin_hash", "pin_set_at"])


def remove_pin(user: User) -> None:
    user.pin_hash = None
    user.pin_set_at = None
    user.save(update_fields=["pin_hash", "pin_set_at"])


def is_locked(session: SessionBase) -> bool:
    return bool(session.get(LOCKED_AT_KEY))


def lock(session: SessionBase, user: User, trigger: str, request: Any = None) -> None:
    """Lock the session now (idempotent) and close its sockets."""
    if is_locked(session):
        return
    session[LOCKED_AT_KEY] = int(time.time())
    session.pop(UNLOCK_FAILURES_KEY, None)
    record_lock(session, user, trigger, request=request)


def record_pending_idle_lock(session: SessionBase, user: User, request: Any = None) -> None:
    """Audit an idle lock detected by the middleware (sockets were already closed)."""
    if session.get(LOCK_TRIGGER_KEY) == "idle":
        from medilink.audit.services import record

        session.pop(LOCK_TRIGGER_KEY, None)
        session.pop("_ml_lock_sockets_closed", None)
        record(
            "auth.session.locked",
            request=request,
            actor=user,
            metadata={"trigger": "idle", "locked_at": int(session.get(LOCKED_AT_KEY) or 0)},
        )


def record_lock(session: SessionBase, user: User, trigger: str, request: Any = None) -> None:
    from medilink.audit.services import record
    from medilink.core.realtime import close_sockets

    session.pop(LOCK_TRIGGER_KEY, None)
    record(
        "auth.session.locked",
        request=request,
        actor=user,
        metadata={"trigger": trigger},
    )
    if session.session_key:
        close_sockets(session_key=session.session_key)


def unlock(session: SessionBase) -> None:
    session.pop("_ml_lock_sockets_closed", None)
    session.pop(LOCKED_AT_KEY, None)
    session.pop(LOCK_TRIGGER_KEY, None)
    session.pop(UNLOCK_FAILURES_KEY, None)
    session[LAST_SEEN_KEY] = int(time.time())


def attempts_remaining(session: SessionBase) -> int:
    return max(0, MAX_UNLOCK_FAILURES - int(session.get(UNLOCK_FAILURES_KEY, 0)))


def register_failure(session: SessionBase) -> int:
    """Count a failed unlock in this lock. Returns the attempts left."""
    session[UNLOCK_FAILURES_KEY] = int(session.get(UNLOCK_FAILURES_KEY, 0)) + 1
    return attempts_remaining(session)


def _pin_failures_key(user: User) -> str:
    return f"medilink:pin-failures:{user.pk}"


def _pin_block_key(user: User) -> str:
    return f"medilink:pin-blocked:{user.pk}"


def pin_unlock_blocked(user: User) -> bool:
    return bool(cache.get(_pin_block_key(user)))


def register_pin_failure(user: User) -> bool:
    """Count a wrong PIN for the user (all sessions, one hour). Returns True when this failure
    blocks PIN unlock (the caller emails the user)."""
    key = _pin_failures_key(user)
    if cache.add(key, 1, timeout=PIN_BLOCK_SECONDS):
        count = 1
    else:
        try:
            count = cache.incr(key)
        except ValueError:
            cache.set(key, 1, timeout=PIN_BLOCK_SECONDS)
            count = 1
    if count >= PIN_FAILURES_PER_HOUR and not pin_unlock_blocked(user):
        cache.set(_pin_block_key(user), 1, timeout=PIN_BLOCK_SECONDS)
        return True
    return False


def check_pin(user: User, pin: str) -> bool:
    return user.pin_hash is not None and check_password(pin, user.pin_hash)


def unlock_methods(user: User, facility_id: Any) -> list[str]:
    from medilink.onboarding.flags import is_enabled

    methods = []
    if user.pin_hash and not pin_unlock_blocked(user) and is_enabled(PIN_FLAG, facility_id):
        methods.append("pin")
    methods.append("password")
    return methods
