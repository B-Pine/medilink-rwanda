"""Patient self-service (contract §3.2): profiles through account links, link rights, dependents,
delegation invites, consents and access history."""

from __future__ import annotations

import hashlib
from datetime import timedelta
from typing import Any

from django.db import transaction
from django.db.models import Q
from django.http import Http404
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions

from medilink.patients import consents, identity
from medilink.patients.audit import record_patient_event
from medilink.patients.audit_actions import ACCESS_HISTORY
from medilink.patients.errors import NOT_ALLOWED, rule
from medilink.patients.models import (
    AuditLink,
    ConsentChannel,
    ConsentKind,
    CreatedVia,
    DelegationInvite,
    Identifier,
    InsuranceProfile,
    Patient,
    PatientLink,
    Relationship,
    RevokeReason,
)
from medilink.patients.normalize import age_years, new_code, normalize_code

SELF, GUARDIAN, DELEGATE = Relationship.SELF, Relationship.GUARDIAN, Relationship.DELEGATE
RIGHTS: dict[str, frozenset[str]] = {
    "view": frozenset({SELF, GUARDIAN, DELEGATE}),
    "edit_core": frozenset({SELF, GUARDIAN}),
    "edit_contacts": frozenset({SELF, GUARDIAN, DELEGATE}),
    "identifiers": frozenset({SELF, GUARDIAN}),
    "history": frozenset({SELF, GUARDIAN}),
    "invite": frozenset({SELF, GUARDIAN}),
}
CORE_FIELDS = ("full_name", "preferred_name", "date_of_birth", "is_birth_date_estimated", "sex")
CONTACT_FIELDS = ("phone_e164", "email", "address", "emergency_contact", "no_known_allergies")
MAX_LINKS = 10
INVITE_TTL = timedelta(days=7)

INVALID_CODE = _("This code isn't valid. Ask for a new one.")
OWN_PROFILE = _("This is your own profile.")
ALREADY_LINKED = _("You already have access to this profile.")
TOO_MANY = _("You can manage up to 10 profiles.")
GUARDIAN_AGE = _("A dependent you are guardian of must be under 18.")
DELEGATE_AGE = _("Add an adult as a delegate only with their agreement.")
CANT_LEAVE_SELF = _("You can't remove your own profile.")


# ---- links and rights ----------------------------------------------------------------------------


def link_for(account: Any, patient_id: Any) -> PatientLink:
    link = (
        PatientLink.objects.for_account(account)
        .active()
        .filter(patient_id=patient_id)
        .select_related("patient")
        .first()
    )
    if link is None:
        raise Http404
    return link


def require(link: PatientLink, right: str) -> None:
    if link.relationship not in RIGHTS[right]:
        raise exceptions.PermissionDenied(NOT_ALLOWED)


def own_link(account: Any) -> PatientLink:
    link = (
        PatientLink.objects.for_account(account)
        .active()
        .filter(relationship=SELF)
        .select_related("patient")
        .first()
    )
    if link is None:
        raise Http404
    return link


def links(account: Any) -> list[PatientLink]:
    found = list(
        PatientLink.objects.for_account(account)
        .active()
        .select_related("patient")
        .order_by("created_at")
    )
    return sorted(found, key=lambda link: link.relationship != SELF)


def completion(patient: Patient) -> dict[str, bool]:
    return {
        "details": bool(patient.full_name and patient.date_of_birth and patient.sex),
        "identifier": Identifier.objects.filter(
            patient=patient, superseded_at__isnull=True
        ).exists(),
        "emergency_contact": bool(patient.emergency_contact),
        "care_consent": consents.has_care_consent(patient),
        "insurance": InsuranceProfile.objects.filter(patient=patient, is_active=True).exists(),
        "allergies_reviewed": patient.no_known_allergies is not None,
    }


def summary_data(link: PatientLink) -> dict[str, Any]:
    patient = link.patient
    done = completion(patient)
    return {
        "patient_id": patient.pk,
        "display_name": patient.preferred_name or patient.full_name,
        "relationship": link.relationship,
        "medilink_number": patient.medilink_number,
        "date_of_birth": patient.date_of_birth,
        "completion_percent": round(100 * sum(done.values()) / len(done)),
    }


