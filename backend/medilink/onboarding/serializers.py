"""Onboarding schemas (contract §3.1). Output serializers render dicts built by the `*_data()`
functions below; input serializers are strict (unknown fields refused)."""

from __future__ import annotations

from datetime import date
from typing import Any

from django.utils import timezone
from rest_framework import serializers

from medilink.accounts.models import Language
from medilink.masterdata.kinds import localise
from medilink.masterdata.models import Location, LocationLevel, ReasonCode
from medilink.onboarding import services
from medilink.onboarding.models import (
    ActorKind,
    Application,
    ApplicationDocument,
    ApplicationEvent,
    ApplicationStatus,
    DocumentKind,
    DocumentReview,
    EventKind,
    FacilityFeatureFlag,
    FacilityLicence,
    FacilityStatusEvent,
    FeatureFlag,
    LicenceKind,
    NoteKind,
)
from medilink.tenancy.models import Facility, FacilityStatus, FacilityType, Ownership
from medilink.uploads.serializers import UploadSerializer

LICENCE_STATES = ["valid", "expiring", "expired", "missing"]
TERMS_VERSION = "2026-10"
DPA_VERSION = "2026-10"


class StrictSerializer(serializers.Serializer):
    def to_internal_value(self, data: Any) -> Any:
        if isinstance(data, dict):
            unknown = set(data) - set(self.fields)
            if unknown:
                raise serializers.ValidationError(
                    {name: ["Unknown field."] for name in sorted(unknown)}
                )
        return super().to_internal_value(data)


# ---- input ---------------------------------------------------------------------------------------


class ApplicantInput(StrictSerializer):
    name = serializers.CharField(max_length=150)
    email = serializers.EmailField(max_length=254)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    position = serializers.CharField(max_length=120, required=False, allow_blank=True)


class ApplicantPatchInput(ApplicantInput):
    name = serializers.CharField(max_length=150, required=False)
    email = serializers.EmailField(max_length=254, required=False)


class FacilityInput(StrictSerializer):
    name = serializers.CharField(max_length=200, required=False)
    facility_type = serializers.ChoiceField(choices=FacilityType.choices, required=False)
    level_of_care = serializers.ChoiceField(
        choices=["primary", "secondary", "tertiary"], required=False
    )
    ownership = serializers.ChoiceField(choices=Ownership.choices, required=False)
    organization_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    email = serializers.EmailField(max_length=254, required=False, allow_blank=True)


class LocationInput(StrictSerializer):
    village_code = serializers.CharField(max_length=20, required=False, allow_blank=True)
    address = serializers.CharField(max_length=300, required=False, allow_blank=True)
    latitude = serializers.DecimalField(
        max_digits=9, decimal_places=6, required=False, allow_null=True, min_value=-3, max_value=-1
    )
    longitude = serializers.DecimalField(
        max_digits=9, decimal_places=6, required=False, allow_null=True, min_value=28, max_value=31
    )


class AdminInput(StrictSerializer):
    name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    email = serializers.EmailField(max_length=254, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)


class StartApplicationInput(StrictSerializer):
    applicant = ApplicantInput()
    facility_name = serializers.CharField(max_length=200)
    preferred_language = serializers.ChoiceField(choices=Language.choices, default="rw")
    website = serializers.CharField(required=False, allow_blank=True, help_text="Leave empty")


class ApplicationPatchInput(StrictSerializer):
    version = serializers.IntegerField()
    facility = FacilityInput(required=False)
    location = LocationInput(required=False)
    applicant = ApplicantPatchInput(required=False)
    proposed_admin = AdminInput(required=False)
    claimed_insurer_codes = serializers.ListField(
        child=serializers.CharField(max_length=40), required=False, max_length=20
    )


class PlatformCreateInput(StrictSerializer):
    applicant = ApplicantInput()
    facility = FacilityInput()
    location = LocationInput(required=False)
    send_link = serializers.BooleanField(default=False)


