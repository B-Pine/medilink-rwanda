"""Facility report (#205, upgrade 13 W6): how the facility ran over a period, by day, week or
month. Built from existing tables; aggregates only, never a patient name. Sensitive diagnoses
are counted, never named. Each table also downloads as CSV."""

from __future__ import annotations

import csv
import datetime as dt
import io
import statistics
from collections import Counter, defaultdict
from typing import Any

from django.db.models import Count, Min, Sum

from medilink.onboarding.facility_report import safe_cell
from medilink.visits.models import Stage, Ticket, TicketEvent, TicketState, Visit, VisitStatus

MAX_DAYS = 366
GROUPS = ("day", "week", "month")
TABLES = ("visits", "sources", "services", "waits", "diagnoses", "money", "lab", "stock")
TOP = 10
STAGE_ORDER = [
    Stage.RECEPTION,
    Stage.TRIAGE,
    Stage.CONSULTATION,
    Stage.LAB,
    Stage.PAYMENT,
    Stage.PHARMACY,
]


def _minutes(delta: dt.timedelta) -> float:
    return delta.total_seconds() / 60


def _median(values: list[float]) -> int | None:
    return round(statistics.median(values)) if values else None


def _p90(values: list[float]) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    return round(ordered[min(len(ordered) - 1, int(0.9 * len(ordered)))])


def bucket(day: dt.date, group: str) -> dt.date:
    """First day of the day, ISO week (Monday) or month that holds `day`."""
    if group == "week":
        return day - dt.timedelta(days=day.weekday())
    if group == "month":
        return day.replace(day=1)
    return day


def buckets(start: dt.date, end: dt.date, group: str) -> list[dt.date]:
    out: list[dt.date] = []
    day = start
    while day <= end:
        first = bucket(day, group)
        if not out or out[-1] != first:
            out.append(first)
        day += dt.timedelta(days=1)
    return out


# ---- visits ------------------------------------------------------------------------------------


def _visits(facility_id: Any, start: dt.date, end: dt.date, group: str) -> dict[str, Any]:
    from medilink.scheduling.models import Booking, BookingStatus

    visits = Visit.objects.filter(
        facility_id=facility_id, service_date__gte=start, service_date__lte=end
    ).exclude(status=VisitStatus.CANCELLED)
    rows: dict[dt.date, dict[str, Any]] = {
        b: {
            "start": b,
            "patients": 0,
            "completed": 0,
            "left_without_service": 0,
            "emergencies": 0,
            "no_shows": 0,
        }
        for b in buckets(start, end, group)
    }
    for day, status, emergency in visits.values_list("service_date", "status", "is_emergency"):
        row = rows[bucket(day, group)]
        row["patients"] += 1
        row["completed"] += status == VisitStatus.COMPLETED
        row["left_without_service"] += status == VisitStatus.LEFT_WITHOUT_SERVICE
        row["emergencies"] += bool(emergency)

    bookings = Booking.objects.filter(
        facility_id=facility_id, service_date__gte=start, service_date__lte=end
    )
    for day in bookings.filter(status=BookingStatus.NO_SHOW).values_list("service_date", flat=True):
        rows[bucket(day, group)]["no_shows"] += 1
    expected = bookings.filter(
        status__in=[BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.NO_SHOW]
    ).count()
    no_shows = sum(r["no_shows"] for r in rows.values())

    sources = Counter(visits.values_list("source", flat=True))
    services = (
        visits.filter(first_service__isnull=False)
        .values("first_service_id", "first_service__name_i18n")
        .annotate(n=Count("id"))
        .order_by("-n")
    )
    periods = list(rows.values())
    return {
        "periods": periods,
        "totals": {
            "patients": sum(r["patients"] for r in periods),
            "completed": sum(r["completed"] for r in periods),
            "left_without_service": sum(r["left_without_service"] for r in periods),
            "emergencies": sum(r["emergencies"] for r in periods),
            "bookings_expected": expected,
            "no_shows": no_shows,
            "no_show_rate_pct": round(100 * no_shows / expected) if expected else None,
        },
        "by_source": [{"source": source, "count": n} for source, n in sources.most_common() if n],
        "by_service": [
            {
                "service_id": r["first_service_id"],
                "name_i18n": r["first_service__name_i18n"],
                "count": r["n"],
            }
            for r in services
        ],
    }


