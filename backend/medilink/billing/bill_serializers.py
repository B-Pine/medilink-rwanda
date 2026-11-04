"""S8 schemas (contract sprint-08 §3). Explicit fields; patient shapes are separate and carry no
staff names beyond the cashier's, and no internal notes."""

from __future__ import annotations

from rest_framework import serializers

from medilink.accounts.serializers import StrictSerializer
from medilink.billing.models import (
    ApprovalKind,
    ApprovalStatus,
    BillStatus,
    ExemptionReason,
    PaymentMethod,
    PaymentStatus,
    ReceiptStatus,
    ShiftStatus,
    TariffKind,
    VerificationResult,
)

REJECTION_REASONS = (
    "expired",
    "not_a_member",
    "not_accepted",
    "referral_missing",
    "card_unreadable",
    "other",
)
INSURANCE_STATUS = ("none", "unverified", "verified", "rejected")

# ---- input ------------------------------------------------------------------------------------


class AddLineSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)
    tariff_code = serializers.CharField(max_length=40)
    quantity = serializers.IntegerField(min_value=1, max_value=1000)


class RemoveLineSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)
    reason = serializers.CharField(min_length=5, max_length=300)


class VerificationInputSerializer(StrictSerializer):
    insurance_profile_id = serializers.UUIDField()
    result = serializers.ChoiceField(choices=VerificationResult.choices)
    reason_code = serializers.ChoiceField(
        choices=REJECTION_REASONS, required=False, allow_blank=True, default=""
    )
    reason_text = serializers.CharField(
        max_length=300, required=False, allow_blank=True, default=""
    )
    referral_letter_seen = serializers.BooleanField(required=False, allow_null=True, default=None)


class PaymentInputSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    amount_rwf = serializers.IntegerField(min_value=1, max_value=100_000_000)
    reference = serializers.CharField(max_length=60, required=False, allow_blank=True, default="")
    ebm_receipt_number = serializers.CharField(
        max_length=40, required=False, allow_blank=True, default=""
    )


class PayoutInputSerializer(StrictSerializer):
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    amount_rwf = serializers.IntegerField(min_value=1, max_value=100_000_000)
    reference = serializers.CharField(max_length=60, required=False, allow_blank=True, default="")


class ExemptionInputSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)
    reason_code = serializers.ChoiceField(choices=ExemptionReason.choices)
    reason_text = serializers.CharField(
        max_length=300, required=False, allow_blank=True, default=""
    )
    amount_rwf = serializers.IntegerField(min_value=1, max_value=100_000_000)


class VoidRequestSerializer(StrictSerializer):
    reason_code = serializers.CharField(max_length=40, required=False, default="other")
    reason_text = serializers.CharField(min_length=5, max_length=300)


class RefundRequestSerializer(VoidRequestSerializer):
    amount_rwf = serializers.IntegerField(min_value=1, max_value=100_000_000)


class BillingDecisionSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)
    note = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class BillingVersionSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)


class OpenShiftSerializer(StrictSerializer):
    opening_float_rwf = serializers.IntegerField(min_value=0, max_value=100_000_000)


class CountedSerializer(StrictSerializer):
    cash = serializers.IntegerField(min_value=0, max_value=100_000_000, default=0)
    mtn_momo = serializers.IntegerField(min_value=0, max_value=100_000_000, default=0)
    airtel_money = serializers.IntegerField(min_value=0, max_value=100_000_000, default=0)
    card = serializers.IntegerField(min_value=0, max_value=100_000_000, default=0)


class CloseShiftSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)
    counted_totals = CountedSerializer()
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


# ---- output -----------------------------------------------------------------------------------


class MethodTotalsSerializer(serializers.Serializer):
    cash = serializers.IntegerField()
    mtn_momo = serializers.IntegerField()
    airtel_money = serializers.IntegerField()
    card = serializers.IntegerField()


class BillLineSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=TariffKind.choices)
    code = serializers.CharField()
    name = serializers.CharField()
    unit_price_rwf = serializers.IntegerField()
    quantity = serializers.IntegerField()
    total_rwf = serializers.IntegerField()
    insurer_share_rwf = serializers.IntegerField()
    patient_share_rwf = serializers.IntegerField()
    is_covered = serializers.BooleanField()
    is_medicine = serializers.BooleanField()
    removed = serializers.BooleanField()
    removed_reason = serializers.CharField(allow_blank=True)


class MissingPriceSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=["service", "medicine"])
    code = serializers.CharField(allow_blank=True)
    name = serializers.CharField(allow_blank=True)


class ReceiptRefSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    number = serializers.CharField()
    status = serializers.ChoiceField(choices=ReceiptStatus.choices)


class PaymentSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    amount_rwf = serializers.IntegerField()
    reference = serializers.CharField(allow_blank=True)
    ebm_receipt_number = serializers.CharField(allow_blank=True)
    received_by_name = serializers.CharField()
    received_at = serializers.DateTimeField()
    status = serializers.ChoiceField(choices=PaymentStatus.choices)
    receipt = ReceiptRefSerializer(allow_null=True)


class ExemptionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    reason_code = serializers.ChoiceField(choices=ExemptionReason.choices)
    reason_text = serializers.CharField(allow_blank=True)
    amount_rwf = serializers.IntegerField()
    applied_by_name = serializers.CharField()
    applied_at = serializers.DateTimeField(allow_null=True)
    is_pending = serializers.BooleanField()


class PayoutSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    reference = serializers.CharField(allow_blank=True)
    amount_rwf = serializers.IntegerField()
    paid_at = serializers.DateTimeField()


class CreditNoteSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    number = serializers.CharField()
    amount_rwf = serializers.IntegerField()
    paid_out_rwf = serializers.IntegerField()
    reason = serializers.CharField()
    issued_at = serializers.DateTimeField()
    payouts = PayoutSerializer(many=True)


class ApprovalRequestSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=ApprovalKind.choices)
    bill_id = serializers.UUIDField()
    payment_id = serializers.UUIDField(allow_null=True)
    amount_rwf = serializers.IntegerField(allow_null=True)
    reason_code = serializers.CharField()
    reason_text = serializers.CharField(allow_blank=True)
    requested_by_name = serializers.CharField()
    requested_at = serializers.DateTimeField()
    status = serializers.ChoiceField(choices=ApprovalStatus.choices)
    decided_by_name = serializers.CharField(allow_null=True)
    decided_at = serializers.DateTimeField(allow_null=True)
    decision_note = serializers.CharField(allow_blank=True)
    is_self_approved = serializers.BooleanField()
    patient_display_name = serializers.CharField()
    version = serializers.IntegerField()


class BillVerificationSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    insurance_profile_id = serializers.UUIDField()
    insurer_code = serializers.CharField()
    result = serializers.ChoiceField(choices=VerificationResult.choices)
    reason_code = serializers.CharField(allow_blank=True)
    reason_text = serializers.CharField(allow_blank=True)
    referral_letter_seen = serializers.BooleanField(allow_null=True)
    verified_by_name = serializers.CharField()
    verified_at = serializers.DateTimeField()


class InsuranceSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=INSURANCE_STATUS)
    insurance_profile_id = serializers.UUIDField(allow_null=True)
    insurer_code = serializers.CharField(allow_blank=True)
    insurer_display = serializers.CharField(allow_blank=True)
    member_number = serializers.CharField(allow_blank=True)
    is_accepted = serializers.BooleanField()
    patient_share_bp = serializers.IntegerField(allow_null=True)
    requires_referral = serializers.BooleanField()


class TotalsSerializer(serializers.Serializer):
    total_rwf = serializers.IntegerField()
    insurer_share_rwf = serializers.IntegerField()
    patient_share_rwf = serializers.IntegerField()
    exempted_rwf = serializers.IntegerField()
    credited_rwf = serializers.IntegerField()
    due_rwf = serializers.IntegerField()
    paid_rwf = serializers.IntegerField()
    refunded_rwf = serializers.IntegerField()
    balance_rwf = serializers.IntegerField()
    owed_to_patient_rwf = serializers.IntegerField()
    refundable_rwf = serializers.IntegerField()


class BillSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    visit_id = serializers.UUIDField()
    facility_patient_id = serializers.UUIDField()
    patient_display_name = serializers.CharField()
    service_date = serializers.DateField()
    ticket_number = serializers.CharField(allow_null=True)
    status = serializers.ChoiceField(choices=BillStatus.choices)
    insurance = InsuranceSerializer()
    totals = TotalsSerializer()
    lines = BillLineSerializer(many=True)
    missing_prices = MissingPriceSerializer(many=True)
    payments = PaymentSerializer(many=True)
    exemptions = ExemptionSerializer(many=True)
    credit_notes = CreditNoteSerializer(many=True)
    approval_requests = ApprovalRequestSerializer(many=True)
    verifications = BillVerificationSerializer(many=True)
    version = serializers.IntegerField()


class BillRowSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    visit_id = serializers.UUIDField()
    patient_display_name = serializers.CharField()
    service_date = serializers.DateField()
    ticket_number = serializers.CharField(allow_null=True)
    status = serializers.ChoiceField(choices=BillStatus.choices)
    insurance_status = serializers.ChoiceField(choices=INSURANCE_STATUS)
    total_rwf = serializers.IntegerField()
    patient_share_rwf = serializers.IntegerField()
    paid_rwf = serializers.IntegerField()
    balance_rwf = serializers.IntegerField()
    version = serializers.IntegerField()


class BalancesSerializer(serializers.Serializer):
    total_balance_rwf = serializers.IntegerField()
    bills = BillRowSerializer(many=True)


class ReceiptSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    number = serializers.CharField()
    status = serializers.ChoiceField(choices=ReceiptStatus.choices)
    issued_at = serializers.DateTimeField()
    facility_name = serializers.CharField()
    patient_display_name = serializers.CharField()
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    amount_rwf = serializers.IntegerField()
    reference = serializers.CharField(allow_blank=True)
    ebm_receipt_number = serializers.CharField(allow_blank=True)
    received_by_name = serializers.CharField()
    bill_id = serializers.UUIDField()
    bill_total_rwf = serializers.IntegerField()
    bill_patient_share_rwf = serializers.IntegerField()
    balance_after_rwf = serializers.IntegerField()


class ShiftMethodSerializer(serializers.Serializer):
    """#203 end-of-shift summary row for one payment method."""

    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    payment_count = serializers.IntegerField()
    received_rwf = serializers.IntegerField()
    paid_out_rwf = serializers.IntegerField(help_text="Refunds paid back in this shift.")
    expected_rwf = serializers.IntegerField(help_text="Cash includes the opening float.")
    counted_rwf = serializers.IntegerField(allow_null=True, help_text="Null while open.")
    difference_rwf = serializers.IntegerField(allow_null=True, help_text="Counted minus expected.")


class CashShiftSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    membership_id = serializers.UUIDField()
    cashier_name = serializers.CharField()
    status = serializers.ChoiceField(choices=ShiftStatus.choices)
    opened_at = serializers.DateTimeField()
    opening_float_rwf = serializers.IntegerField()
    closed_at = serializers.DateTimeField(allow_null=True)
    expected_totals = MethodTotalsSerializer(
        help_text="What the drawer should hold per method; cash includes the opening float."
    )
    counted_totals = MethodTotalsSerializer(allow_null=True)
    difference_rwf = serializers.IntegerField(allow_null=True)
    note = serializers.CharField(allow_blank=True)
    payment_count = serializers.IntegerField()
    by_method = ShiftMethodSerializer(many=True)
    reviewed_by_name = serializers.CharField(allow_null=True)
    reviewed_at = serializers.DateTimeField(allow_null=True)
    review_note = serializers.CharField(allow_blank=True)
    is_self_reviewed = serializers.BooleanField()
    version = serializers.IntegerField()


# ---- patient ----------------------------------------------------------------------------------


class PatientBillLineSerializer(serializers.Serializer):
    name = serializers.CharField()
    quantity = serializers.IntegerField()
    total_rwf = serializers.IntegerField()
    insurer_share_rwf = serializers.IntegerField()
    patient_share_rwf = serializers.IntegerField()


class PatientPaymentSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    amount_rwf = serializers.IntegerField()
    received_at = serializers.DateTimeField()
    status = serializers.ChoiceField(choices=PaymentStatus.choices)
    receipt_number = serializers.CharField(allow_null=True)


class PatientCreditNoteSerializer(serializers.Serializer):
    number = serializers.CharField()
    amount_rwf = serializers.IntegerField()
    issued_at = serializers.DateTimeField()


class PatientBillRowSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    patient_id = serializers.UUIDField()
    facility_name = serializers.CharField()
    service_date = serializers.DateField()
    status = serializers.ChoiceField(choices=BillStatus.choices)
    total_rwf = serializers.IntegerField()
    patient_share_rwf = serializers.IntegerField()
    paid_rwf = serializers.IntegerField()
    balance_rwf = serializers.IntegerField()


class PatientBillSerializer(PatientBillRowSerializer):
    insurer_share_rwf = serializers.IntegerField()
    exempted_rwf = serializers.IntegerField()
    credited_rwf = serializers.IntegerField()
    refunded_rwf = serializers.IntegerField()
    lines = PatientBillLineSerializer(many=True)
    payments = PatientPaymentSerializer(many=True)
    credit_notes = PatientCreditNoteSerializer(many=True)