class EmailInput(StrictSerializer):
    email = serializers.EmailField(max_length=254)


class TokenInput(StrictSerializer):
    token = serializers.CharField(max_length=200)


class DocumentInput(StrictSerializer):
    file = serializers.FileField(allow_empty_file=False, use_url=False)
    kind = serializers.ChoiceField(choices=DocumentKind.choices)
    insurer_code = serializers.CharField(max_length=40, required=False, allow_blank=True)
    number = serializers.CharField(max_length=80, required=False, allow_blank=True)
    issued_on = serializers.DateField(required=False, allow_null=True)
    expires_on = serializers.DateField(required=False, allow_null=True)


class DocumentPatchInput(StrictSerializer):
    number = serializers.CharField(max_length=80, required=False, allow_blank=True)
    issued_on = serializers.DateField(required=False, allow_null=True)
    expires_on = serializers.DateField(required=False, allow_null=True)


class SubmitInput(StrictSerializer):
    version = serializers.IntegerField()
    accepted_terms_version = serializers.CharField(max_length=32, allow_blank=True)
    accepted_dpa_version = serializers.CharField(max_length=32, allow_blank=True)
    ncsa_registration_confirmed = serializers.BooleanField()


class VersionInput(StrictSerializer):
    version = serializers.IntegerField()


class DocumentReviewInput(StrictSerializer):
    review_status = serializers.ChoiceField(
        choices=[DocumentReview.ACCEPTED, DocumentReview.NEEDS_CHANGE]
    )
    comment = serializers.CharField(max_length=2000, required=False, allow_blank=True)


class ItemCommentSerializer(StrictSerializer):
    target = serializers.CharField(max_length=120)
    comment = serializers.CharField(max_length=2000)


class RequestChangesInput(StrictSerializer):
    version = serializers.IntegerField()
    general_comment = serializers.CharField(max_length=4000, required=False, allow_blank=True)
    items = ItemCommentSerializer(many=True)


class LicenceInput(StrictSerializer):
    document_id = serializers.UUIDField(required=False, allow_null=True)
    kind = serializers.ChoiceField(choices=LicenceKind.choices)
    number = serializers.CharField(max_length=80)
    issued_on = serializers.DateField(required=False, allow_null=True)
    expires_on = serializers.DateField()


class ApproveInput(StrictSerializer):
    version = serializers.IntegerField()
    slug = serializers.SlugField(max_length=120)
    organization_name = serializers.CharField(max_length=200)
    facility_type = serializers.ChoiceField(choices=FacilityType.choices)
    ownership = serializers.ChoiceField(choices=Ownership.choices)
    licences = LicenceInput(many=True)


class ReasonInput(StrictSerializer):
    version = serializers.IntegerField()
    reason_code = serializers.CharField(max_length=40)
    reason_text = serializers.CharField(max_length=2000, required=False, allow_blank=True)


class DeactivateInput(ReasonInput):
    confirm_slug = serializers.CharField(max_length=120)


class NoteInput(StrictSerializer):
    note_kind = serializers.ChoiceField(choices=NoteKind.choices)
    text = serializers.CharField(max_length=2000)
    occurred_on = serializers.DateField(required=False, allow_null=True)


class NewLicenceInput(StrictSerializer):
    kind = serializers.ChoiceField(choices=LicenceKind.choices)
    number = serializers.CharField(max_length=80)
    issued_on = serializers.DateField(required=False, allow_null=True)
    expires_on = serializers.DateField()
    upload_id = serializers.UUIDField(required=False, allow_null=True)
    renews_licence_id = serializers.UUIDField(required=False, allow_null=True)


class LicencePatchInput(StrictSerializer):
    version = serializers.IntegerField()
    number = serializers.CharField(max_length=80, required=False)
    issued_on = serializers.DateField(required=False, allow_null=True)
    expires_on = serializers.DateField(required=False)


