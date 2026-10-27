"""Keep slots and the public listing in step with facility configuration (contract sprint-05 §2.3,
§5): a change to services, hours, calendar, prices, insurer rules, schedules or facility status
queues one refresh of that facility after commit."""

from __future__ import annotations

from typing import Any

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from medilink.billing.models import InsurerRule, TariffItem
from medilink.facilities.models import CalendarEvent, OpeningHours, Profile, Service
from medilink.scheduling.models import ScheduleException, ScheduleTemplate
from medilink.tenancy.models import Facility

WATCHED = (
    Service,
    OpeningHours,
    CalendarEvent,
    TariffItem,
    InsurerRule,
    ScheduleTemplate,
    ScheduleException,
    Profile,
)


def _queue(facility_id: Any) -> None:
    from medilink.scheduling.tasks import refresh_facility

    transaction.on_commit(lambda: refresh_facility.delay(str(facility_id)))


@receiver(post_save, dispatch_uid="scheduling-config-changed")
def config_changed(sender: Any, instance: Any, raw: bool = False, **kwargs: Any) -> None:
    if raw or sender not in WATCHED:
        return
    facility_id = getattr(instance, "facility_id", None)
    if facility_id:
        _queue(facility_id)


@receiver(post_save, sender=Facility, dispatch_uid="scheduling-facility-changed")
def facility_changed(sender: Any, instance: Facility, raw: bool = False, **kwargs: Any) -> None:
    if not raw:
        _queue(instance.pk)
