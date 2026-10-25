"""Effective calendar (contract §2.2, FR-SCH-05): opening hours after public holidays, overrides,
closures and Umuganda. S5 builds bookable slots from the same function."""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Any
from zoneinfo import ZoneInfo

from medilink.facilities.models import (
    CalendarEvent,
    CalendarEventKind,
    OpeningHours,
    Settings,
    Umuganda,
)

KIGALI = ZoneInfo("Africa/Kigali")
UMUGANDA_CLOSED_UNTIL = dt.time(12, 0)  # "closed in the morning"
UMUGANDA_REOPEN = dt.time(11, 30)  # "opens at 11:30"
MAX_DAYS = 92


@dataclass
class Day:
    date: dt.date
    open: list[tuple[dt.time, dt.time]] = field(default_factory=list)
    closed_reason: str | None = None
    holiday_name: str | None = None
    umuganda: bool = False


def is_umuganda(day: dt.date) -> bool:
    """Last Saturday of the month."""
    return day.weekday() == 5 and (day + dt.timedelta(days=7)).month != day.month


def _ranges(hours: OpeningHours) -> list[tuple[dt.time, dt.time]]:
    if hours.break_starts_at and hours.break_ends_at:
        return [(hours.opens_at, hours.break_starts_at), (hours.break_ends_at, hours.closes_at)]
    return [(hours.opens_at, hours.closes_at)]


def _cut(
    ranges: list[tuple[dt.time, dt.time]], start: dt.time, end: dt.time
) -> list[tuple[dt.time, dt.time]]:
    """Remove [start, end) from the ranges."""
    out = []
    for a, b in ranges:
        if b <= start or a >= end:
            out.append((a, b))
            continue
        if a < start:
            out.append((a, start))
        if b > end:
            out.append((end, b))
    return out


def _holidays(start: dt.date, end: dt.date) -> dict[dt.date, str]:
    from medilink.masterdata.models import PublicHoliday

    found = {}
    holidays = PublicHoliday.objects.filter(
        is_active=True, holiday_date__gte=start, holiday_date__lte=end
    )
    for holiday in holidays:
        names = holiday.name_i18n or {}
        found[holiday.holiday_date] = names.get("en") or next(iter(names.values()), "")
    return found


def effective_calendar(
    facility_id: Any, start: dt.date, end: dt.date, service_id: Any = None
) -> list[Day]:
    if end < start or (end - start).days > MAX_DAYS:
        raise ValueError("range")
    weekly = {
        h.weekday: h
        for h in OpeningHours.objects.filter(facility_id=facility_id, service_id=service_id)
    }
    if (
        service_id is not None and not weekly
    ):  # a service without its own hours follows the facility
        weekly = {
            h.weekday: h
            for h in OpeningHours.objects.filter(facility_id=facility_id, service__isnull=True)
        }
    settings_row = Settings.objects.filter(facility_id=facility_id).first()
    umuganda = settings_row.umuganda if settings_row else Umuganda.CLOSED
    holidays = _holidays(start, end)
    window_start = dt.datetime.combine(start, dt.time.min, KIGALI)
    window_end = dt.datetime.combine(end + dt.timedelta(days=1), dt.time.min, KIGALI)
    events = list(
        CalendarEvent.objects.filter(
            facility_id=facility_id,
            deleted_at__isnull=True,
            starts_at__lt=window_end,
            ends_at__gt=window_start,
        )
    )
    days = []
    current = start
    while current <= end:
        hours = weekly.get(current.weekday())
        day = Day(date=current, open=_ranges(hours) if hours else [])
        if not hours:
            day.closed_reason = "closed_weekday"
        if current in holidays:
            day.holiday_name = holidays[current]
            override = next(
                (
                    e
                    for e in events
                    if e.kind == CalendarEventKind.HOLIDAY_OVERRIDE
                    and e.is_open
                    and e.starts_at.astimezone(KIGALI).date()
                    <= current
                    <= e.ends_at.astimezone(KIGALI).date()
                    and e.service_id in (None, service_id)
                ),
                None,
            )
            if override is None:
                day.open, day.closed_reason = [], "public_holiday"
            elif override.opens_at and override.closes_at:
                day.open, day.closed_reason = [(override.opens_at, override.closes_at)], None
        for event in events:
            if event.service_id not in (None, service_id):
                continue
            day_start = dt.datetime.combine(current, dt.time.min, KIGALI)
            day_end = day_start + dt.timedelta(days=1)
            if event.ends_at <= day_start or event.starts_at >= day_end:
                continue
            if event.kind == CalendarEventKind.SPECIAL_DAY and event.opens_at and event.closes_at:
                day.open, day.closed_reason = [(event.opens_at, event.closes_at)], None
            elif event.kind == CalendarEventKind.CLOSURE:
                cut_start = max(event.starts_at, day_start).astimezone(KIGALI).time()
                cut_end_dt = min(event.ends_at, day_end)
                cut_end = (
                    dt.time.max if cut_end_dt >= day_end else cut_end_dt.astimezone(KIGALI).time()
                )
                day.open = _cut(day.open, cut_start, cut_end)
                if not day.open:
                    day.closed_reason = "closure"
        if is_umuganda(current) and umuganda != Umuganda.OPEN and day.open:
            day.umuganda = True
            end_cut = UMUGANDA_CLOSED_UNTIL if umuganda == Umuganda.CLOSED else UMUGANDA_REOPEN
            day.open = _cut(day.open, dt.time.min, end_cut)
            if not day.open:
                day.closed_reason = "umuganda"
        days.append(day)
        current += dt.timedelta(days=1)
    return days