class FacilityFlagInput(StrictSerializer):
    is_enabled = serializers.BooleanField()
    note = serializers.CharField(max_length=300, required=False, allow_blank=True)


class FlagPatchInput(StrictSerializer):
    version = serializers.IntegerField()
    default_enabled = serializers.BooleanField(required=False)
    description = serializers.CharField(max_length=300, required=False)


# ---- output -------------------------------------------------------------------------------------


class PersonSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    full_name = serializers.CharField()


class FacilityBlock(serializers.Serializer):
    name = serializers.CharField()
    facility_type = serializers.CharField(allow_blank=True)
    level_of_care = serializers.CharField(allow_blank=True)
    ownership = serializers.CharField(allow_blank=True)
    organization_name = serializers.CharField(allow_blank=True)
    phone = serializers.CharField(allow_blank=True)
    email = serializers.CharField(allow_blank=True)


class LocationPathItem(serializers.Serializer):
    level = serializers.CharField()
    code = serializers.CharField()
    name = serializers.CharField()


class LocationBlock(serializers.Serializer):
    village_code = serializers.CharField(allow_null=True)
    address = serializers.CharField(allow_blank=True)
    latitude = serializers.FloatField(allow_null=True)
    longitude = serializers.FloatField(allow_null=True)
    path = LocationPathItem(many=True)


class ApplicantBlock(serializers.Serializer):
    name = serializers.CharField()
    email = serializers.CharField()
    phone = serializers.CharField(allow_blank=True)
    position = serializers.CharField(allow_blank=True)


class AdminBlock(serializers.Serializer):
    name = serializers.CharField(allow_blank=True)
    email = serializers.CharField(allow_blank=True)
    phone = serializers.CharField(allow_blank=True)


class AgreementsBlock(serializers.Serializer):
    accepted_terms_version = serializers.CharField(allow_null=True)
    accepted_dpa_version = serializers.CharField(allow_null=True)
    ncsa_registration_confirmed = serializers.BooleanField()


class RejectionBlock(serializers.Serializer):
    reason_code = serializers.CharField()
    reason_label = serializers.CharField()
    reason_text = serializers.CharField(allow_blank=True)


class FeedbackBlock(serializers.Serializer):
    general_comment = serializers.CharField(allow_blank=True)
    items = ItemCommentSerializer(many=True)
    rejection = RejectionBlock(allow_null=True)


class ApplicationDocumentSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=DocumentKind.choices)
    insurer_code = serializers.CharField(allow_null=True)
    number = serializers.CharField(allow_blank=True)
    issued_on = serializers.DateField(allow_null=True)
    expires_on = serializers.DateField(allow_null=True)
    review_status = serializers.ChoiceField(choices=DocumentReview.choices)
    review_comment = serializers.CharField(allow_blank=True)
    upload = UploadSerializer()


class DuplicateHintSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(
        choices=["same_licence_number", "same_applicant_email", "same_name_in_district"]
    )
    application_id = serializers.UUIDField(allow_null=True)
    facility_id = serializers.UUIDField(allow_null=True)


class ApplicantApplicationSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    status = serializers.ChoiceField(choices=ApplicationStatus.choices)
    version = serializers.IntegerField()
    facility = FacilityBlock()
    location = LocationBlock()
    applicant = ApplicantBlock()
    proposed_admin = AdminBlock()
    claimed_insurer_codes = serializers.ListField(child=serializers.CharField())
    documents = ApplicationDocumentSerializer(many=True)
    agreements = AgreementsBlock()
    feedback = FeedbackBlock()
    missing_for_submit = serializers.ListField(child=serializers.CharField())
    preferred_language = serializers.CharField()
    submitted_at = serializers.DateTimeField(allow_null=True)
    updated_at = serializers.DateTimeField()


