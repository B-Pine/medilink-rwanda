"""Clinical reads need a care relationship or a reason (security 04 §3, FR-SEC-03).

A staff member reads a facility patient record (ST5) or its health profile (ST13) freely when the
patient is in care here: an open visit, a visit in the last `PATIENTS_CARE_RELATIONSHIP_DAYS`
days, or registered here today. Otherwise, and always when the patient is a colleague
(`is_staff_member`, staff-as-patient), the client first gives a reason (ST28). The reason is
audited and kept in the staff session for `PATIENTS_ACCESS_REASON_TTL_SECONDS`; every read in that
window is audited with it.
"""

from __future__ import annotations

import time
from datetime import timedelta
from typing import Any

from django.db.models import Q
from django.utils import timezone

from medilink.patients.errors import AccessReasonRequired
from medilink.patients.limits import care_window_days, reason_ttl_seconds
from medilink.patients.models import FacilityPatient

SESSION_KEY = "_ml_patient_access"


def has_care_relationship(fp: FacilityPatient) -> bool:
    from medilink.visits.models import OPEN_VISIT, Visit, VisitStatus

    today = timezone.localdate()
    if fp.first_visit_on == today:
        return True
    recent = Q(service_date__gte=today - timedelta(days=care_window_days())) & ~Q(
        status=VisitStatus.CANCELLED
    )
    return (
        Visit.objects.filter(facility_id=fp.facility_id, patient_id=fp.patient_id)
        .filter(Q(status__in=OPEN_VISIT) | recent)
        .exists()
    )


def reason_text(code: str, text: str) -> str:
    """The audit `reason` value: the code, plus the free text for `other`."""
    text = text.strip()
    return f"{code}: {text}" if text else code


def give_reason(session: Any, fp: FacilityPatient, *, code: str, text: str) -> float:
    """Remember the reason for this record in the staff session; returns its expiry (epoch)."""
    until = time.time() + reason_ttl_seconds()
    grants = {
        key: value
        for key, value in dict(session.get(SESSION_KEY) or {}).items()
        if value.get("until", 0) > time.time()
    }
    grants[str(fp.pk)] = {"reason": reason_text(code, text), "until": until}
    session[SESSION_KEY] = grants
    return until


def given_reason(session: Any, fp: FacilityPatient) -> str | None:
    grant = (session.get(SESSION_KEY) or {}).get(str(fp.pk))
    if not grant or grant.get("until", 0) <= time.time():
        return None
    return str(grant.get("reason") or "") or None


def check_clinical_access(session: Any, fp: FacilityPatient) -> tuple[str, str]:
    """Returns (basis, reason) for the audit entry, or raises `access_reason_required`.

    basis: `care_relationship` or `reason`. Staff-as-patient records always need a reason.
    """
    reason = given_reason(session, fp)
    if reason:
        return "reason", reason
    if not fp.is_staff_member and has_care_relationship(fp):
        return "care_relationship", ""
    raise AccessReasonRequired()
