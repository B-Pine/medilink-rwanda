"""Facility prices and insurer rules (contract sprint-02 §2.1). S8 adds bills and payments."""

from __future__ import annotations

from typing import Any, ClassVar

from django.conf import settings
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import ArrayField, DateRangeField, RangeOperators
from django.db import models
from django.db.models import F, Func, Q

from medilink.core.models import TimeStampedModel


class DateRange(Func):
    """daterange(valid_from, valid_to, '[]'); an open end means "until further notice"."""

    function = "DATERANGE"
    output_field = DateRangeField()


def validity() -> DateRange:
    return DateRange(F("valid_from"), F("valid_to"), models.Value("[]"))


class TariffKind(models.TextChoices):
    SERVICE = "service", "Service"
    PROCEDURE = "procedure", "Procedure"
    MEDICINE = "medicine", "Medicine"
    OTHER = "other", "Other"


class TariffItem(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    version = models.PositiveIntegerField(default=1)
    code = models.CharField(max_length=40)
    name_i18n = models.JSONField()
    kind = models.CharField(max_length=10, choices=TariffKind.choices)
    service = models.ForeignKey(
        "facilities.Service", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    amount_rwf = models.PositiveIntegerField()
    valid_from = models.DateField()
    valid_to = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        db_table = "billing_tariff_item"
        constraints: ClassVar[list[Any]] = [
            ExclusionConstraint(
                name="billing_tariff_no_overlap",
                expressions=[
                    ("facility", RangeOperators.EQUAL),
                    ("code", RangeOperators.EQUAL),
                    (validity(), RangeOperators.OVERLAPS),
                ],
            ),
            models.CheckConstraint(
                condition=Q(valid_to__isnull=True) | Q(valid_to__gte=F("valid_from")),
                name="billing_tariff_dates",
            ),
        ]


class InsurerRule(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    version = models.PositiveIntegerField(default=1)
    insurer_code = models.CharField(max_length=40)
    applies_to_all_services = models.BooleanField(default=True)
    service_ids = ArrayField(models.UUIDField(), default=list, blank=True)
    patient_share_bp = models.PositiveIntegerField(default=0)
    requires_referral = models.BooleanField(default=False)
    excluded_tariff_codes = ArrayField(models.CharField(max_length=40), default=list, blank=True)
    ceiling_per_visit_rwf = models.PositiveIntegerField(null=True, blank=True)
    valid_from = models.DateField()
    valid_to = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        db_table = "billing_insurer_rule"
        constraints: ClassVar[list[Any]] = [
            ExclusionConstraint(
                name="billing_insurer_rule_no_overlap",
                expressions=[
                    ("facility", RangeOperators.EQUAL),
                    ("insurer_code", RangeOperators.EQUAL),
                    (validity(), RangeOperators.OVERLAPS),
                ],
            ),
            models.CheckConstraint(
                condition=Q(patient_share_bp__lte=10000), name="billing_rule_share"
            ),
            models.CheckConstraint(
                condition=Q(valid_to__isnull=True) | Q(valid_to__gte=F("valid_from")),
                name="billing_rule_dates",
            ),
        ]


# ---- S8: bills, payments, receipts, shifts and approvals (contract sprint-08 §2.1) -------------


class BillStatus(models.TextChoices):
    OPEN = "open", "Open"
    PARTLY_PAID = "partly_paid", "Partly paid"
    PAID = "paid", "Paid"
    VOIDED = "voided", "Voided"
    CREDITED = "credited", "Credited"


class PaymentMethod(models.TextChoices):
    CASH = "cash", "Cash"
    MTN_MOMO = "mtn_momo", "MTN MoMo"
    AIRTEL_MONEY = "airtel_money", "Airtel Money"
    CARD = "card", "Card"


class Bill(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    version = models.PositiveIntegerField(default=1)
    visit = models.OneToOneField("visits.Visit", on_delete=models.PROTECT, related_name="bill")
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="+")
    facility_patient = models.ForeignKey(
        "patients.FacilityPatient", on_delete=models.PROTECT, related_name="+"
    )
    insurance_profile = models.ForeignKey(
        "patients.InsuranceProfile",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    # none, unverified, verified or rejected: the insurance used for the split (§2.2)
    insurance_status = models.CharField(max_length=12, default="none")
    insurer_code = models.CharField(max_length=40, blank=True)
    insurer_rule = models.ForeignKey(
        InsurerRule, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    patient_share_bp = models.PositiveIntegerField(null=True, blank=True)
    requires_referral = models.BooleanField(default=False)
    status = models.CharField(max_length=12, choices=BillStatus.choices, default=BillStatus.OPEN)
    total_rwf = models.PositiveIntegerField(default=0)
    insurer_share_rwf = models.PositiveIntegerField(default=0)
    patient_share_rwf = models.PositiveIntegerField(default=0)
    exempted_rwf = models.PositiveIntegerField(default=0)
    credited_rwf = models.PositiveIntegerField(default=0)
    paid_rwf = models.PositiveIntegerField(default=0)
    refunded_rwf = models.PositiveIntegerField(default=0)
    balance_rwf = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "billing_bill"
        indexes: ClassVar[list[Any]] = [
            models.Index(
                fields=["facility", "status"],
                condition=Q(balance_rwf__gt=0),
                name="billing_bill_unpaid",
            ),
            models.Index(fields=["patient", "created_at"], name="billing_bill_patient"),
        ]
        constraints: ClassVar[list[Any]] = [
            models.CheckConstraint(
                condition=Q(insurer_share_rwf__lte=F("total_rwf"))
                & Q(patient_share_rwf__lte=F("total_rwf")),
                name="billing_bill_split_within_total",
            ),
            models.CheckConstraint(
                condition=Q(patient_share_bp__isnull=True) | Q(patient_share_bp__lte=10000),
                name="billing_bill_share_bp",
            ),
        ]


class BillLine(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    bill = models.ForeignKey(Bill, on_delete=models.PROTECT, related_name="lines")
    kind = models.CharField(max_length=10, choices=TariffKind.choices)
    tariff_item = models.ForeignKey(
        TariffItem, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    code = models.CharField(max_length=40)
    name = models.CharField(max_length=300)
    unit_price_rwf = models.PositiveIntegerField()
    quantity = models.PositiveIntegerField()
    total_rwf = models.PositiveIntegerField()
    insurer_share_rwf = models.PositiveIntegerField(default=0)
    patient_share_rwf = models.PositiveIntegerField(default=0)
    is_covered = models.BooleanField(default=False)
    prescription_item = models.ForeignKey(
        "pharmacy.PrescriptionItem",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    added_by_membership = models.ForeignKey(
        "tenancy.FacilityMembership",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    removed_at = models.DateTimeField(null=True, blank=True)
    removed_by_membership = models.ForeignKey(
        "tenancy.FacilityMembership",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    removed_reason = models.CharField(max_length=300, blank=True)

    class Meta:
        db_table = "billing_bill_line"
        ordering: ClassVar[list[str]] = ["created_at"]
        constraints: ClassVar[list[Any]] = [
            models.CheckConstraint(condition=Q(quantity__gt=0), name="billing_line_quantity"),
            models.CheckConstraint(
                condition=Q(total_rwf=F("unit_price_rwf") * F("quantity")),
                name="billing_line_total",
            ),
            models.CheckConstraint(
                condition=Q(total_rwf=F("insurer_share_rwf") + F("patient_share_rwf")),
                name="billing_line_split",
            ),
            models.UniqueConstraint(
                fields=["prescription_item"],
                condition=Q(prescription_item__isnull=False, removed_at__isnull=True),
                name="billing_line_one_per_prescription_item",
            ),
        ]


class BillEvent(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    bill = models.ForeignKey(Bill, on_delete=models.PROTECT, related_name="events")
    from_status = models.CharField(max_length=12, blank=True)
    to_status = models.CharField(max_length=12)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    reason = models.CharField(max_length=300, blank=True)
    occurred_at = models.DateTimeField()

    class Meta:
        db_table = "billing_bill_event"
        ordering: ClassVar[list[str]] = ["occurred_at", "created_at"]


class VerificationResult(models.TextChoices):
    VERIFIED = "verified", "Verified"
    REJECTED = "rejected", "Rejected"


class InsuranceVerification(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    visit = models.ForeignKey("visits.Visit", on_delete=models.PROTECT, related_name="+")
    bill = models.ForeignKey(Bill, on_delete=models.PROTECT, related_name="verifications")
    insurance_profile = models.ForeignKey(
        "patients.InsuranceProfile", on_delete=models.PROTECT, related_name="+"
    )
    result = models.CharField(max_length=10, choices=VerificationResult.choices)
    reason_code = models.CharField(max_length=40, blank=True)
    reason_text = models.CharField(max_length=300, blank=True)
    referral_letter_seen = models.BooleanField(null=True, blank=True)
    verified_by_membership = models.ForeignKey(
        "tenancy.FacilityMembership", on_delete=models.PROTECT, related_name="+"
    )
    verified_at = models.DateTimeField()

    class Meta:
        db_table = "billing_insurance_verification"
        ordering: ClassVar[list[str]] = ["verified_at"]


class ShiftStatus(models.TextChoices):
    OPEN = "open", "Open"
    CLOSED = "closed", "Closed"
    REVIEWED = "reviewed", "Reviewed"


class CashShift(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    version = models.PositiveIntegerField(default=1)
    membership = models.ForeignKey(
        "tenancy.FacilityMembership", on_delete=models.PROTECT, related_name="+"
    )
    status = models.CharField(max_length=10, choices=ShiftStatus.choices, default=ShiftStatus.OPEN)
    opened_at = models.DateTimeField()
    opening_float_rwf = models.PositiveIntegerField(default=0)
    closed_at = models.DateTimeField(null=True, blank=True)
    expected_totals = models.JSONField(default=dict, blank=True)
    counted_totals = models.JSONField(default=dict, blank=True)
    difference_rwf = models.BigIntegerField(null=True, blank=True)
    note = models.CharField(max_length=500, blank=True)
    reviewed_by_membership = models.ForeignKey(
        "tenancy.FacilityMembership",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.CharField(max_length=500, blank=True)
    is_self_reviewed = models.BooleanField(default=False)

    class Meta:
        db_table = "billing_cash_shift"
        ordering: ClassVar[list[str]] = ["-opened_at"]
        constraints: ClassVar[list[Any]] = [
            models.UniqueConstraint(
                fields=["facility", "membership"],
                condition=Q(status="open"),
                name="billing_one_open_shift",
            ),
        ]


class PaymentStatus(models.TextChoices):
    RECORDED = "recorded", "Recorded"
    VOIDED = "voided", "Voided"


class Payment(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    bill = models.ForeignKey(Bill, on_delete=models.PROTECT, related_name="payments")
    shift = models.ForeignKey(CashShift, on_delete=models.PROTECT, related_name="payments")
    method = models.CharField(max_length=12, choices=PaymentMethod.choices)
    amount_rwf = models.PositiveIntegerField()
    reference = models.CharField(max_length=60, blank=True)
    ebm_receipt_number = models.CharField(max_length=40, blank=True)
    received_by_membership = models.ForeignKey(
        "tenancy.FacilityMembership", on_delete=models.PROTECT, related_name="+"
    )
    received_at = models.DateTimeField()
    status = models.CharField(
        max_length=10, choices=PaymentStatus.choices, default=PaymentStatus.RECORDED
    )
    voided_at = models.DateTimeField(null=True, blank=True)
    void_request = models.ForeignKey(
        "billing.ApprovalRequest",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    idempotency_key = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "billing_payment"
        ordering: ClassVar[list[str]] = ["received_at"]
        indexes: ClassVar[list[Any]] = [
            models.Index(fields=["facility", "received_at"], name="billing_payment_day"),
        ]
        constraints: ClassVar[list[Any]] = [
            models.CheckConstraint(condition=Q(amount_rwf__gt=0), name="billing_payment_amount"),
            models.UniqueConstraint(
                fields=["facility", "idempotency_key"],
                condition=Q(idempotency_key__isnull=False),
                name="billing_payment_idempotency",
            ),
        ]


class ReceiptStatus(models.TextChoices):
    ISSUED = "issued", "Issued"
    VOIDED = "voided", "Voided"


class Receipt(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    payment = models.OneToOneField(Payment, on_delete=models.PROTECT, related_name="receipt")
    number = models.CharField(max_length=24)
    status = models.CharField(
        max_length=10, choices=ReceiptStatus.choices, default=ReceiptStatus.ISSUED
    )
    issued_at = models.DateTimeField()
    voided_at = models.DateTimeField(null=True, blank=True)
    document_id = models.UUIDField(null=True, blank=True)  # S7b receipt PDF

    class Meta:
        db_table = "billing_receipt"
        constraints: ClassVar[list[Any]] = [
            models.UniqueConstraint(fields=["facility", "number"], name="billing_receipt_number"),
        ]


class ApprovalKind(models.TextChoices):
    VOID_PAYMENT = "void_payment", "Void a payment"
    REFUND = "refund", "Refund"
    WAIVER = "waiver", "Waiver"


class ApprovalStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"
    CANCELLED = "cancelled", "Cancelled"


class ApprovalRequest(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    version = models.PositiveIntegerField(default=1)
    kind = models.CharField(max_length=14, choices=ApprovalKind.choices)
    bill = models.ForeignKey(Bill, on_delete=models.PROTECT, related_name="approval_requests")
    payment = models.ForeignKey(
        Payment, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    exemption = models.ForeignKey(
        "billing.Exemption", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    amount_rwf = models.PositiveIntegerField(null=True, blank=True)
    reason_code = models.CharField(max_length=40)
    reason_text = models.CharField(max_length=300, blank=True)
    requested_by_membership = models.ForeignKey(
        "tenancy.FacilityMembership", on_delete=models.PROTECT, related_name="+"
    )
    status = models.CharField(
        max_length=10, choices=ApprovalStatus.choices, default=ApprovalStatus.PENDING
    )
    decided_by_membership = models.ForeignKey(
        "tenancy.FacilityMembership",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.CharField(max_length=300, blank=True)
    is_self_approved = models.BooleanField(default=False)

    class Meta:
        db_table = "billing_approval_request"
        ordering: ClassVar[list[str]] = ["-created_at"]
        indexes: ClassVar[list[Any]] = [
            models.Index(fields=["facility", "status"], name="billing_approval_status"),
        ]
        constraints: ClassVar[list[Any]] = [
            models.CheckConstraint(
                condition=Q(decided_by_membership__isnull=True)
                | ~Q(decided_by_membership=F("requested_by_membership"))
                | Q(is_self_approved=True),
                name="billing_approval_separation",
            ),
            models.UniqueConstraint(
                fields=["payment"],
                condition=Q(status="pending", payment__isnull=False),
                name="billing_one_pending_void_per_payment",
            ),
        ]


class ExemptionReason(models.TextChoices):
    INDIGENT = "indigent", "Indigent"
    STAFF = "staff", "Staff"
    PUBLIC_PROGRAMME = "public_programme", "Public programme"
    WAIVER = "waiver", "Waiver"
    OTHER = "other", "Other"


class Exemption(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    bill = models.ForeignKey(Bill, on_delete=models.PROTECT, related_name="exemptions")
    reason_code = models.CharField(max_length=20, choices=ExemptionReason.choices)
    reason_text = models.CharField(max_length=300, blank=True)
    amount_rwf = models.PositiveIntegerField()
    applied_by_membership = models.ForeignKey(
        "tenancy.FacilityMembership", on_delete=models.PROTECT, related_name="+"
    )
    approval_request = models.ForeignKey(
        ApprovalRequest, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    applied_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "billing_exemption"
        ordering: ClassVar[list[str]] = ["created_at"]
        constraints: ClassVar[list[Any]] = [
            models.CheckConstraint(condition=Q(amount_rwf__gt=0), name="billing_exemption_amount"),
        ]


class CreditNote(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    bill = models.ForeignKey(Bill, on_delete=models.PROTECT, related_name="credit_notes")
    approval_request = models.OneToOneField(
        ApprovalRequest, on_delete=models.PROTECT, related_name="credit_note"
    )
    number = models.CharField(max_length=24)
    amount_rwf = models.PositiveIntegerField()
    # the part of the amount that lowers what the patient owes; the rest returns an overpayment
    reduces_due_rwf = models.PositiveIntegerField(default=0)
    reason = models.CharField(max_length=300)
    issued_at = models.DateTimeField()
    document_id = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "billing_credit_note"
        ordering: ClassVar[list[str]] = ["issued_at"]
        constraints: ClassVar[list[Any]] = [
            models.CheckConstraint(condition=Q(amount_rwf__gt=0), name="billing_credit_amount"),
            models.CheckConstraint(
                condition=Q(reduces_due_rwf__lte=F("amount_rwf")), name="billing_credit_reduces"
            ),
            models.UniqueConstraint(
                fields=["facility", "number"], name="billing_credit_note_number"
            ),
        ]


class RefundPayout(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    credit_note = models.ForeignKey(CreditNote, on_delete=models.PROTECT, related_name="payouts")
    method = models.CharField(max_length=12, choices=PaymentMethod.choices)
    reference = models.CharField(max_length=60, blank=True)
    amount_rwf = models.PositiveIntegerField()
    paid_by_membership = models.ForeignKey(
        "tenancy.FacilityMembership", on_delete=models.PROTECT, related_name="+"
    )
    paid_at = models.DateTimeField()
    shift = models.ForeignKey(
        CashShift, on_delete=models.PROTECT, null=True, blank=True, related_name="payouts"
    )
    idempotency_key = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "billing_refund_payout"
        ordering: ClassVar[list[str]] = ["paid_at"]
        constraints: ClassVar[list[Any]] = [
            models.CheckConstraint(condition=Q(amount_rwf__gt=0), name="billing_payout_amount"),
            models.CheckConstraint(
                condition=~Q(method="cash") | Q(shift__isnull=False),
                name="billing_cash_payout_in_shift",
            ),
            models.UniqueConstraint(
                fields=["facility", "idempotency_key"],
                condition=Q(idempotency_key__isnull=False),
                name="billing_payout_idempotency",
            ),
        ]
