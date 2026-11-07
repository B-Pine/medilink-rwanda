"""S6a serializers (contract sprint-06 §3). Explicit fields; one serializer per audience.

Staff clinical serializers carry `private_notes` and `examination_text`. The patient serializers
(`Patient*`) never do (contract §2.2 Patient read, S6-B14): keep it that way.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from rest_framework import serializers

from medilink.clinical.models import (
    VITAL_RANGES,
    AccessReasonCode,
    Certainty,
    ConsultationStatus,
    DiagnosisRank,
)
from medilink.visits.models import TRIAGE_URGENCIES

TEXT_MAX = 20_000
NOTES_MAX = 10_000


class _Strict(serializers.Serializer):
    """Reject unknown input fields (mass-assignment protection, security 04 §2)."""

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        unknown = set(getattr(self, "initial_data", {}) or {}) - set(self.fields)
        if unknown:
            raise serializers.ValidationError(
                {name: ["Unknown field."] for name in sorted(unknown)}
            )
        return attrs


# ---- input --------------------------------------------------------------------------------------


class DiagnosisInputSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=10)
    rank = serializers.ChoiceField(choices=DiagnosisRank.choices)
    certainty = serializers.ChoiceField(choices=Certainty.choices)


class ConsultationUpdateSerializer(_Strict):
    version = serializers.IntegerField(min_value=1)
    history_text = serializers.CharField(
        max_length=TEXT_MAX, required=False, allow_blank=True, trim_whitespace=False
    )
    examination_text = serializers.CharField(
        max_length=TEXT_MAX, required=False, allow_blank=True, trim_whitespace=False
    )
    plan_text = serializers.CharField(
        max_length=TEXT_MAX, required=False, allow_blank=True, trim_whitespace=False
    )
    patient_instructions_text = serializers.CharField(
        max_length=TEXT_MAX, required=False, allow_blank=True, trim_whitespace=False
    )
    private_notes = serializers.CharField(
        max_length=NOTES_MAX, required=False, allow_blank=True, trim_whitespace=False
    )
    is_restricted = serializers.BooleanField(required=False)
    diagnoses = DiagnosisInputSerializer(many=True, required=False)


# API field -> section name in models.SECTIONS
SECTION_FIELDS = {
    "history_text": "history",
    "examination_text": "examination",
    "plan_text": "plan",
    "patient_instructions_text": "patient_instructions",
    "private_notes": "private_notes",
}


class ClinicalVersionSerializer(_Strict):
    version = serializers.IntegerField(min_value=1)


class EnteredInErrorSerializer(_Strict):
    version = serializers.IntegerField(min_value=1)
    reason = serializers.CharField(max_length=300)


class AddendumInputSerializer(_Strict):
    reason = serializers.CharField(max_length=300)
    body = serializers.CharField(max_length=NOTES_MAX)


def _vital_field(name: str) -> serializers.Field:
    low, high = VITAL_RANGES[name]
    if name in ("temperature_c", "weight_kg", "height_cm"):
        places = 2 if name == "weight_kg" else 1
        digits = 5 if name in ("weight_kg", "height_cm") else 4
        return serializers.DecimalField(
            max_digits=digits,
            decimal_places=places,
            min_value=Decimal(str(low)),
            max_value=Decimal(str(high)),
            required=False,
            allow_null=True,
        )
    return serializers.IntegerField(
        min_value=int(low), max_value=int(high), required=False, allow_null=True
    )


class VitalsInputSerializer(_Strict):
    temperature_c = _vital_field("temperature_c")
    systolic_mmhg = _vital_field("systolic_mmhg")
    diastolic_mmhg = _vital_field("diastolic_mmhg")
    pulse_bpm = _vital_field("pulse_bpm")
    respiratory_rate = _vital_field("respiratory_rate")
    spo2_pct = _vital_field("spo2_pct")
    weight_kg = _vital_field("weight_kg")
    height_cm = _vital_field("height_cm")
    muac_mm = _vital_field("muac_mm")
    recorded_at = serializers.DateTimeField(required=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        attrs = super().validate(attrs)
        values = {k: v for k, v in attrs.items() if k in VITAL_RANGES and v is not None}
        if not values:
            raise serializers.ValidationError({"non_field_errors": ["Enter at least one value."]})
        systolic, diastolic = values.get("systolic_mmhg"), values.get("diastolic_mmhg")
        if systolic is not None and diastolic is not None and diastolic >= systolic:
            raise serializers.ValidationError(
                {"diastolic_mmhg": ["Must be lower than the systolic value."]}
            )
        return attrs


class ClinicalReasonSerializer(_Strict):
    reason = serializers.CharField(max_length=300)


class AccessReasonInputSerializer(_Strict):
    reason_code = serializers.ChoiceField(choices=AccessReasonCode.choices)
    reason_text = serializers.CharField(max_length=300, required=False, allow_blank=True)


class AlertItemSerializer(serializers.Serializer):
    drug_code = serializers.CharField(max_length=40)
    quantity = serializers.IntegerField(min_value=1, max_value=100_000, required=False)


class AlertCheckSerializer(_Strict):
    facility_patient_id = serializers.UUIDField()
    items = serializers.ListField(child=AlertItemSerializer(), min_length=1, max_length=20)


# ---- staff output -------------------------------------------------------------------------------


class VitalsSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    visit_id = serializers.UUIDField()
    recorded_at = serializers.DateTimeField()
    recorded_by_name = serializers.CharField(allow_null=True)
    temperature_c = serializers.DecimalField(max_digits=4, decimal_places=1, allow_null=True)
    systolic_mmhg = serializers.IntegerField(allow_null=True)
    diastolic_mmhg = serializers.IntegerField(allow_null=True)
    pulse_bpm = serializers.IntegerField(allow_null=True)
    respiratory_rate = serializers.IntegerField(allow_null=True)
    spo2_pct = serializers.IntegerField(allow_null=True)
    weight_kg = serializers.DecimalField(max_digits=5, decimal_places=2, allow_null=True)
    height_cm = serializers.DecimalField(max_digits=5, decimal_places=1, allow_null=True)
    muac_mm = serializers.IntegerField(allow_null=True)
    # upgrade 05 §3: red flags so a dangerous number is never missed
    flags = serializers.ListField(child=serializers.CharField())
    is_entered_in_error = serializers.BooleanField()


class VitalsListSerializer(serializers.Serializer):
    results = VitalsSerializer(many=True)


class DiagnosisSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    code = serializers.CharField()
    display = serializers.CharField()
    plain_language = serializers.CharField()
    rank = serializers.ChoiceField(choices=DiagnosisRank.choices)
    certainty = serializers.ChoiceField(choices=Certainty.choices)
    is_sensitive = serializers.BooleanField()


class AddendumSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    author_name = serializers.CharField()
    is_by_author = serializers.BooleanField()
    reason = serializers.CharField()
    body = serializers.CharField()
    signed_at = serializers.DateTimeField()
    content_hash = serializers.CharField()


class AllergySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    category = serializers.CharField()
    substance = serializers.CharField()
    reaction = serializers.CharField(allow_null=True)
    severity = serializers.CharField()
    verification_status = serializers.CharField()


class ClinicalPatientSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    display_name = serializers.CharField()
    age_years = serializers.IntegerField(allow_null=True)
    sex = serializers.CharField(allow_null=True)


class AuthorSerializer(serializers.Serializer):
    membership_id = serializers.UUIDField()
    full_name = serializers.CharField()


class EnteredInErrorInfoSerializer(serializers.Serializer):
    at = serializers.DateTimeField()
    reason = serializers.CharField()
    by_name = serializers.CharField(allow_null=True)


class PregnancySerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["pregnant", "not_pregnant", "unknown"])
    due_date = serializers.DateField(allow_null=True)
    recorded_at = serializers.DateTimeField()
    is_active = serializers.BooleanField()


class HealthAttributesSerializer(serializers.Serializer):
    blood_group = serializers.CharField(allow_null=True)
    pregnancy = PregnancySerializer(allow_null=True)


class ReasonSymptomSerializer(serializers.Serializer):
    code = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]  # API field name
    duration_days = serializers.IntegerField(allow_null=True)
    severity = serializers.CharField(allow_blank=True)
    stage = serializers.CharField()


class TriageHintSerializer(serializers.Serializer):
    """Care navigation from the triage rules: an urgency and a service, never a diagnosis."""

    urgency = serializers.CharField()
    service_code = serializers.CharField()
    level_of_care = serializers.CharField()
    red_flags = serializers.ListField(child=serializers.CharField())
    rules_version = serializers.CharField()
    signed_off = serializers.BooleanField()


class NurseTriageSerializer(serializers.Serializer):
    urgency = serializers.ChoiceField(choices=list(TRIAGE_URGENCIES))
    note = serializers.CharField(allow_blank=True)
    by_name = serializers.CharField(allow_blank=True)
    at = serializers.DateTimeField()


class ReasonForVisitSerializer(serializers.Serializer):
    patient_words = serializers.CharField(allow_blank=True)
    symptoms = ReasonSymptomSerializer(many=True)
    triage = TriageHintSerializer(allow_null=True)
    nurse_triage = NurseTriageSerializer(
        allow_null=True, help_text="The triage nurse's urgency and note (#200); null when none."
    )


class ConsultationSerializer(serializers.Serializer):
    """Staff clinical view (doctors with clinical.view who pass the access rule)."""

    id = serializers.UUIDField()
    visit_id = serializers.UUIDField()
    facility_patient_id = serializers.UUIDField()
    patient = ClinicalPatientSerializer()
    author = AuthorSerializer()
    status = serializers.ChoiceField(choices=ConsultationStatus.choices)
    started_at = serializers.DateTimeField()
    signed_at = serializers.DateTimeField(allow_null=True)
    is_late_entry = serializers.BooleanField()
    is_restricted = serializers.BooleanField()
    suggest_restricted = serializers.BooleanField()
    history_text = serializers.CharField(allow_blank=True)
    examination_text = serializers.CharField(allow_blank=True)
    plan_text = serializers.CharField(allow_blank=True)
    patient_instructions_text = serializers.CharField(allow_blank=True)
    private_notes = serializers.CharField(allow_blank=True)
    diagnoses = DiagnosisSerializer(many=True)
    vitals = VitalsSerializer(many=True)
    # upgrade 05 §3: why the patient came, read before they sit down
    reason_for_visit = ReasonForVisitSerializer()
    addenda = AddendumSerializer(many=True)
    allergies = AllergySerializer(many=True)
    no_known_allergies = serializers.BooleanField(allow_null=True)
    health_attributes = HealthAttributesSerializer()
    content_hash = serializers.CharField(allow_null=True)
    integrity = serializers.ChoiceField(choices=["ok", "mismatch"], allow_null=True)
    entered_in_error = EnteredInErrorInfoSerializer(allow_null=True)
    can_edit = serializers.BooleanField()
    can_sign = serializers.BooleanField()
    version = serializers.IntegerField()


class MyDayTrendSerializer(serializers.Serializer):
    date = serializers.DateField()
    seen = serializers.IntegerField()


class OpenQuestionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    prescription_id = serializers.UUIDField()
    consultation_id = serializers.UUIDField()
    patient_display_name = serializers.CharField()
    raised_at = serializers.DateTimeField()


class MyDaySerializer(serializers.Serializer):
    """Doctor Today (upgrade 05 §3): counts for one clinician, no clinical content."""

    date = serializers.DateField()
    seen_today = serializers.IntegerField()
    avg_consult_min = serializers.IntegerField(allow_null=True)
    signed_today = serializers.IntegerField()
    trend = MyDayTrendSerializer(many=True)
    unsigned = serializers.IntegerField()
    unsigned_overdue = serializers.IntegerField()
    results_waiting = serializers.IntegerField()
    follow_ups_today = serializers.IntegerField()
    open_questions = OpenQuestionSerializer(many=True)
    updated_at = serializers.DateTimeField()


class ConsultationRowSerializer(serializers.Serializer):
    """Unsigned records list: no clinical content (C7)."""

    id = serializers.UUIDField()
    visit_id = serializers.UUIDField()
    facility_patient_id = serializers.UUIDField()
    patient_display_name = serializers.CharField()
    service_date = serializers.DateField()
    author = AuthorSerializer()
    status = serializers.ChoiceField(choices=ConsultationStatus.choices)
    started_at = serializers.DateTimeField()
    is_overdue = serializers.BooleanField()


class HistoryDiagnosisSerializer(serializers.Serializer):
    code = serializers.CharField()
    display = serializers.CharField()
    certainty = serializers.CharField()
    rank = serializers.CharField()


class LegacyEntrySerializer(serializers.Serializer):
    entry_kind = serializers.ChoiceField(
        choices=["diagnosis", "condition", "allergy", "medication", "procedure"]
    )
    code = serializers.CharField(allow_blank=True)
    display = serializers.CharField()
    note = serializers.CharField(allow_blank=True)
    occurred_on = serializers.DateField(allow_null=True)
    entered_at = serializers.DateTimeField()
    source_scan_id = serializers.UUIDField(allow_null=True)


class ScanItemSerializer(serializers.Serializer):
    document_type = serializers.ChoiceField(
        choices=["outside_result", "legacy_record", "referral_letter", "other"]
    )
    document_date = serializers.DateField()
    description = serializers.CharField(allow_blank=True)
    content_type = serializers.CharField()
    uploaded_at = serializers.DateTimeField()


class HistoryItemSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=["consultation", "vitals", "legacy", "scan"])
    id = serializers.UUIDField()
    occurred_at = serializers.DateTimeField()
    visit_id = serializers.UUIDField(allow_null=True)
    service_name_i18n = serializers.DictField(child=serializers.CharField())
    author_name = serializers.CharField(allow_null=True)
    status = serializers.CharField(allow_null=True)
    is_restricted = serializers.BooleanField()
    is_late_entry = serializers.BooleanField()
    diagnoses = HistoryDiagnosisSerializer(many=True)
    addenda_count = serializers.IntegerField()
    vitals = VitalsSerializer(allow_null=True)
    legacy = LegacyEntrySerializer(allow_null=True)
    scan = ScanItemSerializer(allow_null=True)


class SummaryItemSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    display = serializers.CharField()
    verification_status = serializers.CharField()
    detail = serializers.CharField(allow_null=True)


class RecentDiagnosisSerializer(serializers.Serializer):
    code = serializers.CharField()
    display = serializers.CharField()
    certainty = serializers.CharField()
    last_seen_at = serializers.DateTimeField()


class ProblemSummarySerializer(serializers.Serializer):
    allergies = AllergySerializer(many=True)
    no_known_allergies = serializers.BooleanField(allow_null=True)
    conditions = SummaryItemSerializer(many=True)
    medications = SummaryItemSerializer(many=True)
    recent_diagnoses = RecentDiagnosisSerializer(many=True)
    is_staff_member = serializers.BooleanField()
    health_attributes = HealthAttributesSerializer()


class AccessStateSerializer(serializers.Serializer):
    has_relationship = serializers.BooleanField()
    is_staff_member = serializers.BooleanField()
    reason_required = serializers.BooleanField()
    granted_until = serializers.DateTimeField(allow_null=True)


class AccessGrantSerializer(serializers.Serializer):
    granted_until = serializers.DateTimeField()


class AlertSerializer(serializers.Serializer):
    drug_code = serializers.CharField()
    kind = serializers.ChoiceField(choices=["allergy", "duplicate", "dose"])
    severity = serializers.ChoiceField(choices=["high", "medium"])
    allergy_id = serializers.UUIDField(allow_null=True)
    substance = serializers.CharField(allow_null=True)
    verification_status = serializers.CharField(allow_null=True)
    max_usual_quantity = serializers.IntegerField(allow_null=True)


class AlertResultSerializer(serializers.Serializer):
    alerts = AlertSerializer(many=True)


# ---- patient output (never private notes, never examination) -----------------------------------


class PatientDiagnosisSerializer(serializers.Serializer):
    code = serializers.CharField()
    plain_language = serializers.CharField()
    display = serializers.CharField()
    certainty = serializers.CharField()
    rank = serializers.CharField()


class PatientVitalsSerializer(serializers.Serializer):
    recorded_at = serializers.DateTimeField()
    temperature_c = serializers.DecimalField(max_digits=4, decimal_places=1, allow_null=True)
    systolic_mmhg = serializers.IntegerField(allow_null=True)
    diastolic_mmhg = serializers.IntegerField(allow_null=True)
    pulse_bpm = serializers.IntegerField(allow_null=True)
    respiratory_rate = serializers.IntegerField(allow_null=True)
    spo2_pct = serializers.IntegerField(allow_null=True)
    weight_kg = serializers.DecimalField(max_digits=5, decimal_places=2, allow_null=True)
    height_cm = serializers.DecimalField(max_digits=5, decimal_places=1, allow_null=True)
    muac_mm = serializers.IntegerField(allow_null=True)


class PatientAddendumSerializer(serializers.Serializer):
    author_name = serializers.CharField()
    reason = serializers.CharField()
    body = serializers.CharField()
    signed_at = serializers.DateTimeField()


class PatientRecordRowSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    patient_id = serializers.UUIDField()
    facility_name = serializers.CharField()
    service_date = serializers.DateField()
    doctor_name = serializers.CharField()
    signed_at = serializers.DateTimeField()
    diagnoses = PatientDiagnosisSerializer(many=True)


class PatientRecordSerializer(PatientRecordRowSerializer):
    is_late_entry = serializers.BooleanField()
    history_text = serializers.CharField(allow_blank=True)
    plan_text = serializers.CharField(allow_blank=True)
    patient_instructions_text = serializers.CharField(allow_blank=True)
    vitals = PatientVitalsSerializer(many=True)
    addenda = PatientAddendumSerializer(many=True)


PATIENT_SERIALIZERS: tuple[type[serializers.Serializer], ...] = (
    PatientDiagnosisSerializer,
    PatientVitalsSerializer,
    PatientAddendumSerializer,
    PatientRecordRowSerializer,
    PatientRecordSerializer,
)
