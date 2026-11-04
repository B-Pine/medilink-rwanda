"""S7a schemas (contract sprint-07 §3). Explicit fields; staff and patient shapes are separate:
patient serializers carry no alert overrides and nothing from the consultation."""

from __future__ import annotations

from typing import Any

from rest_framework import serializers

from medilink.accounts.models import Language
from medilink.accounts.serializers import StrictSerializer
from medilink.clinical.serializers import AlertSerializer as ClinicalAlertSerializer
from medilink.pharmacy.models import (
    AdjustmentReason,
    DispenseOutcome,
    Frequency,
    IdentityMethod,
    ItemStatus,
    MealTiming,
    MovementKind,
    PrescriptionStatus,
    QueryStatus,
    Route,
)

# ---- input ------------------------------------------------------------------------------------


class AlertOverrideSerializer(StrictSerializer):
    kind = serializers.ChoiceField(choices=["allergy", "duplicate", "dose"])
    reason = serializers.CharField(min_length=5, max_length=300)


class ItemWriteSerializer(StrictSerializer):
    drug_code = serializers.CharField(max_length=40, required=False, allow_blank=True, default="")
    free_text_drug = serializers.CharField(
        max_length=120, required=False, allow_blank=True, default=""
    )
    dose = serializers.CharField(max_length=60)
    frequency_code = serializers.ChoiceField(choices=Frequency.choices)
    route = serializers.ChoiceField(choices=Route.choices)
    duration_days = serializers.IntegerField(
        min_value=1, max_value=365, required=False, allow_null=True
    )
    meal_timing = serializers.ChoiceField(
        choices=MealTiming.choices, required=False, allow_blank=True, default=""
    )
    quantity = serializers.IntegerField(
        min_value=1, max_value=10000, required=False, allow_null=True
    )
    instructions = serializers.CharField(
        max_length=500, required=False, allow_blank=True, default=""
    )
    substitution_allowed = serializers.BooleanField(required=False, default=True)
    alert_overrides = AlertOverrideSerializer(many=True, required=False, default=list)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        attrs = super().validate(attrs)
        if bool(attrs.get("drug_code")) == bool((attrs.get("free_text_drug") or "").strip()):
            raise serializers.ValidationError(
                {"drug_code": ["Choose a catalogue drug or type a free-text name, not both."]}
            )
        return attrs


class ItemCreateSerializer(ItemWriteSerializer):
    replaces_item_id = serializers.UUIDField(required=False, allow_null=True)


class ItemUpdateSerializer(ItemWriteSerializer):
    version = serializers.IntegerField(min_value=1)


class VersionReasonSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)
    reason = serializers.CharField(min_length=5, max_length=300)


class DispenseLineInputSerializer(StrictSerializer):
    item_id = serializers.UUIDField()
    outcome = serializers.ChoiceField(choices=DispenseOutcome.choices)
    quantity = serializers.IntegerField(
        min_value=0, max_value=10000, required=False, allow_null=True
    )
    substitute_drug_code = serializers.CharField(
        max_length=40, required=False, allow_blank=True, default=""
    )
    substitution_reason = serializers.CharField(
        max_length=300, required=False, allow_blank=True, default=""
    )


class DispenseSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)
    identity_check_method = serializers.ChoiceField(choices=IdentityMethod.choices)
    verification_code = serializers.CharField(
        max_length=24, required=False, allow_blank=True, default=""
    )
    controlled_confirmed = serializers.BooleanField(required=False, default=False)
    lines = serializers.ListField(child=DispenseLineInputSerializer(), min_length=1, max_length=50)


class QueryCreateSerializer(StrictSerializer):
    message = serializers.CharField(min_length=1, max_length=1000)


class QueryAnswerSerializer(StrictSerializer):
    addendum_id = serializers.UUIDField()


class AvailabilityWriteSerializer(StrictSerializer):
    is_available = serializers.BooleanField()


# ---- output -----------------------------------------------------------------------------------

STOCK_LEVELS = ["in_stock", "low", "out"]


def stock_level_field() -> serializers.ChoiceField:
    """W5: null when the medicine does not follow a stock count here."""
    return serializers.ChoiceField(choices=STOCK_LEVELS, allow_null=True)


class PrescriptionAlertSerializer(ClinicalAlertSerializer):
    item_id = serializers.UUIDField()
    overridden = serializers.BooleanField()


class DispenseLineOutSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    item_id = serializers.UUIDField()
    outcome = serializers.ChoiceField(choices=DispenseOutcome.choices)
    quantity = serializers.IntegerField()
    substitute_display = serializers.CharField(allow_blank=True)
    substitution_reason = serializers.CharField(allow_blank=True)


class DispenseRecordSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    pharmacist_name = serializers.CharField()
    identity_check_method = serializers.ChoiceField(choices=IdentityMethod.choices)
    controlled_confirmed = serializers.BooleanField()
    signed_at = serializers.DateTimeField()
    lines = DispenseLineOutSerializer(many=True)


class PrescriptionQuerySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    status = serializers.ChoiceField(choices=QueryStatus.choices)
    message = serializers.CharField()
    raised_by_name = serializers.CharField()
    raised_at = serializers.DateTimeField()
    answered_by_addendum_id = serializers.UUIDField(allow_null=True)
    answered_at = serializers.DateTimeField(allow_null=True)
    closed_at = serializers.DateTimeField(allow_null=True)


class PrescriptionItemSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    drug_code = serializers.CharField(allow_blank=True)
    drug_display = serializers.CharField()
    generic_name = serializers.CharField(allow_blank=True)
    strength = serializers.CharField(allow_blank=True)
    is_off_catalogue = serializers.BooleanField()
    is_controlled = serializers.BooleanField()
    available_here = serializers.BooleanField()
    stock_level = stock_level_field()
    dose = serializers.CharField()
    frequency_code = serializers.ChoiceField(choices=Frequency.choices)
    route = serializers.ChoiceField(choices=Route.choices)
    duration_days = serializers.IntegerField(allow_null=True)
    meal_timing = serializers.ChoiceField(choices=MealTiming.choices, allow_blank=True)
    quantity = serializers.IntegerField()
    dispensed_quantity = serializers.IntegerField()
    instructions = serializers.CharField(allow_blank=True)
    substitution_allowed = serializers.BooleanField()
    status = serializers.ChoiceField(choices=ItemStatus.choices)
    alert_overrides = AlertOverrideSerializer(many=True)
    replaces_item_id = serializers.UUIDField(allow_null=True)
    cancelled_reason = serializers.CharField(allow_blank=True)


class PrescriptionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    consultation_id = serializers.UUIDField()
    visit_id = serializers.UUIDField()
    facility_patient_id = serializers.UUIDField()
    patient_display_name = serializers.CharField()
    prescriber_name = serializers.CharField()
    status = serializers.ChoiceField(choices=PrescriptionStatus.choices)
    number = serializers.CharField(allow_null=True)
    issued_at = serializers.DateTimeField(allow_null=True)
    expires_at = serializers.DateTimeField(allow_null=True)
    cancelled_reason = serializers.CharField(allow_blank=True)
    version = serializers.IntegerField()
    items = PrescriptionItemSerializer(many=True)
    alerts = PrescriptionAlertSerializer(many=True)
    dispense_records = DispenseRecordSerializer(many=True)
    queries = PrescriptionQuerySerializer(many=True)


class QueueRowSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    number = serializers.CharField()
    status = serializers.ChoiceField(choices=PrescriptionStatus.choices)
    patient_display_name = serializers.CharField()
    patient_age = serializers.IntegerField(allow_null=True)
    ticket_number = serializers.CharField(allow_null=True)
    issued_at = serializers.DateTimeField()
    expires_at = serializers.DateTimeField()
    item_count = serializers.IntegerField()
    has_controlled = serializers.BooleanField()
    has_open_query = serializers.BooleanField()
    has_unavailable = serializers.BooleanField()
    version = serializers.IntegerField()


class DrugRowSerializer(serializers.Serializer):
    code = serializers.CharField()
    display = serializers.CharField()
    generic_name = serializers.CharField()
    strength = serializers.CharField()
    form = serializers.CharField()
    is_controlled = serializers.BooleanField()
    available_here = serializers.BooleanField()
    stock_level = stock_level_field()


class AvailabilityRowSerializer(serializers.Serializer):
    drug_code = serializers.CharField()
    display = serializers.CharField()
    is_available = serializers.BooleanField()
    updated_at = serializers.DateTimeField(allow_null=True)
    # W5: a medicine with stock follows its count; its switch is read-only
    follows_stock = serializers.BooleanField()
    stock_level = stock_level_field()


# ---- W5 stock ---------------------------------------------------------------------------------


class StockReceiveSerializer(StrictSerializer):
    drug_code = serializers.CharField(max_length=40)
    batch_number = serializers.CharField(max_length=40)
    expiry_date = serializers.DateField()
    quantity = serializers.IntegerField(min_value=1, max_value=100_000)
    supplier = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    low_stock_threshold = serializers.IntegerField(
        min_value=0, max_value=100_000, required=False, allow_null=True, default=None
    )


