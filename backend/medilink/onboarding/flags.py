"""Feature flags (contract NFR-OPS-07, S1-D4): a catalogue with defaults plus per-facility
overrides. `enabled_flags()` feeds `StaffMe.feature_flags`; `RequiresFeatureFlag` hides
endpoints of disabled features (404)."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from django.http import Http404
from rest_framework.permissions import BasePermission

from medilink.onboarding.models import FacilityFeatureFlag, FeatureFlag

# Catalogue seeded by migration; later sprints add their flags in their own data migrations.
CATALOGUE: tuple[tuple[str, str, bool], ...] = (
    ("security.pin_unlock", "Unlock an idle-locked session with a PIN", True),
)


def enabled_flags(facility_id: UUID | str | None) -> list[str]:
    """Codes of the active flags that are on for the facility (defaults without one)."""
    flags = {f.pk: f for f in FeatureFlag.objects.filter(is_active=True)}
    enabled = {pk for pk, flag in flags.items() if flag.default_enabled}
    if facility_id:
        for flag_id, is_enabled in FacilityFeatureFlag.objects.filter(
            facility_id=facility_id, flag_id__in=flags
        ).values_list("flag_id", "is_enabled"):
            if is_enabled:
                enabled.add(flag_id)
            else:
                enabled.discard(flag_id)
    return sorted(flags[pk].code for pk in enabled)


def is_enabled(code: str, facility_id: UUID | str | None) -> bool:
    flag = FeatureFlag.objects.filter(code=code, is_active=True).first()
    if flag is None:
        return False
    if facility_id:
        override = FacilityFeatureFlag.objects.filter(flag=flag, facility_id=facility_id).first()
        if override is not None:
            return override.is_enabled
    return flag.default_enabled


def RequiresFeatureFlag(code: str) -> type[BasePermission]:
    """DRF permission: 404 when the flag is off for the caller's active facility."""

    class _RequiresFeatureFlag(BasePermission):
        def has_permission(self, request: Any, view: Any) -> bool:
            from medilink.authz.permissions import get_principal

            principal = get_principal(request)
            facility_id = principal.active_facility_id if principal else None
            if not is_enabled(code, facility_id):
                raise Http404
            return True

    _RequiresFeatureFlag.__name__ = f"RequiresFeatureFlag[{code}]"
    return _RequiresFeatureFlag
