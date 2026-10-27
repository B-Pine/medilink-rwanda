"""Slot generation and holds (contract sprint-05 §2.2). Callers run inside the facility's RLS
context. Counters change only under `SELECT … FOR UPDATE` on the slot row."""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db import transaction
from django.db.models import F, QuerySet
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from medilink.facilities.calendar import KIGALI, effective_calendar
from medilink.facilities.models import Service, Settings
from medilink.facilities.settings_schema import with_defaults
from medilink.scheduling.errors import BookingConflict
from medilink.scheduling.models import Slot, SlotHold, SlotStatus
from medilink.scheduling.services import blocks
from medilink.tenancy.models import Facility, FacilityStatus

HOLD_MINUTES = 5
CHUNK_DAYS = 31  # effective_calendar takes at most 92 days per call

SLOT_TAKEN = _("Someone just took this time. Choose another one.")
NOT_BOOKABLE = _("This time can't be booked.")


def booking_settings(facility_id: Any) -> dict[str, Any]:
    row = Settings.objects.filter(facility_id=facility_id).first()
    return with_defaults("booking", (row.booking if row else {}) or {})


def _open_ranges(
    facility_id: Any, service_id: Any, start: dt.date, end: dt.date
) -> dict[dt.date, list[tuple[dt.time, dt.time]]]:
    out: dict[dt.date, list[tuple[dt.time, dt.time]]] = {}
    day = start
    while day <= end:
        last = min(end, day + dt.timedelta(days=CHUNK_DAYS - 1))
        for d in effective_calendar(facility_id, day, last, service_id=service_id):
            out[d.date] = d.open
        day = last + dt.timedelta(days=1)
    return out


def _inside(ranges: list[tuple[dt.time, dt.time]], start: dt.datetime, end: dt.datetime) -> bool:
    local_start, local_end = start.astimezone(KIGALI), end.astimezone(KIGALI)
    if local_start.date() != local_end.date() and local_end.time() != dt.time.min:
        return False
    s, e = (
        local_start.time(),
        (local_end.time() if local_end.time() != dt.time.min else dt.time.max),
    )
    return any(a <= s and e <= b for a, b in ranges)


def generate(facility_id: Any, *, today: dt.date | None = None) -> dict[str, int]:
    """Upsert open slots for the booking window from template blocks, minus closures, holidays,
    Umuganda and leave. Idempotent; never changes `booked_count` (contract §2.2)."""
    today = today or timezone.localdate()
    facility = Facility.objects.filter(pk=facility_id).first()
    if facility is None or facility.status != FacilityStatus.LIVE:
        return {"created": 0, "closed": 0}
    horizon = booking_settings(facility_id)["horizon_days"]
    end = today + dt.timedelta(days=horizon)
    services = {
        str(s.pk): s
        for s in Service.objects.filter(facility_id=facility_id, is_active=True, is_bookable=True)
    }
    ranges = {sid: _open_ranges(facility_id, sid, today, end) for sid in services}
    wanted: dict[tuple[str, str | None, dt.datetime], dict[str, Any]] = {}
    for block in blocks(facility_id, today, end):
        sid = block["service_id"]
        if sid not in services or not block["slot_minutes"]:
            continue
        step = dt.timedelta(minutes=block["slot_minutes"])
        start = block["starts_at"]
        while start + step <= block["ends_at"]:
            day_ranges = ranges[sid].get(start.astimezone(KIGALI).date(), [])
            if _inside(day_ranges, start, start + step):
                capacity = block["capacity"]
                wanted[(sid, block["membership_id"], start)] = {
                    "ends_at": start + step,
                    "capacity": capacity,
                    "bookable_capacity": capacity * block["bookable_share_pct"] // 100,
                    "service_point_id": block["service_point_id"],
                    "source_template_id": block["template_id"],
                }
            start += step

    window_start = dt.datetime.combine(today, dt.time.min, KIGALI)
    window_end = dt.datetime.combine(end + dt.timedelta(days=1), dt.time.min, KIGALI)
    existing = {
        (str(s.service_id), str(s.membership_id) if s.membership_id else None, s.starts_at): s
        for s in Slot.objects.filter(
            facility_id=facility_id, starts_at__gte=window_start, starts_at__lt=window_end
        )
    }
    created = closed = 0
    with transaction.atomic():
        for key, values in wanted.items():
            slot = existing.get(key)
            if slot is None:
                Slot.objects.create(
                    facility_id=facility_id,
                    service_id=key[0],
                    membership_id=key[1],
                    starts_at=key[2],
                    **values,
                )
                created += 1
            elif slot.status != SlotStatus.OPEN or slot.bookable_capacity != max(
                values["bookable_capacity"], slot.booked_count + slot.held_count
            ):
                # Reopened, or the share changed: never below what is already taken
                Slot.objects.filter(pk=slot.pk).update(
                    status=SlotStatus.OPEN,
                    capacity=max(values["capacity"], slot.booked_count + slot.held_count),
                    bookable_capacity=max(
                        values["bookable_capacity"], slot.booked_count + slot.held_count
                    ),
                    updated_at=timezone.now(),
                )
        for key, slot in existing.items():
            if (
                key not in wanted
                and slot.status == SlotStatus.OPEN
                and slot.starts_at > timezone.now()
            ):
                Slot.objects.filter(pk=slot.pk).update(
                    status=SlotStatus.CLOSED, updated_at=timezone.now()
                )
                closed += 1
    return {"created": created, "closed": closed}


