"""Patient profile photo (decision 2026-11-05): added by the patient (or their guardian), seen by
the patient's linked accounts and by staff of facilities where the patient has a record, to
recognise them at the desk. Stored through the S1 upload pipeline (scanned, then attached).
"""

from __future__ import annotations

from typing import Any

from medilink.patients.models import Patient
from medilink.uploads import services as uploads
from medilink.uploads.purposes import UploadPurpose, get_purpose, register
from medilink.uploads.sniff import IMAGE_TYPES

PHOTO_PURPOSE = "patient_photo"
MAX_BYTES = 5 * 2**20


def _can_upload(principal: Any, fields: dict[str, Any]) -> bool:
    # patients upload their own (the view checks the link); staff need patient.register
    if principal.audience == "patient":
        return True
    return "patient.register" in principal.permissions


def _can_read(principal: Any, file: Any) -> bool:
    """Same rule as card photos: the patient's linked accounts, or staff with patients.view where
    the patient has an active facility record."""
    from medilink.patients.cards import _can_read as card_rule

    return bool(card_rule(principal, file))


def register_photo_purpose() -> None:
    if get_purpose(PHOTO_PURPOSE) is not None:
        return
    register(
        UploadPurpose(
            code=PHOTO_PURPOSE,
            audiences=frozenset({"patient", "staff"}),
            owner_kind="patient",
            data_class="C3",  # a face identifies the person: same class as ID and cards
            content_types=IMAGE_TYPES,
            max_bytes=MAX_BYTES,
            can_upload=_can_upload,
            can_read=_can_read,
            unattached_ttl_hours=24,
        )
    )


def set_photo(
    patient: Patient, *, django_file: Any, actor: Any, audience: str, request: Any
) -> Any:
    """Receive the photo; it replaces the old one at once and is attached when its scan is clean
    (until then a link answers `file_not_clean`)."""
    file = uploads.receive(
        actor=actor,
        audience=audience,
        purpose=PHOTO_PURPOSE,
        django_file=django_file,
        patient_id=patient.pk,
        request=request,
    )
    patient.photo_file = file
    patient.version += 1
    patient.save(update_fields=["photo_file", "version", "updated_at"])
    if file.scan_status == "clean" and not file.is_attached:
        uploads.attach(
            file, purpose=PHOTO_PURPOSE, owner_id=patient.pk, patient_id=patient.pk, actor=actor
        )
    return file


def remove_photo(patient: Patient) -> bool:
    if patient.photo_file_id is None:
        return False
    patient.photo_file = None
    patient.version += 1
    patient.save(update_fields=["photo_file", "version", "updated_at"])
    return True


def photo_link(patient: Patient, *, principal: Any, request: Any) -> Any:
    """A 5-minute link to the photo, or None when there is none."""
    if patient.photo_file is None:
        return None
    return uploads.download_link(patient.photo_file, principal=principal, request=request)


def on_upload_scanned(sender: Any, file_id: Any, status: str, **kwargs: Any) -> None:
    """Attach a profile photo when its scan comes back clean (S1 `upload_scanned` signal)."""
    if status != "clean":
        return
    from medilink.uploads.models import UploadedFile

    patient = Patient.objects.filter(photo_file_id=file_id).first()
    file = UploadedFile.objects.filter(pk=file_id).first()
    if patient is None or file is None or file.is_attached:
        return
    uploads.attach(
        file, purpose=PHOTO_PURPOSE, owner_id=patient.pk, patient_id=patient.pk, actor=None
    )
