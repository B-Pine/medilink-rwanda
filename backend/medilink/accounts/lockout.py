"""Per-account login and MFA throttling (security 03 §6).

Keyed by a hash of the normalised email (login) or the user ID (MFA), *not* by whether the
account exists, so the behaviour for unknown emails is identical (no enumeration).
  login: from the 5th failure a growing delay (2^n s, max 60 s); from the 10th a 15-minute lock
  MFA:   5 failures -> 15-minute lock
State lives in the cache (Redis in dev/prod).
"""

from __future__ import annotations

import hashlib
import math
import time
from dataclasses import dataclass

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

    def register_failure(self, ident: str, now: float | None = None) -> int:
        now = now if now is not None else time.time()
        key = self._key(ident)
        state = cache.get(key) or {}
        failures = int(state.get("failures", 0)) + 1
        state = {
            "failures": failures,
            "last": now,
            "locked_until": float(state.get("locked_until", 0)),
        }
        if failures >= self.lock_after:
            state["locked_until"] = now + self.lock_seconds
        cache.set(key, state, timeout=max(self.window_seconds, self.lock_seconds))
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


def reset_email_allowed(email: str) -> bool:
    """At most RESET_EMAILS_PER_HOUR reset emails per address per hour (silent limit)."""
    digest = hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()
    key = f"lockout:reset:{digest}"
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
