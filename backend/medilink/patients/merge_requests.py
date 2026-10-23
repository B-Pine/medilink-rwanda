"""Merge request workflow (contract §2.5, §3.3 ST18-ST25, §3.4 PL1-PL5)."""

from __future__ import annotations

from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from medilink.core.exceptions import Conflict
from medilink.patients import merge as engine
from medilink.patients.audit import record_patient_event
from medilink.patients.errors import rule, stale
from medilink.patients.models import FacilityPatient, Merge, MergeScope, MergeStatus
from medilink.tenancy.context import rls_context

REQUESTER = _("Another approver has to decide on your own request.")
NOT_HERE = _("This request needs the platform team.")
NOT_OPEN = _("This request is no longer open.")
OTHER_APPROVER = _("Someone else here can approve this request.")
FACILITY_ONLY = _("Only the platform team can undo this merge.")


# ---- shapes --------------------------------------------------------------------------------------


class MergeSideSerializer(serializers.Serializer):
    patient_id = serializers.UUIDField()
    medilink_number = serializers.CharField(allow_null=True)
    full_name = serializers.CharField()
    date_of_birth = serializers.DateField(allow_null=True)
    sex = serializers.CharField(allow_null=True)
    file_number = serializers.CharField(allow_null=True)


class MergePreviewSerializer(serializers.Serializer):
    identifiers = serializers.IntegerField()
    insurance_profiles = serializers.IntegerField()
    health_items = serializers.IntegerField()
    account_links = serializers.IntegerField()
    facility_records_here = serializers.IntegerField()
    other_facilities = serializers.IntegerField()
    conflicts = serializers.ListField(child=serializers.CharField())


class FacilityRefSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()


class MergeRequestSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    scope = serializers.ChoiceField(choices=MergeScope.choices)
    status = serializers.ChoiceField(choices=MergeStatus.choices)
    is_escalated = serializers.BooleanField()
    facility = FacilityRefSerializer(allow_null=True)
    surviving = MergeSideSerializer()
    merged = MergeSideSerializer()
    preview = MergePreviewSerializer(allow_null=True)
    reason = serializers.CharField()
    requested_by = serializers.CharField()
    requested_at = serializers.DateTimeField()
    decided_by = serializers.CharField(allow_null=True)
    decided_at = serializers.DateTimeField(allow_null=True)
    decision_reason = serializers.CharField(allow_null=True)
    executed_at = serializers.DateTimeField(allow_null=True)
    undone_at = serializers.DateTimeField(allow_null=True)
    version = serializers.IntegerField()


class MergeCreateSerializer(serializers.Serializer):
    surviving_facility_patient_id = serializers.UUIDField()
    merged_facility_patient_id = serializers.UUIDField()
    reason = serializers.CharField(max_length=300)


class DecisionSerializer(serializers.Serializer):
    version = serializers.IntegerField(min_value=1)
    decision_reason = serializers.CharField(max_length=300, required=False, allow_blank=True)


class RejectSerializer(DecisionSerializer):
    decision_reason = serializers.CharField(max_length=300)


class UndoSerializer(serializers.Serializer):
    version = serializers.IntegerField(min_value=1)
    reason = serializers.CharField(max_length=300)


class UndoResultSerializer(serializers.Serializer):
    merge = MergeRequestSerializer()
    skipped_rows = serializers.IntegerField()


def _side(patient: Any, fp: FacilityPatient | None) -> dict[str, Any]:
    return {
        "patient_id": patient.pk,
        "medilink_number": patient.medilink_number,
        "full_name": patient.full_name,
        "date_of_birth": patient.date_of_birth,
        "sex": patient.sex,
        "file_number": fp.file_number if fp else None,
    }


def merge_data(merge: Merge, *, with_preview: bool = False) -> dict[str, Any]:
    def name(user: Any) -> str | None:
        return user.full_name if user else None

    with rls_context(facility_id=merge.facility_id):
        surviving_fp = (
            FacilityPatient.objects.filter(pk=merge.surviving_facility_patient_id).first()
            if merge.surviving_facility_patient_id
            else None
        )
        merged_fp = (
            FacilityPatient.objects.filter(pk=merge.merged_facility_patient_id).first()
            if merge.merged_facility_patient_id
            else None
        )
    show_preview = with_preview and merge.status == MergeStatus.REQUESTED
    data = {
        "id": merge.pk,
        "scope": merge.scope,
        "status": merge.status,
        "is_escalated": merge.is_escalated,
        "facility": {"id": merge.facility.pk, "name": merge.facility.name}
        if merge.facility
        else None,
        "surviving": _side(merge.surviving_patient, surviving_fp),
        "merged": _side(merge.merged_patient, merged_fp),
        "preview": engine.preview(merge) if show_preview else None,
        "reason": merge.reason,
        "requested_by": name(merge.requested_by),
        "requested_at": merge.created_at,
        "decided_by": name(merge.decided_by),
        "decided_at": merge.decided_at,
        "decision_reason": merge.decision_reason,
        "executed_at": merge.executed_at,
        "undone_at": merge.undone_at,
        "version": merge.version,
    }
    return MergeRequestSerializer(data).data


def queryset() -> Any:
    return Merge.objects.select_related(
        "facility", "surviving_patient", "merged_patient", "requested_by", "decided_by"
    ).order_by("-created_at")


# ---- transitions ---------------------------------------------------------------------------------


def _audit(action: str, merge: Merge, *, request: Any, reason: str = "", **meta: Any) -> None:
    record_patient_event(
        action,
        request=request,
        patient=merge.surviving_patient,
        object_type="merge",
        object_id=merge.pk,
        reason=reason,
        metadata={"merged_patient_id": str(merge.merged_patient_id), "scope": merge.scope, **meta},
    )