def profile_data(link: PatientLink) -> dict[str, Any]:
    patient = link.patient
    return {
        "patient_id": patient.pk,
        "relationship": link.relationship,
        "medilink_number": patient.medilink_number,
        "full_name": patient.full_name,
        "preferred_name": patient.preferred_name,
        "date_of_birth": patient.date_of_birth,
        "is_birth_date_estimated": patient.is_birth_date_estimated,
        "sex": patient.sex,
        "phone_e164": patient.phone_e164,
        "email": patient.email,
        "address": patient.address,
        "emergency_contact": patient.emergency_contact,
        "no_known_allergies": patient.no_known_allergies,
        "has_care_consent": consents.has_care_consent(patient),
        "completion": completion(patient),
        "version": patient.version,
    }


def update_profile(link: PatientLink, data: dict[str, Any], *, request: Any) -> list[str]:
    from medilink.patients.staff import apply_patient_changes

    patient = link.patient
    if data.pop("version") != patient.version:
        from medilink.patients.errors import stale

        raise stale()
    if any(name in data for name in CORE_FIELDS):
        require(link, "edit_core")
    no_allergies = data.pop("no_known_allergies", "unset")
    changed = apply_patient_changes(patient, data)
    if no_allergies != "unset" and patient.no_known_allergies != no_allergies:
        patient.no_known_allergies = no_allergies
        changed.append("no_known_allergies")
    if changed:
        patient.version += 1
        patient.save()
        record_patient_event(
            "patients.profile.updated",
            request=request,
            patient=patient,
            metadata={"fields": sorted(changed)},
        )
    return changed


# ---- dependents and delegations ------------------------------------------------------------------


def _check_room(account: Any) -> None:
    if PatientLink.objects.for_account(account).active().count() >= MAX_LINKS:
        raise rule(TOO_MANY)


def add_dependent(
    *, account: Any, data: dict[str, Any], birth: tuple[Any, bool], request: Any
) -> PatientLink:
    _check_room(account)
    born, estimated = birth
    age = age_years(born, timezone.localdate())
    relationship = data["relationship"]
    if relationship == GUARDIAN and (age is None or age >= 18):
        raise rule(GUARDIAN_AGE)
    if relationship == DELEGATE and (age is None or age < 18 or not data.get("consent_attested")):
        raise rule(DELEGATE_AGE)
    now = timezone.now()
    with transaction.atomic():
        patient = Patient.objects.create(
            full_name=data["full_name"].strip(),
            sex=data["sex"],
            date_of_birth=born,
            is_birth_date_estimated=estimated,
            created_via=CreatedVia.DEPENDENT,
        )
        identity.assign_medilink_number(patient)
        consent = consents.record_consent(
            kind=ConsentKind.GUARDIAN if relationship == GUARDIAN else ConsentKind.DELEGATION,
            version=data["consent_version"],
            granted=True,
            channel=ConsentChannel.WEB,
            patient=patient,
            user=account,
        )
        link = PatientLink.objects.create(
            account=account,
            patient=patient,
            relationship=relationship,
            granted_at=now,
            granted_by=account,
            consent_record=consent,
        )
        record_patient_event(
            "patients.dependent.added",
            request=request,
            patient=patient,
            metadata={"relationship": relationship},
        )
    return link


def _code_hash(code: str) -> bytes:
    return hashlib.sha256(normalize_code(code).encode()).digest()


def create_invite(
    *, link: PatientLink, consent_version: str, request: Any
) -> tuple[DelegationInvite, str]:
    require(link, "invite")
    relationship = DELEGATE if link.relationship == SELF else GUARDIAN
    code = new_code()
    with transaction.atomic():
        consent = consents.record_consent(
            kind=ConsentKind.DELEGATION if relationship == DELEGATE else ConsentKind.GUARDIAN,
            version=consent_version,
            granted=True,
            channel=ConsentChannel.WEB,
            patient=link.patient,
            user=link.account,
        )
        invite = DelegationInvite.objects.create(
            patient=link.patient,
            relationship=relationship,
            created_by=link.account,
            code_hash=_code_hash(code),
            expires_at=timezone.now() + INVITE_TTL,
            consent_record=consent,
        )
        record_patient_event(
            "patients.delegation.created",
            request=request,
            patient=link.patient,
            object_type="delegation_invite",
            object_id=invite.pk,
            metadata={"relationship": relationship},
        )
    return invite, code


