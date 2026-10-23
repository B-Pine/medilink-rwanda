"""Patient merges (contract §2.5): request, conflicts, execution and undo.

Execution re-points rows to the surviving patient and records every change in `moved_rows` as
`{table, id, column, from, to}` (plus `facility` for facility records), so undo can restore each
row whose value still equals `to`. Later sprints register their own tables with `register_mover`.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from django.apps import apps
from django.db import transaction
from django.db.models import Model
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from medilink.patients import identity
from medilink.patients.errors import rule
from medilink.patients.models import (
    Allergy,
    Condition,
    ConsentRecord,
    DelegationInvite,
    FacilityPatient,
    Identifier,
    InsuranceProfile,
    Medication,
    Merge,
    MergeEvent,
    MergeScope,
    MergeStatus,
    Patient,
    PatientLink,
    RevokeReason,
)
from medilink.tenancy.context import rls_context

CREATED = "__created__"

# (model, column): plain re-pointing of rows that reference a patient or a facility record.
_MOVERS: list[tuple[type[Model], str]] = [
    (Allergy, "patient"),
    (Condition, "patient"),
    (Medication, "patient"),
    (ConsentRecord, "patient"),
]
_FP_MOVERS: list[tuple[type[Model], str]] = []

DEMOGRAPHICS = (
    "preferred_name",
    "date_of_birth",
    "sex",
    "phone_e164",
    "email",
    "address",
    "emergency_contact",
    "no_known_allergies",
)

SAME_PATIENT = _("Choose two different patients.")
ALREADY_MERGED = _("One of these records has already been merged.")
OPEN_REQUEST = _("There is already an open merge request for one of these patients.")
TWO_ACCOUNTS = _("Both patients have their own MediLink account. Ask the platform team.")
IDENTIFIER_CLASH = _("The patients have different documents of the same kind.")


def register_mover(model: type[Model], column: str) -> None:
    """A later-sprint table with a `patient` or `facility_patient` FK joins merges and undos."""
    field_obj = model._meta.get_field(column)
    target = getattr(field_obj, "related_model", None)
    registry = _FP_MOVERS if target is FacilityPatient else _MOVERS
    if (model, column) not in registry:
        registry.append((model, column))


def _table(model: type[Model]) -> str:
    return model._meta.db_table


def _model_for(table: str) -> type[Model]:
    for model in apps.get_models():
        if model._meta.db_table == table:
            return model
    raise LookupError(table)


def _value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if value is None or isinstance(value, bool | int | float | str | dict | list):
        return value
    return str(value)


@dataclass
class Recorder:
    rows: list[dict[str, Any]] = field(default_factory=list)

    def change(self, obj: Model, column: str, new: Any, *, facility: Any = None) -> None:
        attname = obj._meta.get_field(column).attname  # type: ignore[union-attr]
        old = getattr(obj, attname)
        setattr(obj, attname, new)
        type(obj)._default_manager.filter(pk=obj.pk).update(**{attname: new})
        row = {
            "table": _table(type(obj)),
            "id": str(obj.pk),
            "column": attname,
            "from": _value(old),
            "to": _value(new),
        }
        if facility is not None:
            row["facility"] = str(facility)
        self.rows.append(row)

    def created(self, obj: Model) -> None:
        self.rows.append(
            {"table": _table(type(obj)), "id": str(obj.pk), "column": CREATED, "from": None}
        )


# ---- conflicts and preview -----------------------------------------------------------------------


def _has_self_account(patient: Patient) -> bool:
    return PatientLink.objects.active().filter(patient=patient, relationship="self").exists()


def check_conflicts(survivor: Patient, merged: Patient, *, exclude: Any = None) -> None:
    if survivor.pk == merged.pk:
        raise rule(SAME_PATIENT)
    if survivor.merged_into_id or merged.merged_into_id:
        raise rule(ALREADY_MERGED)
    open_requests = Merge.objects.filter(
        status=MergeStatus.REQUESTED, surviving_patient__in=[survivor, merged]
    ) | Merge.objects.filter(status=MergeStatus.REQUESTED, merged_patient__in=[survivor, merged])
    if exclude is not None:
        open_requests = open_requests.exclude(pk=exclude)
    if open_requests.exists():
        from medilink.core.exceptions import Conflict

        raise Conflict(OPEN_REQUEST)
    if _has_self_account(survivor) and _has_self_account(merged):
        raise rule(TWO_ACCOUNTS)
    if identifier_conflicts(survivor, merged):
        raise rule(IDENTIFIER_CLASH)


def identifier_conflicts(survivor: Patient, merged: Patient) -> list[str]:
    mine = {
        (i.kind, i.issuing_country): bytes(i.value_bidx)
        for i in Identifier.objects.filter(patient=survivor, superseded_at__isnull=True)
    }
    clashes = []
    for other in Identifier.objects.filter(patient=merged, superseded_at__isnull=True):
        key = (other.kind, other.issuing_country)
        if key in mine and mine[key] != bytes(other.value_bidx):
            clashes.append(other.kind)
    return clashes


def compute_scope(survivor: Patient, merged: Patient, facility_id: Any) -> str:
    elsewhere = identity.known_elsewhere(survivor.pk, facility_id) + identity.known_elsewhere(
        merged.pk, facility_id
    )
    has_account = PatientLink.objects.active().filter(patient__in=[survivor, merged]).exists()
    return MergeScope.CROSS_FACILITY if elsewhere or has_account else MergeScope.FACILITY


def preview(merge: Merge) -> dict[str, Any]:
    merged = merge.merged_patient
    facilities = identity.facilities_of(merged.pk)
    here = [f for f in facilities if merge.facility_id and str(f) == str(merge.facility_id)]
    return {
        "identifiers": Identifier.objects.filter(
            patient=merged, superseded_at__isnull=True
        ).count(),
        "insurance_profiles": InsuranceProfile.objects.filter(
            patient=merged, is_active=True
        ).count(),
        "health_items": sum(
            m.objects.filter(patient=merged, entered_in_error_at__isnull=True).count()
            for m in (Allergy, Condition, Medication)
        ),
        "account_links": PatientLink.objects.active().filter(patient=merged).count(),
        "facility_records_here": len(here) + (1 if merge.surviving_facility_patient_id else 0),
        "other_facilities": len([f for f in facilities if f not in here]),
        "conflicts": identifier_conflicts(merge.surviving_patient, merged),
    }


# ---- transitions ---------------------------------------------------------------------------------


def event(merge: Merge, *, from_status: str | None, actor: Any, reason: str = "") -> None:
    MergeEvent.objects.create(
        merge=merge,
        from_status=from_status,
        to_status=merge.status,
        actor=actor,
        reason=reason or None,
    )


@contextmanager
def _facility(facility_id: Any) -> Iterator[None]:
    with rls_context(facility_id=facility_id):
        yield


def execute(merge: Merge, *, actor: Any) -> None:
    """Run the merge in the caller's transaction and mark it executed."""
    survivor = Patient.objects.select_for_update().get(pk=merge.surviving_patient_id)
    merged = Patient.objects.select_for_update().get(pk=merge.merged_patient_id)
    check_conflicts(survivor, merged, exclude=merge.pk)
    rec = Recorder()
    now = timezone.now()

    # identifiers: an identical one is superseded, others move
    mine = {
        (i.kind, i.issuing_country): bytes(i.value_bidx)
        for i in Identifier.objects.filter(patient=survivor, superseded_at__isnull=True)
    }
    for ident in Identifier.objects.filter(patient=merged, superseded_at__isnull=True):
        if (ident.kind, ident.issuing_country) in mine:
            rec.change(ident, "superseded_at", now)
        else:
            rec.change(ident, "patient", survivor.pk)

    # insurance: an identical active card is deactivated, others move
    cards = set(
        InsuranceProfile.objects.filter(patient=survivor, is_active=True).values_list(
            "insurer_code", "member_number"
        )
    )
    for profile in InsuranceProfile.objects.filter(patient=merged):
        if profile.is_active and (profile.insurer_code, profile.member_number) in cards:
            rec.change(profile, "is_active", False)
        else:
            rec.change(profile, "patient", survivor.pk)

    for model, column in _MOVERS:
        for obj in model.objects.filter(**{column: merged}):  # type: ignore[attr-defined]
            rec.change(obj, column, survivor.pk)

    # account links: revoked on the merged patient, an equivalent created on the survivor
    reason = RevokeReason.CLAIMED if merge.scope == MergeScope.CLAIM else RevokeReason.MERGED
    for link in PatientLink.objects.active().filter(patient=merged):
        rec.change(link, "revoked_at", now)
        rec.change(link, "revoke_reason", reason)
        exists = PatientLink.objects.active().filter(account=link.account_id, patient=survivor)
        if not exists.exists():
            new = PatientLink.objects.create(
                account_id=link.account_id,
                patient=survivor,
                relationship=link.relationship,
                granted_at=now,
                granted_by=link.granted_by,
                consent_record=link.consent_record,
            )
            rec.created(new)
    for invite in DelegationInvite.objects.filter(
        patient=merged, accepted_at__isnull=True, revoked_at__isnull=True
    ):
        rec.change(invite, "revoked_at", now)

    # facility records, one facility at a time (RLS)
    for facility_id in identity.facilities_of(merged.pk):
        with _facility(facility_id):
            mine_here = FacilityPatient.objects.filter(
                facility_id=facility_id, patient=survivor, is_active=True
            ).first()
            for fp in FacilityPatient.objects.filter(facility_id=facility_id, patient=merged):
                if mine_here is None:
                    rec.change(fp, "patient", survivor.pk, facility=facility_id)
                    mine_here = fp
                else:
                    rec.change(fp, "is_active", False, facility=facility_id)
                    rec.change(fp, "merged_into", mine_here.pk, facility=facility_id)
                    for model, column in _FP_MOVERS:
                        for obj in model.objects.filter(**{column: fp}):  # type: ignore[attr-defined]
                            rec.change(obj, column, mine_here.pk, facility=facility_id)

    # survivor's empty demographics are filled from the merged patient
    for name in DEMOGRAPHICS:
        if getattr(survivor, name) in (None, "") and getattr(merged, name) not in (None, ""):
            rec.change(survivor, name, getattr(merged, name))
    if (
        survivor.is_birth_date_estimated
        and not merged.is_birth_date_estimated
        and (merged.date_of_birth)
    ):
        rec.change(survivor, "date_of_birth", merged.date_of_birth)
        rec.change(survivor, "is_birth_date_estimated", False)
    rec.change(merged, "merged_into", survivor.pk)
    rec.change(merged, "merged_at", now)
    Patient.objects.filter(pk=survivor.pk).update(version=survivor.version + 1)

    previous = merge.status
    merge.status = MergeStatus.EXECUTED
    merge.executed_at = now
    merge.moved_rows = rec.rows
    merge.version += 1
    merge.save()
    event(merge, from_status=previous, actor=actor)


