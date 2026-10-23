"""Insurers and card photos (contract §8 Part B): S1 master data and the S1 upload pipeline."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from medilink.uploads.purposes import UploadPurpose, get_purpose, register

CARD_PURPOSE = "insurance_card"


@dataclass(frozen=True)
class InsurerRef:
    code: str
    display: str
    id: Any


def resolve_insurer(code: str) -> InsurerRef | None:
    """An active insurer from S1 master data, or None."""
    from medilink.masterdata.models import Insurer

    insurer = Insurer.objects.filter(code=code, is_active=True).first()
    if insurer is None:
        return None
    return InsurerRef(code=insurer.code, display=insurer.name, id=insurer.pk)


def _can_upload(principal: Any, fields: dict[str, Any]) -> bool:
    if principal.audience == "patient":
        return True
    return "patient.register" in principal.permissions


def _can_read(principal: Any, file: Any) -> bool:
    """After attachment: the patient's linked accounts, or staff with patients.view where the
    patient has a facility record (contract §3.6)."""
    from medilink.patients.models import FacilityPatient, PatientLink

    if file.patient_id is None:
        return False
    if principal.audience == "patient":
        return (
            PatientLink.objects.for_account(principal.user)
            .active()
            .filter(patient_id=file.patient_id)
            .exists()
        )
    if "patients.view" not in principal.permissions or principal.active_facility_id is None:
        return False
    return FacilityPatient.objects.filter(
        facility_id=principal.active_facility_id, patient_id=file.patient_id, is_active=True
    ).exists()


def register_insurance_card_purpose() -> None:
    if get_purpose(CARD_PURPOSE) is not None:
        return
    register(
        UploadPurpose(
            code=CARD_PURPOSE,
            audiences=frozenset({"patient", "staff"}),
            owner_kind="patient",
            data_class="C3",
            content_types=frozenset(
                {"image/jpeg", "image/png", "image/heic", "image/heif", "application/pdf"}
            ),
            max_bytes=10 * 2**20,
            can_upload=_can_upload,
            can_read=_can_read,
            unattached_ttl_hours=24,
        )
    )
