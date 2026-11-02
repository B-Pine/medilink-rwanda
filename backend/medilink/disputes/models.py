"""Disputes (contract sprint-10b §2, database design §5.13). Facility tables with forced RLS;
free text (description, messages, statements) encrypted as in S7 D-3."""

from __future__ import annotations

from typing import Any, ClassVar

from django.conf import settings
from django.db import models
from django.db.models import Q

from medilink.core.models import TimeStampedModel, UUIDModel


class Channel(models.TextChoices):
    APP = "app", "App"
    COUNTER = "counter", "Counter"


class DisputeType(models.TextChoices):
    BILLING = "billing", "Billing"
    MEDICATION = "medication", "Medication"
    QUEUE_BOOKING = "queue_booking", "Queue or booking"
    RECORD_CORRECTION = "record_correction", "Record correction"


class SubjectType(models.TextChoices):
    VISIT = "visit", "Visit"
    TICKET = "ticket", "Ticket"
    BOOKING = "booking", "Booking"
    NO_SHOW_STRIKE = "no_show_strike", "Missed-visit strike"
    PRESCRIPTION = "prescription", "Prescription"
    BILL = "bill", "Bill"
    DOCUMENT = "document", "Document"


class DisputeStatus(models.TextChoices):
    OPEN = "open", "Open"
    ACKNOWLEDGED = "acknowledged", "Acknowledged"
    UNDER_REVIEW = "under_review", "Under review"
    INFO_REQUESTED = "info_requested", "Information requested"
    RESOLVED = "resolved", "Resolved"
    ESCALATED = "escalated", "Escalated"
    FINAL_DECISION = "final_decision", "Final decision"
    CLOSED = "closed", "Closed"
    REOPENED = "reopened", "Reopened"


OPEN_STATUSES = (
    DisputeStatus.OPEN,
    DisputeStatus.ACKNOWLEDGED,
    DisputeStatus.UNDER_REVIEW,
    DisputeStatus.INFO_REQUESTED,
    DisputeStatus.RESOLVED,
    DisputeStatus.ESCALATED,
    DisputeStatus.REOPENED,
)


class HandlerLevel(models.TextChoices):
    FACILITY = "facility", "Facility"
    PLATFORM = "platform", "Platform"


class Outcome(models.TextChoices):
    NO_SHOW_REVERSED = "no_show_reversed", "Missed visit reversed"
    RECORD_CORRECTED = "record_corrected", "Record to be corrected"
    CORRECTION_REFUSED = "correction_refused", "Correction refused"
    REFUND = "refund", "Refund"
    BILL_CORRECTION = "bill_correction", "Bill correction"
    REBOOKING = "rebooking", "Rebooking"
    REJECTED = "rejected", "Rejected"


class Dispute(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    version = models.PositiveIntegerField(default=1)
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="+")
    # null for an online booking that never reached the facility (no facility record yet)
    facility_patient = models.ForeignKey(
        "patients.FacilityPatient",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    raised_by_account = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    raised_by_membership = models.ForeignKey(
        "tenancy.FacilityMembership",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    channel = models.CharField(max_length=8, choices=Channel.choices)
    type = models.CharField(max_length=20, choices=DisputeType.choices)
    subject_type = models.CharField(max_length=16, choices=SubjectType.choices)
    subject_id = models.UUIDField()
    subject_snapshot = models.JSONField(default=dict)
    description_enc = models.BinaryField()
    status = models.CharField(
        max_length=16, choices=DisputeStatus.choices, default=DisputeStatus.OPEN
    )
    handler_level = models.CharField(
        max_length=8, choices=HandlerLevel.choices, default=HandlerLevel.FACILITY
    )
    acknowledge_by = models.DateTimeField()
    decide_by = models.DateTimeField(null=True, blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    escalated_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    reopen_count = models.PositiveSmallIntegerField(default=0)
    outcome = models.CharField(max_length=20, choices=Outcome.choices, blank=True)
    decision_reason = models.CharField(max_length=1000, blank=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )

    class Meta:
        db_table = "disputes_dispute"
        constraints: ClassVar[list[Any]] = [
            models.UniqueConstraint(
                fields=["subject_type", "subject_id"],
                condition=Q(status__in=[s.value for s in OPEN_STATUSES]),
                name="disputes_one_open_per_subject",
            )
        ]
        indexes: ClassVar[list[Any]] = [
            models.Index(fields=["facility", "status"], name="disputes_facility_status"),
            models.Index(fields=["patient", "status"], name="disputes_patient_status"),
        ]


class DisputeEvent(UUIDModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    dispute = models.ForeignKey(Dispute, on_delete=models.PROTECT, related_name="events")
    from_status = models.CharField(max_length=16, blank=True)
    to_status = models.CharField(max_length=16)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    reason = models.CharField(max_length=300, blank=True)
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "disputes_dispute_event"
        ordering: ClassVar[list[str]] = ["occurred_at"]


class Visibility(models.TextChoices):
    THREAD = "thread", "Thread"
    INTERNAL = "internal", "Internal note"
    STAFF_COMMENT = "staff_comment", "Staff comment"


class AuthorRole(models.TextChoices):
    PATIENT = "patient", "Patient"
    HANDLER = "handler", "Handler"
    STAFF = "staff", "Staff"
    PLATFORM = "platform", "Platform"


class Message(UUIDModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    dispute = models.ForeignKey(Dispute, on_delete=models.PROTECT, related_name="messages")
    author_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    author_role = models.CharField(max_length=8, choices=AuthorRole.choices)
    visibility = models.CharField(max_length=14, choices=Visibility.choices)
    body_enc = models.BinaryField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "disputes_message"
        ordering: ClassVar[list[str]] = ["created_at"]


class Evidence(UUIDModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    dispute = models.ForeignKey(Dispute, on_delete=models.PROTECT, related_name="evidence")
    kind = models.CharField(max_length=16)  # audit_extract, record_snapshot
    snapshot = models.JSONField()
    snapshot_sha256 = models.BinaryField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "disputes_evidence"


class CommentRequest(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    dispute = models.ForeignKey(Dispute, on_delete=models.PROTECT, related_name="comment_requests")
    requested_membership = models.ForeignKey(
        "tenancy.FacilityMembership", on_delete=models.PROTECT, related_name="+"
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    responded_message = models.ForeignKey(
        Message, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "disputes_comment_request"


class ActionStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    DONE = "done", "Done"


class Action(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    dispute = models.ForeignKey(Dispute, on_delete=models.PROTECT, related_name="actions")
    outcome = models.CharField(max_length=20, choices=Outcome.choices)
    linked_object_type = models.CharField(max_length=30, blank=True)
    linked_object_id = models.UUIDField(null=True, blank=True)
    status = models.CharField(max_length=8, choices=ActionStatus.choices)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    done_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "disputes_action"


class Disagreement(TimeStampedModel):
    """The patient's statement when a correction is refused (FR-DSP-07, contract D-1)."""

    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    dispute = models.OneToOneField(Dispute, on_delete=models.PROTECT, related_name="disagreement")
    consultation = models.ForeignKey(
        "clinical.Consultation", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="+")
    statement_enc = models.BinaryField()
    created_by_account = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        db_table = "disputes_disagreement"
