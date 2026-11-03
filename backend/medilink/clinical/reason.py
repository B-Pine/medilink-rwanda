"""Reason for visit inside the consultation (upgrade 05 §3), and critical vitals flags.

The patient's own words (check-in reason, else the booking reason), the structured symptoms from
booking or check-in, and the care-navigation hint of the triage rules. The hint is an urgency and a
service, never a diagnosis (analysis 11 §1); rules not signed off say so.
"""

from __future__ import annotations

from typing import Any

from django.utils import timezone

from medilink.patients.crypto.fields import decrypt
from medilink.patients.normalize import age_years


def _patient_words(visit: Any) -> str:
    if visit.reason_encrypted:
        return decrypt(
            bytes(visit.reason_encrypted),
            table="visits_visit",
            column="reason_encrypted",
            row_id=visit.pk,
        )
    if visit.booking_id:
        from medilink.scheduling.models import Booking

        booking = Booking.objects.filter(pk=visit.booking_id).only("reason_encrypted").first()
        if booking is not None and booking.reason_encrypted:
            return decrypt(
                bytes(booking.reason_encrypted),
                table="scheduling_booking",
                column="reason_encrypted",
                row_id=booking.pk,
            )
    return ""


def _age_group(years: int | None) -> str:
    if years is None:
        return "adult"
    if years < 1:
        return "infant"
    if years < 13:
        return "child"
    if years < 18:
        return "teen"
    return "adult" if years < 65 else "older"


def _duration(days: list[int]) -> str:
    longest = max(days, default=0)
    return "today" if longest <= 1 else "days" if longest < 7 else "week"


def reason_for_visit(visit: Any, patient: Any) -> dict[str, Any]:
    from django.db.models import Q

    from medilink.masterdata.models import Symptom
    from medilink.triage import rules
    from medilink.visits.models import ReasonSymptom

    owner = Q(visit_id=visit.pk)
    if visit.booking_id:
        owner |= Q(booking_id=visit.booking_id)
    rows = list(ReasonSymptom.objects.filter(owner).order_by("created_at"))
    seen: set[str] = set()
    symptoms: list[dict[str, Any]] = []
    days: list[int] = []
    for r in rows:
        if r.symptom_code in seen:
            continue
        seen.add(r.symptom_code)
        days.append(r.duration_days or 0)
        symptoms.append(
            {
                "code": r.symptom_code,
                "label": r.symptom_label,
                "duration_days": r.duration_days,
                "severity": r.severity,
                "stage": r.captured_at_stage,
            }
        )
    hint = None
    if symptoms:
        answers = rules.Answers(
            symptoms=frozenset(seen),
            duration=_duration(days),
            age_group=_age_group(age_years(patient.date_of_birth, timezone.localdate())),
        )
        red = Symptom.objects.filter(is_red_flag=True, is_active=True).values_list(
            "code", flat=True
        )
        result = rules.triage(answers, set(red))
        hint = {
            "urgency": result.urgency,
            "service_code": result.service_code,
            "level_of_care": result.level_of_care,
            "red_flags": list(result.red_flags),
            "rules_version": rules.RULES_VERSION,
            "signed_off": rules.SIGNED_OFF,
        }
    return {"patient_words": _patient_words(visit), "symptoms": symptoms, "triage": hint}


# Adult thresholds for a red flag on screen (WHO/ETAT-style); the doctor decides, the flag only
# makes sure the number is not missed.
def vitals_flags(row: Any) -> list[str]:
    flags = []
    if row.spo2_pct is not None and row.spo2_pct < 92:
        flags.append("spo2_low")
    if row.systolic_mmhg is not None and row.systolic_mmhg >= 180:
        flags.append("bp_high")
    if row.diastolic_mmhg is not None and row.diastolic_mmhg >= 110 and "bp_high" not in flags:
        flags.append("bp_high")
    if row.systolic_mmhg is not None and row.systolic_mmhg < 90:
        flags.append("bp_low")
    if row.temperature_c is not None and row.temperature_c >= 39.5:
        flags.append("temp_high")
    if row.temperature_c is not None and row.temperature_c < 35:
        flags.append("temp_low")
    if row.pulse_bpm is not None and row.pulse_bpm > 120:
        flags.append("pulse_high")
    if row.pulse_bpm is not None and row.pulse_bpm < 50:
        flags.append("pulse_low")
    if row.respiratory_rate is not None and row.respiratory_rate > 30:
        flags.append("rr_high")
    return flags
