"""Consultation and vitals services (contract sprint-06 §2.2-2.3). Callers run inside the active
facility's RLS context (the staff request); every write is one transaction."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
from typing import Any

from django.db import transaction
from django.utils import timezone, translation
from django.utils.translation import gettext_lazy as _

from medilink.clinical.models import (
    SECTIONS,
    Addendum,
    Consultation,
    ConsultationStatus,
    Diagnosis,
    DiagnosisRank,
    Vitals,
)
from medilink.core.exceptions import BusinessRuleViolation, Conflict
from medilink.masterdata.models import DiagnosisCode
from medilink.patients.audit import record_patient_event
from medilink.patients.crypto.fields import decrypt, encrypt
from medilink.patients.errors import FieldRule

STALE = _("Someone else changed this record. It was reloaded.")
NOT_DRAFT = _("This record is signed and locked. Add an addendum instead.")
NOT_SIGNED = _("Sign the record before adding an addendum.")
NOT_AUTHOR = _("Only the author can do this.")
NEED_PRIMARY = _("Add a primary diagnosis before signing.")
VISIT_CLOSED = _("This visit was cancelled or the patient left; no record can be opened.")
VISIT_NOT_OPEN = _("Vitals can be recorded only while the patient is here today.")
ALREADY_ERROR = _("This record is already marked entered in error.")
UNKNOWN_CODE = _("Choose a diagnosis from the list.")
REPEATED_CODE = _("Each diagnosis can be listed once.")
ONE_PRIMARY = _("Only one diagnosis can be primary.")
TOO_MANY = _("At most 12 diagnoses.")

LATE_ENTRY_AFTER = dt.timedelta(hours=24)
MAX_DIAGNOSES = 12

_TABLE = "clinical_consultation"


# ---- encrypted text ---------------------------------------------------------------------------


def read_section(consultation: Consultation, name: str) -> str:
    column = SECTIONS[name]
    blob = getattr(consultation, column)
    if not blob:
        return ""
    return decrypt(bytes(blob), table=_TABLE, column=column, row_id=consultation.pk)


def write_section(consultation: Consultation, name: str, value: str) -> None:
    column = SECTIONS[name]
    value = value or ""
    setattr(
        consultation,
        column,
        encrypt(value, table=_TABLE, column=column, row_id=consultation.pk) if value else None,
    )


def addendum_body(addendum: Addendum) -> str:
    return decrypt(
        bytes(addendum.body_enc), table="clinical_addendum", column="body_enc", row_id=addendum.pk
    )


# ---- hashing ----------------------------------------------------------------------------------


def _iso(value: dt.datetime) -> str:
    return value.astimezone(dt.UTC).isoformat(timespec="microseconds")


def _digest(payload: dict[str, Any]) -> bytes:
    text = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(text.encode("utf-8")).digest()


def canonical_content(consultation: Consultation) -> dict[str, Any]:
    """Contract §2.3. `signed_at` must be set."""
    assert consultation.signed_at is not None  # noqa: S101 (programming error)
    diagnoses = sorted(
        consultation.diagnoses.all(), key=lambda d: (d.rank != DiagnosisRank.PRIMARY, d.code)
    )
    return {
        "consultation_id": str(consultation.pk),
        "visit_id": str(consultation.visit_id),
        "patient_id": str(consultation.patient_id),
        "facility_id": str(consultation.facility_id),
        "author_membership_id": str(consultation.author_membership_id),
        "signed_at": _iso(consultation.signed_at),
        "is_restricted": consultation.is_restricted,
        "sections": {name: read_section(consultation, name) for name in SECTIONS},
        "diagnoses": [
            {
                "code_system": d.code_system,
                "code": d.code,
                "display": d.display,
                "rank": d.rank,
                "certainty": d.certainty,
            }
            for d in diagnoses
        ],
    }


def content_hash(consultation: Consultation) -> bytes:
    return _digest(canonical_content(consultation))


def addendum_hash(consultation: Consultation, addendum: Addendum, body: str) -> bytes:
    return _digest(
        {
            "consultation_hash": bytes(consultation.content_hash or b"").hex(),
            "addendum_id": str(addendum.pk),
            "author_membership_id": str(addendum.author_membership_id),
            "reason": addendum.reason,
            "body": body,
            "signed_at": _iso(addendum.signed_at),
        }
    )


def integrity(consultation: Consultation) -> str | None:
    """`ok` / `mismatch` for a signed record (security 05 §6), None for a draft."""
    if consultation.signed_at is None or not consultation.content_hash:
        return None
    return "ok" if content_hash(consultation) == bytes(consultation.content_hash) else "mismatch"


# ---- consultation lifecycle -------------------------------------------------------------------


def _audit(action: str, request: Any, consultation: Consultation, **metadata: Any) -> None:
    record_patient_event(
        action,
        request=request,
        patient=consultation.patient,
        object_type="clinical.consultation",
        object_id=consultation.pk,
        metadata={"visit_id": str(consultation.visit_id), **metadata},
    )


def open_consultation(*, visit: Any, membership: Any, request: Any) -> tuple[Consultation, bool]:
    from medilink.visits.models import VisitStatus

    if visit.status not in (VisitStatus.ON_SITE, VisitStatus.COMPLETED):
        raise BusinessRuleViolation(VISIT_CLOSED)
    with transaction.atomic():
        existing = Consultation.objects.filter(
            visit=visit, author_membership=membership, status=ConsultationStatus.DRAFT
        ).first()
        if existing is not None:
            return existing, False
        consultation = Consultation.objects.create(
            facility_id=visit.facility_id,
            visit=visit,
            patient_id=visit.patient_id,
            facility_patient_id=visit.facility_patient_id,
            author_membership=membership,
            started_at=timezone.now(),
        )
        Vitals.objects.filter(visit=visit, consultation__isnull=True).update(
            consultation=consultation
        )
        _audit("clinical.consultation.opened", request, consultation)
    return consultation, True


def _locked(consultation_id: Any, version: Any) -> Consultation:
    consultation = (
        Consultation.objects.select_for_update().select_related("patient").get(pk=consultation_id)
    )
    if version != consultation.version:
        raise Conflict(STALE)
    return consultation


def _require_author(consultation: Consultation, membership: Any) -> None:
    if consultation.author_membership_id != getattr(membership, "pk", None):
        raise BusinessRuleViolation(NOT_AUTHOR)


def _language() -> str:
    lang = (translation.get_language() or "rw")[:2]
    return lang if lang in ("rw", "en", "fr") else "rw"


def _pick(values: dict[str, Any], lang: str) -> str:
    return str(values.get(lang) or values.get("en") or next(iter(values.values()), "") or "")


def _replace_diagnoses(consultation: Consultation, items: list[dict[str, Any]]) -> None:
    if len(items) > MAX_DIAGNOSES:
        raise FieldRule("diagnoses", TOO_MANY)
    codes = [str(item["code"]).strip().upper() for item in items]
    if len(set(codes)) != len(codes):
        raise FieldRule("diagnoses", REPEATED_CODE)
    if sum(1 for item in items if item["rank"] == DiagnosisRank.PRIMARY) > 1:
        raise FieldRule("diagnoses", ONE_PRIMARY)
    known = {
        row.code: row
        for row in DiagnosisCode.objects.filter(code_system="icd10", code__in=codes, is_active=True)
    }
    missing = [code for code in codes if code not in known]
    if missing:
        raise FieldRule("diagnoses", UNKNOWN_CODE)
    lang = _language()
    consultation.diagnoses.all().delete()
    Diagnosis.objects.bulk_create(
        Diagnosis(
            facility_id=consultation.facility_id,
            consultation=consultation,
            code_system="icd10",
            code=code,
            display=_pick(known[code].title_i18n, lang)[:300],
            plain_language=_pick(known[code].plain_language_i18n, lang)[:300],
            rank=item["rank"],
            certainty=item["certainty"],
            is_sensitive=known[code].is_sensitive,
        )
        for code, item in zip(codes, items, strict=True)
    )


def update_draft(
    consultation_id: Any, *, version: Any, membership: Any, data: dict[str, Any]
) -> Consultation:
    with transaction.atomic():
        consultation = _locked(consultation_id, version)
        if consultation.status != ConsultationStatus.DRAFT:
            raise BusinessRuleViolation(NOT_DRAFT)
        _require_author(consultation, membership)
        for name in SECTIONS:
            if name in data:
                write_section(consultation, name, data[name])
        if "is_restricted" in data:
            consultation.is_restricted = bool(data["is_restricted"])
        if "diagnoses" in data:
            _replace_diagnoses(consultation, list(data["diagnoses"]))
        consultation.version += 1
        consultation.save()
    return consultation


def sign(consultation_id: Any, *, version: Any, membership: Any, request: Any) -> Consultation:
    with transaction.atomic():
        consultation = _locked(consultation_id, version)
        if consultation.status != ConsultationStatus.DRAFT:
            raise BusinessRuleViolation(NOT_DRAFT)
        _require_author(consultation, membership)
        if not consultation.diagnoses.filter(rank=DiagnosisRank.PRIMARY).exists():
            raise BusinessRuleViolation(NEED_PRIMARY)
        consultation.signed_at = timezone.now()
        consultation.is_late_entry = (
            consultation.signed_at - consultation.started_at > LATE_ENTRY_AFTER
        )
        consultation.content_hash = content_hash(consultation)
        consultation.status = ConsultationStatus.SIGNED
        consultation.version += 1
        consultation.save()
        _audit(
            "clinical.consultation.signed",
            request,
            consultation,
            is_late_entry=consultation.is_late_entry,
            is_restricted=consultation.is_restricted,
        )
    return consultation


def add_addendum(
    consultation_id: Any, *, membership: Any, reason: str, body: str, request: Any
) -> Addendum:
    with transaction.atomic():
        consultation = (
            Consultation.objects.select_for_update()
            .select_related("patient")
            .get(pk=consultation_id)
        )
        if consultation.status != ConsultationStatus.SIGNED:
            raise BusinessRuleViolation(NOT_SIGNED)
        addendum = Addendum(
            facility_id=consultation.facility_id,
            consultation=consultation,
            author_membership=membership,
            reason=reason.strip()[:300],
            signed_at=timezone.now(),
            is_by_author=consultation.author_membership_id == membership.pk,
        )
        addendum.body_enc = encrypt(
            body, table="clinical_addendum", column="body_enc", row_id=addendum.pk
        )
        addendum.content_hash = addendum_hash(consultation, addendum, body)
        addendum.save()
        _audit(
            "clinical.addendum.added",
            request,
            consultation,
            addendum_id=str(addendum.pk),
            is_by_author=addendum.is_by_author,
        )
    return addendum


def mark_entered_in_error(
    consultation_id: Any, *, version: Any, membership: Any, reason: str, request: Any
) -> Consultation:
    with transaction.atomic():
        consultation = _locked(consultation_id, version)
        if consultation.status == ConsultationStatus.ENTERED_IN_ERROR:
            raise BusinessRuleViolation(ALREADY_ERROR)
        _require_author(consultation, membership)
        consultation.status = ConsultationStatus.ENTERED_IN_ERROR
        consultation.entered_in_error_at = timezone.now()
        consultation.entered_in_error_by_membership = membership
        consultation.entered_in_error_reason = reason.strip()[:300]
        consultation.version += 1
        consultation.save(
            update_fields=[
                "status",
                "entered_in_error_at",
                "entered_in_error_by_membership",
                "entered_in_error_reason",
                "version",
                "updated_at",
            ]
        )
        _audit("clinical.consultation.entered_in_error", request, consultation)
    return consultation


# ---- vitals -------------------------------------------------------------------------------------


def record_vitals(*, visit: Any, membership: Any, values: dict[str, Any], request: Any) -> Vitals:
    from medilink.visits.models import VisitStatus

    today = timezone.localdate()
    open_now = visit.status == VisitStatus.ON_SITE or (
        visit.status == VisitStatus.COMPLETED and visit.service_date == today
    )
    if not open_now:
        raise BusinessRuleViolation(VISIT_NOT_OPEN)
    with transaction.atomic():
        consultation = (
            Consultation.objects.filter(visit=visit, status=ConsultationStatus.DRAFT)
            .order_by("-started_at")
            .first()
        )
        vitals = Vitals.objects.create(
            facility_id=visit.facility_id,
            visit=visit,
            patient_id=visit.patient_id,
            consultation=consultation,
            recorded_by_membership=membership,
            recorded_at=values.pop("recorded_at", None) or timezone.now(),
            **values,
        )
        record_patient_event(
            "clinical.vitals.recorded",
            request=request,
            patient=visit.patient,
            object_type="clinical.vitals",
            object_id=vitals.pk,
            metadata={"visit_id": str(visit.pk)},
        )
    return vitals


def vitals_entered_in_error(
    vitals: Vitals, *, membership: Any, reason: str, request: Any
) -> Vitals:
    if vitals.entered_in_error_at is not None:
        raise BusinessRuleViolation(ALREADY_ERROR)
    with transaction.atomic():
        vitals.entered_in_error_at = timezone.now()
        vitals.entered_in_error_by_membership = membership
        vitals.entered_in_error_reason = reason.strip()[:300]
        vitals.save(
            update_fields=[
                "entered_in_error_at",
                "entered_in_error_by_membership",
                "entered_in_error_reason",
            ]
        )
        record_patient_event(
            "clinical.vitals.entered_in_error",
            request=request,
            patient=vitals.patient,
            object_type="clinical.vitals",
            object_id=vitals.pk,
            metadata={"visit_id": str(vitals.visit_id)},
        )
    return vitals