def undo(merge: Merge, *, actor: Any, reason: str) -> int:
    """Restore every moved row whose value still equals `to`. Returns the skipped count."""
    skipped = 0
    for row in reversed(merge.moved_rows):
        model = _model_for(row["table"])
        manager = model.objects  # type: ignore[attr-defined]
        ctx = _facility(row["facility"]) if row.get("facility") else transaction.atomic()
        with ctx:
            obj = manager.filter(pk=row["id"]).first()
            if obj is None:
                skipped += 1
                continue
            if row["column"] == CREATED:
                if getattr(obj, "revoked_at", None) is None:
                    manager.filter(pk=obj.pk).update(
                        revoked_at=timezone.now(), revoke_reason=RevokeReason.MERGED
                    )
                continue
            if _value(getattr(obj, row["column"])) != row["to"]:
                skipped += 1
                continue
            manager.filter(pk=obj.pk).update(**{row["column"]: row["from"]})
    previous = merge.status
    merge.status = MergeStatus.UNDONE
    merge.undone_by = actor
    merge.undone_at = timezone.now()
    merge.undo_reason = reason
    merge.version += 1
    merge.save()
    event(merge, from_status=previous, actor=actor, reason=reason)
    return skipped


def create_claim_merge(*, survivor: Patient, merged: Patient, actor: Any, reason: str) -> Merge:
    merge = Merge.objects.create(
        scope=MergeScope.CLAIM,
        surviving_patient=survivor,
        merged_patient=merged,
        requested_by=actor,
        reason=reason,
    )
    event(merge, from_status=None, actor=actor)
    return merge
