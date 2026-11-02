"""Documents (contract sprint-07 §2.1). S7a created the app with the number counter (D-2); S7b
adds generated documents, their versions, public verification, share links, and the referral,
lab request and sick note tables deferred from S6 (S6 D-1)."""

from __future__ import annotations

from typing import Any, ClassVar

from django.conf import settings
from django.db import models
from django.db.models import F, Q

from medilink.core.models import TimeStampedModel, UUIDModel


class NumberCounter(TimeStampedModel):
    """Last document number per facility, prefix and year (`RX-2026-000123`). One row is locked
    while a number is taken, so numbers have no gaps: a rolled-back transaction gives it back."""

    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    prefix = models.CharField(max_length=4)
    year = models.PositiveSmallIntegerField()
    last_value = models.PositiveBigIntegerField(default=0)

    class Meta:
        db_table = "documents_number_counter"
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "prefix", "year"], name="documents_counter_unique"
            ),
            models.CheckConstraint(
                condition=models.Q(prefix__regex=r"^[A-Z]{2,4}$"), name="documents_counter_prefix"
            ),
        ]


# ---- S7b: clinical letters and requests (database design §5.8) --------------------------------


class Urgency(models.TextChoices):
    ROUTINE = "routine", "Routine"
    URGENT = "urgent", "Urgent"
    EMERGENCY = "emergency", "Emergency"


class ClinicalDocumentSource(TimeStampedModel):
    """Written with the consultation (signed when it is signed) or after signing (signed on
    creation). Locked after signing by a trigger: only `document_id` may still be set."""

    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    consultation = models.ForeignKey(
        "clinical.Consultation", on_delete=models.PROTECT, related_name="+"
    )
    author_membership = models.ForeignKey(
        "tenancy.FacilityMembership", on_delete=models.PROTECT, related_name="+"
    )
    signed_at = models.DateTimeField(null=True, blank=True)
    document = models.OneToOneField(
        "documents.Document", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )

    class Meta:
        abstract = True


