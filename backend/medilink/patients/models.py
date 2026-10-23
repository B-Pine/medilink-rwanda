"""Patients and identity (Sprint 0 tables extended by Sprint 3, contract §2.1).

Platform-wide tables (patient, identifiers, insurance, health items, consents) have no facility
RLS: staff reach them only through a facility record of the active facility, patients only through
an active PatientLink (contract §2.3). `patients_facility_patient` has forced facility RLS.
"""

from __future__ import annotations

from typing import Any, ClassVar

from django.conf import settings
from django.contrib.postgres.indexes import GinIndex, OpClass
from django.db import models
from django.db.models import F, Q

from medilink.core.models import TimeStampedModel, UUIDModel


class Sex(models.TextChoices):
    FEMALE = "female", "Female"
    MALE = "male", "Male"
    OTHER = "other", "Other"


class Relationship(models.TextChoices):
    SELF = "self", "Self"
    GUARDIAN = "guardian", "Guardian"
    DELEGATE = "delegate", "Delegate"


class ConsentKind(models.TextChoices):
    TERMS = "terms", "Terms of use"
    PRIVACY = "privacy", "Privacy notice"
    CARE = "care", "Care"
    RESEARCH = "research", "Research"
    # S3
    NOTIFICATIONS = "notifications", "Notifications"
    LOCATION = "location", "Location"
    SHARING = "sharing", "Sharing"
    GUARDIAN = "guardian", "Guardian"
    DELEGATION = "delegation", "Delegation"


class ConsentChannel(models.TextChoices):
    WEB = "web", "Web"
    MOBILE = "mobile", "Mobile app"
    STAFF_ASSISTED = "staff_assisted", "Staff assisted"


class CreatedVia(models.TextChoices):
    SELF_SIGNUP = "self_signup", "Self sign-up"
    DEPENDENT = "dependent", "Dependent"
    WALK_IN = "walk_in", "Walk-in"


class Patient(TimeStampedModel):
    """Platform-wide person (C2). Identifiers live in `patients_identifier` (encrypted)."""

    version = models.PositiveIntegerField(default=1)
    medilink_number = models.CharField(max_length=12, unique=True, null=True)  # noqa: DJ001 (backfilled)
    full_name = models.CharField(max_length=200)
    preferred_name = models.CharField(max_length=100, null=True, blank=True)  # noqa: DJ001
    date_of_birth = models.DateField(null=True, blank=True)
    is_birth_date_estimated = models.BooleanField(default=False)
    # null = unknown; the API returns an explicit null (architecture 02 §2)
    sex = models.CharField(max_length=8, choices=Sex.choices, null=True, blank=True)  # noqa: DJ001
    phone_e164 = models.CharField(max_length=16, null=True, blank=True)  # noqa: DJ001
    email = models.EmailField(max_length=254, null=True, blank=True)  # noqa: DJ001
    address = models.CharField(max_length=300, null=True, blank=True)  # noqa: DJ001
    emergency_contact = models.JSONField(null=True, blank=True)
    created_via = models.CharField(
        max_length=16, choices=CreatedVia.choices, default=CreatedVia.SELF_SIGNUP
    )
    name_normalized = models.CharField(max_length=200, default="")
    no_known_allergies = models.BooleanField(null=True, blank=True)
    merged_into = models.ForeignKey(
        "self", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    merged_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            GinIndex(OpClass("name_normalized", name="gin_trgm_ops"), name="patients_name_trgm"),
            models.Index(fields=["date_of_birth"], name="patients_dob_idx"),
            models.Index(fields=["phone_e164"], name="patients_phone_idx"),
        ]

    def __str__(self) -> str:
        return f"patient {self.pk}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        from medilink.patients.normalize import normalize_name

        self.name_normalized = normalize_name(self.full_name)
        update_fields = kwargs.get("update_fields")
        if update_fields is not None and "full_name" in update_fields:
            kwargs["update_fields"] = {*update_fields, "name_normalized"}
        super().save(*args, **kwargs)


