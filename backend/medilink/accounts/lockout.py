"""Per-account login and MFA throttling (security 03 §6).

Keyed by a hash of the normalised email (login) or the user ID (MFA), *not* by whether the
account exists, so the behaviour for unknown emails is identical (no enumeration).
  login: from the 5th failure a growing delay (2^n s, max 60 s); from the 10th a 15-minute lock
  MFA:   5 failures -> 15-minute lock
The account owner is emailed when a lock starts (never the requester).
State lives in the cache (Redis in dev/prod).
"""

from __future__ import annotations

import hashlib
import math
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.core.cache import cache


@dataclass(frozen=True)
class LockoutPolicy:
    kind: str
    delay_after: int
    lock_after: int
    lock_seconds: int
    max_delay_seconds: int
    window_seconds: int

    def _key(self, ident: str) -> str:
        digest = hashlib.sha256(ident.strip().lower().encode("utf-8")).hexdigest()
        return f"lockout:{self.kind}:{digest}"

    def retry_after(self, ident: str, now: float | None = None) -> int:
        """Seconds the caller must wait before the next attempt (0 = allowed)."""
        now = now if now is not None else time.time()
        state = cache.get(self._key(ident)) or {}
        locked_until = float(state.get("locked_until", 0))
        if locked_until > now:
            return math.ceil(locked_until - now)
        failures = int(state.get("failures", 0))
        if failures >= self.delay_after and self.max_delay_seconds > 0:
            delay = min(2 ** (failures - self.delay_after), self.max_delay_seconds)
            elapsed = now - float(state.get("last", 0))
            if elapsed < delay:
                return math.ceil(delay - elapsed)
        return 0

    def register_failure(
        self,
        ident: str,
        now: float | None = None,
        on_lock: Callable[[], None] | None = None,
    ) -> int:
        """Count a failure. `on_lock` runs once when this failure starts a lock (to notify the
        account owner); it never runs for later failures while the lock holds."""
        now = now if now is not None else time.time()
        key = self._key(ident)
        state = cache.get(key) or {}
        failures = int(state.get("failures", 0)) + 1
        previous_lock = float(state.get("locked_until", 0))
        state = {"failures": failures, "last": now, "locked_until": previous_lock}
        newly_locked = failures >= self.lock_after and previous_lock <= now
        if failures >= self.lock_after:
            state["locked_until"] = now + self.lock_seconds
        cache.set(key, state, timeout=max(self.window_seconds, self.lock_seconds))
        if newly_locked and on_lock is not None:
            on_lock()
        return self.retry_after(ident, now)

    def reset(self, ident: str) -> None:
        cache.delete(self._key(ident))


def login_policy() -> LockoutPolicy:
    cfg = settings.AUTH_LOCKOUT
    return LockoutPolicy(
        kind="login",
        delay_after=int(cfg["DELAY_AFTER"]),
        lock_after=int(cfg["LOCK_AFTER"]),
        lock_seconds=int(cfg["LOCK_SECONDS"]),
        max_delay_seconds=int(cfg["MAX_DELAY_SECONDS"]),
        window_seconds=int(cfg["WINDOW_SECONDS"]),
    )


RESET_EMAILS_PER_HOUR = 3


def reset_email_allowed(email: str, kind: str = "reset") -> bool:
    """At most RESET_EMAILS_PER_HOUR emails of one kind per address per hour (silent limit).
    Kinds: "reset" (password reset), "signup" (sign-up verification / account exists)."""
    digest = hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()
    key = f"lockout:{kind}:{digest}"
    cache.add(key, 0, timeout=3600)
    try:
        count = cache.incr(key)
    except ValueError:  # expired between add and incr
        cache.set(key, 1, timeout=3600)
        count = 1
    return count <= RESET_EMAILS_PER_HOUR


def mfa_policy() -> LockoutPolicy:
    return LockoutPolicy(
        kind="mfa",
        delay_after=settings.MFA_MAX_FAILURES,
        lock_after=settings.MFA_MAX_FAILURES,
        lock_seconds=settings.MFA_LOCK_SECONDS,
        max_delay_seconds=0,
        window_seconds=settings.MFA_LOCK_SECONDS,
    )


def notify_on_lock(request: Any, user: Any, kind: str) -> Callable[[], None] | None:
    """`on_lock` callback for `register_failure`: audit the lock and email the account owner.
    None when there is no (active) account to tell, so unknown emails behave the same."""
    if user is None or not getattr(user, "is_active", False):
        return None

    def _notify() -> None:
        from django.db import transaction

        from medilink.accounts.tasks import send_account_locked_email
        from medilink.audit import actions
        from medilink.audit.services import record

        record(
            actions.ACCOUNT_LOCKED,
            request=request,
            actor=user,
            actor_role="",
            object_type="user",
            object_id=user.pk,
            metadata={"kind": kind},
        )
        user_id = str(user.pk)
        transaction.on_commit(lambda: send_account_locked_email.delay(user_id, kind))

    return _notify
