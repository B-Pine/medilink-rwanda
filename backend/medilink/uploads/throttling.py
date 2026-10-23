"""Sprint 1 rate-limit classes with their own default rates (contract §3.7), overridable by
environment variables, so DEFAULT_THROTTLE_RATES needs no edit."""

from __future__ import annotations

from typing import Any

import environ
from rest_framework.throttling import SimpleRateThrottle

_env = environ.Env()


class EnvRateThrottle(SimpleRateThrottle):
    """A throttle whose rate is `env(<env_var>, default=<default_rate>)`.

    Subclasses set `scope`, `env_var`, `default_rate` and implement `get_ident_for()`;
    returning None skips the limit for that request.
    """

    env_var = ""
    default_rate = ""

    def get_rate(self) -> str | None:
        return (
            str(_env(self.env_var, default=self.default_rate))
            if self.env_var
            else self.default_rate
        )

    def get_ident_for(self, request: Any, view: Any) -> str | None:
        raise NotImplementedError

    def get_cache_key(self, request: Any, view: Any) -> str | None:
        ident = self.get_ident_for(request, view)
        if ident is None:
            return None
        return self.cache_format % {"scope": self.scope, "ident": ident}


class UploadRateThrottle(EnvRateThrottle):
    """60 uploads an hour per account, or per application for applicants."""

    scope = "upload"
    env_var = "THROTTLE_RATE_UPLOAD"
    default_rate = "60/hour"

    def get_ident_for(self, request: Any, view: Any) -> str | None:
        application_id = getattr(view, "upload_throttle_application_id", None)
        if application_id:
            return f"application:{application_id}"
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated:
            return f"user:{user.pk}"
        return self.get_ident(request)

    def allow_request(self, request: Any, view: Any) -> bool:
        if request.method != "POST":
            return True
        return super().allow_request(request, view)