# ---- waits -------------------------------------------------------------------------------------


def wait_samples(
    facility_id: Any, start: dt.date, end: dt.date
) -> list[tuple[dt.date, str, float]]:
    """(service day, stage, minutes) per called ticket: from when the patient was in that queue
    (the later of joining it and arriving on site) to the first call (analysis 13 §1). The first
    `call` event is kept: a recall or no response moves `called_at`. In the facility's RLS
    context; the national report (W9) pools these across facilities."""
    tickets = Ticket.objects.filter(
        facility_id=facility_id, service_date__gte=start, service_date__lte=end
    )
    first_calls = (
        TicketEvent.objects.filter(facility_id=facility_id, action="call", ticket__in=tickets)
        .values(
            "ticket_id",
            "ticket__stage",
            "ticket__service_date",
            "ticket__arrival_at",
            "ticket__visit__checked_in_at",
        )
        .annotate(first=Min("occurred_at"))
    )
    out: list[tuple[dt.date, str, float]] = []
    for row in first_calls:
        on_site = row["ticket__visit__checked_in_at"]
        if on_site is None:
            continue
        since = max(row["ticket__arrival_at"], on_site)
        minutes = max(0.0, _minutes(row["first"] - since))
        out.append((row["ticket__service_date"], row["ticket__stage"], minutes))
    return out


def median(values: list[float]) -> int | None:
    return _median(values)


def p90(values: list[float]) -> int | None:
    return _p90(values)


def _waits(facility_id: Any, start: dt.date, end: dt.date) -> list[dict[str, Any]]:
    """Wait per stage (see `wait_samples`)."""
    tickets = Ticket.objects.filter(
        facility_id=facility_id, service_date__gte=start, service_date__lte=end
    )
    waits: dict[str, list[float]] = defaultdict(list)
    for _day, stage, minutes in wait_samples(facility_id, start, end):
        waits[stage].append(minutes)
    issued = Counter(tickets.values_list("stage", flat=True))
    left = Counter(
        tickets.filter(state=TicketState.LEFT_WITHOUT_SERVICE).values_list("stage", flat=True)
    )
    return [
        {
            "stage": stage,
            "tickets": issued[stage],
            "called": len(waits[stage]),
            "median_wait_min": _median(waits[stage]),
            "p90_wait_min": _p90(waits[stage]),
            "left_without_service": left[stage],
        }
        for stage in STAGE_ORDER
        if issued[stage]
    ]


# ---- diagnoses and referrals ---------------------------------------------------------------------


def _diagnoses(facility_id: Any, start: dt.date, end: dt.date) -> dict[str, Any]:
    from medilink.clinical.models import ConsultationStatus, Diagnosis
    from medilink.documents.models import Referral

    signed = Diagnosis.objects.filter(
        facility_id=facility_id,
        consultation__status=ConsultationStatus.SIGNED,
        consultation__visit__service_date__gte=start,
        consultation__visit__service_date__lte=end,
    )
    top = (
        signed.filter(is_sensitive=False)
        .values("code")
        .annotate(n=Count("id"), display=Min("display"))
        .order_by("-n", "code")[:TOP]
    )
    referrals = Referral.objects.filter(
        facility_id=facility_id,
        signed_at__isnull=False,
        consultation__visit__service_date__gte=start,
        consultation__visit__service_date__lte=end,
    )
    return {
        "signed_with_diagnosis": signed.values("consultation_id").distinct().count(),
        "sensitive_count": signed.filter(is_sensitive=True).count(),
        "top": [{"code": r["code"], "display": r["display"], "count": r["n"]} for r in top],
        "referrals_out": referrals.count(),
        "referrals_by_specialty": [
            {"specialty": r["specialty"], "count": r["n"]}
            for r in referrals.values("specialty").annotate(n=Count("id")).order_by("-n")[:TOP]
        ],
    }


# ---- money -------------------------------------------------------------------------------------


