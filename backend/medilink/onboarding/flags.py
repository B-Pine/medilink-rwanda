"""Feature flags (contract NFR-OPS-07, S1-D4): a catalogue with defaults plus per-facility
overrides. `enabled_flags()` feeds `StaffMe.feature_flags`; `RequiresFeatureFlag` hides
endpoints of disabled features (404)."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from django.http import Http404
from rest_framework.permissions import BasePermission

from medilink.onboarding.models import FacilityFeatureFlag, FeatureFlag

STAFF_MFA_FLAG = "security.staff_mfa"
STAFF_MFA_DESCRIPTION = (
    "Staff sign in with a password and an authenticator code. Turn off only while testing: "
    "staff then sign in with the password alone."
)

# Flags with one platform-wide value: facilities can't override them.
PLATFORM_ONLY = frozenset({STAFF_MFA_FLAG})

# Catalogue seeded by migration; later sprints add their flags in their own data migrations.
CATALOGUE: tuple[tuple[str, str, bool], ...] = (
    ("security.pin_unlock", "Unlock an idle-locked session with a PIN", True),
    ("security.staff_mfa", STAFF_MFA_DESCRIPTION, True),
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


def staff_mfa_off() -> bool:
    """True when a platform admin turned staff two-step sign-in off (the flag's default, platform
    wide; per-facility overrides don't apply: sign-in happens before a facility is chosen).

    A missing or retired flag counts as on, so two-step stays required unless someone turned it
    off on purpose."""
    return FeatureFlag.objects.filter(
        code=STAFF_MFA_FLAG, is_active=True, default_enabled=False
    ).exists()
