"""Membership queries. Callers must have the RLS user context set (the request middleware does)."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from medilink.tenancy.models import FacilityMembership


def active_memberships(user: Any) -> list[FacilityMembership]:
    return list(
        FacilityMembership.objects.for_user(user)
        .active()
        .select_related("facility")
        .prefetch_related("roles__permissions")
        .order_by("facility__name")
    )


def active_membership(user: Any, facility_id: UUID | str) -> FacilityMembership | None:
    return (
        FacilityMembership.objects.for_user(user)
        .active()
        .filter(facility_id=facility_id)
        .select_related("facility")
        .prefetch_related("roles__permissions")
        .first()
    )


def has_active_membership(user: Any) -> bool:
    return FacilityMembership.objects.for_user(user).active().exists()


def membership_permissions(membership: FacilityMembership | None) -> frozenset[str]:
    if membership is None:
        return frozenset()
    return frozenset(
        permission.code for role in membership.roles.all() for permission in role.permissions.all()
    )


def membership_roles(membership: FacilityMembership | None) -> list[str]:
    if membership is None:
        return []
    return sorted(role.code for role in membership.roles.all())