def _money(facility_id: Any, start: dt.date, end: dt.date) -> dict[str, Any]:
    from medilink.billing.models import (
        Bill,
        BillStatus,
        CreditNote,
        Exemption,
        Payment,
        PaymentStatus,
        RefundPayout,
        VerificationResult,
    )
    from medilink.masterdata.models import Insurer

    payments = Payment.objects.filter(
        facility_id=facility_id, received_at__date__gte=start, received_at__date__lte=end
    )
    recorded = payments.filter(status=PaymentStatus.RECORDED)
    by_method = recorded.values("method").annotate(n=Count("id"), total=Sum("amount_rwf"))
    voided = payments.filter(status=PaymentStatus.VOIDED).aggregate(
        n=Count("id"), total=Sum("amount_rwf")
    )
    bills = Bill.objects.filter(
        facility_id=facility_id, visit__service_date__gte=start, visit__service_date__lte=end
    )
    insured = (
        bills.exclude(status=BillStatus.VOIDED)
        .filter(insurance_status=VerificationResult.VERIFIED)
        .exclude(insurer_code="")
        .values("insurer_code")
        .annotate(
            n=Count("id"),
            insurer=Sum("insurer_share_rwf"),
            patient=Sum("patient_share_rwf"),
        )
        .order_by("-insurer")
    )
    names = dict(
        Insurer.objects.filter(code__in=[r["insurer_code"] for r in insured]).values_list(
            "code", "name"
        )
    )
    exemptions = Exemption.objects.filter(
        facility_id=facility_id, applied_at__date__gte=start, applied_at__date__lte=end
    )
    credits = CreditNote.objects.filter(
        facility_id=facility_id, issued_at__date__gte=start, issued_at__date__lte=end
    ).aggregate(n=Count("id"), total=Sum("amount_rwf"))
    payouts = RefundPayout.objects.filter(
        facility_id=facility_id, paid_at__date__gte=start, paid_at__date__lte=end
    ).aggregate(total=Sum("amount_rwf"))
    return {
        "collected_rwf": recorded.aggregate(n=Sum("amount_rwf"))["n"] or 0,
        "billed_rwf": bills.exclude(status=BillStatus.VOIDED).aggregate(n=Sum("total_rwf"))["n"]
        or 0,
        "by_method": [
            {"method": r["method"], "count": r["n"], "amount_rwf": r["total"] or 0}
            for r in by_method.order_by("-total")
        ],
        "by_insurer": [
            {
                "insurer_code": r["insurer_code"],
                "insurer_name": names.get(r["insurer_code"], r["insurer_code"]),
                "bills": r["n"],
                "insurer_share_rwf": r["insurer"] or 0,
                "patient_share_rwf": r["patient"] or 0,
            }
            for r in insured
        ],
        "exemptions": [
            {"reason": r["reason_code"], "count": r["n"], "amount_rwf": r["total"] or 0}
            for r in exemptions.values("reason_code")
            .annotate(n=Count("id"), total=Sum("amount_rwf"))
            .order_by("-total")
        ],
        "voided_payments": {"count": voided["n"] or 0, "amount_rwf": voided["total"] or 0},
        "voided_bills": bills.filter(status=BillStatus.VOIDED).count(),
        "credit_notes": {"count": credits["n"] or 0, "amount_rwf": credits["total"] or 0},
        "refunds_paid_rwf": payouts["total"] or 0,
    }


# ---- laboratory --------------------------------------------------------------------------------


def _lab(facility_id: Any, start: dt.date, end: dt.date) -> dict[str, Any]:
    from medilink.clinical.models import LabOrder, LabOrderState

    ordered = LabOrder.objects.filter(
        facility_id=facility_id, ordered_at__date__gte=start, ordered_at__date__lte=end
    )
    done = ordered.filter(resulted_at__isnull=False)
    by_test: dict[str, dict[str, Any]] = {}
    all_turnaround: list[float] = []
    for code, name, at, resulted, abnormal in done.values_list(
        "test_code", "test_name", "ordered_at", "resulted_at", "is_abnormal"
    ):
        if resulted is None:
            continue
        row = by_test.setdefault(code, {"code": code, "name": name, "minutes": [], "abnormal": 0})
        minutes = _minutes(resulted - at)
        row["minutes"].append(minutes)
        row["abnormal"] += bool(abnormal)
        all_turnaround.append(minutes)
    tests = sorted(by_test.values(), key=lambda r: (-len(r["minutes"]), r["code"]))
    return {
        "ordered": ordered.exclude(state=LabOrderState.CANCELLED).count(),
        "cancelled": ordered.filter(state=LabOrderState.CANCELLED).count(),
        "resulted": done.count(),
        "waiting": ordered.filter(
            state__in=[LabOrderState.ORDERED, LabOrderState.SAMPLE_TAKEN]
        ).count(),
        "median_turnaround_min": _median(all_turnaround),
        "p90_turnaround_min": _p90(all_turnaround),
        "by_test": [
            {
                "code": r["code"],
                "name": r["name"],
                "count": len(r["minutes"]),
                "abnormal": r["abnormal"],
                "median_turnaround_min": _median(r["minutes"]),
            }
            for r in tests[:TOP]
        ],
    }


