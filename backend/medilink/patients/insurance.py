"""Insurance profiles (contract §3.2 PA12-PA15, PA25; §3.3 ST9-ST12, ST26). Insurers come from S1
master data; card photos from the S1 upload pipeline."""

from __future__ import annotations

from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from medilink.patients.cards import CARD_PURPOSE, resolve_insurer
from medilink.patients.errors import FieldConflict, stale
from medilink.patients.models import InsuranceProfile, InsuranceStatus, Patient
from medilink.uploads import services as uploads

TAKEN = _("This card is already on the profile.")
UNKNOWN_INSURER = _("Choose an insurer from the list.")
RESETS_STATUS = {
    "insurer_code",
    "member_number",
    "is_principal",
    "principal_name",
    "principal_member_number",
    "relationship_to_principal",
    "valid_until",
}


def _insurer(code: str) -> Any:
    insurer = resolve_insurer(code)
    if insurer is None:
        from rest_framework.exceptions import ValidationError

        raise ValidationError({"insurer_code": [str(UNKNOWN_INSURER)]})
    return insurer


def add_profile(patient: Patient, data: dict[str, Any], *, actor: Any) -> InsuranceProfile:
    insurer = _insurer(data["insurer_code"])
    profile = InsuranceProfile(
        patient=patient,
        insurer_id=insurer.id,
        insurer_code=insurer.code,
        insurer_display=insurer.display,
        member_number=data["member_number"],
        is_principal=data.get("is_principal", True),
        principal_name=data.get("principal_name"),
        principal_member_number=data.get("principal_member_number"),
        relationship_to_principal=data.get("relationship_to_principal"),
        valid_until=data.get("valid_until"),
        created_by=actor,
    )
    try:
        with transaction.atomic():
            profile.save()
    except IntegrityError:
        raise FieldConflict("member_number", TAKEN) from None
    return profile


def update_profile(profile: InsuranceProfile, data: dict[str, Any]) -> list[str]:
    """Apply a PATCH; returns the changed field names. Identity fields reset the status."""
    if data.pop("version") != profile.version or not profile.is_active:
        raise stale()
    if "insurer_code" in data:
        insurer = _insurer(data["insurer_code"])
        profile.insurer_id = insurer.id
        profile.insurer_display = insurer.display
    changed = [name for name, value in data.items() if getattr(profile, name) != value]
    for name in changed:
        setattr(profile, name, data[name])
    if not changed:
        return []
    if RESETS_STATUS & set(changed):
        reset_status(profile)
    profile.version += 1
    try:
        with transaction.atomic():
            profile.save()
    except IntegrityError:
        raise FieldConflict("member_number", TAKEN) from None
    return changed


def reset_status(profile: InsuranceProfile) -> None:
    profile.status = InsuranceStatus.UNVERIFIED
    profile.status_reason = None


def verify(
    profile: InsuranceProfile,
    *,
    outcome: str,
    valid_until: Any,
    reason: str,
    actor: Any,
    facility_id: Any,
) -> None:
    profile.status = outcome
    profile.status_reason = reason.strip() or None if outcome == "rejected" else None
    if valid_until is not None:
        profile.valid_until = valid_until
    profile.last_verified_at = timezone.now()
    profile.last_verified_by = actor
    profile.last_verified_facility_id = facility_id
    profile.version += 1
    profile.save()


def deactivate(profile: InsuranceProfile) -> None:
    profile.is_active = False
    profile.version += 1
    profile.save(update_fields=["is_active", "version", "updated_at"])


def attach_card(
    profile: InsuranceProfile,
    *,
    side: str,
    django_file: Any,
    actor: Any,
    audience: str,
    request: Any,
) -> Any:
    """Receive a card photo through the S1 pipeline; it is attached once its scan is clean
    (`on_upload_scanned`). Until then the profile shows it with its scan status."""
    file = uploads.receive(
        actor=actor,
        audience=audience,
        purpose=CARD_PURPOSE,
        django_file=django_file,
        idempotency_key=None,
        facility_id=None,
        request=request,
    )
    setattr(profile, f"card_{side}_file", file)
    reset_status(profile)
    profile.version += 1
    profile.save()
    if file.scan_status == "clean" and not file.is_attached:
        uploads.attach(
            file,
            purpose=CARD_PURPOSE,
            owner_id=profile.pk,
            patient_id=profile.patient_id,
            actor=actor,
        )
    return file


def on_upload_scanned(sender: Any, file_id: Any, status: str, **kwargs: Any) -> None:
    """Attach a card photo when its scan comes back clean (S1 `upload_scanned` signal)."""
    if status != "clean":
        return
    from django.db.models import Q

    from medilink.uploads.models import UploadedFile

    profile = InsuranceProfile.objects.filter(
        Q(card_front_file_id=file_id) | Q(card_back_file_id=file_id)
    ).first()
    file = UploadedFile.objects.filter(pk=file_id).first()
    if profile is None or file is None or file.is_attached:
        return
    uploads.attach(
        file, purpose=CARD_PURPOSE, owner_id=profile.pk, patient_id=profile.patient_id, actor=None
    )


def profiles_of(patient: Patient) -> list[InsuranceProfile]:
    return list(
        InsuranceProfile.objects.filter(patient=patient)
        .select_related("last_verified_facility", "card_front_file", "card_back_file")
        .order_by("-is_active", "-created_at")
    )