def accept_invite(*, account: Any, code: str, request: Any) -> PatientLink:
    invite = (
        DelegationInvite.objects.select_for_update()
        .filter(
            code_hash=_code_hash(code),
            accepted_at__isnull=True,
            revoked_at__isnull=True,
            expires_at__gt=timezone.now(),
        )
        .select_related("patient")
        .first()
    )
    if invite is None:
        raise exceptions.ValidationError({"code": [str(INVALID_CODE)]})
    existing = PatientLink.objects.for_account(account).active().filter(patient=invite.patient)
    if existing.filter(relationship=SELF).exists():
        raise rule(OWN_PROFILE)
    if existing.exists():
        from medilink.core.exceptions import Conflict

        raise Conflict(ALREADY_LINKED)
    _check_room(account)
    now = timezone.now()
    link = PatientLink.objects.create(
        account=account,
        patient=invite.patient,
        relationship=invite.relationship,
        granted_at=now,
        granted_by=invite.created_by,
        consent_record=invite.consent_record,
    )
    invite.accepted_at = now
    invite.accepted_by = account
    invite.link = link
    invite.save(update_fields=["accepted_at", "accepted_by", "link"])
    record_patient_event(
        "patients.delegation.accepted",
        request=request,
        patient=invite.patient,
        object_type="patient_link",
        object_id=link.pk,
        metadata={"relationship": link.relationship},
    )
    return link


def _short(name: str) -> str:
    parts = name.split()
    if len(parts) < 2:
        return name
    return f"{parts[0]} {parts[1][0]}."


def delegations(account: Any) -> dict[str, Any]:
    mine = PatientLink.objects.for_account(account).active()
    managed = mine.filter(relationship__in=[SELF, GUARDIAN]).values_list("patient_id", flat=True)
    granted = (
        PatientLink.objects.active()
        .filter(patient_id__in=list(managed))
        .exclude(account=account)
        .select_related("account", "patient")
        .order_by("created_at")
    )
    received = mine.exclude(relationship=SELF).select_related("patient", "granted_by")
    pending = DelegationInvite.objects.filter(
        created_by=account,
        accepted_at__isnull=True,
        revoked_at__isnull=True,
        expires_at__gt=timezone.now(),
    ).select_related("patient")
    return {
        "granted": [
            {
                "id": link.pk,
                "patient_id": link.patient_id,
                "profile_name": link.patient.full_name,
                "holder_name": _short(link.account.full_name),
                "relationship": link.relationship,
                "granted_at": link.granted_at,
                "can_revoke": link.relationship == DELEGATE
                or link.granted_by_id == account.pk
                or mine.filter(patient_id=link.patient_id, relationship=SELF).exists(),
            }
            for link in granted
        ],
        "received": [
            {
                "id": link.pk,
                "patient_id": link.patient_id,
                "profile_name": link.patient.full_name,
                "holder_name": _short(link.granted_by.full_name) if link.granted_by else None,
                "relationship": link.relationship,
                "granted_at": link.granted_at,
                "can_revoke": True,
            }
            for link in received
        ],
        "pending_invites": [
            {
                "id": invite.pk,
                "patient_id": invite.patient_id,
                "profile_name": invite.patient.full_name,
                "relationship": invite.relationship,
                "expires_at": invite.expires_at,
            }
            for invite in pending
        ],
    }


def revoke(*, account: Any, object_id: Any, request: Any) -> None:
    now = timezone.now()
    invite = DelegationInvite.objects.filter(
        pk=object_id, created_by=account, accepted_at__isnull=True, revoked_at__isnull=True
    ).first()
    if invite is not None:
        invite.revoked_at = now
        invite.save(update_fields=["revoked_at"])
        return
    link = PatientLink.objects.active().filter(pk=object_id).select_related("patient").first()
    if link is None:
        raise Http404
    mine = PatientLink.objects.for_account(account).active().filter(patient=link.patient)
    if link.account_id == account.pk:
        if link.relationship == SELF:
            raise rule(CANT_LEAVE_SELF)
        reason = RevokeReason.LEFT
    elif mine.filter(relationship=SELF).exists() or (
        mine.filter(relationship=GUARDIAN).exists() and link.granted_by_id == account.pk
    ):
        if link.relationship == SELF:
            raise exceptions.PermissionDenied(NOT_ALLOWED)
        reason = RevokeReason.BY_GRANTOR
    else:
        raise Http404
    link.revoked_at = now
    link.revoked_by = account
    link.revoke_reason = reason
    link.save(update_fields=["revoked_at", "revoked_by", "revoke_reason", "updated_at"])
    record_patient_event(
        "patients.delegation.revoked",
        request=request,
        patient=link.patient,
        object_type="patient_link",
        object_id=link.pk,
        metadata={"reason": reason},
    )


