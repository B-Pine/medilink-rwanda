"""Prescriptions, dispensing and availability (contract sprint-07 §2.1). Every table is
facility-owned with forced RLS; item instructions and query messages are field-encrypted (D-3)
with `medilink.patients.crypto`, bound to table, column and row.

Data classes: prescription and items C3, events C2, dispense records and lines C3,
availability C1, queries C3.
"""

from __future__ import annotations

from django.db import models
from django.db.models import F, Q

from medilink.core.models import TimeStampedModel


class PrescriptionStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    ISSUED = "issued", "Issued"
    AWAITING_PAYMENT = "awaiting_payment", "Awaiting payment"
    READY = "ready_to_dispense", "Ready to dispense"
    PARTLY = "partly_dispensed", "Partly dispensed"
    DISPENSED = "dispensed", "Dispensed"
    NOT_AVAILABLE = "not_available", "Not available"
    CANCELLED = "cancelled", "Cancelled"
    EXPIRED = "expired", "Expired"


class ItemStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    ISSUED = "issued", "Issued"
    PARTLY = "partly_dispensed", "Partly dispensed"
    DISPENSED = "dispensed", "Dispensed"
    NOT_AVAILABLE = "not_available", "Not available"
    CANCELLED = "cancelled", "Cancelled"
    EXPIRED = "expired", "Expired"


# Item states the pharmacy can still act on
OPEN_ITEM = (ItemStatus.ISSUED, ItemStatus.PARTLY, ItemStatus.NOT_AVAILABLE)


class Frequency(models.TextChoices):
    """Common frequencies; `per_day` drives the default quantity."""

    ONCE = "once", "Once"
    OD = "od", "Once a day"
    BD = "bd", "Twice a day"
    TDS = "tds", "Three times a day"
    QDS = "qds", "Four times a day"
    NOCTE = "nocte", "At night"
    PRN = "prn", "When needed"


PER_DAY: dict[str, int] = {"od": 1, "bd": 2, "tds": 3, "qds": 4, "nocte": 1}


class Route(models.TextChoices):
    ORAL = "oral", "Oral"
    TOPICAL = "topical", "On the skin"
    INHALED = "inhaled", "Inhaled"
    RECTAL = "rectal", "Rectal"
    VAGINAL = "vaginal", "Vaginal"
    EYE = "eye", "In the eye"
    EAR = "ear", "In the ear"
    NASAL = "nasal", "In the nose"
    INJECTION = "injection", "Injection"


class IdentityMethod(models.TextChoices):
    TICKET_NAME_DOB = "ticket_name_dob", "Ticket, name and date of birth"
    VERIFICATION_CODE = "verification_code", "Prescription code"


class DispenseOutcome(models.TextChoices):
    FULL = "full", "Dispensed in full"
    PARTIAL = "partial", "Dispensed in part"
    SUBSTITUTED = "substituted", "Generic substitution"
    NOT_AVAILABLE = "not_available", "Not available"


class QueryStatus(models.TextChoices):
    OPEN = "open", "Open"
    ANSWERED = "answered", "Answered"
    CLOSED = "closed", "Closed"


class Prescription(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    version = models.PositiveIntegerField(default=1)
    visit = models.ForeignKey("visits.Visit", on_delete=models.PROTECT, related_name="+")
    consultation = models.OneToOneField(
        "clinical.Consultation", on_delete=models.PROTECT, related_name="prescription"
    )
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="+")
    facility_patient = models.ForeignKey(
        "patients.FacilityPatient", on_delete=models.PROTECT, related_name="+"
    )
    prescriber_membership = models.ForeignKey(
        "tenancy.FacilityMembership", on_delete=models.PROTECT, related_name="+"
    )
    status = models.CharField(
        max_length=20, choices=PrescriptionStatus.choices, default=PrescriptionStatus.DRAFT
    )
    number = models.CharField(max_length=20, null=True, blank=True)  # noqa: DJ001  (NULL until issued)
    issued_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    cancelled_reason = models.CharField(max_length=300, blank=True)

    class Meta:
        db_table = "pharmacy_prescription"
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "number"],
                condition=Q(number__isnull=False),
                name="pharmacy_prescription_number_unique",
            ),
            models.CheckConstraint(
                condition=Q(status="draft") | Q(number__isnull=False, issued_at__isnull=False),
                name="pharmacy_prescription_issued_has_number",
            ),
        ]
        indexes = [
            models.Index(
                fields=["facility", "status", "issued_at"],
                condition=Q(status__in=["ready_to_dispense", "partly_dispensed"]),
                name="pharmacy_rx_queue",
            ),
            models.Index(fields=["patient", "issued_at"], name="pharmacy_rx_patient"),
        ]