class Referral(ClinicalDocumentSource):
    to_facility = models.ForeignKey(
        "tenancy.Facility", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    to_facility_name = models.CharField(max_length=200)
    specialty = models.CharField(max_length=100)
    reason_enc = models.BinaryField()  # contract D-3 approach: free text can hold clinical detail
    urgency = models.CharField(max_length=10, choices=Urgency.choices, default=Urgency.ROUTINE)

    class Meta:
        db_table = "clinical_referral"


class LabRequest(ClinicalDocumentSource):
    tests = models.JSONField(default=list)  # [{code, name}]
    reason_enc = models.BinaryField()

    class Meta:
        db_table = "clinical_lab_request"


class SickNote(ClinicalDocumentSource):
    rest_from = models.DateField()
    rest_to = models.DateField()
    show_diagnosis = models.BooleanField(default=False)

    class Meta:
        db_table = "clinical_sick_note"
        constraints: ClassVar[list[Any]] = [
            models.CheckConstraint(
                condition=Q(rest_to__gte=F("rest_from")), name="clinical_sick_note_dates"
            )
        ]


# ---- S7b: documents, versions, verification, share links (database design §5.10) -------------


class DocumentKind(models.TextChoices):
    PRESCRIPTION = "prescription", "Prescription"
    REFERRAL = "referral", "Referral letter"
    LAB_REQUEST = "lab_request", "Lab or imaging request"
    SICK_NOTE = "sick_note", "Sick note"


# Number prefixes per kind (the prescription keeps its RX number from S7a).
PREFIXES = {
    DocumentKind.PRESCRIPTION: "RX",
    DocumentKind.REFERRAL: "REF",
    DocumentKind.LAB_REQUEST: "LAB",
    DocumentKind.SICK_NOTE: "SN",
}


class Document(TimeStampedModel):
    """A generated clinical document. Released to the patient when generated (every S7b kind is
    meant for the patient); each change of its source adds a version."""

    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    kind = models.CharField(max_length=20, choices=DocumentKind.choices)
    number = models.CharField(max_length=20)
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="+")
    facility_patient = models.ForeignKey(
        "patients.FacilityPatient", on_delete=models.PROTECT, related_name="+"
    )
    visit = models.ForeignKey(
        "visits.Visit", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    consultation = models.ForeignKey(
        "clinical.Consultation", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    source_id = models.UUIDField()  # prescription, referral, lab request or sick note
    author_membership = models.ForeignKey(
        "tenancy.FacilityMembership", on_delete=models.PROTECT, related_name="+"
    )
    language = models.CharField(max_length=2, default="rw")
    document_date = models.DateField()
    released_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "documents_document"
        constraints: ClassVar[list[Any]] = [
            models.UniqueConstraint(fields=["facility", "number"], name="documents_number_unique"),
            models.UniqueConstraint(fields=["kind", "source_id"], name="documents_source_unique"),
        ]
        indexes: ClassVar[list[Any]] = [
            models.Index(fields=["patient", "-document_date"], name="documents_patient_date"),
            models.Index(fields=["facility", "visit"], name="documents_visit"),
        ]


class DocumentVersion(UUIDModel):
    """One rendered PDF. Append-only, except `superseded_at` when a newer version replaces it.
    The object lives in the `documents` bucket under `storage_key` (generated, so no upload scan:
    contract D-9)."""

    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    document = models.ForeignKey(Document, on_delete=models.PROTECT, related_name="versions")
    version_no = models.PositiveSmallIntegerField()
    storage_key = models.CharField(max_length=200)
    size_bytes = models.PositiveIntegerField()
    sha256 = models.BinaryField()
    source_hash = models.BinaryField()  # SHA-256 of the rendered content; unchanged = no version
    created_at = models.DateTimeField(auto_now_add=True)
    superseded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "documents_document_version"
        ordering: ClassVar[list[str]] = ["-version_no"]
        constraints: ClassVar[list[Any]] = [
            models.UniqueConstraint(
                fields=["document", "version_no"], name="documents_version_unique"
            )
        ]


class VerificationStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    DISPENSED = "dispensed", "Dispensed"
    CANCELLED = "cancelled", "Cancelled"
    EXPIRED = "expired", "Expired"


class VerificationRecord(TimeStampedModel):
    """The public projection behind the QR code. No facility RLS (database design §5.10): it holds
    no more than the page shows, plus the details encrypted until a date-of-birth match."""

    code = models.CharField(max_length=12, unique=True)
    document = models.OneToOneField(Document, on_delete=models.PROTECT, related_name="verification")
    kind = models.CharField(max_length=20, choices=DocumentKind.choices)
    number = models.CharField(max_length=20)
    issued_at = models.DateTimeField()
    facility_name = models.CharField(max_length=200)
    author_name = models.CharField(max_length=200)
    author_licence = models.CharField(max_length=60, blank=True)
    status = models.CharField(
        max_length=12, choices=VerificationStatus.choices, default=VerificationStatus.ACTIVE
    )
    valid_until = models.DateTimeField(null=True, blank=True)
    version_no = models.PositiveSmallIntegerField(default=1)
    patient_dob_hmac = models.BinaryField(null=True, blank=True)
    details_enc = models.BinaryField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "documents_verification_record"


class VerificationResult(models.TextChoices):
    VALID = "valid", "Valid"
    NOT_FOUND = "not_found", "Not found"
    RATE_LIMITED = "rate_limited", "Rate limited"
    DOB_MISMATCH = "dob_mismatch", "Date of birth does not match"


class VerificationLog(UUIDModel):
    """Every verification attempt (append-only). `client_hash` is an HMAC of the IP address."""

    verification_record = models.ForeignKey(
        VerificationRecord, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    occurred_at = models.DateTimeField(auto_now_add=True)
    client_hash = models.BinaryField()
    result = models.CharField(max_length=14, choices=VerificationResult.choices)
    detailed = models.BooleanField(default=False)

    class Meta:
        db_table = "documents_verification_log"


class ShareLink(TimeStampedModel):
    """An expiring link a patient made for one document. The token is shown once; only its
    SHA-256 is stored. No facility RLS: found by token through a SECURITY DEFINER function."""

    document = models.ForeignKey(Document, on_delete=models.PROTECT, related_name="+")
    created_by_account = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    token_hash = models.BinaryField(unique=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    access_count = models.PositiveIntegerField(default=0)
    last_accessed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "documents_share_link"