# ---- stock -------------------------------------------------------------------------------------


def _stock(facility_id: Any, start: dt.date, end: dt.date) -> dict[str, Any]:
    """Levels are now (stock has no history of levels); movements are for the period."""
    from medilink.pharmacy import stock
    from medilink.pharmacy.models import MovementKind, StockMovement

    cards = list(stock.cards(facility_id))
    out = [c for c in cards if stock.level(int(c.on_hand or 0), c.low_stock_threshold) == "out"]
    low = [c for c in cards if stock.level(int(c.on_hand or 0), c.low_stock_threshold) == "low"]
    moved = dict(
        StockMovement.objects.filter(
            facility_id=facility_id, occurred_at__date__gte=start, occurred_at__date__lte=end
        )
        .values("kind")
        .annotate(total=Sum("quantity"))
        .values_list("kind", "total")
    )
    expiring = list(stock.expiring(facility_id))
    return {
        "tracked": len(cards),
        "out_now": len(out),
        "low_now": len(low),
        "out_medicines": sorted(stock.drug_display(c.drug) for c in out)[: TOP * 2],
        "received_units": int(moved.get(MovementKind.RECEIVED) or 0),
        "dispensed_units": abs(int(moved.get(MovementKind.DISPENSED) or 0)),
        "adjusted_units": int(moved.get(MovementKind.ADJUSTED) or 0),
        "expiring": [
            {
                "drug_code": b.stock_item.drug.code,
                "display": stock.drug_display(b.stock_item.drug),
                "batch_number": b.batch_number,
                "expiry_date": b.expiry_date,
                "quantity_on_hand": b.quantity_on_hand,
                "is_expired": b.expiry_date < stock.today(),
            }
            for b in expiring[: TOP * 2]
        ],
        "expiring_window_days": stock.EXPIRING_DAYS,
    }


def facility_report(facility_id: Any, start: dt.date, end: dt.date, group: str) -> dict[str, Any]:
    """In the facility's RLS context (the view's)."""
    return {
        "from": start,
        "to": end,
        "group": group,
        "visits": _visits(facility_id, start, end, group),
        "waits": _waits(facility_id, start, end),
        "diagnoses": _diagnoses(facility_id, start, end),
        "money": _money(facility_id, start, end),
        "lab": _lab(facility_id, start, end),
        "stock": _stock(facility_id, start, end),
    }


# ---- CSV ---------------------------------------------------------------------------------------


def _name(name_i18n: Any) -> str:
    if isinstance(name_i18n, dict):
        return str(name_i18n.get("en") or next(iter(name_i18n.values()), ""))
    return str(name_i18n or "")


