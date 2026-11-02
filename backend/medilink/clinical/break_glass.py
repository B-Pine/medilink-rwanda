"""Break-glass for the super admin (contract sprint-06 §2.2, FR-ACC-09, FR-SEC-09).

A super admin gives a reason and re-authenticates, then gets 60 minutes of read-only access to
one patient's record at one facility. Every opening and read lands in the patient's access
history; another super admin reviews the session in the weekly list.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from medilink.audit.services import record
from medilink.clinical.models import BreakGlassReason, BreakGlassSession
from medilink.core.exceptions import BusinessRuleViolation, Conflict
from medilink.patients.errors import FieldRule

WINDOW = dt.timedelta(minutes=60)
REVIEW_AFTER = dt.timedelta(days=7)
MIN_REASON = 20
NOT_A_PATIENT_HERE = _("This patient has no record at that facility.")
ALREADY_OPEN = _("You already have an open session for this patient.")
NEED_REASON = _("Describe the emergency in at least 20 characters.")
OWN_SESSION = _("Another super admin must review your session.")
ALREADY_REVIEWED = _("This session was already reviewed.")
NOT_OPEN = _("This session has ended. Open a new one with a new reason.")
NOT_YOURS = _("Only the super admin who opened this session can use it.")


def is_open(session: BreakGlassSession, now: dt.datetime | None = None) -> bool:
    now = now or timezone.now()
    return session.ended_at is None and session.expires_at > now


def _patient_event(action: str, request: Any, session: BreakGlassSession, **metadata: Any) -> None:
    """In the facility's context, linked to the patient (access history)."""
    from medilink.patients.audit import record_patient_event
    from medilink.patients.models import Patient
    from medilink.tenancy.context import rls_context

    with rls_context(facility_id=session.facility_id, user_id=session.user_id):
        record_patient_event(
            action,
            request=request,
            patient=Patient.objects.get(pk=session.patient_id),
            object_type="authz.break_glass_session",
            object_id=session.pk,
            metadata={"facility_id": str(session.facility_id), **metadata},
        )


def facility_record(patient_id: Any, facility_id: Any) -> Any:
    from medilink.patients.models import FacilityPatient
    from medilink.tenancy.context import rls_context

    with rls_context(facility_id=facility_id):
        return (
            FacilityPatient.objects.filter(facility_id=facility_id, patient_id=patient_id)
            .select_related("patient")
            .first()
        )


def open_session(
    *,
    user: Any,
    patient_id: Any,
    facility_id: Any,
    reason_code: str,
    reason_text: str,
    request: Any,
) -> BreakGlassSession:
    reason_text = (reason_text or "").strip()
    if reason_code not in BreakGlassReason.values:
        raise FieldRule("reason_code", NEED_REASON)
    if len(reason_text) < MIN_REASON:
        raise FieldRule("reason_text", NEED_REASON)
    if facility_record(patient_id, facility_id) is None:
        raise FieldRule("patient_id", NOT_A_PATIENT_HERE)
    now = timezone.now()
    with transaction.atomic():
        open_ = BreakGlassSession.objects.select_for_update().filter(
            user=user, patient_id=patient_id, ended_at__isnull=True, expires_at__gt=now
        )
        if open_.exists():
            raise Conflict(ALREADY_OPEN)
        session = BreakGlassSession.objects.create(
            user=user,
            patient_id=patient_id,
            facility_id=facility_id,
            reason_code=reason_code,
            reason_text=reason_text[:500],
            starts_at=now,
            expires_at=now + WINDOW,
        )
        record(
            "authz.break_glass.opened",
            request=request,
            facility_id=facility_id,
            object_type="authz.break_glass_session",
            object_id=session.pk,
            metadata={"patient_id": str(patient_id), "reason_code": reason_code},
        )
    _patient_event("authz.break_glass.opened", request, session, reason_code=reason_code)
    return session


def end_session(session_id: Any, *, user: Any, request: Any) -> BreakGlassSession:
    with transaction.atomic():
        session = BreakGlassSession.objects.select_for_update().get(pk=session_id)
        if session.user_id != user.pk:
            raise BusinessRuleViolation(NOT_YOURS)
        if not is_open(session):
            raise BusinessRuleViolation(NOT_OPEN)
        session.ended_at = timezone.now()
        session.save(update_fields=["ended_at", "updated_at"])
        record(
            "authz.break_glass.ended",
            request=request,
            facility_id=session.facility_id,
            object_type="authz.break_glass_session",
            object_id=session.pk,
        )
    return session


def review_session(
    session_id: Any, *, user: Any, outcome: str, note: str, request: Any
) -> BreakGlassSession:
    with transaction.atomic():
        session = BreakGlassSession.objects.select_for_update().get(pk=session_id)
        if session.user_id == user.pk:
            raise BusinessRuleViolation(OWN_SESSION)
        if session.reviewed_at is not None:
            raise BusinessRuleViolation(ALREADY_REVIEWED)
        session.reviewed_by = user
        session.reviewed_at = timezone.now()
        session.review_outcome = outcome
        session.review_note = (note or "").strip()[:500]
        session.save(
            update_fields=[
                "reviewed_by",
                "reviewed_at",
                "review_outcome",
                "review_note",
                "updated_at",
            ]
        )
        record(
            "authz.break_glass.reviewed",
            request=request,
            facility_id=session.facility_id,
            object_type="authz.break_glass_session",
            object_id=session.pk,
            metadata={"outcome": outcome},
        )
    return session


def usable(session_id: Any, patient_id: Any, *, user: Any) -> BreakGlassSession:
    session = BreakGlassSession.objects.filter(pk=session_id).first()
    if session is None or str(session.patient_id) != str(patient_id):
        raise BusinessRuleViolation(NOT_OPEN)
    if session.user_id != user.pk:
        raise BusinessRuleViolation(NOT_YOURS)
    if not is_open(session):
        raise BusinessRuleViolation(NOT_OPEN)
    return session


def read_history(session: BreakGlassSession, *, request: Any) -> dict[str, Any]:
    """Read-only H1 timeline and problem summary at the session's facility."""
    from medilink.clinical.views import history_items, problem_summary
    from medilink.tenancy.context import rls_context

    with rls_context(facility_id=session.facility_id, user_id=session.user_id):
        record_ = facility_record(session.patient_id, session.facility_id)
        items = history_items(record_, None, {})
        summary = problem_summary(record_, None)
        patient = record_.patient
        data = {
            "session_id": session.pk,
            "expires_at": session.expires_at,
            "patient": {
                "id": patient.pk,
                "display_name": str(patient.preferred_name or patient.full_name),
                "date_of_birth": patient.date_of_birth,
                "sex": patient.sex,
            },
            "facility_patient_id": record_.pk,
            "summary": summary,
            "items": items,
        }
    _patient_event("authz.break_glass.viewed", request, session)
    return data


def remind_reviews(now: dt.datetime | None = None) -> int:
    """Weekly: tell super admins how many sessions wait for review (counts only)."""
    from medilink.clinical.notification_events import BREAK_GLASS_REVIEW_DUE
    from medilink.notifications.recipients import Recipients
    from medilink.notifications.service import notify

    now = now or timezone.now()
    waiting = BreakGlassSession.objects.filter(
        reviewed_at__isnull=True, expires_at__lte=now
    ).count()
    if waiting:
        with transaction.atomic():
            notify(
                BREAK_GLASS_REVIEW_DUE,
                Recipients.platform_admins(),
                {"count": waiting},
                dedupe_key=f"{BREAK_GLASS_REVIEW_DUE}:{now.date().isoformat()}",
            )
    return waiting
