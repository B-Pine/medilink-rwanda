"""Treatment-relationship rule and reason for access (contract sprint-06 §2.2, FR-SEC-03,
security 04 §3).

`require_access(principal, facility_patient)` is the one check before any clinical read about a
patient. It passes when the clinician has a relationship (open visit today, or recent care by
them in the last RECENT_CARE_DAYS) and the patient is not a staff member, or when the user gave a
reason for this patient within REASON_MINUTES. Otherwise `403 access_reason_required`.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Any

from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions, status

from medilink.clinical.models import AccessReason, AccessReasonCode, Consultation, Vitals
from medilink.patients.audit import record_patient_event
from medilink.patients.errors import FieldRule
from medilink.patients.models import FacilityPatient

RECENT_CARE_DAYS = 30  # contract D-8
REASON_MINUTES = 120  # contract D-8

NEED_TEXT = _("Say why you need this record.")


class AccessReasonRequired(exceptions.APIException):
    status_code = status.HTTP_403_FORBIDDEN
    default_code = "access_reason_required"
    default_detail = _("This patient is not in your care today. Give a reason to open the record.")


@dataclass(frozen=True)
class AccessState:
    has_relationship: bool
    is_staff_member: bool
    granted_until: dt.datetime | None

    @property
    def reason_required(self) -> bool:
        needs = self.is_staff_member or not self.has_relationship
        return needs and self.granted_until is None


def has_relationship(membership: Any, facility_patient: FacilityPatient) -> bool:
    from medilink.visits.models import OPEN_VISIT, Ticket, Visit

    facility_id, patient_id = facility_patient.facility_id, facility_patient.patient_id
    if Visit.objects.filter(
        facility_id=facility_id,
        patient_id=patient_id,
        status__in=list(OPEN_VISIT),
        service_date=timezone.localdate(),
    ).exists():
        return True
    if membership is None:
        return False
    since = timezone.now() - dt.timedelta(days=RECENT_CARE_DAYS)
    return (
        Consultation.objects.filter(
            facility_id=facility_id,
            patient_id=patient_id,
            author_membership=membership,
            started_at__gte=since,
        ).exists()
        or Vitals.objects.filter(
            facility_id=facility_id,
            patient_id=patient_id,
            recorded_by_membership=membership,
            recorded_at__gte=since,
        ).exists()
        or Ticket.objects.filter(
            facility_id=facility_id,
            visit__patient_id=patient_id,
            assigned_membership=membership,
            created_at__gte=since,
        ).exists()
    )


def active_reason_until(user: Any, facility_patient: FacilityPatient) -> dt.datetime | None:
    row = (
        AccessReason.objects.filter(
            facility_id=facility_patient.facility_id,
            user=user,
            facility_patient=facility_patient,
            granted_until__gt=timezone.now(),
        )
        .order_by("-granted_until")
        .first()
    )
    return row.granted_until if row else None


def state(principal: Any, facility_patient: FacilityPatient) -> AccessState:
    return AccessState(
        has_relationship=has_relationship(principal.membership, facility_patient),
        is_staff_member=facility_patient.is_staff_member,
        granted_until=active_reason_until(principal.user, facility_patient),
    )


def require_access(principal: Any, facility_patient: FacilityPatient) -> AccessState:
    current = state(principal, facility_patient)
    if current.reason_required:
        raise AccessReasonRequired()
    return current


def give_reason(
    *, request: Any, principal: Any, facility_patient: FacilityPatient, code: str, text: str
) -> AccessReason:
    text = (text or "").strip()
    if code == AccessReasonCode.OTHER and not text:
        raise FieldRule("reason_text", NEED_TEXT)
    reason = AccessReason.objects.create(
        facility_id=facility_patient.facility_id,
        user=principal.user,
        membership=principal.membership,
        patient_id=facility_patient.patient_id,
        facility_patient=facility_patient,
        reason_code=code,
        reason_text=text[:300],
        granted_until=timezone.now() + dt.timedelta(minutes=REASON_MINUTES),
    )
    record_patient_event(
        "clinical.access_reason.given",
        request=request,
        patient=facility_patient.patient,
        object_type="authz.access_reason",
        object_id=reason.pk,
        metadata={
            "reason_code": code,
            "facility_patient_id": str(facility_patient.pk),
            "is_staff_member": facility_patient.is_staff_member,
        },
    )
    return reason
