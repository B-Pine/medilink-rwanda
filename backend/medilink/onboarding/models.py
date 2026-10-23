"""Facility onboarding (contract §2.2, S1-D1..D4, D10, D12).

Platform-level tables without facility RLS (contract §2.6): applications exist before the
tenant does; status events, licences and flag overrides are the platform's verification and
operations data about facilities, listed across facilities. They are protected by the policy
layer (PlatformAdmin, the applicant session), explicit serializers, audit and append-only events.
"""

from __future__ import annotations

from typing import Any, ClassVar

from django.conf import settings
from django.db import models
from django.db.models import Q

from medilink.core.models import TimeStampedModel, UUIDModel
from medilink.tenancy.models import FacilityStatus, FacilityType, Ownership


class ApplicationStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    SUBMITTED = "submitted", "Submitted"
    UNDER_REVIEW = "under_review", "Under review"
    CHANGES_REQUESTED = "changes_requested", "Changes requested"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


EDITABLE_STATUSES = frozenset({ApplicationStatus.DRAFT, ApplicationStatus.CHANGES_REQUESTED})
OPEN_STATUSES = EDITABLE_STATUSES


class Application(TimeStampedModel):
    # Data classes (security 05): C2 unless noted.
    version = models.PositiveIntegerField(default=1)
    status = models.CharField(
        max_length=20, choices=ApplicationStatus.choices, default=ApplicationStatus.DRAFT
    )
    facility_name = models.CharField(max_length=200)
    facility_type = models.CharField(max_length=32, choices=FacilityType.choices, blank=True)
    level_of_care = models.CharField(max_length=12, blank=True)
    ownership = models.CharField(max_length=16, choices=Ownership.choices, blank=True)
    organization_name = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(max_length=254, blank=True)
    village = models.ForeignKey(
        "masterdata.Location", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    district_code = models.CharField(max_length=20, blank=True, db_index=True)  # C0, filter
    address = models.CharField(max_length=300, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    applicant_name = models.CharField(max_length=150)
    applicant_email = models.EmailField(max_length=254, db_index=True)  # stored lowercased
    applicant_phone = models.CharField(max_length=20, blank=True)
    applicant_position = models.CharField(max_length=120, blank=True)
    preferred_language = models.CharField(max_length=2, default="rw")
    proposed_admin_name = models.CharField(max_length=150, blank=True)
    proposed_admin_email = models.EmailField(max_length=254, blank=True)
    proposed_admin_phone = models.CharField(max_length=20, blank=True)
    claimed_insurer_codes = models.JSONField(default=list)  # text[] in the design; JSON list
    accepted_terms_version = models.CharField(max_length=32, blank=True)
    accepted_dpa_version = models.CharField(max_length=32, blank=True)
    ncsa_registration_confirmed = models.BooleanField(default=False)
    # C3: token hashes (SHA-256), never the tokens
    resume_token_hash = models.CharField(max_length=64, null=True, blank=True, unique=True)
    resume_token_expires_at = models.DateTimeField(null=True, blank=True)
    session_token_hash = models.CharField(max_length=64, null=True, blank=True, unique=True)
    session_expires_at = models.DateTimeField(null=True, blank=True)
    last_activity_at = models.DateTimeField(null=True, blank=True)
    created_by_platform_admin = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    facility = models.OneToOneField(
        "tenancy.Facility", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    general_comment = models.TextField(blank=True)  # latest request-changes comment
    submitted_at = models.DateTimeField(null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    draft_reminder_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "onboarding_application"
        indexes = [
            models.Index(fields=["status", "submitted_at"], name="onb_app_status_submitted_idx")
        ]

    def __str__(self) -> str:
        return f"{self.facility_name} ({self.status})"

    @property
    def is_editable(self) -> bool:
        return self.status in EDITABLE_STATUSES


class DocumentKind(models.TextChoices):
    MOH_LICENCE = "moh_licence", "MoH operating licence"
    RDB_REGISTRATION = "rdb_registration", "RDB registration"
    TIN_CERTIFICATE = "tin_certificate", "TIN certificate"
    ACCREDITATION = "accreditation", "Accreditation"
    INSURER_CONTRACT = "insurer_contract", "Insurer contract"
    OTHER = "other", "Other"


class DocumentReview(models.TextChoices):
    PENDING = "pending", "Pending"
    ACCEPTED = "accepted", "Accepted"
    NEEDS_CHANGE = "needs_change", "Needs change"


class ApplicationDocumentQuerySet(models.QuerySet["ApplicationDocument"]):
    def current(self) -> ApplicationDocumentQuerySet:
        return self.filter(deleted_at__isnull=True)


class ApplicationDocument(TimeStampedModel):
    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name="documents")
    file = models.OneToOneField("uploads.UploadedFile", on_delete=models.PROTECT, related_name="+")
    kind = models.CharField(max_length=20, choices=DocumentKind.choices)
    insurer_code = models.CharField(max_length=40, blank=True)
    number = models.CharField(max_length=80, blank=True)
    issued_on = models.DateField(null=True, blank=True)
    expires_on = models.DateField(null=True, blank=True)
    review_status = models.CharField(
        max_length=16, choices=DocumentReview.choices, default=DocumentReview.PENDING
    )
    review_comment = models.TextField(blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    objects: ClassVar[Any] = ApplicationDocumentQuerySet.as_manager()

    class Meta:
        db_table = "onboarding_application_document"


class EventKind(models.TextChoices):
    STATUS_CHANGE = "status_change", "Status change"
    NOTE = "note", "Note"
    ITEM_COMMENTS = "item_comments", "Item comments"
    DOCUMENT_REVIEW = "document_review", "Document review"
    LINK_SENT = "link_sent", "Resume link sent"
    PLATFORM_EDIT = "platform_edit", "Edited by the platform"


class ActorKind(models.TextChoices):
    APPLICANT = "applicant", "Applicant"
    PLATFORM_ADMIN = "platform_admin", "Super admin"
    SYSTEM = "system", "System"


class NoteKind(models.TextChoices):
    CALL = "call", "Call"
    VISIT = "visit", "Visit"
    DOCUMENT_CHECK = "document_check", "Document check"
    OTHER = "other", "Other"


class ApplicationEvent(UUIDModel):
    """Append-only history (UPDATE/DELETE revoked for the runtime role)."""

    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name="events")
    kind = models.CharField(max_length=20, choices=EventKind.choices)
    from_status = models.CharField(max_length=20, blank=True)
    to_status = models.CharField(max_length=20, blank=True)
    actor_kind = models.CharField(max_length=16, choices=ActorKind.choices)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    note_kind = models.CharField(max_length=16, choices=NoteKind.choices, blank=True)
    note = models.TextField(blank=True)
    reason_code = models.CharField(max_length=40, blank=True)
    item_comments = models.JSONField(default=list, blank=True)
    metadata = models.JSONField(default=dict, blank=True)  # document id, field names
    is_visible_to_applicant = models.BooleanField(default=False)
    idempotency_key = models.CharField(max_length=200, blank=True)
    occurred_at = models.DateTimeField(auto_now_add=True)
    occurred_on = models.DateField(null=True, blank=True)  # notes: when the call/visit happened

    class Meta:
        db_table = "onboarding_application_event"
        indexes = [models.Index(fields=["application", "occurred_at"], name="onb_event_app_idx")]
        constraints = [
            models.UniqueConstraint(
                fields=["application", "idempotency_key"],
                condition=~Q(idempotency_key=""),
                name="onb_event_idempotency_uniq",
            )
        ]


class FacilityStatusEvent(UUIDModel):
    """Append-only facility status history (S1-D2). The count of events is the facility's
    status `version` (tenancy_facility has no version column and S1 adds no tenancy migration)."""

    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    from_status = models.CharField(max_length=24, choices=FacilityStatus.choices, blank=True)
    to_status = models.CharField(max_length=24, choices=FacilityStatus.choices)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    reason_code = models.CharField(max_length=40, blank=True)
    reason_text = models.TextField(blank=True)
    idempotency_key = models.CharField(max_length=200, blank=True)
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "onboarding_facility_status_event"
        indexes = [models.Index(fields=["facility", "occurred_at"], name="onb_status_event_idx")]
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "idempotency_key"],
                condition=~Q(idempotency_key=""),
                name="onb_status_event_idempotency_uniq",
            )
        ]


