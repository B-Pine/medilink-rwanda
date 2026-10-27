"""Operations figures for the facility dashboard (analysis 13 §1 metric definitions, design 04
§3.4). Computed from ticket and visit timestamps; aggregates only, never names."""

from __future__ import annotations

import datetime as dt
import statistics
from collections import Counter
from typing import Any

from django.utils import timezone

from medilink.visits.models import (
    ACTIVE_STATES,
    DutyState,
    DutyStatus,
    Stage,
    Ticket,
    TicketEvent,
    TicketState,
    Visit,
    VisitStatus,
)
from medilink.visits.services import doctors_for

TREND_DAYS = 14
HEAT_DAYS = 28


def _minutes(delta: dt.timedelta) -> float:
    return delta.total_seconds() / 60


def _median(values: list[float]) -> int | None:
    return round(statistics.median(values)) if values else None


def _p90(values: list[float]) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    return round(ordered[min(len(ordered) - 1, int(0.9 * len(ordered)))])


def _day_figures(facility_id: Any, day: dt.date) -> dict[str, Any]:
    visits = Visit.objects.filter(facility_id=facility_id, service_date=day)
    consult = Ticket.objects.filter(
        facility_id=facility_id, service_date=day, stage=Stage.CONSULTATION
    )
    waits = [
        _minutes(called - arrived)
        for arrived, called in consult.filter(called_at__isnull=False).values_list(
            "arrival_at", "called_at"
        )
        if called is not None
    ]
    durations = [
        _minutes(end - start)
        for start, end in consult.filter(
            started_at__isnull=False, ended_at__isnull=False
        ).values_list("started_at", "ended_at")
        if start is not None and end is not None
    ]
    issued = consult.count()
    left = consult.filter(state=TicketState.LEFT_WITHOUT_SERVICE).count()
    return {
        "date": day,
        "patients": visits.count(),
        "completed": visits.filter(status=VisitStatus.COMPLETED).count(),
        "median_wait_min": _median(waits),
        "p90_wait_min": _p90(waits),
        "avg_consult_min": round(sum(durations) / len(durations)) if durations else None,
        "left_rate_pct": round(100 * left / issued) if issued else None,
        "walk_ins": visits.filter(source="walk_in").count(),
        "emergencies": visits.filter(is_emergency=True).count(),
    }


def _load(waiting: int, doctors: int) -> str:
    """Queue pressure (design 04 §3.4): people waiting per doctor on duty."""
    if waiting == 0:
        return "low"
    if doctors == 0:
        return "high"
    per_doctor = waiting / doctors
    return "low" if per_doctor < 4 else "medium" if per_doctor < 8 else "high"


def operations(facility_id: Any) -> dict[str, Any]:
    now = timezone.now()
    today = timezone.localdate()
    trend = [_day_figures(facility_id, today - dt.timedelta(days=i)) for i in range(TREND_DAYS)][
        ::-1
    ]
    same_day_last_week = _day_figures(facility_id, today - dt.timedelta(days=7))

    tickets = list(
        Ticket.objects.filter(
            facility_id=facility_id, service_date=today, state__in=ACTIVE_STATES
        ).select_related("service")
    )
    by_service: dict[Any, dict[str, Any]] = {}
    for t in tickets:
        row = by_service.setdefault(
            t.service_id,
            {
                "service_id": t.service_id,
                "name_i18n": t.service.name_i18n,
                "waiting": 0,
                "in_service": 0,
                "longest_wait_min": 0,
            },
        )
        if t.state == TicketState.WAITING:
            row["waiting"] += 1
            row["longest_wait_min"] = max(
                row["longest_wait_min"], round(_minutes(now - t.arrival_at))
            )
        elif t.state in (TicketState.CALLED, TicketState.IN_SERVICE):
            row["in_service"] += 1
    services = []
    for row in by_service.values():
        doctors = (
            doctors_for(facility_id, row["service_id"]).filter(state=DutyState.ON_DUTY).count()
        )
        services.append({**row, "doctors_on_duty": doctors, "load": _load(row["waiting"], doctors)})
    services.sort(key=lambda r: (-r["waiting"], str(r["service_id"])))

    arrivals = Visit.objects.filter(
        facility_id=facility_id,
        service_date__gte=today - dt.timedelta(days=HEAT_DAYS - 1),
        checked_in_at__isnull=False,
    ).values_list("checked_in_at", flat=True)
    heat: Counter[tuple[int, int]] = Counter()
    for at in arrivals:
        local = timezone.localtime(at)
        heat[(local.weekday(), local.hour)] += 1

    duty = Counter(
        DutyStatus.objects.filter(facility_id=facility_id).values_list("state", flat=True)
    )
    return {
        "today": trend[-1],
        "same_day_last_week": same_day_last_week,
        "trend": trend,
        "now": {
            "waiting": sum(1 for t in tickets if t.state == TicketState.WAITING),
            "in_service": sum(
                1 for t in tickets if t.state in (TicketState.CALLED, TicketState.IN_SERVICE)
            ),
            "doctors_on_duty": duty.get(DutyState.ON_DUTY, 0),
            "doctors_on_break": duty.get(DutyState.BREAK, 0),
        },
        "services": services,
        "arrivals_heatmap": [
            {"weekday": w, "hour": h, "count": c} for (w, h), c in sorted(heat.items())
        ],
        "attention": {
            "unreviewed_reorders": TicketEvent.objects.filter(
                facility_id=facility_id, action="reorder", review__isnull=True
            ).count(),
        },
        "updated_at": now,
    }
