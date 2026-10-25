"""S2 rate limits (contract §3.5): invitations per facility."""

from __future__ import annotations

from typing import Any

from medilink.authz.permissions import get_principal
from medilink.uploads.throttling import EnvRateThrottle


class InvitationRateThrottle(EnvRateThrottle):
    scope = "invitation"
    env_var = "THROTTLE_RATE_INVITATION"
    default_rate = "30/hour"

    def get_ident_for(self, request: Any, view: Any) -> str | None:
        principal = get_principal(request)
        facility = getattr(principal, "active_facility_id", None)
        return f"facility:{facility}" if facility else None
