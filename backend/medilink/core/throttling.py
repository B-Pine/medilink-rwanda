"""Throttles. IP limits are deliberately high (whole facilities share one IP) and only one signal;
per-account limits live in medilink.accounts.lockout (security 03 §6)."""

from __future__ import annotations

from typing import Any

from rest_framework.throttling import ScopedRateThrottle, SimpleRateThrottle


class BurstRateThrottle(SimpleRateThrottle):
    """Global ceiling per user (or per IP when anonymous)."""

    scope = "burst"

    def get_cache_key(self, request: Any, view: Any) -> str | None:
        user = getattr(request, "user", None)
        ident = (
            f"user:{user.pk}"
            if user is not None and user.is_authenticated
            else self.get_ident(request)
        )
        return self.cache_format % {"scope": self.scope, "ident": ident}


class IPScopedRateThrottle(ScopedRateThrottle):
    """Per-IP limit for the view's `throttle_scope`, even for (partly) authenticated sessions."""

    def get_cache_key(self, request: Any, view: Any) -> str | None:
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}
