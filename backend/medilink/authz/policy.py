"""Policy layer (security 04 §1-2): the one place where authorisation decisions are made.

Views call:
    authorize(principal, "queue.operate")                   # function-level (RBAC)
    qs = scoped(principal, Visit.objects)                     # facility-scoped queryset
    visit = get_scoped_object_or_404(principal, Visit.objects, pk=visit_id)  # 404, never 403

Objects of another facility are *not found* (no existence leak across facilities). The database
enforces the same rule through RLS as a second wall.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from django.core.exceptions import ObjectDoesNotExist
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Model, QuerySet
from rest_framework import exceptions

from medilink.accounts.principal import Principal


def has_permission(principal: Principal | None, code: str) -> bool:
    return bool(principal and principal.is_authenticated and code in principal.permissions)


def authorize(principal: Principal | None, code: str, obj: Any = None) -> None:
    """Raise unless the principal may perform `code` (on `obj` if given).

    Object checks: the object must belong to the principal's active facility; otherwise 404.
    """
    if principal is None or not principal.is_authenticated:
        raise exceptions.NotAuthenticated()
    if obj is not None:
        facility_id = getattr(obj, "facility_id", None)
        if facility_id is None or facility_id != principal.active_facility_id:
            raise exceptions.NotFound()
    if code not in principal.permissions:
        raise exceptions.PermissionDenied()


def scoped[M: Model](principal: Principal | None, queryset: QuerySet[M] | Any) -> QuerySet[M]:
    """Restrict a facility-owned queryset to the active facility (empty without one)."""
    qs: QuerySet[M] = queryset.all() if not isinstance(queryset, QuerySet) else queryset
    facility_id: UUID | None = principal.active_facility_id if principal else None
    if facility_id is None:
        return qs.none()
    return qs.filter(facility_id=facility_id)


def get_scoped_object_or_404[M: Model](
    principal: Principal | None, queryset: QuerySet[M] | Any, **lookup: Any
) -> M:
    try:
        return scoped(principal, queryset).get(**lookup)
    except (ObjectDoesNotExist, DjangoValidationError, ValueError, TypeError) as exc:
        raise exceptions.NotFound() from exc  # malformed IDs are "not found" too
