"""Clinical record (contract sprint-06 §2.1). Every table is facility-owned with forced RLS;
free text is field-encrypted (D-2) with `medilink.patients.crypto`, bound to table, column and row.

Data classes: consultation C4 (private notes), diagnosis C3/C4, addendum C3/C4, vitals C3,
access reason C2.
"""

from __future__ import annotations

from typing import Any, ClassVar

from django.conf import settings
from django.db import models
from django.db.models import Q

from medilink.core.models import TimeStampedModel, UUIDModel


class ConsultationStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    SIGNED = "signed", "Signed"
    ENTERED_IN_ERROR = "entered_in_error", "Entered in error"


# Encrypted sections: API name -> model column (contract §2.2, D-2)
SECTIONS: dict[str, str] = {
    "history": "history_enc",
    "examination": "examination_enc",
    "plan": "plan_enc",
    "patient_instructions": "instructions_enc",
    "private_notes": "private_notes_enc",
}


class Consultation(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    version = models.PositiveIntegerField(default=1)
    visit = models.ForeignKey("visits.Visit", on_delete=models.PROTECT, related_name="+")
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="+")
    facility_patient = models.ForeignKey(
        "patients.FacilityPatient", on_delete=models.PROTECT, related_name="+"
    )
    author_membership = models.ForeignKey(
        "tenancy.FacilityMembership", on_delete=models.PROTECT, related_name="+"
    )
    status = models.CharField(
        max_length=20, choices=ConsultationStatus.choices, default=ConsultationStatus.DRAFT
    )
    started_at = models.DateTimeField()
    signed_at = models.DateTimeField(null=True, blank=True)
    content_hash = models.BinaryField(null=True, blank=True)
    is_late_entry = models.BooleanField(default=False)
    is_restricted = models.BooleanField(default=False)
    history_enc = models.BinaryField(null=True, blank=True)
    examination_enc = models.BinaryField(null=True, blank=True)
    plan_enc = models.BinaryField(null=True, blank=True)
    instructions_enc = models.BinaryField(null=True, blank=True)
    private_notes_enc = models.BinaryField(null=True, blank=True)  # C4: never to patients
    entered_in_error_reason = models.CharField(max_length=300, blank=True)
    entered_in_error_at = models.DateTimeField(null=True, blank=True)
    entered_in_error_by_membership = models.ForeignKey(
        "tenancy.FacilityMembership",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        db_table = "clinical_consultation"
        indexes: ClassVar[list[Any]] = [
            models.Index(fields=["facility", "visit"], name="clinical_cons_visit"),
            models.Index(
                fields=["facility", "patient", "-signed_at"], name="clinical_cons_patient"
            ),
            models.Index(
                fields=["facility", "author_membership"],
                condition=Q(status="draft"),
                name="clinical_cons_drafts",
            ),
        ]
        constraints: ClassVar[list[Any]] = [
            models.UniqueConstraint(
                fields=["visit", "author_membership"],
                condition=Q(status="draft"),
                name="clinical_one_draft_per_author",
            ),
            models.CheckConstraint(
                condition=Q(status="draft")
                | Q(signed_at__isnull=False)
                | Q(status="entered_in_error"),
                name="clinical_signed_has_time",
            ),
        ]

    def __str__(self) -> str:
        return f"consultation {self.pk}"


class DiagnosisRank(models.TextChoices):
    PRIMARY = "primary", "Primary"
    SECONDARY = "secondary", "Secondary"


class Certainty(models.TextChoices):
    PROVISIONAL = "provisional", "Provisional"
    CONFIRMED = "confirmed", "Confirmed"


class Diagnosis(UUIDModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    consultation = models.ForeignKey(
        Consultation, on_delete=models.PROTECT, related_name="diagnoses"
    )
    code_system = models.CharField(max_length=8, default="icd10")
    code = models.CharField(max_length=10)
    display = models.CharField(max_length=300)
    plain_language = models.CharField(max_length=300, blank=True)
    rank = models.CharField(max_length=10, choices=DiagnosisRank.choices)
    certainty = models.CharField(max_length=12, choices=Certainty.choices)
    is_sensitive = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "clinical_diagnosis"
        indexes: ClassVar[list[Any]] = [
            models.Index(fields=["facility", "code"], name="clinical_diag_code"),
        ]
        constraints: ClassVar[list[Any]] = [
            models.UniqueConstraint(
                fields=["consultation"],
                condition=Q(rank="primary"),
                name="clinical_one_primary_diagnosis",
            ),
            models.UniqueConstraint(
                fields=["consultation", "code_system", "code"], name="clinical_diag_unique_code"
            ),
        ]

    def __str__(self) -> str:
        return self.code


class Addendum(UUIDModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    consultation = models.ForeignKey(Consultation, on_delete=models.PROTECT, related_name="addenda")
    author_membership = models.ForeignKey(
        "tenancy.FacilityMembership", on_delete=models.PROTECT, related_name="+"
    )
    reason = models.CharField(max_length=300)
    body_enc = models.BinaryField()
    content_hash = models.BinaryField()
    signed_at = models.DateTimeField()
    is_by_author = models.BooleanField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "clinical_addendum"
        indexes: ClassVar[list[Any]] = [
            models.Index(fields=["consultation", "signed_at"], name="clinical_addendum_cons"),
        ]

    def __str__(self) -> str:
        return f"addendum {self.pk}"


# Measurement columns and their plausible ranges (contract §2.2 Vitals)
VITAL_RANGES: dict[str, tuple[float, float]] = {
    "temperature_c": (30, 45),
    "systolic_mmhg": (50, 260),
    "diastolic_mmhg": (20, 160),
    "pulse_bpm": (20, 250),
    "respiratory_rate": (4, 80),
    "spo2_pct": (50, 100),
    "weight_kg": (0.3, 400),
    "height_cm": (20, 250),
    "muac_mm": (50, 400),
}


def _range(name: str) -> Q:
    low, high = VITAL_RANGES[name]
    return Q(**{f"{name}__isnull": True}) | Q(**{f"{name}__gte": low, f"{name}__lte": high})


class Vitals(UUIDModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    visit = models.ForeignKey("visits.Visit", on_delete=models.PROTECT, related_name="+")
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="+")
    consultation = models.ForeignKey(
        Consultation, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    recorded_by_membership = models.ForeignKey(
        "tenancy.FacilityMembership", on_delete=models.PROTECT, related_name="+"
    )
    recorded_at = models.DateTimeField()
    temperature_c = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    systolic_mmhg = models.PositiveSmallIntegerField(null=True, blank=True)
    diastolic_mmhg = models.PositiveSmallIntegerField(null=True, blank=True)
    pulse_bpm = models.PositiveSmallIntegerField(null=True, blank=True)
    respiratory_rate = models.PositiveSmallIntegerField(null=True, blank=True)
    spo2_pct = models.PositiveSmallIntegerField(null=True, blank=True)
    weight_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    height_cm = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    muac_mm = models.PositiveSmallIntegerField(null=True, blank=True)
    entered_in_error_at = models.DateTimeField(null=True, blank=True)
    entered_in_error_by_membership = models.ForeignKey(
        "tenancy.FacilityMembership",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    entered_in_error_reason = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "clinical_vitals"
        indexes: ClassVar[list[Any]] = [
            models.Index(fields=["facility", "visit"], name="clinical_vitals_visit"),
            models.Index(
                fields=["facility", "patient", "-recorded_at"], name="clinical_vitals_patient"
            ),
        ]
        constraints: ClassVar[list[Any]] = [
            *[
                models.CheckConstraint(condition=_range(name), name=f"clinical_vitals_{name}")
                for name in VITAL_RANGES
            ],
            models.CheckConstraint(
                condition=Q(systolic_mmhg__isnull=True)
                | Q(diastolic_mmhg__isnull=True)
                | Q(diastolic_mmhg__lt=models.F("systolic_mmhg")),
                name="clinical_vitals_bp_order",
            ),
            models.CheckConstraint(
                condition=(
                    Q(temperature_c__isnull=False)
                    | Q(systolic_mmhg__isnull=False)
                    | Q(diastolic_mmhg__isnull=False)
                    | Q(pulse_bpm__isnull=False)
                    | Q(respiratory_rate__isnull=False)
                    | Q(spo2_pct__isnull=False)
                    | Q(weight_kg__isnull=False)
                    | Q(height_cm__isnull=False)
                    | Q(muac_mm__isnull=False)
                ),
                name="clinical_vitals_not_empty",
            ),
        ]

    def __str__(self) -> str:
        return f"vitals {self.pk}"


class AccessReasonCode(models.TextChoices):
    CARE_CONTINUITY = "care_continuity", "Care continuity"
    RESULTS_REVIEW = "results_review", "Results review"
    ADMIN_REQUEST = "admin_request", "Administrative request"
    OTHER = "other", "Other"


class AccessReason(UUIDModel):
    """`authz_access_reason` (database design §5.2), created by this app (contract D-3)."""

    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    membership = models.ForeignKey(
        "tenancy.FacilityMembership", on_delete=models.PROTECT, related_name="+"
    )
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="+")
    facility_patient = models.ForeignKey(
        "patients.FacilityPatient", on_delete=models.PROTECT, related_name="+"
    )
    reason_code = models.CharField(max_length=20, choices=AccessReasonCode.choices)
    reason_text = models.CharField(max_length=300, blank=True)
    granted_until = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "authz_access_reason"
        indexes: ClassVar[list[Any]] = [
            models.Index(
                fields=["facility", "user", "facility_patient", "-granted_until"],
                name="authz_access_reason_lookup",
            ),
        ]

    def __str__(self) -> str:
        return f"access reason {self.pk}"


# ---- S6b (contract sprint-06 §2.1, §3.3) ----------------------------------------------------


class DocumentType(models.TextChoices):
    OUTSIDE_RESULT = "outside_result", "Outside lab or imaging result"
    LEGACY_RECORD = "legacy_record", "Paper record"
    REFERRAL_LETTER = "referral_letter", "Referral letter"
    OTHER = "other", "Other"


class ClinicalScan(TimeStampedModel):
    """A scanned or uploaded document attached to a patient at the facility (FR-PAT-11). Outside
    results also open a results inbox item (FR-CLN-09)."""

    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="+")
    facility_patient = models.ForeignKey(
        "patients.FacilityPatient", on_delete=models.PROTECT, related_name="+"
    )
    upload = models.OneToOneField(
        "uploads.UploadedFile", on_delete=models.PROTECT, related_name="+"
    )
    document_type = models.CharField(max_length=20, choices=DocumentType.choices)
    document_date = models.DateField()
    description = models.CharField(max_length=200, blank=True)
    uploaded_by_membership = models.ForeignKey(
        "tenancy.FacilityMembership", on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        db_table = "clinical_scan"
        ordering: ClassVar[list[str]] = ["-document_date", "-created_at"]


class ResultStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    REVIEWED = "reviewed", "Reviewed"


class ResultReview(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    version = models.PositiveIntegerField(default=1)
    scan = models.OneToOneField(ClinicalScan, on_delete=models.PROTECT, related_name="review")
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="+")
    facility_patient = models.ForeignKey(
        "patients.FacilityPatient", on_delete=models.PROTECT, related_name="+"
    )
    assigned_membership = models.ForeignKey(
        "tenancy.FacilityMembership", on_delete=models.PROTECT, related_name="+"
    )
    status = models.CharField(
        max_length=10, choices=ResultStatus.choices, default=ResultStatus.PENDING
    )
    comment_enc = models.BinaryField(null=True, blank=True)
    reviewed_by_membership = models.ForeignKey(
        "tenancy.FacilityMembership",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "clinical_result_review"
        ordering: ClassVar[list[str]] = ["created_at"]
        indexes: ClassVar[list[Any]] = [
            models.Index(
                fields=["facility", "assigned_membership"],
                condition=Q(status="pending"),
                name="clinical_result_inbox",
            ),
        ]


class HistoryKind(models.TextChoices):
    DIAGNOSIS = "diagnosis", "Diagnosis"
    CONDITION = "condition", "Condition"
    ALLERGY = "allergy", "Allergy"
    MEDICATION = "medication", "Medicine"
    PROCEDURE = "procedure", "Procedure"


class HistoryEntry(TimeStampedModel):
    """Structured back-entry from paper records, always labelled "Historical" (FR-PAT-12)."""

    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="+")
    facility_patient = models.ForeignKey(
        "patients.FacilityPatient", on_delete=models.PROTECT, related_name="+"
    )
    kind = models.CharField(max_length=12, choices=HistoryKind.choices)
    code = models.CharField(max_length=10, blank=True)  # ICD-10 for diagnoses
    display = models.CharField(max_length=200)
    note_enc = models.BinaryField(null=True, blank=True)
    occurred_on = models.DateField(null=True, blank=True)
    source_scan = models.ForeignKey(
        ClinicalScan, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    entered_by_membership = models.ForeignKey(
        "tenancy.FacilityMembership", on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        db_table = "clinical_history_entry"
        ordering: ClassVar[list[str]] = ["-occurred_on", "-created_at"]


class AttributeKind(models.TextChoices):
    BLOOD_GROUP = "blood_group", "Blood group"
    PREGNANCY = "pregnancy", "Pregnancy"


BLOOD_GROUPS = ("A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown")
PREGNANCY_VALUES = ("pregnant", "not_pregnant", "unknown")


class HealthAttribute(TimeStampedModel):
    """Blood group and pregnancy status (database design §5.5, contract D-13): patient-level,
    append-only; the latest row per kind wins."""

    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="+")
    kind = models.CharField(max_length=12, choices=AttributeKind.choices)
    value = models.CharField(max_length=20)
    due_date = models.DateField(null=True, blank=True)
    source = models.CharField(max_length=10, default="clinician")
    recorded_by_membership = models.ForeignKey(
        "tenancy.FacilityMembership",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    recorded_at = models.DateTimeField()

    class Meta:
        db_table = "patients_health_attribute"
        ordering: ClassVar[list[str]] = ["-recorded_at"]
        indexes: ClassVar[list[Any]] = [
            models.Index(fields=["patient", "kind", "-recorded_at"], name="patients_attr_latest"),
        ]


class BreakGlassReason(models.TextChoices):
    PATIENT_SAFETY = "patient_safety", "Patient safety emergency"
    LEGAL_REQUEST = "legal_request", "Legal or regulatory request"
    INCIDENT = "incident", "Security or data incident"
    OTHER = "other", "Other"


class ReviewOutcome(models.TextChoices):
    APPROPRIATE = "appropriate", "Appropriate"
    INAPPROPRIATE = "inappropriate", "Inappropriate"


class BreakGlassSession(TimeStampedModel):
    """Super admin emergency read access to one patient at one facility (FR-ACC-09, FR-SEC-09):
    60 minutes, read-only, reviewed by another super admin. Platform table (no facility RLS)."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="+")
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    reason_code = models.CharField(max_length=20, choices=BreakGlassReason.choices)
    reason_text = models.CharField(max_length=500)
    starts_at = models.DateTimeField()
    expires_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_outcome = models.CharField(max_length=14, choices=ReviewOutcome.choices, blank=True)
    review_note = models.CharField(max_length=500, blank=True)

    class Meta:
        db_table = "authz_break_glass_session"
        ordering: ClassVar[list[str]] = ["-starts_at"]
        constraints: ClassVar[list[Any]] = [
            models.CheckConstraint(
                condition=Q(reviewed_by__isnull=True) | ~Q(reviewed_by=models.F("user")),
                name="authz_break_glass_other_reviewer",
            ),
            models.CheckConstraint(
                condition=Q(expires_at__gt=models.F("starts_at")),
                name="authz_break_glass_window",
            ),
        ]


class ImportStatus(models.TextChoices):
    UPLOADED = "uploaded", "Uploaded"
    PREVIEWED = "previewed", "Previewed"
    CONFIRMED = "confirmed", "Confirmed"
    ROLLED_BACK = "rolled_back", "Rolled back"
    FAILED = "failed", "Failed"


class ImportRowStatus(models.TextChoices):
    PENDING = "pending", "Not checked yet"
    VALID = "valid", "Ready to import"
    ERROR = "error", "Has errors"
    DUPLICATE = "duplicate", "Likely duplicate"
    CREATED = "created", "Imported"
    ROLLED_BACK = "rolled_back", "Rolled back"


class ImportBatch(TimeStampedModel):
    """A legacy patient register imported from CSV (FR-PAT-10, contract sprint-06 §2.2)."""

    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    version = models.PositiveIntegerField(default=1)
    upload = models.OneToOneField(
        "uploads.UploadedFile", on_delete=models.PROTECT, related_name="+"
    )
    status = models.CharField(
        max_length=12, choices=ImportStatus.choices, default=ImportStatus.UPLOADED
    )
    headers = models.JSONField(default=list)
    column_mapping = models.JSONField(default=dict, blank=True)
    row_count = models.PositiveIntegerField(default=0)
    valid_count = models.PositiveIntegerField(default=0)
    error_count = models.PositiveIntegerField(default=0)
    duplicate_count = models.PositiveIntegerField(default=0)
    created_count = models.PositiveIntegerField(default=0)
    created_by_membership = models.ForeignKey(
        "tenancy.FacilityMembership", on_delete=models.PROTECT, related_name="+"
    )
    confirmed_by_membership = models.ForeignKey(
        "tenancy.FacilityMembership",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    confirmed_at = models.DateTimeField(null=True, blank=True)
    rollback_until = models.DateTimeField(null=True, blank=True)
    rolled_back_at = models.DateTimeField(null=True, blank=True)
    purged_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "patients_import_batch"
        ordering: ClassVar[list[str]] = ["-created_at"]


class ImportRow(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    batch = models.ForeignKey(ImportBatch, on_delete=models.PROTECT, related_name="rows")
    row_number = models.PositiveIntegerField()
    raw_enc = models.BinaryField(null=True, blank=True)  # may hold national IDs (C3)
    normalized = models.JSONField(default=dict, blank=True)  # never a national ID
    status = models.CharField(
        max_length=12, choices=ImportRowStatus.choices, default=ImportRowStatus.PENDING
    )
    errors = models.JSONField(default=list, blank=True)
    matched_patient = models.ForeignKey(
        "patients.Patient", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    created_facility_patient = models.ForeignKey(
        "patients.FacilityPatient",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        db_table = "patients_import_row"
        ordering: ClassVar[list[str]] = ["row_number"]
        constraints: ClassVar[list[Any]] = [
            models.UniqueConstraint(
                fields=["batch", "row_number"], name="patients_import_row_uniq"
            ),
        ]