class IdentifierKind(models.TextChoices):
    NATIONAL_ID = "national_id", "National ID"
    PASSPORT = "passport", "Passport"
    REFUGEE_ID = "refugee_id", "Refugee ID"
    BIRTH_CERTIFICATE = "birth_certificate", "Birth certificate"


class Identifier(UUIDModel):
    """C3. Value only as AES-GCM ciphertext + blind index + last four (contract §2.4)."""

    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="identifiers")
    kind = models.CharField(max_length=20, choices=IdentifierKind.choices)
    issuing_country = models.CharField(max_length=2)
    value_enc = models.BinaryField()
    value_bidx = models.BinaryField()
    bidx_key_id = models.PositiveSmallIntegerField()
    value_last4 = models.CharField(max_length=4)
    verified_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    verified_facility = models.ForeignKey(
        "tenancy.Facility", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    superseded_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "patients_identifier"
        constraints = [
            models.UniqueConstraint(
                fields=["kind", "issuing_country", "bidx_key_id", "value_bidx"],
                condition=Q(superseded_at__isnull=True),
                name="patients_identifier_value_uniq",
            ),
            models.UniqueConstraint(
                fields=["patient", "kind", "issuing_country"],
                condition=Q(superseded_at__isnull=True),
                name="patients_identifier_one_per_kind",
            ),
        ]

    @property
    def is_active(self) -> bool:
        return self.superseded_at is None


class PatientLinkQuerySet(models.QuerySet["PatientLink"]):
    def active(self) -> PatientLinkQuerySet:
        return self.filter(revoked_at__isnull=True)

    def for_account(self, user: object) -> PatientLinkQuerySet:
        return self.filter(account=user)


class RevokeReason(models.TextChoices):
    BY_GRANTOR = "revoked_by_grantor", "Revoked by the grantor"
    LEFT = "left_by_holder", "Left by the holder"
    MERGED = "merged", "Merged"
    CLAIMED = "claimed", "Claimed"


class PatientLink(TimeStampedModel):
    """An account's access to a patient profile: self, guardian of a minor, or delegate."""

    account = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="patient_links"
    )
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="links")
    relationship = models.CharField(max_length=16, choices=Relationship.choices)
    revoked_at = models.DateTimeField(null=True, blank=True)
    # S3
    granted_at = models.DateTimeField(null=True, blank=True)
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    consent_record = models.ForeignKey(
        "ConsentRecord", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    revoked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    revoke_reason = models.CharField(  # noqa: DJ001
        max_length=24, choices=RevokeReason.choices, null=True, blank=True
    )

    objects: ClassVar[Any] = PatientLinkQuerySet.as_manager()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["account", "patient"],
                condition=Q(revoked_at__isnull=True),
                name="patients_link_active_unique",
            ),
            models.UniqueConstraint(
                fields=["account"],
                condition=Q(relationship="self", revoked_at__isnull=True),
                name="patients_link_one_self_per_account",
            ),
        ]

    def __str__(self) -> str:
        return f"patient link {self.pk}"


