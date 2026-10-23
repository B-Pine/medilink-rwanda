"""Applicant rate limits (contract §3.7): `application` 10/h per IP and 3/day per applicant email;
`resume` 10/h per IP and 3/h per email. Only POSTs count."""

from __future__ import annotations

from typing import Any

from medilink.accounts.models import normalize_email
from medilink.uploads.throttling import EnvRateThrottle


class _PostOnly(EnvRateThrottle):
    def allow_request(self, request: Any, view: Any) -> bool:
        if request.method != "POST":
            return True
        return super().allow_request(request, view)


def _email(request: Any, nested: bool) -> str | None:
    data: dict[str, Any] = request.data if isinstance(request.data, dict) else {}
    if nested:
        nested_data = data.get("applicant")
        data = nested_data if isinstance(nested_data, dict) else {}
    email = normalize_email(str(data.get("email") or ""))
    return email or None


class ApplicationIPThrottle(_PostOnly):
    scope = "application_ip"
    env_var = "THROTTLE_RATE_APPLICATION_IP"
    default_rate = "10/hour"

    def get_ident_for(self, request: Any, view: Any) -> str | None:
        return self.get_ident(request)


class ApplicationEmailThrottle(_PostOnly):
    scope = "application_email"
    env_var = "THROTTLE_RATE_APPLICATION_EMAIL"
    default_rate = "3/day"

    def get_ident_for(self, request: Any, view: Any) -> str | None:
        email = _email(request, nested=True)
        return f"email:{email}" if email else None


class ResumeIPThrottle(_PostOnly):
    scope = "resume_ip"
    env_var = "THROTTLE_RATE_RESUME_IP"
    default_rate = "10/hour"

    def get_ident_for(self, request: Any, view: Any) -> str | None:
        return self.get_ident(request)


class ResumeEmailThrottle(_PostOnly):
    scope = "resume_email"
    env_var = "THROTTLE_RATE_RESUME_EMAIL"
    default_rate = "3/hour"

    def get_ident_for(self, request: Any, view: Any) -> str | None:
        email = _email(request, nested=False)
        return f"email:{email}" if email else None