def bookable(
    facility_id: Any,
    service_id: Any,
    *,
    start: dt.datetime,
    end: dt.datetime,
    membership_id: Any = None,
) -> QuerySet[Slot]:
    """Open slots with a free place inside the booking window (lead time and horizon)."""
    settings_ = booking_settings(facility_id)
    now = timezone.now()
    earliest = max(start, now + dt.timedelta(hours=settings_["lead_time_hours"]))
    latest = min(
        end,
        dt.datetime.combine(
            timezone.localdate() + dt.timedelta(days=settings_["horizon_days"] + 1),
            dt.time.min,
            KIGALI,
        ),
    )
    qs = Slot.objects.filter(
        facility_id=facility_id,
        service_id=service_id,
        status=SlotStatus.OPEN,
        starts_at__gte=earliest,
        starts_at__lt=latest,
        booked_count__lt=F("bookable_capacity") - F("held_count"),
    )
    if membership_id:
        qs = qs.filter(membership_id=membership_id)
    return qs.order_by("starts_at", "membership_id")


def alternatives(slot: Slot, limit: int = 3) -> list[Slot]:
    return list(
        bookable(
            slot.facility_id,
            slot.service_id,
            start=slot.starts_at - dt.timedelta(hours=3),
            end=slot.starts_at + dt.timedelta(days=3),
        ).exclude(pk=slot.pk)[:limit]
    )


def _is_bookable_now(slot: Slot) -> bool:
    settings_ = booking_settings(slot.facility_id)
    if not settings_["enabled"] or slot.status != SlotStatus.OPEN:
        return False
    now = timezone.now()
    if slot.starts_at < now + dt.timedelta(hours=settings_["lead_time_hours"]):
        return False
    service = Service.objects.filter(pk=slot.service_id).first()
    return bool(service and service.is_active and service.is_bookable)


def hold(slot_id: Any, *, account: Any = None, membership: Any = None) -> SlotHold:
    """Hold one place for 5 minutes. One open hold per account or staff member: a new hold
    releases the previous one. Raises 409 `slot_taken` when the slot is full."""
    with transaction.atomic():
        previous = SlotHold.objects.select_for_update().filter(
            released_at__isnull=True,
            booking_id__isnull=True,
            **({"account": account} if account is not None else {"membership": membership}),
        )
        for old in previous:
            _release(old)
        slot = Slot.objects.select_for_update().get(pk=slot_id)
        if not _is_bookable_now(slot):
            raise BookingConflict(NOT_BOOKABLE, "not_bookable")
        if slot.open_places < 1:
            raise BookingConflict(SLOT_TAKEN, "slot_taken")
        slot.held_count += 1
        slot.save(update_fields=["held_count", "updated_at"])
        return SlotHold.objects.create(
            facility_id=slot.facility_id,
            slot=slot,
            account=account,
            membership=membership,
            expires_at=timezone.now() + dt.timedelta(minutes=HOLD_MINUTES),
        )


def _release(h: SlotHold) -> None:
    if h.released_at is not None:
        return
    Slot.objects.filter(pk=h.slot_id, held_count__gt=0).update(
        held_count=F("held_count") - 1, updated_at=timezone.now()
    )
    h.released_at = timezone.now()
    h.save(update_fields=["released_at", "updated_at"])


def release(h: SlotHold) -> None:
    with transaction.atomic():
        locked = SlotHold.objects.select_for_update().get(pk=h.pk)
        Slot.objects.select_for_update().filter(pk=locked.slot_id).first()
        _release(locked)


def expire_holds(facility_id: Any) -> int:
    with transaction.atomic():
        expired = list(
            SlotHold.objects.select_for_update().filter(
                facility_id=facility_id,
                released_at__isnull=True,
                booking_id__isnull=True,
                expires_at__lte=timezone.now(),
            )
        )
        for h in expired:
            _release(h)
    return len(expired)


def purge(facility_id: Any) -> int:
    """R-TMP: past slots after 90 days (no booking points at them any more), released holds after
    one day."""
    now = timezone.now()
    holds = SlotHold.objects.filter(
        facility_id=facility_id, released_at__lt=now - dt.timedelta(days=1)
    ).delete()[0]
    slots = (
        Slot.objects.filter(facility_id=facility_id, ends_at__lt=now - dt.timedelta(days=90))
        .filter(holds__isnull=True)
        .delete()[0]
    )
    return holds + slots