class PlatformApplicationSerializer(ApplicantApplicationSerializer):
    created_by_platform = serializers.BooleanField()
    reviewer = PersonSerializer(allow_null=True)
    facility_id = serializers.UUIDField(allow_null=True)
    suggested_slug = serializers.CharField()
    last_activity_at = serializers.DateTimeField(allow_null=True)
    duplicate_hints = DuplicateHintSerializer(many=True)


class ApplicationSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    status = serializers.ChoiceField(choices=ApplicationStatus.choices)
    facility_name = serializers.CharField()
    facility_type = serializers.CharField(allow_blank=True)
    district_code = serializers.CharField(allow_blank=True)
    applicant_name = serializers.CharField()
    created_by_platform = serializers.BooleanField()
    submitted_at = serializers.DateTimeField(allow_null=True)
    last_activity_at = serializers.DateTimeField(allow_null=True)
    reviewer = PersonSerializer(allow_null=True)


class ApplicationEventSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=EventKind.choices)
    from_status = serializers.CharField(allow_blank=True)
    to_status = serializers.CharField(allow_blank=True)
    actor_kind = serializers.ChoiceField(choices=ActorKind.choices)
    actor = PersonSerializer(allow_null=True)
    note_kind = serializers.CharField(allow_blank=True)
    note = serializers.CharField(allow_blank=True)
    reason_code = serializers.CharField(allow_blank=True)
    item_comments = ItemCommentSerializer(many=True)
    metadata = serializers.DictField()
    occurred_at = serializers.DateTimeField()
    occurred_on = serializers.DateField(allow_null=True)


class DistrictSerializer(serializers.Serializer):
    code = serializers.CharField()
    name = serializers.CharField()


class PlatformFacilitySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    slug = serializers.CharField()
    facility_type = serializers.CharField()
    level_of_care = serializers.CharField(allow_blank=True)
    ownership = serializers.CharField()
    status = serializers.ChoiceField(choices=FacilityStatus.choices)
    district = DistrictSerializer(allow_null=True)
    application_id = serializers.UUIDField(allow_null=True)
    licence_state = serializers.ChoiceField(choices=LICENCE_STATES)
    next_licence_expiry = serializers.DateField(allow_null=True)
    created_at = serializers.DateTimeField()
    version = serializers.IntegerField()


class LicenceSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=LicenceKind.choices)
    number = serializers.CharField()
    issued_on = serializers.DateField(allow_null=True)
    expires_on = serializers.DateField()
    state = serializers.ChoiceField(choices=LICENCE_STATES)
    upload_id = serializers.UUIDField(allow_null=True)
    verified_by = PersonSerializer(allow_null=True)
    verified_at = serializers.DateTimeField(allow_null=True)
    superseded_at = serializers.DateTimeField(allow_null=True)
    version = serializers.IntegerField()


class PlatformFacilityDetailSerializer(PlatformFacilitySerializer):
    application = ApplicationSummarySerializer(allow_null=True)
    licences = LicenceSerializer(many=True)


class StatusEventSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    from_status = serializers.CharField(allow_blank=True)
    to_status = serializers.CharField()
    reason_code = serializers.CharField(allow_blank=True)
    reason_label = serializers.CharField(allow_blank=True)
    reason_text = serializers.CharField(allow_blank=True)
    actor = PersonSerializer(allow_null=True)
    occurred_at = serializers.DateTimeField()


class FeatureFlagSerializer(serializers.Serializer):
    code = serializers.CharField()
    description = serializers.CharField()
    default_enabled = serializers.BooleanField()
    is_active = serializers.BooleanField()
    override_count = serializers.IntegerField()
    version = serializers.IntegerField()


class FacilityFeatureFlagSerializer(serializers.Serializer):
    code = serializers.CharField()
    is_enabled = serializers.BooleanField()
    source = serializers.ChoiceField(choices=["override", "default"])  # type: ignore[assignment]
    note = serializers.CharField(allow_blank=True)
    set_by = PersonSerializer(allow_null=True)
    updated_at = serializers.DateTimeField(allow_null=True)


