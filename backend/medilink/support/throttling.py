"""S10 rate limit (contract sprint-10 §3.2): creates and requester messages, per account."""

from __future__ import annotations

from typing import Any

from medilink.uploads.throttling import EnvRateThrottle


class SupportWriteThrottle(EnvRateThrottle):
    scope = "support_write"
    env_var = "THROTTLE_RATE_SUPPORT_WRITE"
    default_rate = "20/hour"

    def get_ident_for(self, request: Any, view: Any) -> str | None:
        if request.method != "POST":
            return None
        user = getattr(request, "user", None)
        return str(user.pk) if user is not None and user.is_authenticated else None
