"""Identifiers and MediLink numbers (contract §2.2, §2.4): add, supersede, look up, reveal."""

from __future__ import annotations

from typing import Any

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from medilink.patients import crypto
from medilink.patients.models import Identifier, Patient
from medilink.patients.normalize import (
    InvalidValue,
    last4,
    new_medilink_number,
    normalize_identifier,
    normalize_medilink_number,
)

TABLE = "patients_identifier"
COLUMN = "value_enc"


class IdentifierTaken(Exception):
    """The value belongs to another patient (409: request a merge or claim)."""

    def __init__(self, patient_id: Any) -> None:
        super().__init__("identifier used by another patient")
        self.patient_id = patient_id


class IdentifierLocked(Exception):
    """A verified identifier of that kind exists; only reception may change it (422)."""


def assign_medilink_number(patient: Patient) -> None:
    for _ in range(10):
        patient.medilink_number = new_medilink_number()
        try:
            with transaction.atomic():
                patient.save(update_fields=["medilink_number"])
            return
        except IntegrityError:
            continue
    raise RuntimeError("Could not allocate a MediLink number")


def resolve(patient: Patient) -> Patient:
    """Follow merges to the surviving patient."""
    seen = set()
    while patient.merged_into_id and patient.pk not in seen:
        seen.add(patient.pk)
        patient = Patient.objects.get(pk=patient.merged_into_id)
    return patient


def find_by_medilink_number(value: str) -> Patient | None:
    try:
        number = normalize_medilink_number(value)
    except InvalidValue:
        return None
    patient = Patient.objects.filter(medilink_number=number).first()
    return resolve(patient) if patient else None


def find_by_identifier(kind: str, country: str, value: str) -> Patient | None:
    """The patient holding this active identifier (blind index under every key), or None."""
    country, normalized = normalize_identifier(kind, country, value)
    condition = Q()
    for key_id, digest in crypto.blind_indexes(kind, country, normalized):
        condition |= Q(bidx_key_id=key_id, value_bidx=digest)
    found = (
        Identifier.objects.filter(
            condition, kind=kind, issuing_country=country, superseded_at__isnull=True
        )
        .select_related("patient")
        .first()
    )
    return resolve(found.patient) if found else None


def add_identifier(
    patient: Patient,
    *,
    kind: str,
    country: str,
    value: str,
    actor: Any,
    verified: bool = False,
    facility_id: Any = None,
    allow_replace_verified: bool = True,
) -> tuple[Identifier, Identifier | None]:
    """Add (or replace) the patient's identifier of this kind. Returns (new, superseded)."""
    country, normalized = normalize_identifier(kind, country, value)
    holder = find_by_identifier(kind, country, normalized)
    if holder is not None and holder.pk != patient.pk:
        raise IdentifierTaken(holder.pk)
    current = Identifier.objects.filter(
        patient=patient, kind=kind, issuing_country=country, superseded_at__isnull=True
    ).first()
    if current is not None and current.verified_at and not allow_replace_verified:
        raise IdentifierLocked()
    now = timezone.now()
    with transaction.atomic():
        if current is not None:
            current.superseded_at = now
            current.save(update_fields=["superseded_at"])
        identifier = Identifier(
            patient=patient, kind=kind, issuing_country=country, created_by=actor
        )
        identifier.value_enc = crypto.encrypt(
            normalized, table=TABLE, column=COLUMN, row_id=identifier.pk
        )
        identifier.bidx_key_id, identifier.value_bidx = crypto.blind_index(
            kind, country, normalized
        )
        identifier.value_last4 = last4(normalized)
        if verified:
            identifier.verified_at = now
            identifier.verified_by = actor
            identifier.verified_facility_id = facility_id
        try:
            with transaction.atomic():
                identifier.save()
        except IntegrityError:
            raise IdentifierTaken(None) from None
    return identifier, current


def reveal(identifier: Identifier) -> str:
    return crypto.decrypt(
        bytes(identifier.value_enc), table=TABLE, column=COLUMN, row_id=identifier.pk
    )


def active_identifiers(patient: Patient) -> list[Identifier]:
    return list(
        Identifier.objects.filter(patient=patient, superseded_at__isnull=True).order_by("kind")
    )


def known_elsewhere(patient_id: Any, facility_id: Any) -> int:
    """Active facility records of the patient outside `facility_id` (bypasses RLS, counts only)."""
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute("SELECT patients_known_elsewhere(%s, %s)", [patient_id, facility_id])
        return int(cursor.fetchone()[0])


def facilities_of(patient_id: Any) -> list[Any]:
    """Facilities with an active record of the patient (bypasses RLS; IDs only)."""
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute("SELECT patients_facilities_of(%s)", [patient_id])
        return [row[0] for row in cursor.fetchall()]
