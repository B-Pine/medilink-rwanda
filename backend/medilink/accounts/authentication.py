"""DRF authentication classes: one per audience, reading the principal resolved by
TenantContextMiddleware from the audience session cookie.

A staff session never authenticates a patient endpoint and vice versa: the cookie is chosen by
URL prefix, the session store only loads a key under its own audience, and these classes check
the audience once more.
"""

from __future__ import annotations

from typing import Any

from drf_spectacular.extensions import OpenApiAuthenticationExtension
from rest_framework.authentication import BaseAuthentication

from medilink.accounts.principal import Principal


class _AudienceSessionAuthentication(BaseAuthentication):
    audience = ""

    def authenticate(self, request: Any) -> tuple[Any, Principal] | None:
        principal = getattr(request._request, "principal", None)
        if (
            not isinstance(principal, Principal)
            or principal.audience != self.audience
            or not principal.is_authenticated
        ):
            return None
        return principal.user, principal

    def authenticate_header(self, request: Any) -> str:
        return f'Session realm="{self.audience}"'


class StaffSessionAuthentication(_AudienceSessionAuthentication):
    audience = "staff"


class PatientSessionAuthentication(_AudienceSessionAuthentication):
    audience = "patient"


def _cookie_name(audience: str) -> str:
    from django.conf import settings

    return str(settings.SESSION_AUDIENCES[audience]["COOKIE_NAME"])


class StaffSessionScheme(OpenApiAuthenticationExtension):
    target_class = "medilink.accounts.authentication.StaffSessionAuthentication"
    name = "staffSession"

    def get_security_definition(self, auto_schema: Any) -> dict[str, str]:
        return {
            "type": "apiKey",
            "in": "cookie",
            "name": _cookie_name("staff"),
            "description": "Staff session cookie (__Host-ml_staff in production). "
            "Unsafe methods also need the X-CSRFToken header.",
        }


class PatientSessionScheme(OpenApiAuthenticationExtension):
    target_class = "medilink.accounts.authentication.PatientSessionAuthentication"
    name = "patientSession"

    def get_security_definition(self, auto_schema: Any) -> dict[str, str]:
        return {
            "type": "apiKey",
            "in": "cookie",
            "name": _cookie_name("patient"),
            "description": "Patient session cookie (__Host-ml_patient in production). "
            "Unsafe methods also need the X-CSRFToken header.",
        }
