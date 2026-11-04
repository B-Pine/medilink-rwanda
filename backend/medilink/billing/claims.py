"""Monthly claim list per insurer (#203, upgrade 13 §3 W4).

For one insurer and one month of visits, every bill whose insurance was verified at the desk and
where the insurer owes something: member number, visit date, ICD-10 codes of the signed notes, the
services and items, the insurer and patient shares, and what the insurer did with the claim (paid
or rejected with a reason). The facility downloads it as CSV or PDF and sends it to the insurer;
electronic submission to RAMA or MMI waits for their interface (decision #40).

The list is built from the bills; an `InsuranceClaim` row only exists once a claim is marked.
"""

from __future__ import annotations

import csv
import datetime as dt
import io
from typing import Any

from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from medilink.audit.services import record
from medilink.billing.models import (
    Bill,
    BillLine,
    BillStatus,
    ClaimStatus,
    InsuranceClaim,
    InsurerRule,
    VerificationResult,
)
from medilink.core.exceptions import BusinessRuleViolation, Conflict
from medilink.onboarding.facility_report import safe_cell
from medilink.patients.errors import FieldRule

NOT_CLAIMABLE = _("This bill has no verified insurance share to claim.")
STALE = _("This claim was changed meanwhile. It was reloaded: check it and try again.")
NEED_REASON = _("Give the insurer's reason for the rejection.")
MIN_REASON = 5
DECISIONS = (ClaimStatus.PAID, ClaimStatus.REJECTED)


