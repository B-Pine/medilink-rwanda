"""Setup checklist (contract §2.2) and the `setup.checklist_complete` go-live check
(S1 registry)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.db.models import Q
from django.utils import timezone

from medilink.facilities.models import OpeningHours, Profile, Service, ServicePoint, Settings
from medilink.onboarding.golive import Problem


@dataclass
class Item:
    code: str
    done: bool
    count: int
    link: str


def _claimed_insurers(facility: Any) -> list[str]:
    from medilink.onboarding.models import Application

    application = Application.objects.filter(facility_id=facility.pk).first()
    return list(application.claimed_insurer_codes or []) if application else []


def checklist(facility: Any) -> list[Item]:
    from medilink.billing.models import InsurerRule, TariffItem
    from medilink.onboarding.golive import moh_operating_licence_valid
    from medilink.scheduling.models import ScheduleTemplate
    from medilink.tenancy.models import FacilityMembership

    today = timezone.localdate()
    current = Q(valid_from__lte=today) & (Q(valid_to__isnull=True) | Q(valid_to__gte=today))
    profile = Profile.objects.filter(facility=facility).first()
    profile_done = bool(
        profile and profile.phone and profile.address and profile.latitude is not None
    )
    services = Service.objects.filter(facility=facility, is_active=True)
    points = ServicePoint.objects.filter(facility=facility, is_active=True)
    unserved = services.exclude(service_points__in=points).distinct()
    clinicians = FacilityMembership.objects.filter(
        facility=facility, is_active=True, roles__code="doctor", licence_attested_at__isnull=False
    ).distinct()
    templated = set(
        ScheduleTemplate.objects.filter(facility=facility, ended_at__isnull=True).values_list(
            "service_id", flat=True
        )
    )
    bookable_without = [s for s in services.filter(is_bookable=True) if s.pk not in templated]
    priced = set(
        TariffItem.objects.filter(current, facility=facility, service__isnull=False).values_list(
            "service_id", flat=True
        )
    )
    unpriced = [s for s in services if s.pk not in priced]
    settings_row = Settings.objects.filter(facility=facility).first()
    no_insurers = bool(settings_row and (settings_row.billing or {}).get("no_insurers"))
    ruled = set(
        InsurerRule.objects.filter(current, facility=facility).values_list(
            "insurer_code", flat=True
        )
    )
    missing_rules = [code for code in _claimed_insurers(facility) if code not in ruled]
    insurers_done = no_insurers or (bool(ruled) and not missing_rules)
    return [
        Item("profile", profile_done, int(profile_done), "/settings/profile"),
        Item(
            "departments",
            facility_departments(facility) > 0,
            facility_departments(facility),
            "/settings/services",
        ),
        Item("services", services.exists(), services.count(), "/settings/services"),
        Item(
            "service_points",
            points.exists() and not unserved.exists(),
            points.count(),
            "/settings/services",
        ),
        Item(
            "opening_hours",
            OpeningHours.objects.filter(facility=facility, service__isnull=True).exists(),
            OpeningHours.objects.filter(facility=facility, service__isnull=True).count(),
            "/settings/hours",
        ),
        Item("staff", clinicians.exists(), clinicians.count(), "/staff"),
        Item(
            "schedules",
            services.filter(is_bookable=True).exists() and not bookable_without,
            len(templated),
            "/settings/schedules",
        ),
        Item("tariff", services.exists() and not unpriced, len(priced), "/settings/tariffs"),
        Item("insurers", insurers_done, len(ruled), "/settings/insurers"),
        Item("licence", not moh_operating_licence_valid(facility), 0, "/settings/profile"),
    ]


def facility_departments(facility: Any) -> int:
    from medilink.facilities.models import Department

    return Department.objects.filter(facility=facility, is_active=True).count()


def checklist_complete(facility: Any) -> list[Problem]:
    """Go-live check: one problem per missing item."""
    from medilink.tenancy.context import rls_context

    with rls_context(facility_id=facility.pk):
        items = checklist(facility)
    return [
        Problem(code=f"setup.{item.code}", message=f"Setup step not complete: {item.code}")
        for item in items
        if not item.done and item.code != "licence"  # S1 reports the licence itself
    ]
