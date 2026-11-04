"""Pharmacist workspace (upgrade 05 §4): Pharmacist Today and the dispensing history.

Counts for the day, then a history of dispensings with the outcome per line. Names are short
(first name and initial), as on the queue; no diagnosis, no notes, no amounts.
"""

from __future__ import annotations

import datetime as dt
from collections import Counter
from typing import Any

from django.db.models import Q
from django.utils import timezone

from medilink.patients.models import Patient
from medilink.pharmacy import stock
from medilink.pharmacy.models import (
    DispenseLine,
    DispenseOutcome,
    DispenseRecord,
    Prescription,
    PrescriptionQuery,
    PrescriptionStatus,
    QueryStatus,
)
from medilink.pharmacy.services import unavailable_codes
from medilink.visits.views import short_name


def _name(patient: Patient) -> str:
    return short_name(patient.preferred_name or patient.full_name)


def my_day(facility_id: Any, membership_id: Any) -> dict[str, Any]:
    today = timezone.localdate()
    records = DispenseRecord.objects.filter(facility_id=facility_id, signed_at__date=today)
    lines = Counter(
        DispenseLine.objects.filter(dispense_record__in=records).values_list("outcome", flat=True)
    )
    prescriptions = Prescription.objects.filter(facility_id=facility_id)
    return {
        "date": today,
        "ready": prescriptions.filter(status=PrescriptionStatus.READY).count(),
        "partly": prescriptions.filter(status=PrescriptionStatus.PARTLY).count(),
        "questions_open": PrescriptionQuery.objects.filter(
            facility_id=facility_id, status=QueryStatus.OPEN
        ).count(),
        "questions_answered": PrescriptionQuery.objects.filter(
            facility_id=facility_id, status=QueryStatus.ANSWERED
        ).count(),
        "dispensed_today": records.count(),
        "dispensed_by_me": records.filter(pharmacist_membership_id=membership_id).count(),
        "not_available_today": lines.get(DispenseOutcome.NOT_AVAILABLE, 0),
        "substituted_today": lines.get(DispenseOutcome.SUBSTITUTED, 0),
        "out_of_stock": len(unavailable_codes(facility_id)),
        **stock.counts(facility_id),  # W5: low_stock, expiring_soon
        "updated_at": timezone.now(),
    }


def history(facility_id: Any, *, days: int, mine_of: Any | None, q: str) -> list[dict[str, Any]]:
    since = timezone.localdate() - dt.timedelta(days=days - 1)
    rows = (
        DispenseRecord.objects.filter(facility_id=facility_id, signed_at__date__gte=since)
        .select_related("prescription__patient", "pharmacist_membership__user")
        .prefetch_related("lines__prescription_item")
        .order_by("-signed_at")
    )
    if mine_of is not None:
        rows = rows.filter(pharmacist_membership_id=mine_of)
    if q:
        rows = rows.filter(
            Q(prescription__number__icontains=q)
            | Q(prescription__patient__full_name__icontains=q)
            | Q(prescription__patient__preferred_name__icontains=q)
        )
    out = []
    for r in rows[:200]:
        p = r.prescription
        out.append(
            {
                "id": r.pk,
                "prescription_id": p.pk,
                "prescription_number": p.number or "",
                "patient_display_name": _name(p.patient),
                "pharmacist_name": r.pharmacist_membership.user.full_name,
                "signed_at": r.signed_at,
                "identity_check_method": r.identity_check_method,
                "controlled_confirmed": r.controlled_confirmed,
                "lines": [
                    {
                        "drug": line.substitute_display or line.prescription_item.drug_display,
                        "outcome": line.outcome,
                        "quantity": line.quantity,
                    }
                    for line in r.lines.all()
                ],
                "status": p.status,
            }
        )
    return out