class ApproveResultSerializer(serializers.Serializer):
    application = PlatformApplicationSerializer()
    facility = PlatformFacilitySerializer()


class DistrictCountSerializer(serializers.Serializer):
    district_code = serializers.CharField()
    district = serializers.CharField()
    province = serializers.CharField()
    facilities = serializers.IntegerField()


class OverviewSerializer(serializers.Serializer):
    applications = serializers.DictField(child=serializers.IntegerField())
    licences = serializers.DictField(child=serializers.IntegerField())
    facilities = serializers.DictField(child=serializers.IntegerField())
    oldest_waiting_application = serializers.DictField(allow_null=True)
    facilities_by_district = DistrictCountSerializer(many=True)


# ---- data builders ------------------------------------------------------------------------------


def _person(user: Any) -> dict[str, Any] | None:
    return {"id": user.pk, "full_name": user.full_name} if user is not None else None


def _path(village: Location | None) -> list[dict[str, str]]:
    path = []
    node = village
    while node is not None:
        path.append({"level": node.level, "code": node.code, "name": node.name})
        node = node.parent
    return list(reversed(path))


def document_data(document: ApplicationDocument) -> dict[str, Any]:
    return {
        "id": document.pk,
        "kind": document.kind,
        "insurer_code": document.insurer_code or None,
        "number": document.number,
        "issued_on": document.issued_on,
        "expires_on": document.expires_on,
        "review_status": document.review_status,
        "review_comment": document.review_comment,
        "upload": UploadSerializer(document.file).data,
    }


def _feedback(application: Application, language: str) -> dict[str, Any]:
    items: list[dict[str, str]] = []
    rejection = None
    last = (
        ApplicationEvent.objects.filter(application=application, kind=EventKind.STATUS_CHANGE)
        .order_by("-occurred_at")
        .first()
    )
    if last is not None and last.to_status == ApplicationStatus.CHANGES_REQUESTED:
        items = list(last.item_comments or [])
    if application.status == ApplicationStatus.REJECTED and last is not None:
        reason = ReasonCode.objects.filter(
            kind="application_rejection", code=last.reason_code
        ).first()
        rejection = {
            "reason_code": last.reason_code,
            "reason_label": localise(reason.label_i18n, language) if reason else last.reason_code,
            "reason_text": last.note,
        }
    return {"general_comment": application.general_comment, "items": items, "rejection": rejection}


def application_data(
    application: Application, *, platform: bool = False, language: str = "en"
) -> dict[str, Any]:
    village = (
        Location.objects.select_related("parent__parent__parent__parent")
        .filter(pk=application.village_id)
        .first()
        if application.village_id
        else None
    )
    documents = (
        ApplicationDocument.objects.current()
        .filter(application=application)
        .select_related("file")
        .order_by("created_at")
    )
    data: dict[str, Any] = {
        "id": application.pk,
        "status": application.status,
        "version": application.version,
        "facility": {
            "name": application.facility_name,
            "facility_type": application.facility_type,
            "level_of_care": application.level_of_care,
            "ownership": application.ownership,
            "organization_name": application.organization_name,
            "phone": application.phone,
            "email": application.email,
        },
        "location": {
            "village_code": village.code if village else None,
            "address": application.address,
            "latitude": float(application.latitude) if application.latitude is not None else None,
            "longitude": float(application.longitude)
            if application.longitude is not None
            else None,
            "path": _path(village),
        },
        "applicant": {
            "name": application.applicant_name,
            "email": application.applicant_email,
            "phone": application.applicant_phone,
            "position": application.applicant_position,
        },
        "proposed_admin": {
            "name": application.proposed_admin_name,
            "email": application.proposed_admin_email,
            "phone": application.proposed_admin_phone,
        },
        "claimed_insurer_codes": list(application.claimed_insurer_codes or []),
        "documents": [document_data(d) for d in documents],
        "agreements": {
            "accepted_terms_version": application.accepted_terms_version or None,
            "accepted_dpa_version": application.accepted_dpa_version or None,
            "ncsa_registration_confirmed": application.ncsa_registration_confirmed,
        },
        "feedback": _feedback(application, language),
        "missing_for_submit": services.missing_for_submit(application)
        if application.is_editable
        else [],
        "preferred_language": application.preferred_language,
        "submitted_at": application.submitted_at,
        "updated_at": application.updated_at,
    }
    if platform:
        data.update(
            {
                "created_by_platform": application.created_by_platform_admin_id is not None,
                "reviewer": _person(application.reviewer),
                "facility_id": application.facility_id,
                "suggested_slug": services.suggested_slug(application),
                "last_activity_at": application.last_activity_at,
                "duplicate_hints": services.duplicate_hints(application),
            }
        )
    return data


