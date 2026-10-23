"""Health profile items (contract §3.2 PA16-PA18, §3.3 ST13-ST15): allergies, conditions, medicines
with provenance. Patients add unverified items; clinicians add verified ones and review."""

from __future__ import annotations

from typing import Any

from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from medilink.patients.errors import rule
from medilink.patients.models import (
    Allergy,
    HealthSource,
    Patient,
    Verification,
)
from medilink.patients.serializers import HEALTH_MODELS


def add_item(
    patient: Patient,
    kind: str,
    data: dict[str, Any],
    *,
    actor: Any,
    source: str,
    facility_id: Any = None,
    membership: Any = None,
) -> Any:
    model = HEALTH_MODELS[kind]
    clinician = source == HealthSource.CLINICIAN
    item = model.objects.create(
        patient=patient,
        source=source,
        verification_status=Verification.VERIFIED if clinician else Verification.UNVERIFIED,
        recorded_by=actor,
        recorded_facility_id=facility_id,
        reviewed_by_membership=membership if clinician else None,
        reviewed_at=timezone.now() if clinician else None,
        **data,
    )
    if model is Allergy and patient.no_known_allergies is not False:
        patient.no_known_allergies = False
        patient.save(update_fields=["no_known_allergies", "updated_at"])
    return item


def get_item(patient: Patient, kind: str, item_id: Any) -> Any:
    from django.http import Http404

    model = HEALTH_MODELS[kind]
    item = model.objects.filter(
        pk=item_id, patient=patient, entered_in_error_at__isnull=True
    ).first()
    if item is None:
        raise Http404
    return item


def review(item: Any, *, outcome: str, note: str, actor: Any, membership: Any) -> None:
    now = timezone.now()
    if outcome == "entered_in_error":
        item.entered_in_error_at = now
        item.entered_in_error_by = actor
    else:
        item.verification_status = outcome
    item.reviewed_by_membership = membership
    item.reviewed_at = now
    item.review_note = note.strip() or None
    item.save()


def patient_entered_in_error(item: Any, *, actor: Any) -> None:
    if item.source != HealthSource.PATIENT or item.verification_status != Verification.UNVERIFIED:
        raise rule(_("A clinician confirmed this item. Ask them to change it."))
    item.entered_in_error_at = timezone.now()
    item.entered_in_error_by = actor
    item.save(update_fields=["entered_in_error_at", "entered_in_error_by", "updated_at"])
