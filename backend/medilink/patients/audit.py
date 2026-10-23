"""`record_patient_event()`: an audit entry about a patient plus its `patients_audit_link`, in one
transaction (contract §2.6). Later sprints use it for events about a patient."""

from __future__ import annotations

from typing import Any

from django.db import transaction

from medilink.audit.services import record
from medilink.authz.permissions import get_principal
from medilink.patients.models import ActorKind, AuditLink, Patient, PatientLink


def _actor_kind(request: Any, patient: Patient) -> str:
    principal = get_principal(request) if request is not None else None
    if principal is None or principal.user is None:
        return ActorKind.SYSTEM
    if principal.audience == "staff":
        if principal.active_facility_id is None and principal.user.is_platform_admin:
            return ActorKind.PLATFORM
        return ActorKind.STAFF
    link = PatientLink.objects.for_account(principal.user).filter(patient=patient).first()
    return (
        ActorKind.SELF
        if link is not None and link.relationship == "self"
        else ActorKind.LINKED_ACCOUNT
    )


def record_patient_event(
    action: str,
    *,
    request: Any,
    patient: Patient,
    object_type: str = "patient",
    object_id: Any = None,
    reason: str = "",
    metadata: dict[str, Any] | None = None,
    actor: Any = None,
    actor_kind: str | None = None,
) -> None:
    with transaction.atomic():
        entry = record(
            action,
            request=request,
            actor=actor,
            object_type=object_type,
            object_id=object_id if object_id is not None else patient.pk,
            reason=reason,
            metadata=metadata,
        )
        AuditLink.objects.create(
            audit_entry=entry,
            patient=patient,
            occurred_at=entry.occurred_at,
            actor_kind=actor_kind or _actor_kind(request, patient),
        )