def expire_invites() -> int:
    """Daily job: revoke invites past their deadline (they are unusable anyway)."""
    return DelegationInvite.objects.filter(
        accepted_at__isnull=True, revoked_at__isnull=True, expires_at__lte=timezone.now()
    ).update(revoked_at=timezone.now())


# ---- consents ------------------------------------------------------------------------------------

ACCOUNT_KINDS = (ConsentKind.TERMS, ConsentKind.PRIVACY)
PROFILE_KINDS = (ConsentKind.CARE, ConsentKind.RESEARCH)
WITHDRAW_ACCOUNT = _("Withdrawing this consent closes your account. Contact support.")
CURRENT_ONLY = _("Accept the current version.")


def consent_state(account: Any) -> dict[str, Any]:
    from medilink.patients.models import ConsentRecord

    managed = list(
        PatientLink.objects.for_account(account)
        .active()
        .filter(relationship__in=[SELF, GUARDIAN])
        .values_list("patient_id", flat=True)
    )
    records = ConsentRecord.objects.filter(
        Q(user=account, patient__isnull=True) | Q(patient_id__in=managed, kind__in=PROFILE_KINDS)
    ).order_by("-granted_at")
    latest: dict[tuple[str, Any], Any] = {}
    for record in records:
        latest.setdefault((record.kind, record.patient_id), record)

    def row(record: Any) -> dict[str, Any]:
        return {
            "id": record.pk,
            "kind": record.kind,
            "patient_id": record.patient_id,
            "granted": record.granted,
            "version": record.version,
            "granted_at": record.granted_at,
            "channel": record.channel,
        }

    return {
        "current_versions": {
            kind: consents.current_version(kind) for kind in (*ACCOUNT_KINDS, *PROFILE_KINDS)
        },
        "consents": [row(r) for r in latest.values()],
        "history": [row(r) for r in records[:50]],
    }


def give_consent(*, account: Any, data: dict[str, Any], request: Any) -> Any:
    kind = data["kind"]
    patient = None
    if kind in ACCOUNT_KINDS:
        if not data["granted"]:
            raise rule(WITHDRAW_ACCOUNT)
        if data["version"] != consents.current_version(kind):
            raise rule(CURRENT_ONLY)
        if data.get("patient_id"):
            raise exceptions.ValidationError({"patient_id": [str(NOT_ALLOWED)]})
    elif data.get("patient_id"):
        link = link_for(account, data["patient_id"])
        if link.relationship not in (SELF, GUARDIAN):
            raise exceptions.PermissionDenied(NOT_ALLOWED)
        patient = link.patient
    elif kind == ConsentKind.CARE:
        patient = own_link(account).patient
    record = consents.record_consent(
        kind=kind,
        version=data["version"],
        granted=data["granted"],
        channel=ConsentChannel.WEB,
        patient=patient,
        user=account,
    )
    if patient is not None:
        record_patient_event(
            "patients.consent.recorded",
            request=request,
            patient=patient,
            object_type="consent",
            object_id=record.pk,
            metadata={"kind": kind, "granted": record.granted},
        )
    return record


# ---- access history ------------------------------------------------------------------------------


def access_history(link: PatientLink, account: Any) -> Any:
    require(link, "history")
    patient_ids = [link.patient_id]
    frontier = [link.patient_id]
    while frontier:  # patients merged into this one, transitively
        frontier = list(
            Patient.objects.filter(merged_into_id__in=frontier).values_list("pk", flat=True)
        )
        patient_ids.extend(frontier)
    return (
        AuditLink.objects.filter(
            patient_id__in=patient_ids, audit_entry__action__in=sorted(ACCESS_HISTORY)
        )
        .exclude(audit_entry__actor=account)
        .select_related("audit_entry", "audit_entry__facility")
        .order_by("-occurred_at")
    )


def history_item(item: AuditLink) -> dict[str, Any]:
    entry = item.audit_entry
    return {
        "id": item.pk,
        "occurred_at": item.occurred_at,
        "action": entry.action,
        "actor_kind": item.actor_kind,
        "actor_role": entry.actor_role or None,
        "facility": {"id": entry.facility.pk, "name": entry.facility.name}
        if entry.facility
        else None,
    }