class ConsentRecord(UUIDModel):
    """Versioned consent decision (FR-SEC-04/05). Append-only: a change of mind is a new record."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="consents",
    )
    kind = models.CharField(max_length=16, choices=ConsentKind.choices)
    version = models.CharField(max_length=32)
    granted = models.BooleanField()
    granted_at = models.DateTimeField()
    channel = models.CharField(max_length=16, choices=ConsentChannel.choices)
    created_at = models.DateTimeField(auto_now_add=True)
    # S3
    patient = models.ForeignKey(
        Patient, on_delete=models.PROTECT, null=True, blank=True, related_name="consents"
    )
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    facility = models.ForeignKey(
        "tenancy.Facility", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )

    class Meta:
        ordering = ["-granted_at"]
        indexes = [
            models.Index(fields=["user", "kind", "-granted_at"], name="patients_consent_lookup"),
            models.Index(
                fields=["patient", "kind", "-granted_at"], name="patients_consent_patient"
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(user__isnull=False) | Q(patient__isnull=False),
                name="patients_consent_subject",
            )
        ]

    def __str__(self) -> str:
        return f"consent {self.kind} {self.pk}"


class FacilityPatientQuerySet(models.QuerySet["FacilityPatient"]):
    def active(self) -> FacilityPatientQuerySet:
        return self.filter(is_active=True)


class FacilityPatient(TimeStampedModel):
    """A patient known at a facility (forced RLS on facility_id). Visits hang here from S4."""

    version = models.PositiveIntegerField(default=1)
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="facility_records")
    file_number = models.CharField(max_length=40, null=True, blank=True)  # noqa: DJ001
    first_visit_on = models.DateField()
    reception_notes = models.CharField(max_length=500, null=True, blank=True)  # noqa: DJ001
    is_staff_member = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    merged_into = models.ForeignKey(
        "self", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    registered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    registration_key = models.UUIDField(null=True, blank=True)

    objects: ClassVar[Any] = FacilityPatientQuerySet.as_manager()

    class Meta:
        db_table = "patients_facility_patient"
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "patient"], name="patients_fp_facility_patient_uniq"
            ),
            models.UniqueConstraint(
                fields=["facility", "file_number"],
                condition=Q(file_number__isnull=False),
                name="patients_fp_file_number_uniq",
            ),
            models.UniqueConstraint(
                fields=["facility", "registration_key"],
                condition=Q(registration_key__isnull=False),
                name="patients_fp_registration_key_uniq",
            ),
        ]


class DelegationInvite(UUIDModel):
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="+")
    relationship = models.CharField(max_length=16, choices=Relationship.choices)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    code_hash = models.BinaryField(unique=True)
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)
    accepted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    link = models.ForeignKey(
        PatientLink, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    revoked_at = models.DateTimeField(null=True, blank=True)
    consent_record = models.ForeignKey(ConsentRecord, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "patients_delegation_invite"


class InsuranceStatus(models.TextChoices):
    UNVERIFIED = "unverified", "Unverified"
    VERIFIED = "verified", "Verified"
    REJECTED = "rejected", "Rejected"


class PrincipalRelationship(models.TextChoices):
    SPOUSE = "spouse", "Spouse"
    CHILD = "child", "Child"
    PARENT = "parent", "Parent"
    OTHER = "other", "Other"


class InsuranceProfile(TimeStampedModel):
    version = models.PositiveIntegerField(default=1)
    patient = models.ForeignKey(
        Patient, on_delete=models.PROTECT, related_name="insurance_profiles"
    )
    insurer = models.ForeignKey(
        "masterdata.Insurer", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    insurer_code = models.CharField(max_length=40)
    insurer_display = models.CharField(max_length=120)
    member_number = models.CharField(max_length=40)
    is_principal = models.BooleanField(default=True)
    principal_name = models.CharField(max_length=200, null=True, blank=True)  # noqa: DJ001
    principal_member_number = models.CharField(max_length=40, null=True, blank=True)  # noqa: DJ001
    relationship_to_principal = models.CharField(  # noqa: DJ001
        max_length=8, choices=PrincipalRelationship.choices, null=True, blank=True
    )
    valid_until = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=12, choices=InsuranceStatus.choices, default=InsuranceStatus.UNVERIFIED
    )
    status_reason = models.CharField(max_length=200, null=True, blank=True)  # noqa: DJ001
    last_verified_facility = models.ForeignKey(
        "tenancy.Facility", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    last_verified_at = models.DateTimeField(null=True, blank=True)
    last_verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    card_front_file = models.ForeignKey(
        "uploads.UploadedFile", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    card_back_file = models.ForeignKey(
        "uploads.UploadedFile", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        db_table = "patients_insurance_profile"
        indexes = [
            models.Index(fields=["insurer_code", "member_number"], name="patients_ins_member_idx")
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["patient", "insurer_code", "member_number"],
                condition=Q(is_active=True),
                name="patients_ins_active_uniq",
            )
        ]


class HealthSource(models.TextChoices):
    PATIENT = "patient", "Patient"
    CLINICIAN = "clinician", "Clinician"


class Verification(models.TextChoices):
    UNVERIFIED = "unverified", "Unverified"
    VERIFIED = "verified", "Verified"
    REFUTED = "refuted", "Refuted"


class HealthItem(TimeStampedModel):
    """Provenance columns shared by allergies, conditions and medications (C3)."""

    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="+")
    source = models.CharField(max_length=10, choices=HealthSource.choices)
    verification_status = models.CharField(max_length=10, choices=Verification.choices)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    recorded_facility = models.ForeignKey(
        "tenancy.Facility", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    reviewed_by_membership = models.ForeignKey(
        "tenancy.FacilityMembership",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.CharField(max_length=200, null=True, blank=True)  # noqa: DJ001
    entered_in_error_at = models.DateTimeField(null=True, blank=True)
    entered_in_error_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )

    class Meta:
        abstract = True


class AllergyCategory(models.TextChoices):
    DRUG = "drug", "Drug"
    FOOD = "food", "Food"
    OTHER = "other", "Other"


class Severity(models.TextChoices):
    MILD = "mild", "Mild"
    MODERATE = "moderate", "Moderate"
    SEVERE = "severe", "Severe"
    UNKNOWN = "unknown", "Unknown"


class Allergy(HealthItem):
    category = models.CharField(max_length=8, choices=AllergyCategory.choices)
    substance_text = models.CharField(max_length=120)
    reaction = models.CharField(max_length=200, null=True, blank=True)  # noqa: DJ001
    severity = models.CharField(max_length=10, choices=Severity.choices, default=Severity.UNKNOWN)

    class Meta:
        db_table = "patients_allergy"
        indexes = [
            models.Index(
                fields=["patient"],
                condition=Q(entered_in_error_at__isnull=True),
                name="patients_allergy_active",
            )
        ]


class ConditionStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    RESOLVED = "resolved", "Resolved"


class Condition(HealthItem):
    display = models.CharField(max_length=120)
    status = models.CharField(
        max_length=10, choices=ConditionStatus.choices, default=ConditionStatus.ACTIVE
    )
    onset_date = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "patients_condition"
        indexes = [
            models.Index(
                fields=["patient"],
                condition=Q(entered_in_error_at__isnull=True),
                name="patients_condition_active",
            )
        ]


class Medication(HealthItem):
    drug_display = models.CharField(max_length=120)
    dose_text = models.CharField(max_length=120, null=True, blank=True)  # noqa: DJ001
    started_on = models.DateField(null=True, blank=True)
    stopped_on = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "patients_medication"
        indexes = [
            models.Index(
                fields=["patient"],
                condition=Q(entered_in_error_at__isnull=True),
                name="patients_medication_active",
            )
        ]


class MergeScope(models.TextChoices):
    FACILITY = "facility", "Facility"
    CROSS_FACILITY = "cross_facility", "Cross-facility"
    CLAIM = "claim", "Claim"


class MergeStatus(models.TextChoices):
    REQUESTED = "requested", "Requested"
    REJECTED = "rejected", "Rejected"
    CANCELLED = "cancelled", "Cancelled"
    EXECUTED = "executed", "Executed"
    UNDONE = "undone", "Undone"


class Merge(TimeStampedModel):
    version = models.PositiveIntegerField(default=1)
    scope = models.CharField(max_length=16, choices=MergeScope.choices)
    facility = models.ForeignKey(
        "tenancy.Facility", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    surviving_patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="+")
    merged_patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="+")
    surviving_facility_patient = models.ForeignKey(
        FacilityPatient, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    merged_facility_patient = models.ForeignKey(
        FacilityPatient, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    status = models.CharField(
        max_length=10, choices=MergeStatus.choices, default=MergeStatus.REQUESTED
    )
    is_escalated = models.BooleanField(default=False)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    reason = models.CharField(max_length=300)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_reason = models.CharField(max_length=300, null=True, blank=True)  # noqa: DJ001
    moved_rows = models.JSONField(default=list)
    executed_at = models.DateTimeField(null=True, blank=True)
    undone_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    undone_at = models.DateTimeField(null=True, blank=True)
    undo_reason = models.CharField(max_length=300, null=True, blank=True)  # noqa: DJ001
    idempotency_key = models.CharField(max_length=200, blank=True)

    class Meta:
        db_table = "patients_merge"
        constraints = [
            models.CheckConstraint(
                condition=~Q(surviving_patient=F("merged_patient")), name="patients_merge_distinct"
            ),
            models.CheckConstraint(
                condition=Q(decided_by__isnull=True) | ~Q(decided_by=F("requested_by")),
                name="patients_merge_four_eyes",
            ),
            models.UniqueConstraint(
                fields=["surviving_patient"],
                condition=Q(status="requested"),
                name="patients_merge_open_surviving",
            ),
            models.UniqueConstraint(
                fields=["merged_patient"],
                condition=Q(status="requested"),
                name="patients_merge_open_merged",
            ),
        ]


class MergeEvent(UUIDModel):
    merge = models.ForeignKey(Merge, on_delete=models.PROTECT, related_name="events")
    from_status = models.CharField(max_length=10, null=True, blank=True)  # noqa: DJ001
    to_status = models.CharField(max_length=10)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    occurred_at = models.DateTimeField(auto_now_add=True)
    reason = models.CharField(max_length=300, null=True, blank=True)  # noqa: DJ001

    class Meta:
        db_table = "patients_merge_event"


class ClaimMethod(models.TextChoices):
    CONTACT_CODE = "contact_code", "Code to the contact email"
    RECEPTION_CHECK = "reception_check", "ID check at reception"


class ClaimStatus(models.TextChoices):
    CODE_SENT = "code_sent", "Code sent"
    AWAITING_RECEPTION = "awaiting_reception", "Awaiting reception"
    COMPLETED = "completed", "Completed"
    FAILED = "failed", "Failed"
    EXPIRED = "expired", "Expired"
    CANCELLED = "cancelled", "Cancelled"


class RecordClaim(UUIDModel):
    account = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="+")
    method = models.CharField(max_length=16, choices=ClaimMethod.choices)
    code_hash = models.BinaryField(null=True, blank=True)
    reference = models.CharField(max_length=8, unique=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    status = models.CharField(max_length=20, choices=ClaimStatus.choices)
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    facility = models.ForeignKey(
        "tenancy.Facility", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    merge = models.ForeignKey(
        Merge, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "patients_record_claim"


class ActorKind(models.TextChoices):
    STAFF = "staff", "Staff"
    SELF = "self", "Self"
    LINKED_ACCOUNT = "linked_account", "Linked account"
    PLATFORM = "platform", "Platform"
    SYSTEM = "system", "System"


class AuditLink(UUIDModel):
    """Which audit entries are about which patient (append-only; replaces
    audit_entry.patient_id)."""

    audit_entry = models.OneToOneField(
        "audit.AuditEntry", on_delete=models.PROTECT, related_name="+"
    )
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="+")
    occurred_at = models.DateTimeField()
    actor_kind = models.CharField(max_length=16, choices=ActorKind.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "patients_audit_link"
        indexes = [models.Index(fields=["patient", "-occurred_at"], name="patients_audit_link_idx")]