def request_merge(
    *, principal: Any, request: Any, data: dict[str, Any], idempotency_key: str | None
) -> Merge:
    facility_id = principal.active_facility_id
    if idempotency_key:
        existing = Merge.objects.filter(
            facility_id=facility_id,
            requested_by=principal.user,
            idempotency_key=idempotency_key[:200],
        ).first()
        if existing is not None:
            return existing
    records = {
        fp.pk: fp
        for fp in FacilityPatient.objects.filter(
            facility_id=facility_id,
            pk__in=[data["surviving_facility_patient_id"], data["merged_facility_patient_id"]],
            is_active=True,
        ).select_related("patient")
    }
    surviving = records.get(data["surviving_facility_patient_id"])
    merged = records.get(data["merged_facility_patient_id"])
    if surviving is None or merged is None:
        from django.http import Http404

        raise Http404
    engine.check_conflicts(surviving.patient, merged.patient)
    try:
        with transaction.atomic():
            merge = Merge.objects.create(
                scope=engine.compute_scope(surviving.patient, merged.patient, facility_id),
                facility_id=facility_id,
                surviving_patient=surviving.patient,
                merged_patient=merged.patient,
                surviving_facility_patient=surviving,
                merged_facility_patient=merged,
                requested_by=principal.user,
                reason=data["reason"].strip(),
                idempotency_key=(idempotency_key or "")[:200],
            )
    except IntegrityError:
        raise Conflict(engine.OPEN_REQUEST) from None
    engine.event(merge, from_status=None, actor=principal.user, reason=merge.reason)
    _audit("patients.merge.requested", merge, request=request, reason=merge.reason)
    return merge


def _lock(merge: Merge, version: int | None = None) -> Merge:
    locked = queryset().select_for_update(of=("self",)).get(pk=merge.pk)
    if version is not None and locked.version != version:
        raise stale()
    return locked


def _check_open(merge: Merge) -> None:
    if merge.status != MergeStatus.REQUESTED:
        raise rule(NOT_OPEN)


def approve(
    merge: Merge, *, actor: Any, request: Any, version: int, reason: str, platform: bool
) -> Merge:
    merge = _lock(merge, version)
    _check_open(merge)
    if merge.requested_by_id == actor.pk:
        raise rule(REQUESTER)
    if not platform and (merge.scope != MergeScope.FACILITY or merge.is_escalated):
        raise rule(NOT_HERE)
    merge.decided_by = actor
    merge.decided_at = timezone.now()
    merge.decision_reason = reason.strip() or None
    engine.execute(merge, actor=actor)
    _audit(
        "patients.merge.executed", merge, request=request, reason=reason, rows=len(merge.moved_rows)
    )
    return merge


def reject(merge: Merge, *, actor: Any, request: Any, version: int, reason: str) -> Merge:
    merge = _lock(merge, version)
    _check_open(merge)
    if merge.requested_by_id == actor.pk:
        raise rule(REQUESTER)
    merge.status = MergeStatus.REJECTED
    merge.decided_by = actor
    merge.decided_at = timezone.now()
    merge.decision_reason = reason.strip()
    merge.version += 1
    merge.save()
    engine.event(merge, from_status=MergeStatus.REQUESTED, actor=actor, reason=reason)
    _audit("patients.merge.rejected", merge, request=request, reason=reason)
    return merge


def cancel(merge: Merge, *, actor: Any, request: Any) -> Merge:
    merge = _lock(merge)
    _check_open(merge)
    if merge.requested_by_id != actor.pk:
        from rest_framework.exceptions import PermissionDenied

        raise PermissionDenied()
    merge.status = MergeStatus.CANCELLED
    merge.version += 1
    merge.save()
    engine.event(merge, from_status=MergeStatus.REQUESTED, actor=actor)
    _audit("patients.merge.cancelled", merge, request=request)
    return merge


def other_approvers(merge: Merge, actor: Any) -> bool:
    from medilink.tenancy.models import FacilityMembership

    return (
        FacilityMembership.objects.filter(
            facility_id=merge.facility_id,  # type: ignore[misc]
            is_active=True,
            roles__permissions__code="patients.merge_approve",
        )
        .exclude(user=actor)
        .exists()
    )


def escalate(merge: Merge, *, actor: Any, request: Any) -> Merge:
    merge = _lock(merge)
    _check_open(merge)
    if merge.requested_by_id != actor.pk:
        from rest_framework.exceptions import PermissionDenied

        raise PermissionDenied()
    if merge.scope != MergeScope.FACILITY or merge.is_escalated:
        raise rule(NOT_HERE)
    if other_approvers(merge, actor):
        raise rule(OTHER_APPROVER)
    merge.is_escalated = True
    merge.version += 1
    merge.save()
    engine.event(merge, from_status=MergeStatus.REQUESTED, actor=actor, reason="escalated")
    _audit("patients.merge.escalated", merge, request=request)
    return merge


def undo(
    merge: Merge, *, actor: Any, request: Any, version: int, reason: str, platform: bool
) -> tuple[Merge, int]:
    merge = _lock(merge, version)
    if merge.status != MergeStatus.EXECUTED:
        raise rule(NOT_OPEN)
    if not platform and merge.scope != MergeScope.FACILITY:
        raise rule(FACILITY_ONLY)
    skipped = engine.undo(merge, actor=actor, reason=reason.strip())
    _audit("patients.merge.undone", merge, request=request, reason=reason, skipped_rows=skipped)
    return merge, skipped