class PrescriptionItem(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    prescription = models.ForeignKey(Prescription, on_delete=models.PROTECT, related_name="items")
    drug = models.ForeignKey(
        "masterdata.Drug", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    drug_code = models.CharField(max_length=40, blank=True)
    drug_display = models.CharField(max_length=300)
    free_text_drug = models.CharField(max_length=120, blank=True)
    is_off_catalogue = models.BooleanField(default=False)
    is_controlled = models.BooleanField(default=False)
    dose = models.CharField(max_length=60)
    frequency_code = models.CharField(max_length=20, choices=Frequency.choices)
    route = models.CharField(max_length=20, choices=Route.choices)
    duration_days = models.PositiveSmallIntegerField(null=True, blank=True)
    quantity = models.PositiveIntegerField()
    instructions_enc = models.BinaryField(null=True, blank=True)
    substitution_allowed = models.BooleanField(default=True)
    status = models.CharField(max_length=20, choices=ItemStatus.choices, default=ItemStatus.DRAFT)
    alert_overrides = models.JSONField(default=list, blank=True)
    replaces_item = models.ForeignKey(
        "self", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    cancelled_reason = models.CharField(max_length=300, blank=True)
    dispensed_quantity = models.PositiveIntegerField(default=0)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "pharmacy_prescription_item"
        ordering = ["sort_order", "created_at"]
        constraints = [
            models.CheckConstraint(condition=Q(quantity__gt=0), name="pharmacy_item_quantity"),
            models.CheckConstraint(
                condition=(Q(drug__isnull=False, is_off_catalogue=False))
                | (Q(drug__isnull=True, is_off_catalogue=True) & ~Q(free_text_drug="")),
                name="pharmacy_item_catalogue_or_free_text",
            ),
            models.CheckConstraint(
                condition=Q(dispensed_quantity__lte=F("quantity")),
                name="pharmacy_item_not_over_dispensed",
            ),
        ]


class PrescriptionEvent(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    prescription = models.ForeignKey(Prescription, on_delete=models.PROTECT, related_name="events")
    item = models.ForeignKey(
        PrescriptionItem, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    from_status = models.CharField(max_length=20, blank=True)
    to_status = models.CharField(max_length=20)
    actor = models.ForeignKey(
        "accounts.User", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    reason = models.CharField(max_length=300, blank=True)
    occurred_at = models.DateTimeField()

    class Meta:
        db_table = "pharmacy_prescription_event"
        ordering = ["occurred_at", "created_at"]


class DispenseRecord(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    prescription = models.ForeignKey(
        Prescription, on_delete=models.PROTECT, related_name="dispense_records"
    )
    pharmacist_membership = models.ForeignKey(
        "tenancy.FacilityMembership", on_delete=models.PROTECT, related_name="+"
    )
    identity_check_method = models.CharField(max_length=20, choices=IdentityMethod.choices)
    controlled_confirmed = models.BooleanField(default=False)
    signed_at = models.DateTimeField()
    document_id = models.UUIDField(null=True, blank=True)  # S7b dispensing record PDF

    class Meta:
        db_table = "pharmacy_dispense_record"
        ordering = ["signed_at"]


class DispenseLine(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    dispense_record = models.ForeignKey(
        DispenseRecord, on_delete=models.PROTECT, related_name="lines"
    )
    prescription_item = models.ForeignKey(
        PrescriptionItem, on_delete=models.PROTECT, related_name="dispense_lines"
    )
    outcome = models.CharField(max_length=20, choices=DispenseOutcome.choices)
    quantity = models.PositiveIntegerField(default=0)
    substitute_drug = models.ForeignKey(
        "masterdata.Drug", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    substitute_display = models.CharField(max_length=300, blank=True)
    substitution_reason = models.CharField(max_length=300, blank=True)

    class Meta:
        db_table = "pharmacy_dispense_line"
        constraints = [
            models.CheckConstraint(
                condition=~Q(outcome="substituted")
                | (Q(substitute_drug__isnull=False) & ~Q(substitution_reason="")),
                name="pharmacy_line_substitution_reason",
            ),
            models.CheckConstraint(
                condition=~Q(outcome="not_available") | Q(quantity=0),
                name="pharmacy_line_not_available_zero",
            ),
            models.CheckConstraint(
                condition=Q(outcome="not_available") | Q(quantity__gt=0),
                name="pharmacy_line_quantity",
            ),
        ]


class DrugAvailability(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    drug = models.ForeignKey("masterdata.Drug", on_delete=models.PROTECT, related_name="+")
    is_available = models.BooleanField(default=True)
    updated_by_membership = models.ForeignKey(
        "tenancy.FacilityMembership", on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        db_table = "pharmacy_drug_availability"
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "drug"], name="pharmacy_availability_unique"
            )
        ]


class PrescriptionQuery(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    prescription = models.ForeignKey(Prescription, on_delete=models.PROTECT, related_name="queries")
    raised_by_membership = models.ForeignKey(
        "tenancy.FacilityMembership", on_delete=models.PROTECT, related_name="+"
    )
    message_enc = models.BinaryField()
    status = models.CharField(max_length=10, choices=QueryStatus.choices, default=QueryStatus.OPEN)
    answered_by_addendum = models.ForeignKey(
        "clinical.Addendum", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    answered_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "pharmacy_prescription_query"
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["prescription"],
                condition=Q(status="open"),
                name="pharmacy_one_open_query",
            )
        ]
