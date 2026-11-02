"""Facility and platform report figures (analysis 13 §1-3, contract sprint-10c §2). Aggregates
from event timestamps and money columns; never patient names. Staff names appear only in the
doctor-activity rows, which facility admins already see in staff management."""

from __future__ import annotations

import datetime as dt
from collections import Counter, defaultdict
from typing import Any

from django.db import connection
from django.db.models import Count, Q, Sum
from django.utils import timezone

MAX_DAYS = 92


def period(start: dt.date, end: dt.date) -> list[dt.date]:
    days = (end - start).days + 1
    return [start + dt.timedelta(days=i) for i in range(max(days, 0))]


def facility_period(facility_id: Any, start: dt.date, end: dt.date) -> dict[str, Any]:
    """In the facility's RLS context."""
    from medilink.billing.models import Bill
    from medilink.clinical.models import Consultation, ConsultationStatus
    from medilink.disputes.models import OPEN_STATUSES, Dispute
    from medilink.scheduling.models import Booking
    from medilink.visits.stats import _day_figures

    days = [_day_figures(facility_id, d) for d in period(start, end)]
    totals = {
        "patients": sum(d["patients"] for d in days),
        "completed": sum(d["completed"] for d in days),
        "walk_ins": sum(d["walk_ins"] for d in days),
        "emergencies": sum(d["emergencies"] for d in days),
    }
    waits = [d["median_wait_min"] for d in days if d["median_wait_min"] is not None]
    totals["median_wait_min"] = round(sum(waits) / len(waits)) if waits else None

    bookings = Booking.objects.filter(
        facility_id=facility_id, service_date__gte=start, service_date__lte=end
    )
    by_status = Counter(bookings.values_list("status", flat=True))
    booking_figures = {
        # a rescheduled booking is superseded by its new one: count the booking once
        "booked": sum(n for status, n in by_status.items() if status != "superseded"),
        "checked_in": by_status.get("checked_in", 0),
        "no_show": by_status.get("no_show", 0),
        "cancelled": by_status.get("cancelled", 0) + by_status.get("late_cancelled", 0),
        "late_cancelled": by_status.get("late_cancelled", 0),
    }

    consultations = Consultation.objects.filter(
        facility_id=facility_id,
        visit__service_date__gte=start,
        visit__service_date__lte=end,
    ).select_related("author_membership__user")
    doctors: dict[Any, dict[str, Any]] = defaultdict(
        lambda: {"name": "", "signed": 0, "unsigned": 0, "late": 0}
    )
    for c in consultations:
        row = doctors[c.author_membership_id]
        row["name"] = str(c.author_membership.user.full_name)
        if c.status == ConsultationStatus.SIGNED:
            row["signed"] += 1
            row["late"] += int(c.is_late_entry)
        elif c.status == ConsultationStatus.DRAFT:
            row["unsigned"] += 1
    doctor_rows = sorted(
        ({"membership_id": k, **v} for k, v in doctors.items()),
        key=lambda r: (-r["signed"], r["name"]),
    )

    money = Bill.objects.filter(
        facility_id=facility_id,
        visit__service_date__gte=start,
        visit__service_date__lte=end,
    ).aggregate(
        bills=Count("id"),
        billed=Sum("total_rwf"),
        insurer=Sum("insurer_share_rwf"),
        patient=Sum("patient_share_rwf"),
        paid=Sum("paid_rwf"),
        exempted=Sum("exempted_rwf"),
        refunded=Sum("refunded_rwf"),
        balance=Sum("balance_rwf"),
    )
    finance = {key: int(value or 0) for key, value in money.items()}

    disputes = Dispute.objects.filter(
        facility_id=facility_id,
        created_at__date__gte=start,
        created_at__date__lte=end,
    )
    now = timezone.now()
    dispute_figures = {
        "raised": disputes.count(),
        "open": Dispute.objects.filter(facility_id=facility_id, status__in=OPEN_STATUSES).count(),
        "overdue": Dispute.objects.filter(
            Q(status__in=["open", "reopened"], acknowledge_by__lt=now)
            | Q(status__in=["acknowledged", "under_review", "info_requested"], decide_by__lt=now),
            facility_id=facility_id,
        ).count(),
        "by_type": dict(Counter(disputes.values_list("type", flat=True))),
        "by_outcome": dict(Counter(o for o in disputes.values_list("outcome", flat=True) if o)),
    }
    return {
        "from": start,
        "to": end,
        "totals": totals,
        "days": days,
        "bookings": booking_figures,
        "doctors": doctor_rows,
        "finance": finance,
        "disputes": dispute_figures,
    }


CSV_DANGER = ("=", "+", "-", "@", "\t", "\r")


def csv_cell(value: Any) -> str:
    """CSV-injection safe (OWASP): a text cell that a spreadsheet could read as a formula gets a
    leading apostrophe. Numbers stay numbers."""
    if value is None:
        return ""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)
    text = str(value)
    return "'" + text if text.startswith(CSV_DANGER) else text


def csv_rows(report: dict[str, Any]) -> list[list[Any]]:
    head = [
        "date",
        "patients",
        "completed",
        "median_wait_min",
        "p90_wait_min",
        "avg_consult_min",
        "left_rate_pct",
        "walk_ins",
        "emergencies",
    ]
    rows: list[list[Any]] = [head]
    for d in report["days"]:
        rows.append([d["date"].isoformat(), *[d[k] for k in head[1:]]])
    rows.append([])
    rows.append(["finance", *report["finance"].keys()])
    rows.append(["", *report["finance"].values()])
    rows.append([])
    rows.append(["bookings", *report["bookings"].keys()])
    rows.append(["", *report["bookings"].values()])
    rows.append([])
    rows.append(["doctor", "signed", "unsigned", "late"])
    for doc in report["doctors"]:
        rows.append([doc["name"], doc["signed"], doc["unsigned"], doc["late"]])
    return rows


def platform_figures(start: dt.date, end: dt.date) -> dict[str, Any]:
    """SECURITY DEFINER `reports_platform_figures` (aggregates across facilities, no rows)."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT * FROM reports_platform_figures(%s, %s)", [start, end])
        cols = [c.name for c in cursor.description]
        facilities = [dict(zip(cols, row, strict=True)) for row in cursor.fetchall()]
    visits = sum(f["visits"] for f in facilities)
    disputes = sum(f["disputes"] for f in facilities)
    escalated = sum(f["escalated"] for f in facilities)
    return {
        "from": start,
        "to": end,
        "totals": {
            "facilities_live": sum(1 for f in facilities if f["status"] == "live"),
            "facilities_active": sum(1 for f in facilities if f["visits"] > 0),
            "visits": visits,
            "bookings": sum(f["bookings"] for f in facilities),
            "disputes": disputes,
            "disputes_per_1000_visits": round(1000 * disputes / visits, 1) if visits else None,
            "escalation_rate_pct": round(100 * escalated / disputes) if disputes else None,
        },
        "facilities": facilities,
    }
