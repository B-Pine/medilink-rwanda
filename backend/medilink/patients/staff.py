"""Reception services (contract §3.3 ST1-ST8, ST16): search, duplicate check, walk-in registration,
add an existing MediLink patient, edit, identifiers, reveal, consents. All act in the active
facility; `patients_facility_patient` RLS keeps other facilities out."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from typing import Any

from django.contrib.postgres.search import TrigramSimilarity
from django.db import IntegrityError, transaction
from django.http import Http404
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from medilink.patients import consents, identity, insurance
from medilink.patients.audit import record_patient_event
from medilink.patients.errors import FieldConflict, FieldRule, stale
from medilink.patients.matching import Match, find_matches
from medilink.patients.models import (
    ConsentChannel,
    ConsentKind,
    CreatedVia,
    FacilityPatient,
    Identifier,
    Patient,
)
from medilink.patients.normalize import (
    InvalidValue,
    estimated_birth_date,
    looks_like_medilink_number,
    normalize_name,
    normalize_phone,
)

SEARCH_LIMIT = 20
NAME_SIMILARITY = 0.3

IDENTIFIER_TAKEN = _("Another patient has this document. Request a merge instead.")
EXISTS_ELSEWHERE = _("This patient is already on MediLink. Add them to this facility instead.")
POSSIBLE_DUPLICATE = _("This patient may already be registered here. Check the matches first.")
FILE_NUMBER_TAKEN = _("Another patient here has this file number.")
PROOF_MISMATCH = _("The proof doesn't match this patient.")


# ---- lookups -------------------------------------------------------------------------------------


def record_here(facility_id: Any, fp_id: Any) -> FacilityPatient:
    fp = (
        FacilityPatient.objects.filter(pk=fp_id, facility_id=facility_id)
        .select_related("patient")
        .first()
    )
    if fp is None:
        raise Http404
    return fp


def _survivor(fp: FacilityPatient) -> FacilityPatient:
    seen: set[Any] = set()
    while fp.merged_into_id and fp.pk not in seen:
        seen.add(fp.pk)
        fp = FacilityPatient.objects.select_related("patient").get(pk=fp.merged_into_id)
    return fp


def _here(facility_id: Any, patient: Patient) -> FacilityPatient | None:
    return (
        FacilityPatient.objects.filter(facility_id=facility_id, patient=patient, is_active=True)
        .select_related("patient")
        .first()
    )


@dataclass
class SearchResult:
    results: list[tuple[FacilityPatient, str]]
    external: Match | None
    by: str


def _detect(query: str) -> str:
    compact = re.sub(r"[\s\-.]", "", query)
    if looks_like_medilink_number(query):
        return "medilink_number"
    if re.fullmatch(r"\d{16}", compact):
        return "national_id"
    try:
        if normalize_phone(query):
            return "phone"
    except InvalidValue:
        pass
    if re.search(r"\d", query):
        return "file_number"
    return "name"


def search(
    *, facility_id: Any, query: str, by: str, kind: str | None = None, country: str = ""
) -> SearchResult:
    query = query.strip()
    if by == "auto":
        by = _detect(query)
    found: list[tuple[FacilityPatient, str]] = []
    external = None
    records = FacilityPatient.objects.filter(facility_id=facility_id).select_related("patient")
    if by in ("national_id", "identifier", "medilink_number"):
        try:
            if by == "medilink_number":
                patient = identity.find_by_medilink_number(query)
            else:
                patient = identity.find_by_identifier(
                    "national_id" if by == "national_id" else (kind or ""), country, query
                )
        except InvalidValue:
            patient = None
        if patient is not None:
            fp = _here(facility_id, patient)
            if fp:
                found.append((fp, by))
            else:
                external = Match("exact_identifier", patient, by)
    elif by == "phone":
        try:
            phone = normalize_phone(query)
        except InvalidValue:
            phone = None
        if phone:
            found = [
                (fp, "phone")
                for fp in records.filter(is_active=True, patient__phone_e164=phone)[:SEARCH_LIMIT]
            ]
    elif by == "file_number":
        for fp in records.filter(file_number__iexact=query)[:SEARCH_LIMIT]:
            found.append((_survivor(fp), "file_number"))
    else:
        name = normalize_name(query)
        if name:
            matches = (
                records.filter(is_active=True)
                .annotate(score=TrigramSimilarity("patient__name_normalized", name))
                .filter(score__gte=NAME_SIMILARITY)
                .order_by("-score")[:SEARCH_LIMIT]
            )
            found = [(fp, "name") for fp in matches]
    unique: dict[Any, tuple[FacilityPatient, str]] = {}
    for fp, how in found:
        unique.setdefault(fp.pk, (fp, how))
    return SearchResult(list(unique.values()), external, by)


def birth(data: dict[str, Any]) -> tuple[Any, bool]:
    if data.get("date_of_birth") is not None:
        return data["date_of_birth"], False
    years, months = data.get("estimated_age_years"), data.get("estimated_age_months")
    if years is None and months is None:
        return None, False
    return estimated_birth_date(timezone.localdate(), years, months), True


def duplicate_check(*, facility_id: Any, data: dict[str, Any]) -> Any:
    dob, _estimated = birth(data)
    return find_matches(
        facility_id=facility_id,
        full_name=data.get("full_name") or "",
        sex=data.get("sex"),
        date_of_birth=dob,
        phone_e164=data.get("phone_e164"),
        identifier=data.get("identifier"),
        medilink_number=data.get("medilink_number") or None,
    )


# ---- registration --------------------------------------------------------------------------------


def _registration_key(key: str | None) -> uuid.UUID | None:
    if not key:
        return None
    try:
        return uuid.UUID(key)
    except ValueError:
        return uuid.uuid5(uuid.NAMESPACE_URL, f"medilink:registration:{key}")


def is_staff_here(patient: Patient, facility_id: Any) -> bool:
    """Contract §2.2: an account linked to the patient is an active member of the facility."""
    from medilink.patients.models import PatientLink
    from medilink.tenancy.models import FacilityMembership

    accounts = PatientLink.objects.active().filter(patient=patient).values("account_id")
    return FacilityMembership.objects.filter(
        facility_id=facility_id, is_active=True, user_id__in=accounts
    ).exists()


def refresh_staff_flag(fp: FacilityPatient) -> None:
    flag = is_staff_here(fp.patient, fp.facility_id)
    if fp.is_staff_member != flag:
        fp.is_staff_member = flag
        FacilityPatient.objects.filter(pk=fp.pk).update(is_staff_member=flag)


def _create_record(
    *, facility_id: Any, patient: Patient, file_number: str | None, actor: Any, key: Any = None
) -> FacilityPatient:
    try:
        with transaction.atomic():
            return FacilityPatient.objects.create(
                facility_id=facility_id,
                patient=patient,
                file_number=(file_number or "").strip() or None,
                first_visit_on=timezone.localdate(),
                registered_by=actor,
                registration_key=key,
                is_staff_member=is_staff_here(patient, facility_id),
            )
    except IntegrityError:
        raise FieldConflict("file_number", FILE_NUMBER_TAKEN) from None


def register_walk_in(
    *, request: Any, principal: Any, data: dict[str, Any], idempotency_key: str | None
) -> tuple[FacilityPatient, bool]:
    facility_id = principal.active_facility_id
    actor = principal.user
    key = _registration_key(idempotency_key)
    if key is not None:
        existing = FacilityPatient.objects.filter(
            facility_id=facility_id, registration_key=key
        ).first()
        if existing is not None:
            return existing, False
    ident = data.get("identifier")
    if ident:
        try:
            holder = identity.find_by_identifier(
                ident["kind"], ident.get("issuing_country", ""), ident["value"]
            )
        except InvalidValue as exc:
            from rest_framework.exceptions import ValidationError

            raise ValidationError({"identifier": {"value": [str(exc)]}}) from None
        if holder is not None:
            raise FieldConflict("identifier", EXISTS_ELSEWHERE)
    file_number = (data.get("file_number") or "").strip() or None
    if (
        file_number
        and FacilityPatient.objects.filter(
            facility_id=facility_id, file_number=file_number
        ).exists()
    ):
        raise FieldConflict("file_number", FILE_NUMBER_TAKEN)
    matches = duplicate_check(facility_id=facility_id, data=data)
    strong = [m for m, _fp in matches.here if m.level in ("exact_identifier", "strong")]
    if strong and not data.get("confirm_not_duplicate"):
        raise FieldConflict("non_field_errors", POSSIBLE_DUPLICATE)
    dob, estimated = birth(data)
    with transaction.atomic():
        patient = Patient.objects.create(
            full_name=data["full_name"].strip(),
            sex=data["sex"],
            date_of_birth=dob,
            is_birth_date_estimated=estimated,
            phone_e164=data.get("phone_e164"),
            created_via=CreatedVia.WALK_IN,
        )
        identity.assign_medilink_number(patient)
        fp = _create_record(
            facility_id=facility_id,
            patient=patient,
            file_number=file_number,
            actor=actor,
            key=key,
        )
        if ident:
            try:
                identity.add_identifier(
                    patient,
                    kind=ident["kind"],
                    country=ident.get("issuing_country", ""),
                    value=ident["value"],
                    actor=actor,
                )
            except identity.IdentifierTaken:
                raise FieldConflict("identifier", EXISTS_ELSEWHERE) from None
        if data.get("insurance"):
            insurance.add_profile(patient, dict(data["insurance"]), actor=actor)
        consents.record_consent(
            kind=ConsentKind.CARE,
            version=data["care_consent"]["version"],
            granted=True,
            channel=ConsentChannel.STAFF_ASSISTED,
            patient=patient,
            recorded_by=actor,
            facility_id=facility_id,
        )
        record_patient_event(
            "patients.walk_in.registered",
            request=request,
            patient=patient,
            object_id=fp.pk,
            object_type="facility_patient",
        )
        if matches.here and data.get("confirm_not_duplicate"):
            record_patient_event(
                "patients.duplicates.dismissed",
                request=request,
                patient=patient,
                object_type="facility_patient",
                object_id=fp.pk,
                metadata={"match_count": len(matches.here)},
            )
    return fp, True


def add_existing(
    *, request: Any, principal: Any, data: dict[str, Any]
) -> tuple[FacilityPatient, bool]:
    facility_id = principal.active_facility_id
    patient = Patient.objects.filter(pk=data["patient_ref"]).first()
    if patient is None:
        raise FieldRule("proof", PROOF_MISMATCH)
    patient = identity.resolve(patient)
    proof = data["proof"]
    try:
        if proof.get("medilink_number"):
            proven = identity.find_by_medilink_number(proof["medilink_number"])
        else:
            ident = proof["identifier"]
            proven = identity.find_by_identifier(
                ident["kind"], ident.get("issuing_country", ""), ident["value"]
            )
    except InvalidValue:
        proven = None
    if proven is None or proven.pk != patient.pk:
        raise FieldRule("proof", PROOF_MISMATCH)
    existing = FacilityPatient.objects.filter(facility_id=facility_id, patient=patient).first()
    if existing is not None:
        return _survivor(existing), False
    with transaction.atomic():
        fp = _create_record(
            facility_id=facility_id,
            patient=patient,
            file_number=data.get("file_number"),
            actor=principal.user,
        )
        if data["care_consent"]["granted"]:
            consents.record_consent(
                kind=ConsentKind.CARE,
                version=data["care_consent"]["version"],
                granted=True,
                channel=ConsentChannel.STAFF_ASSISTED,
                patient=patient,
                recorded_by=principal.user,
                facility_id=facility_id,
            )
        record_patient_event(
            "patients.existing.added",
            request=request,
            patient=patient,
            object_type="facility_patient",
            object_id=fp.pk,
        )
    return fp, True


# ---- edits ---------------------------------------------------------------------------------------

PATIENT_FIELDS = (
    "full_name",
    "preferred_name",
    "sex",
    "date_of_birth",
    "is_birth_date_estimated",
    "phone_e164",
    "email",
    "address",
    "emergency_contact",
)
RECORD_FIELDS = ("file_number", "reception_notes")


def apply_patient_changes(patient: Patient, data: dict[str, Any]) -> list[str]:
    changed = []
    for name in PATIENT_FIELDS:
        if name in data:
            value = data[name]
            if name == "emergency_contact" and value is not None:
                value = dict(value)
            if getattr(patient, name) != value:
                setattr(patient, name, value)
                changed.append(name)
    if "date_of_birth" in changed and "is_birth_date_estimated" not in data:
        patient.is_birth_date_estimated = False
    return changed


def update_record(fp: FacilityPatient, data: dict[str, Any], *, request: Any) -> list[str]:
    if not fp.is_active:
        raise stale()
    patient = fp.patient
    if data["version"] != fp.version or data["patient_version"] != patient.version:
        raise stale()
    changed = apply_patient_changes(patient, data)
    record_changed = []
    for name in RECORD_FIELDS:
        if name in data:
            value = data[name]
            if name == "file_number":
                value = (value or "").strip() or None
            if getattr(fp, name) != value:
                setattr(fp, name, value)
                record_changed.append(name)
    if changed:
        patient.version += 1
        patient.save()
    if record_changed or changed:
        fp.version += 1
        try:
            with transaction.atomic():
                fp.save()
        except IntegrityError:
            raise FieldConflict("file_number", FILE_NUMBER_TAKEN) from None
        record_patient_event(
            "patients.record.updated",
            request=request,
            patient=patient,
            object_type="facility_patient",
            object_id=fp.pk,
            metadata={"fields": sorted(changed + record_changed)},
        )
    return changed + record_changed


def add_identifier(
    fp: FacilityPatient, data: dict[str, Any], *, request: Any, principal: Any
) -> Identifier:
    try:
        new, old = identity.add_identifier(
            fp.patient,
            kind=data["kind"],
            country=data.get("issuing_country", ""),
            value=data["value"],
            actor=principal.user,
            verified=data.get("seen_document", False),
            facility_id=principal.active_facility_id,
        )
    except identity.IdentifierTaken:
        raise FieldConflict("value", IDENTIFIER_TAKEN) from None
    except InvalidValue as exc:
        from rest_framework.exceptions import ValidationError

        raise ValidationError({"value": [str(exc)]}) from None
    meta = {"kind": new.kind}
    if old is not None:
        record_patient_event(
            "patients.identifier.superseded",
            request=request,
            patient=fp.patient,
            object_type="identifier",
            object_id=old.pk,
            metadata=meta,
        )
    record_patient_event(
        "patients.identifier.added",
        request=request,
        patient=fp.patient,
        object_type="identifier",
        object_id=new.pk,
        metadata=meta,
    )
    if new.verified_at:
        record_patient_event(
            "patients.identifier.verified",
            request=request,
            patient=fp.patient,
            object_type="identifier",
            object_id=new.pk,
            metadata=meta,
        )
    return new


def reveal(fp: FacilityPatient, data: dict[str, Any], *, request: Any) -> str:
    reason = data["reason_code"]
    if data["field"] == "phone":
        if not fp.patient.phone_e164:
            raise Http404
        record_patient_event(
            "patients.phone.revealed",
            request=request,
            patient=fp.patient,
            object_type="facility_patient",
            object_id=fp.pk,
            reason=reason,
        )
        return fp.patient.phone_e164
    identifier = Identifier.objects.filter(
        pk=data["identifier_id"], patient=fp.patient, superseded_at__isnull=True
    ).first()
    if identifier is None:
        raise Http404
    value = identity.reveal(identifier)
    record_patient_event(
        "patients.identifier.revealed",
        request=request,
        patient=fp.patient,
        object_type="identifier",
        object_id=identifier.pk,
        reason=reason,
        metadata={"kind": identifier.kind},
    )
    return value
