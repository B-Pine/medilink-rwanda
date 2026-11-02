"""S7a schemas (contract sprint-07 §3). Explicit fields; staff and patient shapes are separate:
patient serializers carry no alert overrides and nothing from the consultation."""

from __future__ import annotations

from typing import Any

from rest_framework import serializers

from medilink.accounts.models import Language
from medilink.accounts.serializers import StrictSerializer
from medilink.clinical.serializers import AlertSerializer as ClinicalAlertSerializer
from medilink.pharmacy.models import (
    DispenseOutcome,
    Frequency,
    IdentityMethod,
    ItemStatus,
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
    dose = serializers.CharField()
    frequency_code = serializers.ChoiceField(choices=Frequency.choices)
    route = serializers.ChoiceField(choices=Route.choices)
    duration_days = serializers.IntegerField(allow_null=True)
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


class AvailabilityRowSerializer(serializers.Serializer):
    drug_code = serializers.CharField()
    display = serializers.CharField()
    is_available = serializers.BooleanField()
    updated_at = serializers.DateTimeField(allow_null=True)


class DosingLabelSerializer(serializers.Serializer):
    line_id = serializers.UUIDField()
    language = serializers.ChoiceField(choices=Language.choices)
    drug = serializers.CharField()
    quantity = serializers.IntegerField()
    dose = serializers.CharField()
    frequency = serializers.CharField()
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