def table_rows(report: dict[str, Any], table: str) -> list[list[Any]]:
    """One report table as rows, the header first. English headings, like the claim list."""
    v, m, lab, st = report["visits"], report["money"], report["lab"], report["stock"]
    if table == "visits":
        head = ["Period start", "Patients", "Completed", "Left without service"]
        head += ["Emergencies", "No-shows"]
        return [head] + [
            [
                p["start"].isoformat(),
                p["patients"],
                p["completed"],
                p["left_without_service"],
                p["emergencies"],
                p["no_shows"],
            ]
            for p in v["periods"]
        ]
    if table == "sources":
        return [["Source", "Patients"]] + [[r["source"], r["count"]] for r in v["by_source"]]
    if table == "services":
        return [["Service", "Patients"]] + [
            [_name(r["name_i18n"]), r["count"]] for r in v["by_service"]
        ]
    if table == "waits":
        head = ["Stage", "Tickets", "Called", "Median wait (min)", "90th percentile (min)"]
        return [[*head, "Left without service"]] + [
            [
                r["stage"],
                r["tickets"],
                r["called"],
                r["median_wait_min"],
                r["p90_wait_min"],
                r["left_without_service"],
            ]
            for r in report["waits"]
        ]
    if table == "diagnoses":
        d = report["diagnoses"]
        rows: list[list[Any]] = [["ICD-10", "Diagnosis", "Visits"]]
        rows += [[r["code"], r["display"], r["count"]] for r in d["top"]]
        rows += [["", "Sensitive diagnoses (not named)", d["sensitive_count"]]]
        rows += [[], ["Referral specialty", "", "Referrals out"]]
        rows += [[r["specialty"], "", r["count"]] for r in d["referrals_by_specialty"]]
        return rows
    if table == "money":
        rows = [["Payment method", "Payments", "Amount (RWF)"]]
        rows += [[r["method"], r["count"], r["amount_rwf"]] for r in m["by_method"]]
        rows += [["Total collected", "", m["collected_rwf"]], []]
        rows += [["Insurer", "Bills", "Insurer share (RWF)", "Patient share (RWF)"]]
        rows += [
            [r["insurer_name"], r["bills"], r["insurer_share_rwf"], r["patient_share_rwf"]]
            for r in m["by_insurer"]
        ]
        rows += [[], ["Exemption reason", "Exemptions", "Amount (RWF)"]]
        rows += [[r["reason"], r["count"], r["amount_rwf"]] for r in m["exemptions"]]
        rows += [
            [],
            ["Voided payments", m["voided_payments"]["count"], m["voided_payments"]["amount_rwf"]],
            ["Voided bills", m["voided_bills"], ""],
            ["Credit notes", m["credit_notes"]["count"], m["credit_notes"]["amount_rwf"]],
            ["Refunds paid", "", m["refunds_paid_rwf"]],
        ]
        return rows
    if table == "lab":
        rows = [["Test code", "Test", "Resulted", "Abnormal", "Median turnaround (min)"]]
        rows += [
            [r["code"], r["name"], r["count"], r["abnormal"], r["median_turnaround_min"]]
            for r in lab["by_test"]
        ]
        rows += [["All tests", "", lab["resulted"], "", lab["median_turnaround_min"]]]
        return rows
    rows = [["Medicine", "Batch", "Expiry date", "Units left", "Expired"]]
    rows += [
        [
            r["display"],
            r["batch_number"],
            r["expiry_date"].isoformat(),
            r["quantity_on_hand"],
            "yes" if r["is_expired"] else "no",
        ]
        for r in st["expiring"]
    ]
    rows += [[], ["Out of stock now", st["out_now"]], ["Low on stock now", st["low_now"]]]
    rows += [["Units received", st["received_units"]], ["Units dispensed", st["dispensed_units"]]]
    return rows


def export_csv(report: dict[str, Any], table: str) -> str:
    """UTF-8 with BOM for spreadsheets; text cells never start a formula."""
    return csv_text(table_rows(report, table))


def csv_text(rows: list[list[Any]]) -> str:
    """Rows as CSV: UTF-8 with BOM, CRLF, text cells never start a formula (also W9)."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    for row in rows:
        writer.writerow(
            [
                ""
                if cell is None
                else cell
                if isinstance(cell, int) and not isinstance(cell, bool)
                else safe_cell(str(cell))
                for cell in row
            ]
        )
    return "﻿" + buffer.getvalue()


# ---- period ------------------------------------------------------------------------------------


def parse_period(params: Any, today: dt.date) -> tuple[dt.date, dt.date, str]:
    """`from`, `to` (YYYY-MM-DD; the last 30 days by default) and `group` from query params.
    Raises ValidationError with every problem at once (also the national report, W9)."""
    from rest_framework import exceptions

    problems: dict[str, list[str]] = {}

    def day(name: str, default: dt.date) -> dt.date:
        raw = str(params.get(name, "") or "").strip()
        if not raw:
            return default
        try:
            return dt.date.fromisoformat(raw)
        except ValueError:
            problems[name] = ["Use YYYY-MM-DD."]
            return default

    end = day("to", today)
    start = day("from", end - dt.timedelta(days=29))
    group = str(params.get("group", "day") or "day").strip() or "day"
    if group not in GROUPS:
        problems["group"] = ["Use day, week or month."]
    if start > end:
        problems["from"] = ["The first day comes after the last day."]
    elif (end - start).days + 1 > MAX_DAYS:
        problems["from"] = [f"Choose at most {MAX_DAYS} days."]
    if end > today:
        problems["to"] = ["The last day can't be in the future."]
    if problems:
        raise exceptions.ValidationError(problems)
    return start, end, group
