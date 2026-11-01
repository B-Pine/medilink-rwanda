"""S9 rate limits (contract sprint-09 §3.3): push subscriptions 20 an hour per account."""

from __future__ import annotations

from typing import Any

from medilink.uploads.throttling import EnvRateThrottle


class PushSubscribeThrottle(EnvRateThrottle):
    scope = "push_subscribe"
    env_var = "THROTTLE_RATE_PUSH_SUBSCRIBE"
    default_rate = "20/hour"

    def get_ident_for(self, request: Any, view: Any) -> str | None:
        user = getattr(request, "user", None)
        return str(user.pk) if user is not None and user.is_authenticated else None