def summary_data(application: Application) -> dict[str, Any]:
    return {
        "id": application.pk,
        "status": application.status,
        "facility_name": application.facility_name,
        "facility_type": application.facility_type,
        "district_code": application.district_code,
        "applicant_name": application.applicant_name,
        "created_by_platform": application.created_by_platform_admin_id is not None,
        "submitted_at": application.submitted_at,
        "last_activity_at": application.last_activity_at,
        "reviewer": _person(application.reviewer),
    }


def event_data(event: ApplicationEvent) -> dict[str, Any]:
    return {
        "id": event.pk,
        "kind": event.kind,
        "from_status": event.from_status,
        "to_status": event.to_status,
        "actor_kind": event.actor_kind,
        "actor": _person(event.actor),
        "note_kind": event.note_kind,
        "note": event.note,
        "reason_code": event.reason_code,
        "item_comments": event.item_comments or [],
        "metadata": event.metadata or {},
        "occurred_at": event.occurred_at,
        "occurred_on": event.occurred_on,
    }


def licence_data(licence: FacilityLicence, today: date | None = None) -> dict[str, Any]:
    return {
        "id": licence.pk,
        "kind": licence.kind,
        "number": licence.number,
        "issued_on": licence.issued_on,
        "expires_on": licence.expires_on,
        "state": services.licence_state(licence, today),
        "upload_id": licence.file_id,
        "verified_by": _person(licence.verified_by),
        "verified_at": licence.verified_at,
        "superseded_at": licence.superseded_at,
        "version": licence.version,
    }


def _current_licences(facility: Facility) -> list[FacilityLicence]:
    return list(
        FacilityLicence.objects.filter(facility=facility, superseded_at__isnull=True)
        .select_related("verified_by")
        .order_by("expires_on")
    )


def _district(application: Application | None) -> dict[str, str] | None:
    if application is None or not application.district_code:
        return None
    district = Location.objects.filter(code=application.district_code).first()
    return {"code": application.district_code, "name": district.name if district else ""}


def facility_data(facility: Facility, *, detail: bool = False) -> dict[str, Any]:
    application = Application.objects.filter(facility=facility).first()
    licences = _current_licences(facility)
    moh = [lic for lic in licences if lic.kind == LicenceKind.MOH_OPERATING]
    data: dict[str, Any] = {
        "id": facility.pk,
        "name": facility.name,
        "slug": facility.slug,
        "facility_type": facility.facility_type,
        "level_of_care": application.level_of_care if application else "",
        "ownership": facility.ownership,
        "status": facility.status,
        "district": _district(application),
        "application_id": application.pk if application else None,
        "licence_state": services.licence_state(moh[0] if moh else None),
        "next_licence_expiry": licences[0].expires_on if licences else None,
        "created_at": facility.created_at,
        "version": services.facility_version(facility),
    }
    if detail:
        data["application"] = summary_data(application) if application else None
        data["licences"] = [licence_data(lic) for lic in licences]
    return data


