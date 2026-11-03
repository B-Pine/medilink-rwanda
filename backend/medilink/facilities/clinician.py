"""The clinician's professional profile (FR-ACC-07; full profile 2026-11-03).

A clinician keeps one profile across facilities: council, licence number and end date, the
licence scan, profession, specialty (a fixed list), sex, qualifications and a photo. Each facility
admin checks the licence before attesting it (`staff.attest_licence`); a new licence (number,
council or scan) needs a new attestation everywhere. Expired licences lose their attestations in
the daily job, which also reminds the clinician and the facility admins 60 and 30 days before.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions

from medilink.accounts.models import SPECIALTIES, ClinicianProfile
from medilink.audit.services import record
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import FacilityMembership, RoleCode
from medilink.uploads import services as uploads
from medilink.uploads.models import UploadedFile
from medilink.uploads.purposes import UploadPurpose, get_purpose, register
from medilink.uploads.sniff import DOCUMENT_TYPES, IMAGE_TYPES

LICENCE_PURPOSE = "clinician_licence"
PHOTO_PURPOSE = "clinician_photo"
REMINDER_DAYS = (60, 30)
LICENCE_TAKEN = _("This licence number is already registered.")
BAD_UPLOAD = _("Upload the file again: it is not ready or not yours.")


# ---- upload purposes --------------------------------------------------------------------------


def _can_upload(principal: Any, fields: dict[str, Any]) -> bool:
    return getattr(principal, "user", None) is not None


def _can_read(principal: Any, file: Any) -> bool:
    """The clinician themself, or a facility admin of a facility where they work."""
    user = getattr(principal, "user", None)
    if user is None:
        return False
    if file.owner_id == user.pk:
        return True
    if "staff.manage" not in principal.permissions or principal.active_facility_id is None:
        return False
    with rls_context(facility_id=principal.active_facility_id, user_id=user.pk):
        return FacilityMembership.objects.filter(
            facility_id=principal.active_facility_id, user_id=file.owner_id
        ).exists()


def register_purposes() -> None:
    if get_purpose(LICENCE_PURPOSE) is None:
        register(
            UploadPurpose(
                code=LICENCE_PURPOSE,
                audiences=frozenset({"staff"}),
                owner_kind="platform",
                data_class="C1",
                content_types=DOCUMENT_TYPES,
                max_bytes=10 * 2**20,
                can_upload=_can_upload,
                can_read=_can_read,
            )
        )
    if get_purpose(PHOTO_PURPOSE) is None:
        register(
            UploadPurpose(
                code=PHOTO_PURPOSE,
                audiences=frozenset({"staff"}),
                owner_kind="platform",
                data_class="C0",
                content_types=IMAGE_TYPES,
                max_bytes=5 * 2**20,
                can_upload=_can_upload,
                can_read=_can_read,
            )
        )


# ---- read ----------------------------------------------------------------------------------


def licence_state(profile: ClinicianProfile | None, today: date | None = None) -> str:
    """valid, expiring (60 days or less), expired, or missing (no end date or no scan)."""
    if profile is None or profile.licence_valid_until is None or profile.licence_file_id is None:
        return "missing"
    left = (profile.licence_valid_until - (today or timezone.localdate())).days
    if left < 0:
        return "expired"
    return "expiring" if left <= REMINDER_DAYS[0] else "valid"


def file_ref(file: UploadedFile | None) -> dict[str, Any] | None:
    if file is None or file.deleted_at is not None:
        return None
    return {"id": file.pk, "original_filename": file.original_filename, "status": file.scan_status}


def profile_data(profile: ClinicianProfile) -> dict[str, Any]:
    return {
        "council": profile.council,
        "licence_number": profile.licence_number,
        "specialty": profile.specialty,
        "profession": profile.profession,
        "specialty_code": profile.specialty_code,
        "licence_valid_until": profile.licence_valid_until,
        "sex": profile.sex,
        "qualifications": profile.qualifications,
        "licence_state": licence_state(profile),
        "licence_file": file_ref(profile.licence_file),
        "photo_file": file_ref(profile.photo_file),
    }


def membership_clinician(profile: ClinicianProfile, membership: FacilityMembership) -> dict:
    """The clinician block of a member, for the facility admin's team list."""
    data = profile_data(profile)
    data.pop("photo_file")
    data["attested_at"] = membership.licence_attested_at
    data["refused_reason"] = membership.licence_refused_reason
    return data


# ---- write ---------------------------------------------------------------------------------


def _attach(user: Any, upload_id: Any, purpose: str) -> UploadedFile:
    file = UploadedFile.objects.filter(pk=upload_id, deleted_at__isnull=True).first()
    if file is None:
        raise exceptions.ValidationError({f"{purpose.split('_')[1]}_upload_id": [str(BAD_UPLOAD)]})
    if file.is_attached and file.owner_id == user.pk and file.purpose == purpose:
        return file  # the same file sent again
    try:
        return uploads.attach(file, purpose=purpose, owner_id=user.pk, actor=user)
    except (uploads.UploadRejected, uploads.NotClean):
        raise exceptions.ValidationError(
            {f"{purpose.split('_')[1]}_upload_id": [str(BAD_UPLOAD)]}
        ) from None


