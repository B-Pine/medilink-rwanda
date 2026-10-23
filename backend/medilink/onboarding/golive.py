"""Go-live check registry (contract §2.3). A check returns problems `{code, message}`; S1 registers
`licence.moh_operating_valid`, S2 registers the setup checklist:

    from medilink.onboarding.golive import register
    register("setup.checklist_complete", my_check)   # my_check(facility) -> list[Problem]
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, TypedDict


class Problem(TypedDict):
    code: str
    message: str


Check = Callable[[Any], list[Problem]]

_CHECKS: dict[str, Check] = {}


def register(code: str, check: Check) -> None:
    if code in _CHECKS:
        raise ValueError(f"Go-live check {code!r} is already registered")
    _CHECKS[code] = check


def unregister(code: str) -> None:
    _CHECKS.pop(code, None)


def run(facility: Any) -> dict[str, list[Problem]]:
    """Failing checks only: {check code: problems}."""
    failing = {}
    for code, check in _CHECKS.items():
        problems = check(facility)
        if problems:
            failing[code] = problems
    return failing


def moh_operating_licence_valid(facility: Any) -> list[Problem]:
    from django.utils import timezone

    from medilink.onboarding.models import FacilityLicence, LicenceKind

    current = FacilityLicence.objects.filter(
        facility=facility,
        kind=LicenceKind.MOH_OPERATING,
        superseded_at__isnull=True,
        expires_on__gte=timezone.localdate(),
    )
    if current.exists():
        return []
    return [
        {
            "code": "licence.moh_operating_valid",
            "message": "A current MoH operating licence that hasn't expired is required.",
        }
    ]
