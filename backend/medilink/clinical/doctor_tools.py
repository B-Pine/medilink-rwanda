"""Doctor tools (upgrade 05 §3): pharmacy questions, my follow-ups, my activity, my templates.

Every function is scoped to one clinician at one facility. Questions and follow-ups name the
patient (the doctor already treats them); activity is counts only.
"""

from __future__ import annotations

import datetime as dt
from collections import Counter
from typing import Any

from django.db import transaction
from django.db.models import Count
from django.utils import timezone, translation

from medilink.clinical import services
from medilink.clinical.models import Consultation, ConsultationStatus, Diagnosis
from medilink.core.exceptions import BusinessRuleViolation
from medilink.masterdata.models import DiagnosisCode
from medilink.pharmacy import services as pharmacy
from medilink.pharmacy.models import (
    ItemStatus,
    PrescriptionItem,
    PrescriptionQuery,
    PrescriptionStatus,
    QueryStatus,
)
from medilink.scheduling.models import BookingStatus, FollowUp, FollowUpStatus
from medilink.visits.models import Stage, Ticket

ANSWER_REASON = "Answer to the pharmacy question"
NOT_YOUR_PATIENT = "not_your_prescription: only the prescriber answers this question."
OPEN_FOLLOW_UP = (FollowUpStatus.BOOKED, FollowUpStatus.DUE, FollowUpStatus.NO_SLOT)
UPCOMING_DAYS = 14


def _name(patient: Any) -> str:
    return str(patient.preferred_name or patient.full_name)


# ---- pharmacy questions --------------------------------------------------------------------


def question_data(q: PrescriptionQuery) -> dict[str, Any]:
    p = q.prescription
    return {
        "id": q.pk,
        "status": q.status,
        "message": pharmacy.query_message(q),
        "raised_by_name": q.raised_by_membership.user.full_name,
        "raised_at": q.created_at,
        "answered_at": q.answered_at,
        "prescription_id": p.pk,
        "consultation_id": p.consultation_id,
        "facility_patient_id": p.facility_patient_id,
        "patient_display_name": _name(p.patient),
        "items": [item.drug_display or item.free_text_drug for item in p.items.all()],
    }


def questions(facility_id: Any, membership_id: Any, status: str) -> list[dict[str, Any]]:
    rows = (
        PrescriptionQuery.objects.filter(
            facility_id=facility_id, prescription__prescriber_membership_id=membership_id
        )
        .select_related("prescription__patient", "raised_by_membership__user")
        .prefetch_related("prescription__items")
    )
    if status == "open":
        rows = rows.filter(status=QueryStatus.OPEN).order_by("created_at")
    else:
        rows = rows.exclude(status=QueryStatus.OPEN).order_by("-created_at")[:50]
    return [question_data(q) for q in rows]


def reply(query_id: Any, *, membership: Any, body: str, request: Any) -> PrescriptionQuery:
    """Answer in one step: a signed addendum on the consultation, linked to the question."""
    with transaction.atomic():
        query = (
            PrescriptionQuery.objects.select_for_update()
            .select_related("prescription")
            .get(pk=query_id)
        )
        if query.prescription.prescriber_membership_id != membership.pk:
            raise BusinessRuleViolation(NOT_YOUR_PATIENT)
        addendum = services.add_addendum(
            query.prescription.consultation_id,
            membership=membership,
            reason=ANSWER_REASON,
            body=body,
            request=request,
        )
        return pharmacy.answer_query(query.pk, addendum_id=addendum.pk, request=request)


# ---- follow-ups -----------------------------------------------------------------------------


def _follow_up_state(f: FollowUp, today: dt.date) -> str:
    if f.booking is not None and f.booking.status == BookingStatus.CHECKED_IN:
        return "attended"
    if f.status == FollowUpStatus.DONE:
        return "attended"
    if f.booking is not None and f.booking.status == BookingStatus.NO_SHOW:
        return "missed"
    if f.status in OPEN_FOLLOW_UP and f.due_on < today:
        return "missed"
    if f.due_on == today:
        return "today"
    return "upcoming"