class LicenceKind(models.TextChoices):
    MOH_OPERATING = "moh_operating", "MoH operating licence"
    PHARMACY = "pharmacy", "Pharmacy licence"
    RDB_REGISTRATION = "rdb_registration", "RDB registration"
    ACCREDITATION = "accreditation", "Accreditation"
    OTHER = "other", "Other"


class FacilityLicence(TimeStampedModel):
    """Versioned: a renewal is a new row and the old one is superseded (S1-D12)."""

    version = models.PositiveIntegerField(default=1)
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    kind = models.CharField(max_length=20, choices=LicenceKind.choices)
    number = models.CharField(max_length=80)
    issued_on = models.DateField(null=True, blank=True)
    expires_on = models.DateField()
    file = models.ForeignKey(
        "uploads.UploadedFile", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    source_document = models.ForeignKey(
        ApplicationDocument, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    last_reminder_days = models.PositiveSmallIntegerField(null=True, blank=True)  # 60, 30, 0
    superseded_by = models.ForeignKey(
        "self", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    superseded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "onboarding_facility_licence"
        indexes = [
            models.Index(
                fields=["expires_on"],
                condition=Q(superseded_at__isnull=True),
                name="onb_licence_current_expiry_idx",
            )
        ]


class FeatureFlag(TimeStampedModel):
    version = models.PositiveIntegerField(default=1)
    code = models.CharField(max_length=80, unique=True)  # <area>.<name>
    description = models.CharField(max_length=300)
    default_enabled = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "onboarding_feature_flag"
        ordering = ["code"]

    def __str__(self) -> str:
        return self.code


class FacilityFeatureFlag(TimeStampedModel):
    flag = models.ForeignKey(FeatureFlag, on_delete=models.CASCADE, related_name="overrides")
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.CASCADE, related_name="+")
    is_enabled = models.BooleanField()
    note = models.CharField(max_length=300, blank=True)
    set_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, related_name="+"
    )

    class Meta:
        db_table = "onboarding_facility_feature_flag"
        constraints = [
            models.UniqueConstraint(fields=["flag", "facility"], name="onb_facility_flag_uniq")
        ]
