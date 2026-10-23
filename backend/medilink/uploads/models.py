"""`uploads_file` (contract §2.2): one row per received file.

Content is append-only: after the scan only the status fields, the attachment and the soft delete
change. Row-level security isolates facility rows; rows without a facility (applications,
platform, patients) are governed by the purpose's policy functions (contract §2.6).
"""

from __future__ import annotations

from django.conf import settings
from django.db import models
from django.db.models import Q

from medilink.core.models import UUIDModel


class ScanStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    CLEAN = "clean", "Clean"
    INFECTED = "infected", "Infected"
    REJECTED = "rejected", "Rejected"
    FAILED = "failed", "Failed"


FINAL_STATUSES = frozenset(
    {ScanStatus.CLEAN, ScanStatus.INFECTED, ScanStatus.REJECTED, ScanStatus.FAILED}
)


class OwnerKind(models.TextChoices):
    APPLICATION = "application", "Facility application"
    PLATFORM = "platform", "Platform"
    PATIENT = "patient", "Patient"
    FACILITY = "facility", "Facility"


class StorageBucket(models.TextChoices):
    QUARANTINE = "quarantine", "Quarantine"
    DOCUMENTS = "documents", "Documents"


class UploadedVia(models.TextChoices):
    PUBLIC = "public", "Public"
    STAFF = "staff", "Staff"
    PATIENT = "patient", "Patient"
    PLATFORM = "platform", "Platform"


class UploadedFile(UUIDModel):
    # Data classes per field (security 05): the content class comes from the purpose.
    purpose = models.CharField(max_length=64)  # C0
    owner_kind = models.CharField(max_length=16, choices=OwnerKind.choices)  # C0
    owner_id = models.UUIDField(null=True, blank=True)  # C1, set by attach()
    facility = models.ForeignKey(
        "tenancy.Facility", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )  # C1
    patient = models.ForeignKey(
        "patients.Patient", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )  # C2
    data_class = models.CharField(max_length=2)  # C0
    storage_bucket = models.CharField(max_length=16, choices=StorageBucket.choices)  # C0
    storage_key = models.UUIDField(unique=True)  # C1
    original_sha256 = models.CharField(max_length=64)  # C1
    sha256 = models.CharField(max_length=64, blank=True, db_index=True)  # C1 (stored bytes)
    size_bytes = models.PositiveBigIntegerField()  # C0
    content_type = models.CharField(max_length=64)  # C0 (sniffed)
    original_filename = models.CharField(max_length=200)  # purpose's class (sanitised)
    scan_status = models.CharField(
        max_length=16, choices=ScanStatus.choices, default=ScanStatus.PENDING
    )  # C0
    rejection_reason = models.CharField(max_length=64, blank=True)  # C0
    scanned_at = models.DateTimeField(null=True, blank=True)
    scanner_version = models.CharField(max_length=100, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )  # C1, null = applicant
    uploaded_via = models.CharField(max_length=16, choices=UploadedVia.choices)  # C0
    idempotency_scope = models.CharField(max_length=80)  # C1, "user:<id>" or "application:<id>"
    idempotency_key = models.CharField(max_length=200, blank=True)  # C1
    attached_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "uploads_file"
        indexes = [
            models.Index(fields=["scan_status", "created_at"], name="uploads_file_status_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["idempotency_scope", "idempotency_key"],
                condition=~Q(idempotency_key=""),
                name="uploads_file_idempotency_uniq",
            ),
            models.CheckConstraint(
                condition=Q(data_class__in=["C0", "C1", "C2", "C3"]),
                name="uploads_file_data_class_valid",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.purpose}:{self.pk}"

    @property
    def is_attached(self) -> bool:
        return self.attached_at is not None

    @property
    def is_final(self) -> bool:
        return self.scan_status in FINAL_STATUSES