def status_event_data(event: FacilityStatusEvent, language: str = "en") -> dict[str, Any]:
    label = ""
    if event.reason_code:
        reason = ReasonCode.objects.filter(
            code=event.reason_code, kind__startswith="facility_"
        ).first()
        label = localise(reason.label_i18n, language) if reason else event.reason_code
    return {
        "id": event.pk,
        "from_status": event.from_status,
        "to_status": event.to_status,
        "reason_code": event.reason_code,
        "reason_label": label,
        "reason_text": event.reason_text,
        "actor": _person(event.actor),
        "occurred_at": event.occurred_at,
    }


def flag_data(flag: FeatureFlag) -> dict[str, Any]:
    return {
        "code": flag.code,
        "description": flag.description,
        "default_enabled": flag.default_enabled,
        "is_active": flag.is_active,
        "override_count": flag.overrides.count(),
        "version": flag.version,
    }


def facility_flag_data(flag: FeatureFlag, override: FacilityFeatureFlag | None) -> dict[str, Any]:
    if override is None:
        return {
            "code": flag.code,
            "is_enabled": flag.default_enabled,
            "source": "default",
            "note": "",
            "set_by": None,
            "updated_at": None,
        }
    return {
        "code": flag.code,
        "is_enabled": override.is_enabled,
        "source": "override",
        "note": override.note,
        "set_by": _person(override.set_by),
        "updated_at": override.updated_at,
    }


def overview_data() -> dict[str, Any]:
    from django.db.models import Count

    statuses = dict(
        Application.objects.values_list("status").annotate(n=Count("id")).values_list("status", "n")
    )
    facilities = dict(
        Facility.objects.values_list("status").annotate(n=Count("id")).values_list("status", "n")
    )
    today = timezone.localdate()
    counts = {"expiring_60": 0, "expiring_30": 0, "expired": 0}
    for licence in FacilityLicence.objects.filter(superseded_at__isnull=True):
        days = (licence.expires_on - today).days
        if days < 0:
            counts["expired"] += 1
        elif days <= 30:
            counts["expiring_30"] += 1
        elif days <= 60:
            counts["expiring_60"] += 1
    oldest = (
        Application.objects.filter(status=ApplicationStatus.SUBMITTED)
        .order_by("submitted_at")
        .values("id", "submitted_at")
        .first()
    )
    # Network by district (design 04 §3.5): where facilities that are not deactivated sit, from
    # the location on their approved application (village -> cell -> sector -> district).
    districts: dict[str, dict[str, Any]] = {}
    for application in (
        Application.objects.filter(facility__isnull=False)
        .exclude(facility__status=FacilityStatus.DEACTIVATED)
        .select_related("village__parent__parent__parent__parent")
    ):
        node = application.village
        while node is not None and node.level != LocationLevel.DISTRICT:
            node = node.parent
        if node is None:
            continue
        row = districts.setdefault(
            node.code,
            {
                "district_code": node.code,
                "district": node.name,
                "province": node.parent.name if node.parent else "",
                "facilities": 0,
            },
        )
        row["facilities"] += 1
    return {
        "applications": {
            s: statuses.get(s, 0)
            for s in (
                ApplicationStatus.SUBMITTED,
                ApplicationStatus.UNDER_REVIEW,
                ApplicationStatus.CHANGES_REQUESTED,
                ApplicationStatus.APPROVED,
            )
        },
        "licences": counts,
        "facilities": {
            s: facilities.get(s, 0)
            for s in (
                FacilityStatus.APPROVED,
                FacilityStatus.SETUP,
                FacilityStatus.LIVE,
                FacilityStatus.SUSPENDED,
                FacilityStatus.DEACTIVATED,
            )
        },
        "oldest_waiting_application": (
            {"id": str(oldest["id"]), "submitted_at": oldest["submitted_at"]} if oldest else None
        ),
        "facilities_by_district": sorted(
            districts.values(), key=lambda r: (-r["facilities"], r["district"])
        ),
    }
