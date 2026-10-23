"""S3 rate-limit classes (contract §3): defaults in code, overridable by environment variables."""

from __future__ import annotations

from typing import Any

from medilink.uploads.throttling import EnvRateThrottle


class _UserThrottle(EnvRateThrottle):
    def get_ident_for(self, request: Any, view: Any) -> str | None:
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated:
            return f"user:{user.pk}"
        return self.get_ident(request)

    def allow_request(self, request: Any, view: Any) -> bool:
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        return super().allow_request(request, view)


class SearchRateThrottle(_UserThrottle):
    scope = "patients_search"
    env_var = "THROTTLE_RATE_PATIENTS_SEARCH"
    default_rate = "60/min"


class VerificationRateThrottle(_UserThrottle):
    scope = "patients_verification"
    env_var = "THROTTLE_RATE_PATIENTS_VERIFICATION"
    default_rate = "10/hour"


class RevealRateThrottle(_UserThrottle):
    scope = "patients_reveal"
    env_var = "THROTTLE_RATE_PATIENTS_REVEAL"
    default_rate = "30/hour"
