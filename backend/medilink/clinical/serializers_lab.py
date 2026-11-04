"""Laboratory loop serializers (upgrade 06 §3, FR-CLN-11, #201)."""

from __future__ import annotations

from rest_framework import serializers

from medilink.accounts.serializers import StrictSerializer
from medilink.clinical.models import LabOrderState
from medilink.visits.serializers import TicketRowSerializer

RESULT_KINDS = ("number", "choice")
FLAGS = ("low", "high", "abnormal")
SPECIMENS = ("blood", "urine", "stool")


class LabCatalogueItemSerializer(serializers.Serializer):
    code = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]  # API field name
    kind = serializers.ChoiceField(choices=list(RESULT_KINDS))
    unit = serializers.CharField(allow_blank=True)
    low = serializers.DecimalField(max_digits=8, decimal_places=2, allow_null=True)
    high = serializers.DecimalField(max_digits=8, decimal_places=2, allow_null=True)
    choices = serializers.ListField(child=serializers.CharField())
    normal = serializers.CharField(allow_null=True)


class LabCatalogueTestSerializer(serializers.Serializer):
    code = serializers.CharField()
    name = serializers.CharField()
    specimen = serializers.ChoiceField(choices=list(SPECIMENS))
    items = LabCatalogueItemSerializer(many=True)


class LabResultItemSerializer(serializers.Serializer):
    code = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]  # API field name
    kind = serializers.ChoiceField(choices=list(RESULT_KINDS))
    value = serializers.CharField(allow_blank=True)
    unit = serializers.CharField(allow_blank=True)
    low = serializers.DecimalField(max_digits=8, decimal_places=2, allow_null=True)
    high = serializers.DecimalField(max_digits=8, decimal_places=2, allow_null=True)
    flag = serializers.ChoiceField(choices=list(FLAGS), allow_null=True)


class LabResultSerializer(serializers.Serializer):
    items = LabResultItemSerializer(many=True)
    comment = serializers.CharField(allow_blank=True)


class LabOrderSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    visit_id = serializers.UUIDField()
    consultation_id = serializers.UUIDField()
    test_code = serializers.CharField()
    test_name = serializers.CharField()
    specimen = serializers.CharField(allow_blank=True)
    state = serializers.ChoiceField(choices=LabOrderState.choices)
    reason = serializers.CharField(allow_blank=True, help_text="Why the doctor asks (encrypted).")
    ordered_at = serializers.DateTimeField()
    ordered_by_name = serializers.CharField(allow_null=True)
    sample_taken_at = serializers.DateTimeField(allow_null=True)
    sample_taken_by_name = serializers.CharField(allow_null=True)
    resulted_at = serializers.DateTimeField(allow_null=True)
    resulted_by_name = serializers.CharField(allow_null=True)
    result = LabResultSerializer(allow_null=True)
    is_abnormal = serializers.BooleanField()
    reviewed_at = serializers.DateTimeField(allow_null=True)
    reviewed_by_name = serializers.CharField(allow_null=True)
    review_note = serializers.CharField(
        allow_blank=True, help_text="The clinician's note for the patient; empty for the lab."
    )
    released_at = serializers.DateTimeField(allow_null=True)
    version = serializers.IntegerField()


class LabOrderInputSerializer(StrictSerializer):
    tests = serializers.ListField(
        child=serializers.CharField(max_length=20), min_length=1, max_length=10
    )
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True)


class LabVersionSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)


class LabResultInputSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)
    values = serializers.DictField(child=serializers.CharField(max_length=40, allow_blank=True))
    comment = serializers.CharField(max_length=500, required=False, allow_blank=True)


class LabReviewInputSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)
    note = serializers.CharField(max_length=1000, required=False, allow_blank=True)


class LabPatientSerializer(serializers.Serializer):
    """What the lab needs to confirm who the patient is (upgrade 06 §3)."""

    full_name = serializers.CharField()
    display_name = serializers.CharField()
    date_of_birth = serializers.DateField(allow_null=True)
    age_years = serializers.IntegerField(allow_null=True)
    sex = serializers.CharField(allow_null=True)
    medilink_number = serializers.CharField(allow_null=True)


class LabVisitSerializer(serializers.Serializer):
    visit_id = serializers.UUIDField()
    ticket = TicketRowSerializer(
        allow_null=True, help_text="The lab ticket; null until the doctor sends the patient."
    )
    patient = LabPatientSerializer()
    unpaid = serializers.BooleanField(help_text="Something is still to pay on the visit's bill.")
    orders = LabOrderSerializer(many=True)


class LabQueueSerializer(serializers.Serializer):
    waiting = LabVisitSerializer(many=True, help_text="At least one sample to take.")
    in_progress = LabVisitSerializer(many=True, help_text="Samples taken, results to enter.")
    done_today = LabVisitSerializer(many=True, help_text="Every test resulted today.")


class LabInboxRowSerializer(serializers.Serializer):
    order = LabOrderSerializer()
    patient = LabPatientSerializer()
    facility_patient_id = serializers.UUIDField()


class PatientLabResultSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    patient_id = serializers.UUIDField()
    facility_name = serializers.CharField()
    test_code = serializers.CharField()
    test_name = serializers.CharField()
    ordered_at = serializers.DateTimeField()
    released_at = serializers.DateTimeField()
    doctor_name = serializers.CharField(allow_blank=True)
    items = LabResultItemSerializer(many=True)
    is_abnormal = serializers.BooleanField()
    note = serializers.CharField(allow_blank=True, help_text="The doctor's note with the result.")
