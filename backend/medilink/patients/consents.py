"""Consent records (FR-SEC-04/05): append-only; the latest record of a kind wins."""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.utils import timezone

from medilink.patients.models import ConsentKind, ConsentRecord, Patient

DEFAULT_VERSIONS = {
    ConsentKind.TERMS: "2026-10",
    ConsentKind.PRIVACY: "2026-10",
    ConsentKind.CARE: "2026-10",
    ConsentKind.RESEARCH: "2026-10",
    ConsentKind.GUARDIAN: "2026-10",
    ConsentKind.DELEGATION: "2026-10",
}


def current_versions() -> dict[str, str]:
    return {**DEFAULT_VERSIONS, **getattr(settings, "PATIENT_CONSENT_VERSIONS", {})}


def current_version(kind: str) -> str:
    return current_versions()[kind]


def latest(patient: Patient, kind: str) -> ConsentRecord | None:
    return ConsentRecord.objects.filter(patient=patient, kind=kind).order_by("-granted_at").first()


def has_care_consent(patient: Patient) -> bool:
    record = latest(patient, ConsentKind.CARE)
    return bool(record and record.granted)


def record_consent(
    *,
    kind: str,
    version: str,
    granted: bool,
    channel: str,
    patient: Patient | None = None,
    user: Any = None,
    recorded_by: Any = None,
    facility_id: Any = None,
) -> ConsentRecord:
    return ConsentRecord.objects.create(
        kind=kind,
        version=version,
        granted=granted,
        granted_at=timezone.now(),
        channel=channel,
        patient=patient,
        user=user,
        recorded_by=recorded_by,
        facility_id=facility_id,
    )