def month_range(month: str) -> tuple[dt.date, dt.date]:
    """First and last day of a `YYYY-MM` month."""
    first = dt.date.fromisoformat(f"{month}-01")
    following = (first.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
    return first, following - dt.timedelta(days=1)


def insurers(facility_id: Any) -> list[dict[str, str]]:
    """Insurers the facility accepts or has verified a card of, with their names."""
    from medilink.masterdata.models import Insurer

    codes = set(
        InsurerRule.objects.filter(facility_id=facility_id).values_list("insurer_code", flat=True)
    ) | set(
        Bill.objects.filter(facility_id=facility_id, insurance_status=VerificationResult.VERIFIED)
        .exclude(insurer_code="")
        .values_list("insurer_code", flat=True)
        .distinct()
    )
    names = dict(Insurer.objects.filter(code__in=codes).values_list("code", "name"))
    return [{"code": code, "name": names.get(code, code)} for code in sorted(codes)]


def claim_bills(facility_id: Any, insurer_code: str, month: str) -> QuerySet[Bill]:
    first, last = month_range(month)
    return (
        Bill.objects.filter(
            facility_id=facility_id,
            insurer_code=insurer_code,
            insurance_status=VerificationResult.VERIFIED,
            insurer_share_rwf__gt=0,
            visit__service_date__range=(first, last),
        )
        .exclude(status=BillStatus.VOIDED)
        .select_related("patient", "visit", "insurance_profile")
        .order_by("visit__service_date", "created_at")
    )


def _diagnoses(visit_ids: list[Any]) -> dict[Any, list[str]]:
    """ICD-10 codes of the visits' signed notes, the primary diagnosis first."""
    from medilink.clinical.models import ConsultationStatus, Diagnosis

    out: dict[Any, list[str]] = {}
    rows = (
        Diagnosis.objects.filter(
            consultation__visit_id__in=visit_ids,
            consultation__status=ConsultationStatus.SIGNED,
            code_system="icd10",
        )
        .order_by("consultation__visit_id", "rank", "created_at")
        .values_list("consultation__visit_id", "code")
    )
    for visit_id, code in rows:
        codes = out.setdefault(visit_id, [])
        if code not in codes:
            codes.append(code)
    return out


def _claim_of(bill: Bill, claims: dict[Any, InsuranceClaim]) -> InsuranceClaim | None:
    claim = claims.get(bill.pk)
    # a card verified again for another insurer starts a new claim
    return claim if claim is not None and claim.insurer_code == bill.insurer_code else None


def claim_rows(facility_id: Any, insurer_code: str, month: str) -> list[dict[str, Any]]:
    return rows_for(list(claim_bills(facility_id, insurer_code, month)))


def rows_for(bills: list[Bill]) -> list[dict[str, Any]]:
    """One claim-list row per bill (bills with patient, visit and insurance profile loaded)."""
    claims = {
        c.bill_id: c
        for c in InsuranceClaim.objects.filter(bill_id__in=[b.pk for b in bills]).select_related(
            "decided_by_membership__user"
        )
    }
    codes = _diagnoses([b.visit_id for b in bills])
    lines: dict[Any, list[dict[str, Any]]] = {}
    for line in BillLine.objects.filter(
        bill_id__in=[b.pk for b in bills], removed_at__isnull=True
    ).order_by("created_at"):
        lines.setdefault(line.bill_id, []).append(
            {
                "code": line.code,
                "name": line.name,
                "kind": line.kind,
                "quantity": line.quantity,
                "total_rwf": line.total_rwf,
                "insurer_share_rwf": line.insurer_share_rwf,
                "patient_share_rwf": line.patient_share_rwf,
                "is_covered": line.is_covered,
            }
        )
    rows = []
    for bill in bills:
        claim = _claim_of(bill, claims)
        decider = claim.decided_by_membership if claim else None
        rows.append(
            {
                "bill_id": bill.pk,
                "visit_id": bill.visit_id,
                "service_date": bill.visit.service_date,
                "patient_display_name": str(bill.patient.preferred_name or bill.patient.full_name),
                "member_number": (
                    bill.insurance_profile.member_number if bill.insurance_profile else ""
                ),
                "icd10_codes": codes.get(bill.visit_id, []),
                "lines": lines.get(bill.pk, []),
                "total_rwf": bill.total_rwf,
                "insurer_share_rwf": bill.insurer_share_rwf,
                "patient_share_rwf": bill.patient_share_rwf,
                "status": claim.status if claim else ClaimStatus.PENDING,
                "reason": claim.reason if claim else "",
                "reference": claim.reference if claim else "",
                "decided_by_name": str(decider.user.full_name) if decider else None,
                "decided_at": claim.decided_at if claim else None,
                "version": claim.version if claim else 0,
            }
        )
    return rows


def summary(rows: list[dict[str, Any]]) -> dict[str, int]:
    def by(status: str) -> list[dict[str, Any]]:
        return [r for r in rows if r["status"] == status]

    return {
        "count": len(rows),
        "total_rwf": sum(r["total_rwf"] for r in rows),
        "insurer_share_rwf": sum(r["insurer_share_rwf"] for r in rows),
        "patient_share_rwf": sum(r["patient_share_rwf"] for r in rows),
        "pending_count": len(by(ClaimStatus.PENDING)),
        "paid_count": len(by(ClaimStatus.PAID)),
        "paid_rwf": sum(r["insurer_share_rwf"] for r in by(ClaimStatus.PAID)),
        "rejected_count": len(by(ClaimStatus.REJECTED)),
        "rejected_rwf": sum(r["insurer_share_rwf"] for r in by(ClaimStatus.REJECTED)),
    }


# ---- marking ------------------------------------------------------------------------------------


def mark(
    bill_id: Any,
    *,
    status: str,
    reason: str,
    reference: str,
    version: int,
    membership: Any,
    request: Any,
) -> InsuranceClaim:
    """Record what the insurer did with a bill's claim: paid, or rejected with their reason. A
    claim can be marked again (a rejected claim sent again and paid); each change is audited."""
    if status not in DECISIONS:
        raise FieldRule("status", NOT_CLAIMABLE)
    reason = (reason or "").strip()[:300]
    if status == ClaimStatus.REJECTED and len(reason) < MIN_REASON:
        raise FieldRule("reason", NEED_REASON)
    with transaction.atomic():
        bill = Bill.objects.select_for_update(of=("self",)).get(pk=bill_id)
        if (
            bill.status == BillStatus.VOIDED
            or bill.insurance_status != VerificationResult.VERIFIED
            or bill.insurer_share_rwf <= 0
        ):
            raise BusinessRuleViolation(NOT_CLAIMABLE)
        claim = InsuranceClaim.objects.select_for_update().filter(bill=bill).first()
        current = claim.version if claim and claim.insurer_code == bill.insurer_code else 0
        if version != current:
            raise Conflict(STALE)
        before = (
            claim.status
            if claim and claim.insurer_code == bill.insurer_code
            else ClaimStatus.PENDING
        )
        if claim is None:
            claim = InsuranceClaim(facility_id=bill.facility_id, bill=bill, version=0)
        claim.insurer_code = bill.insurer_code
        claim.status = status
        claim.reason = reason
        claim.reference = (reference or "").strip()[:60]
        claim.decided_by_membership = membership
        claim.decided_at = timezone.now()
        claim.version = current + 1
        claim.save()
        record(
            "billing.claim.marked",
            request=request,
            facility_id=bill.facility_id,
            object_type="billing.insurance_claim",
            object_id=claim.pk,
            reason=reason,
            metadata={
                "bill_id": str(bill.pk),
                "insurer_code": bill.insurer_code,
                "from_status": before,
                "to_status": status,
                "insurer_share_rwf": bill.insurer_share_rwf,
            },
        )
    return claim


# ---- downloads --------------------------------------------------------------------------------

COLUMNS = (
    ("service_date", "Visit date"),
    ("member_number", "Member number"),
    ("patient_display_name", "Patient"),
    ("icd10_codes", "ICD-10"),
    ("lines", "Services and items"),
    ("total_rwf", "Total (RWF)"),
    ("insurer_share_rwf", "Insurer share (RWF)"),
    ("patient_share_rwf", "Patient share (RWF)"),
    ("status", "Status"),
    ("reason", "Reason"),
    ("reference", "Reference"),
)


def _lines_text(lines: list[dict[str, Any]]) -> str:
    return "; ".join(f"{x['code']} {x['name']} x{x['quantity']} = {x['total_rwf']}" for x in lines)


def _flat(row: dict[str, Any]) -> dict[str, str]:
    return {
        **{key: "" if row.get(key) is None else str(row[key]) for key, _l in COLUMNS},
        "service_date": row["service_date"].isoformat(),
        "icd10_codes": " ".join(row["icd10_codes"]),
        "lines": _lines_text(row["lines"]),
    }


def export_csv(rows: list[dict[str, Any]]) -> str:
    """The claim list as CSV (UTF-8 with BOM for spreadsheets, no formulas from data)."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow([label for _key, label in COLUMNS])
    for row in rows:
        flat = _flat(row)
        writer.writerow([safe_cell(flat[key]) for key, _l in COLUMNS])
    totals = summary(rows)
    writer.writerow(
        [
            "Total",
            "",
            "",
            "",
            f"{totals['count']} visits",
            totals["total_rwf"],
            totals["insurer_share_rwf"],
            totals["patient_share_rwf"],
            "",
            "",
            "",
        ]
    )
    return "﻿" + buffer.getvalue()


def export_pdf(
    rows: list[dict[str, Any]], *, facility_name: str, insurer: str, month: str
) -> bytes:
    """The claim list as a landscape A4 table (reportlab, as the clinical documents)."""
    from xml.sax.saxutils import escape

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    cell = ParagraphStyle("cell", fontName="Helvetica", fontSize=7.5, leading=9)
    head = ParagraphStyle("head", parent=cell, fontName="Helvetica-Bold")
    title = ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=14, leading=18)
    sub = ParagraphStyle("sub", fontName="Helvetica", fontSize=9, leading=12)

    def p(text: Any, style: ParagraphStyle = cell) -> Paragraph:
        return Paragraph(escape(str(text)), style)

    data: list[list[Any]] = [[p(label, head) for _k, label in COLUMNS]]
    for row in rows:
        flat = _flat(row)
        data.append([p(flat[key]) for key, _l in COLUMNS])
    totals = summary(rows)
    data.append(
        [
            p("Total", head),
            "",
            "",
            "",
            p(f"{totals['count']} visits", head),
            p(totals["total_rwf"], head),
            p(totals["insurer_share_rwf"], head),
            p(totals["patient_share_rwf"], head),
            "",
            "",
            "",
        ]
    )
    widths = [17, 22, 30, 16, 72, 16, 18, 18, 14, 26, 20]  # 269 mm between the margins
    table = Table(data, colWidths=[w * mm for w in widths], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, 0), 0.8, colors.HexColor("#14211d")),
                ("LINEBELOW", (0, 1), (-1, -2), 0.25, colors.HexColor("#c9d3cf")),
                ("LINEABOVE", (0, -1), (-1, -1), 0.8, colors.HexColor("#14211d")),
            ]
        )
    )
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title=f"Claims {insurer} {month}",
        creator="MediLink Rwanda",
    )
    doc.build(
        [
            p(f"{facility_name}: claims to {insurer}", title),
            p(f"Visits in {month}. Amounts in RWF.", sub),
            Spacer(1, 4 * mm),
            table,
        ]
    )
    return buffer.getvalue()
