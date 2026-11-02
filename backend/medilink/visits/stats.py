"""Operations figures for the facility dashboard (analysis 13 §1 metric definitions, design 04
§3.4). Computed from ticket and visit timestamps; aggregates only, never names."""

from __future__ import annotations

import datetime as dt
import statistics
from collections import Counter
from typing import Any

from django.db.models import Min, Sum
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
    # Wait = check-in (or confirmed remote arrival) to the first call (analysis 13 §1). The
    # first `call` event is kept: `called_at` moves on recall and no response, and `arrival_at`
    # of a remote joiner is the join time at home.
    first_calls = (
        TicketEvent.objects.filter(facility_id=facility_id, action="call", ticket__in=consult)
        .values("ticket_id", "ticket__visit__checked_in_at")
        .annotate(first=Min("occurred_at"))
    )
    waits = [
        _minutes(row["first"] - row["ticket__visit__checked_in_at"])
        for row in first_calls
        if row["ticket__visit__checked_in_at"] is not None
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


def _attention(facility_id: Any, today: dt.date) -> dict[str, int]:
    """Needs-your-attention counts for the facility admin (upgrade 05 §5)."""
    from django_otp.plugins.otp_totp.models import TOTPDevice

    from medilink.billing.models import ApprovalRequest, ApprovalStatus, CashShift, ShiftStatus
    from medilink.clinical.models import Consultation, ConsultationStatus
    from medilink.disputes.models import OPEN_STATUSES, Dispute
    from medilink.onboarding.models import FacilityLicence
    from medilink.tenancy.models import FacilityMembership, Invitation

    member_ids = FacilityMembership.objects.filter(
        facility_id=facility_id, is_active=True
    ).values_list("user_id", flat=True)
    with_mfa = TOTPDevice.objects.filter(confirmed=True, user_id__in=member_ids)
    out = {
        "unreviewed_reorders": TicketEvent.objects.filter(
            facility_id=facility_id, action="reorder", review__isnull=True
        ).count(),
        "approvals_pending": ApprovalRequest.objects.filter(
            facility_id=facility_id, status=ApprovalStatus.PENDING
        ).count(),
        "shifts_to_review": CashShift.objects.filter(
            facility_id=facility_id, status=ShiftStatus.CLOSED
        ).count(),
        "unsigned_records": Consultation.objects.filter(
            facility_id=facility_id, status=ConsultationStatus.DRAFT
        ).count(),
        "disputes_open": Dispute.objects.filter(
            facility_id=facility_id, status__in=OPEN_STATUSES
        ).count(),
        "invitations_pending": Invitation.objects.filter(
            facility_id=facility_id,
            accepted_at__isnull=True,
            revoked_at__isnull=True,
            expires_at__gt=timezone.now(),
        ).count(),
        "staff_without_mfa": max(
            0, member_ids.count() - with_mfa.values("user_id").distinct().count()
        ),
    }
    licence = (
        FacilityLicence.objects.filter(facility_id=facility_id, superseded_by__isnull=True)
        .order_by("expires_on")
        .first()
    )
    if licence is not None:
        out["licence_days_left"] = (licence.expires_on - today).days
    return out


def _finance(facility_id: Any, today: dt.date) -> dict[str, int]:
    """Money today (S8): amounts and counts only, never patients."""
    from medilink.billing.models import Bill, Payment, PaymentStatus

    payments = Payment.objects.filter(
        facility_id=facility_id, status=PaymentStatus.RECORDED, received_at__date=today
    )
    return {
        "collected_today_rwf": payments.aggregate(n=Sum("amount_rwf"))["n"] or 0,
        "payments_today": payments.count(),
        "bills_today": Bill.objects.filter(
            facility_id=facility_id, visit__service_date=today
        ).count(),
        "open_balance_rwf": Bill.objects.filter(
            facility_id=facility_id, balance_rwf__gt=0
        ).aggregate(n=Sum("balance_rwf"))["n"]
        or 0,
    }


def _bookings(facility_id: Any, today: dt.date) -> dict[str, int]:
    """Today's bookings (S5): expected, arrived and no-shows."""
    from medilink.scheduling.models import Booking, BookingStatus

    day = Counter(
        Booking.objects.filter(facility_id=facility_id, service_date=today).values_list(
            "status", flat=True
        )
    )
    no_shows = day[BookingStatus.NO_SHOW]
    expected = day[BookingStatus.CONFIRMED] + day[BookingStatus.CHECKED_IN] + no_shows
    return {
        "expected_today": expected,
        "checked_in_today": day[BookingStatus.CHECKED_IN],
        "no_shows_today": no_shows,
        "no_show_rate_pct": round(100 * no_shows / expected) if expected else 0,
    }


def _on_duty(facility_id: Any) -> list[dict[str, Any]]:
    rows = (
        DutyStatus.objects.filter(facility_id=facility_id)
        .exclude(state=DutyState.OFF)
        .select_related("membership__user", "service_point")
        .order_by("state", "membership__user__full_name")
    )
    return [
        {
            "name": r.membership.user.full_name,
            "state": r.state,
            "room": r.service_point.name if r.service_point else "",
        }
        for r in rows
    ]


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
        ).select_related("service", "visit")
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
            if t.visit.checked_in_at is not None:  # remote joiners wait from confirmed arrival
                row["longest_wait_min"] = max(
                    row["longest_wait_min"], round(_minutes(now - t.visit.checked_in_at))
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
        "attention": _attention(facility_id, today),
        "finance": _finance(facility_id, today),
        "bookings": _bookings(facility_id, today),
        "on_duty": _on_duty(facility_id),
        "updated_at": now,
    }