def follow_ups(facility_id: Any, membership_id: Any) -> list[dict[str, Any]]:
    today = timezone.localdate()
    rows = (
        FollowUp.objects.filter(
            facility_id=facility_id,
            membership_id=membership_id,
            due_on__gte=today - dt.timedelta(days=30),
            due_on__lte=today + dt.timedelta(days=UPCOMING_DAYS),
        )
        .exclude(status=FollowUpStatus.CANCELLED)
        .select_related("patient", "service", "booking", "visit")
        .order_by("due_on")
    )
    return [
        {
            "id": f.pk,
            "patient_display_name": _name(f.patient),
            "facility_patient_id": f.visit.facility_patient_id,
            "service_name_i18n": f.service.name_i18n,
            "due_on": f.due_on,
            "mode": f.mode,
            "status": f.status,
            "state": _follow_up_state(f, today),
            "booking_starts_at": f.booking.starts_at if f.booking is not None else None,
            "consultation_id": f.consultation_id,
        }
        for f in rows
    ]


# ---- activity -------------------------------------------------------------------------------


def activity(facility_id: Any, membership_id: Any, days: int) -> dict[str, Any]:
    today = timezone.localdate()
    since = today - dt.timedelta(days=days - 1)
    per_day = {since + dt.timedelta(days=i): {"seen": 0, "signed": 0} for i in range(days)}
    durations: list[float] = []
    for day, started, ended in Ticket.objects.filter(
        facility_id=facility_id,
        assigned_membership_id=membership_id,
        stage=Stage.CONSULTATION,
        service_date__gte=since,
        started_at__isnull=False,
        ended_at__isnull=False,
    ).values_list("service_date", "started_at", "ended_at"):
        if day in per_day:
            per_day[day]["seen"] += 1
        if started is not None and ended is not None:
            durations.append((ended - started).total_seconds() / 60)
    mine = Consultation.objects.filter(facility_id=facility_id, author_membership_id=membership_id)
    for signed_at in mine.filter(
        status=ConsultationStatus.SIGNED, signed_at__date__gte=since
    ).values_list("signed_at", flat=True):
        if signed_at is not None and (signed := timezone.localdate(signed_at)) in per_day:
            per_day[signed]["signed"] += 1
    codes = Counter(
        Diagnosis.objects.filter(
            consultation__in=mine.filter(started_at__date__gte=since).exclude(
                status=ConsultationStatus.ENTERED_IN_ERROR
            ),
        ).values_list("code", "display")
    )
    late = mine.filter(
        status=ConsultationStatus.SIGNED, is_late_entry=True, signed_at__date__gte=since
    )
    return {
        "days": days,
        "seen": sum(d["seen"] for d in per_day.values()),
        "signed": sum(d["signed"] for d in per_day.values()),
        "avg_consult_min": round(sum(durations) / len(durations)) if durations else None,
        "late_signatures": late.count(),
        "unsigned_now": mine.filter(status=ConsultationStatus.DRAFT).count(),
        "follow_ups_set": FollowUp.objects.filter(
            facility_id=facility_id,
            membership_id=membership_id,
            created_at__date__gte=since,
        ).count(),
        "trend": [
            {"date": day, "seen": v["seen"], "signed": v["signed"]}
            for day, v in sorted(per_day.items())
        ],
        "top_diagnoses": [
            {"code": code, "display": display, "count": n}
            for (code, display), n in codes.most_common(6)
        ],
    }


# ---- quick note: order sets and favourites (W3, #202) ---------------------------------------

FAVOURITE_DAYS = 180
FAVOURITE_LIMIT = 8
FAVOURITE_MIN_USES = 2