class StockAdjustSerializer(StrictSerializer):
    quantity_change = serializers.IntegerField(min_value=-100_000, max_value=100_000)
    reason = serializers.ChoiceField(choices=AdjustmentReason.choices)
    note = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class StockThresholdSerializer(StrictSerializer):
    low_stock_threshold = serializers.IntegerField(min_value=0, max_value=100_000)


class StockCardSerializer(serializers.Serializer):
    drug_code = serializers.CharField()
    display = serializers.CharField()
    is_controlled = serializers.BooleanField()
    on_hand = serializers.IntegerField(help_text="Units in batches that have not expired")
    expired_on_hand = serializers.IntegerField(help_text="Units in expired batches, to remove")
    low_stock_threshold = serializers.IntegerField()
    stock_level = serializers.ChoiceField(choices=STOCK_LEVELS)
    next_expiry = serializers.DateField(allow_null=True)
    updated_at = serializers.DateTimeField()


class StockBatchSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    drug_code = serializers.CharField()
    display = serializers.CharField()
    batch_number = serializers.CharField()
    expiry_date = serializers.DateField()
    quantity_on_hand = serializers.IntegerField()
    supplier = serializers.CharField(allow_blank=True)
    is_expired = serializers.BooleanField()
    received_at = serializers.DateTimeField()


class StockMovementSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    drug_code = serializers.CharField()
    display = serializers.CharField()
    batch_id = serializers.UUIDField()
    batch_number = serializers.CharField()
    kind = serializers.ChoiceField(choices=MovementKind.choices)
    quantity = serializers.IntegerField(help_text="Signed: + received, - dispensed or removed")
    balance_after = serializers.IntegerField(help_text="Units left in the batch afterwards")
    reason = serializers.CharField(allow_blank=True)
    note = serializers.CharField(allow_blank=True)
    prescription_id = serializers.UUIDField(allow_null=True)
    by_name = serializers.CharField()
    occurred_at = serializers.DateTimeField()


class StockDetailSerializer(StockCardSerializer):
    batches = StockBatchSerializer(many=True)
    movements = StockMovementSerializer(many=True)


class DosingLabelSerializer(serializers.Serializer):
    line_id = serializers.UUIDField()
    language = serializers.ChoiceField(choices=Language.choices)
    drug = serializers.CharField()
    quantity = serializers.IntegerField()
    dose = serializers.CharField()
    frequency = serializers.CharField()
    frequency_code = serializers.ChoiceField(choices=Frequency.choices)
    times = serializers.ListField(
        child=serializers.ChoiceField(choices=["morning", "noon", "evening", "night"]),
        help_text="Times of day to take it, for the pictograms; empty for once or when needed",
    )
    meal_timing = serializers.ChoiceField(choices=MealTiming.choices, allow_blank=True)
    meal = serializers.CharField(allow_blank=True, help_text="meal_timing in the label language")
    route = serializers.CharField()
    duration = serializers.CharField(allow_blank=True)
    instructions = serializers.CharField(allow_blank=True)
    patient_name = serializers.CharField()
    dispensed_on = serializers.DateField()
    facility_name = serializers.CharField()
    prescription_number = serializers.CharField()


class LabelsSerializer(serializers.Serializer):
    labels = DosingLabelSerializer(many=True)


# ---- patient ----------------------------------------------------------------------------------


class PatientItemSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    drug_display = serializers.CharField()
    dose = serializers.CharField()
    frequency_code = serializers.ChoiceField(choices=Frequency.choices)
    route = serializers.ChoiceField(choices=Route.choices)
    duration_days = serializers.IntegerField(allow_null=True)
    quantity = serializers.IntegerField()
    dispensed_quantity = serializers.IntegerField()
    instructions = serializers.CharField(allow_blank=True)
    status = serializers.ChoiceField(choices=ItemStatus.choices)
    substitute_display = serializers.CharField(allow_blank=True)


class PatientPrescriptionRowSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    patient_id = serializers.UUIDField()
    number = serializers.CharField()
    facility_name = serializers.CharField()
    prescriber_name = serializers.CharField()
    status = serializers.ChoiceField(choices=PrescriptionStatus.choices)
    issued_at = serializers.DateTimeField()
    expires_at = serializers.DateTimeField()
    item_count = serializers.IntegerField()


class PatientPrescriptionSerializer(PatientPrescriptionRowSerializer):
    items = PatientItemSerializer(many=True)
