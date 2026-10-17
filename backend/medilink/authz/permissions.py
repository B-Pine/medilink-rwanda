"""DRF permission classes. The global default is DenyAll; every view declares its own policy.

`tests/test_b03_default_deny.py` fails if a URL-routed DRF view relies on the default.
"""

from __future__ import annotations

from typing import Any

from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions
from rest_framework.permissions import AllowAny, BasePermission

from medilink.accounts.principal import Principal, PrincipalState
from medilink.core.exceptions import MfaRequired


def get_principal(request: Any) -> Principal | None:
    django_request = getattr(request, "_request", request)
    principal = getattr(django_request, "principal", None)
    return principal if isinstance(principal, Principal) else None


class DenyAll(BasePermission):
    """Global default (REST_FRAMEWORK.DEFAULT_PERMISSION_CLASSES): nothing is allowed."""

    message = _("You don't have permission to do this.")

    def has_permission(self, request: Any, view: Any) -> bool:
        return False


class PublicEndpoint(AllowAny):
    """Explicit opt-in for public endpoints (health, CSRF, login, register, password reset)."""


class _AudiencePermission(BasePermission):
    audience = ""

    def has_permission(self, request: Any, view: Any) -> bool:
        principal = get_principal(request)
        if principal is None or principal.audience != self.audience:
            return False
        if principal.is_authenticated and request.user == principal.user:
            return True
        if principal.is_pending:
            raise MfaRequired()
        return False


class IsStaffAuthenticated(_AudiencePermission):
    """Staff session with password + second factor verified (and still a staff member)."""

    audience = "staff"


class IsPatientAuthenticated(_AudiencePermission):
    audience = "patient"


class IsPlatformAdmin(IsStaffAuthenticated):
    def has_permission(self, request: Any, view: Any) -> bool:
        if not super().has_permission(request, view):
            return False
        principal = get_principal(request)
        return bool(principal and principal.user and principal.user.is_platform_admin)


class _PendingMfa(BasePermission):
    """Password verified, second factor pending, in the given stage. Raises 401 otherwise."""

    stage: PrincipalState

    def has_permission(self, request: Any, view: Any) -> bool:
        principal = get_principal(request)
        if (
            principal is not None
            and principal.audience == "staff"
            and principal.state == self.stage
        ):
            return True
        raise exceptions.NotAuthenticated()


class IsStaffMfaSetupPending(_PendingMfa):
    stage = PrincipalState.MFA_SETUP_REQUIRED


class IsStaffMfaVerifyPending(_PendingMfa):
    stage = PrincipalState.MFA_REQUIRED


def HasFacilityPermission(code: str) -> type[BasePermission]:
    """Staff whose active-facility roles grant `code`: HasFacilityPermission("queue.operate")."""

    class _HasFacilityPermission(IsStaffAuthenticated):
        permission_code = code

        def has_permission(self, request: Any, view: Any) -> bool:
            if not super().has_permission(request, view):
                return False
            principal = get_principal(request)
            return bool(principal and code in principal.permissions)

    _HasFacilityPermission.__name__ = f"HasFacilityPermission[{code}]"
    return _HasFacilityPermission