def save_profile(user: Any, data: dict[str, Any], *, request: Any) -> tuple[ClinicianProfile, bool]:
    """Create or update my profile. Returns it and whether the licence changed (the caller then
    removes every attestation: they were for the old licence)."""
    profile = ClinicianProfile.objects.filter(user_id=user.pk).first()
    before = (profile.council, profile.licence_number, profile.licence_file_id) if profile else None
    fields = dict(data)
    if "licence_upload_id" in fields:
        upload = fields.pop("licence_upload_id")
        fields["licence_file"] = _attach(user, upload, LICENCE_PURPOSE) if upload else None
    if "photo_upload_id" in fields:
        upload = fields.pop("photo_upload_id")
        fields["photo_file"] = _attach(user, upload, PHOTO_PURPOSE) if upload else None
    code = fields.get("specialty_code")
    if code and not fields.get("specialty"):
        fields["specialty"] = SPECIALTIES[code]  # the English name that letters print
    try:
        with transaction.atomic():
            profile, _created = ClinicianProfile.objects.update_or_create(
                user_id=user.pk, defaults=fields
            )
    except IntegrityError:
        from medilink.facilities.errors import FieldConflict

        raise FieldConflict("licence_number", str(LICENCE_TAKEN)) from None
    after = (profile.council, profile.licence_number, profile.licence_file_id)
    if before is None or after != before or "licence_valid_until" in fields:
        profile.licence_reminder_days = None  # a new end date starts the reminders again
        profile.save(update_fields=["licence_reminder_days", "updated_at"])
    return profile, before is None or after != before


def clear_attestations(user_id: Any, reason: str = "") -> int:
    """Remove the user's licence attestations in every facility (each in its RLS context)."""
    count = 0
    with rls_context(user_id=user_id):  # membership_self_read: the user's own memberships
        attested = list(
            FacilityMembership.objects.filter(
                user_id=user_id, licence_attested_at__isnull=False
            ).values_list("pk", "facility_id")
        )
    for pk, facility_id in attested:
        with rls_context(facility_id=facility_id, user_id=user_id):
            count += FacilityMembership.objects.filter(pk=pk).update(
                licence_attested_at=None,
                licence_attested_by=None,
                licence_refused_reason=reason,
                licence_refused_at=timezone.now() if reason else None,
            )
    return count


# ---- daily job -----------------------------------------------------------------------------


def _admin_emails(facility_id: Any) -> list[str]:
    with rls_context(facility_id=facility_id):
        return list(
            FacilityMembership.objects.filter(
                facility_id=facility_id, is_active=True, roles__code=RoleCode.FACILITY_ADMIN
            )
            .values_list("user__email", flat=True)
            .distinct()
        )


def _facilities_of(user_id: Any) -> list[Any]:
    with rls_context(user_id=user_id):
        return list(
            FacilityMembership.objects.filter(user_id=user_id, is_active=True).values_list(
                "facility_id", flat=True
            )
        )


def check_licences(today: date | None = None) -> dict[str, int]:
    """Remind 60 and 30 days before a licence ends; on the day after, remove the attestations
    (the clinician can't be scheduled or sign until a facility admin checks the new one)."""
    today = today or timezone.localdate()
    reminded = expired = 0
    soon = ClinicianProfile.objects.filter(
        licence_valid_until__gte=today,
        licence_valid_until__lte=today + timedelta(days=REMINDER_DAYS[0]),
    ).select_related("user")
    for profile in soon:
        assert profile.licence_valid_until is not None  # noqa: S101 (filtered)
        left = (profile.licence_valid_until - today).days
        due = min((d for d in REMINDER_DAYS if left <= d), default=None)
        if due is None or (profile.licence_reminder_days or 10_000) <= due:
            continue
        profile.licence_reminder_days = due
        profile.save(update_fields=["licence_reminder_days", "updated_at"])
        recipients = {profile.user.email}
        for facility_id in _facilities_of(profile.user_id):
            recipients.update(_admin_emails(facility_id))
        _send_reminder(profile, sorted(recipients), left)
        reminded += 1
    for profile in ClinicianProfile.objects.filter(licence_valid_until__lt=today):
        cleared = clear_attestations(profile.user_id, reason=str(_("The licence ended.")))
        if cleared:
            expired += cleared
            record(
                "staff.clinician_licence.expired",
                actor=None,
                object_type="user",
                object_id=profile.user_id,
            )
    return {"reminded": reminded, "expired": expired}


def _send_reminder(profile: ClinicianProfile, recipients: list[str], left: int) -> None:
    name, until = profile.user.full_name, profile.licence_valid_until
    transaction.on_commit(
        lambda: send_mail(
            subject=str(_("A practising licence ends in %(days)s days") % {"days": left}),
            message=str(
                _(
                    "The practising licence of %(name)s ends on %(date)s. Renew it with the "
                    "council and upload the new one under My clinician profile; a facility admin "
                    "then checks it again. After that date they can't be scheduled or sign."
                )
                % {"name": name, "date": until}
            ),
            from_email=None,
            recipient_list=recipients,
        )
    )
