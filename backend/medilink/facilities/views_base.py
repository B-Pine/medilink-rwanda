"""Shared view plumbing for S2: permission classes and the active facility."""

from __future__ import annotations

from typing import Any

from drf_spectacular.utils import OpenApiParameter, OpenApiResponse
from rest_framework import exceptions
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.authz.permissions import IsStaffAuthenticated, get_principal
from medilink.core.exceptions import CurrentOnConflict
from medilink.core.pagination import DefaultPagination
from medilink.core.serializers import ErrorSerializer
from medilink.facilities.errors import SetupAPIView
from medilink.tenancy.models import Facility

PAGE = [OpenApiParameter("page", int), OpenApiParameter("page_size", int)]


def err(description: str) -> OpenApiResponse:
    return OpenApiResponse(response=ErrorSerializer, description=description)


def paginated(view: Any, request: Request, rows: Any, render: Any) -> Response:
    """Page-number pagination (architecture 02 §3): `{count, next, previous, results}`."""
    paginator = DefaultPagination()
    page: list[Any] | None = paginator.paginate_queryset(rows, request, view=view)
    return paginator.get_paginated_response([render(row) for row in page or []])


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


# A view of the active facility; a `409` carries the current resource (`error.current`).
class FacilityView(CurrentOnConflict, SetupAPIView):
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