def _language() -> str:
    lang = (translation.get_language() or "rw")[:2]
    return lang if lang in ("rw", "en", "fr") else "rw"


def _pick(values: dict[str, Any] | None, lang: str) -> str:
    values = values or {}
    return str(values.get(lang) or values.get("en") or next(iter(values.values()), "") or "")


def diagnosis_labels(codes: list[str]) -> dict[str, dict[str, Any]]:
    """Active ICD-10 codes with their title and plain words in the request language.

    A code missing here cannot be saved on a consultation, so an order set reports it as
    skipped instead of failing the autosave.
    """
    lang = _language()
    return {
        row.code: {
            "code": row.code,
            "display": _pick(row.title_i18n, lang) or row.code,
            "plain_language": _pick(row.plain_language_i18n, lang),
            "is_sensitive": row.is_sensitive,
        }
        for row in DiagnosisCode.objects.filter(
            code_system="icd10", code__in=[c.upper() for c in codes], is_active=True
        )
    }


def favourites(facility_id: Any, membership_id: Any) -> dict[str, Any]:
    """The doctor's most used diagnoses and medicines here, derived from their own work.

    Diagnoses come from their signed consultations, medicines from their issued prescriptions
    (cancelled lines left out), over the last FAVOURITE_DAYS days and used at least
    FAVOURITE_MIN_USES times. Nothing is stored: the list follows how they practise. Sensitive
    diagnoses are left out so they never show as a shortcut on another patient's screen.
    Each medicine carries the dosing of its latest use, to prefill the form.
    """
    since = timezone.now() - dt.timedelta(days=FAVOURITE_DAYS)
    top_codes = list(
        Diagnosis.objects.filter(
            facility_id=facility_id,
            consultation__author_membership_id=membership_id,
            consultation__status=ConsultationStatus.SIGNED,
            consultation__signed_at__gte=since,
        )
        .values("code")
        .annotate(n=Count("id"))
        .filter(n__gte=FAVOURITE_MIN_USES)
        .order_by("-n", "code")
        .values_list("code", "n")[: FAVOURITE_LIMIT * 2]
    )
    labels = diagnosis_labels([code for code, _ in top_codes])
    diagnoses = [
        {**labels[code], "count": n}
        for code, n in top_codes
        if code in labels and not labels[code]["is_sensitive"]
    ][:FAVOURITE_LIMIT]

    mine = (
        PrescriptionItem.objects.filter(
            facility_id=facility_id,
            prescription__prescriber_membership_id=membership_id,
            created_at__gte=since,
        )
        .exclude(prescription__status=PrescriptionStatus.DRAFT)
        .exclude(status=ItemStatus.CANCELLED)
    )
    top_drugs = list(
        mine.values("drug_code", "free_text_drug")
        .annotate(n=Count("id"))
        .filter(n__gte=FAVOURITE_MIN_USES)
        .order_by("-n", "drug_code", "free_text_drug")[:FAVOURITE_LIMIT]
    )
    unavailable = pharmacy.unavailable_codes(
        facility_id, [row["drug_code"] for row in top_drugs if row["drug_code"]]
    )
    medicines = []
    for row in top_drugs:
        latest = (
            mine.filter(drug_code=row["drug_code"], free_text_drug=row["free_text_drug"])
            .order_by("-created_at")
            .first()
        )
        if latest is None:
            continue
        medicines.append(
            {
                "drug_code": latest.drug_code,
                "free_text_drug": latest.free_text_drug,
                "drug_display": latest.drug_display,
                "is_controlled": latest.is_controlled,
                "available_here": not latest.drug_code or latest.drug_code not in unavailable,
                "dose": latest.dose,
                "frequency_code": latest.frequency_code,
                "route": latest.route,
                "duration_days": latest.duration_days,
                "count": row["n"],
            }
        )
    return {"window_days": FAVOURITE_DAYS, "diagnoses": diagnoses, "medicines": medicines}
