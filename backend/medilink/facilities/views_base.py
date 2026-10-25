"""Shared view plumbing for S2: permission classes and the active facility."""

from __future__ import annotations

from typing import Any

from drf_spectacular.utils import OpenApiResponse
from rest_framework import exceptions
from rest_framework.permissions import BasePermission
from rest_framework.request import Request

from medilink.authz.permissions import IsStaffAuthenticated, get_principal
from medilink.core.serializers import ErrorSerializer
from medilink.facilities.errors import SetupAPIView
from medilink.tenancy.models import Facility


def err(description: str) -> OpenApiResponse:
    return OpenApiResponse(response=ErrorSerializer, description=description)


def Needs(*codes: str, methods: dict[str, tuple[str, ...]] | None = None) -> type[BasePermission]:
    """Staff with an active facility and any of `codes` (`()` = any member); `methods` overrides
    the codes for given HTTP methods."""

    class _Needs(IsStaffAuthenticated):
        def has_permission(self, request: Any, view: Any) -> bool:
            if not super().has_permission(request, view):
                return False
            principal = get_principal(request)
            if principal is None or principal.active_facility_id is None:
                return False
            wanted = (methods or {}).get(request.method, codes)
            return not wanted or any(code in principal.permissions for code in wanted)

    _Needs.__name__ = f"Needs[{','.join(codes) or 'member'}]"
    return _Needs


Member = Needs()


class FacilityView(SetupAPIView):
    def principal(self) -> Any:
        principal = get_principal(self.request)
        if principal is None:
            raise exceptions.NotAuthenticated()
        return principal

    def facility(self) -> Facility:
        return Facility.objects.get(pk=self.principal().active_facility_id)

    def can(self, *codes: str) -> bool:
        return any(code in self.principal().permissions for code in codes)


def query_date(request: Request, name: str, default: Any = None) -> Any:
    import datetime as dt

    value = request.query_params.get(name)
    if not value:
        return default
    try:
        return dt.date.fromisoformat(value)
    except ValueError:
        raise exceptions.ValidationError({name: ["Use YYYY-MM-DD."]}) from None
