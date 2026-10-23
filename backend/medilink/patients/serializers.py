"""Request and response shapes (contract §3.1). Responses never carry a full identifier value or
phone number for staff, except the reveal endpoints."""

from __future__ import annotations

from datetime import date
from typing import Any

from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from medilink.accounts.serializers import StrictSerializer
from medilink.patients import consents
from medilink.patients.models import (
    Allergy,
    AllergyCategory,
    Condition,
    ConditionStatus,
    FacilityPatient,
    Identifier,
    IdentifierKind,
    InsuranceProfile,
    InsuranceStatus,
    Medication,
    Patient,
    PatientLink,
    PrincipalRelationship,
    Relationship,
    Severity,
    Sex,
)
from medilink.patients.normalize import (
    InvalidValue,
    age_years,
    mask,
    mask_phone,
    normalize_phone,
)

HEALTH_KINDS = ("allergy", "condition", "medication")
STAFF_CONSENT_KINDS = ("care", "research")
REVEAL_REASONS = ("identity_check", "insurance_claim", "patient_request", "other")

# ---- field helpers -------------------------------------------------------------------------------


class PhoneField(serializers.CharField):
    def __init__(self, **kwargs: Any) -> None:
        kwargs.setdefault("max_length", 20)
        kwargs.setdefault("allow_null", True)
        kwargs.setdefault("required", False)
        super().__init__(**kwargs)

    def to_internal_value(self, data: Any) -> str | None:  # type: ignore[override]
        value = super().to_internal_value(data)
        try:
            return normalize_phone(value)
        except InvalidValue as exc:
            raise serializers.ValidationError(str(exc)) from None


class EmergencyContactSerializer(StrictSerializer):
    name = serializers.CharField(max_length=200)
    phone_e164 = PhoneField(required=True, allow_null=False)
    relationship = serializers.CharField(max_length=40)


class IdentifierInputSerializer(StrictSerializer):
    kind = serializers.ChoiceField(choices=IdentifierKind.choices)
    issuing_country = serializers.CharField(max_length=2, required=False, allow_blank=True)
    value = serializers.CharField(max_length=40)


def past_date(value: date) -> None:
    if value > timezone.localdate():
        raise serializers.ValidationError(_("The date can't be in the future."))


# ---- identifiers ---------------------------------------------------------------------------------


class IdentifierSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=IdentifierKind.choices)
    issuing_country = serializers.CharField()
    masked_value = serializers.SerializerMethodField()
    is_verified = serializers.SerializerMethodField()
    verified_at = serializers.DateTimeField(allow_null=True)

    def get_masked_value(self, obj: Identifier) -> str:
        return mask(obj.value_last4)

    def get_is_verified(self, obj: Identifier) -> bool:
        return obj.verified_at is not None


class RevealSerializer(serializers.Serializer):
    value = serializers.CharField()


# ---- insurance -----------------------------------------------------------------------------------


class InsuranceInputSerializer(StrictSerializer):
    insurer_code = serializers.CharField(max_length=40)
    member_number = serializers.CharField(max_length=40)
    is_principal = serializers.BooleanField(default=True)
    principal_name = serializers.CharField(max_length=200, required=False, allow_null=True)
    principal_member_number = serializers.CharField(max_length=40, required=False, allow_null=True)
    relationship_to_principal = serializers.ChoiceField(
        choices=PrincipalRelationship.choices, required=False, allow_null=True
    )
    valid_until = serializers.DateField(required=False, allow_null=True)

    def validate_member_number(self, value: str) -> str:
        return value.strip().upper()

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs.get("is_principal", True) is False and not attrs.get("principal_name"):
            raise serializers.ValidationError(
                {"principal_name": [_("Give the name of the main member.")]}
            )
        return attrs


class InsuranceUpdateSerializer(InsuranceInputSerializer):
    version = serializers.IntegerField(min_value=1)

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        for name, field in self.fields.items():
            if name != "version":
                field.required = False

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        return attrs


class InsuranceVerifySerializer(StrictSerializer):
    outcome = serializers.ChoiceField(choices=["verified", "rejected"])
    valid_until = serializers.DateField(required=False, allow_null=True)
    reason = serializers.CharField(max_length=200, required=False, allow_blank=True)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs["outcome"] == "rejected" and not attrs.get("reason", "").strip():
            raise serializers.ValidationError({"reason": [_("Say why the card was rejected.")]})
        return attrs


class CardImageSerializer(StrictSerializer):
    side = serializers.ChoiceField(choices=["front", "back"])
    file = serializers.FileField()


class InsuranceProfileSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    insurer_code = serializers.CharField()
    insurer_display = serializers.CharField()
    member_number = serializers.CharField()
    is_principal = serializers.BooleanField()
    principal_name = serializers.CharField(allow_null=True)
    principal_member_number = serializers.CharField(allow_null=True)
    relationship_to_principal = serializers.CharField(allow_null=True)
    valid_until = serializers.DateField(allow_null=True)
    is_expired = serializers.SerializerMethodField()
    status = serializers.ChoiceField(choices=InsuranceStatus.choices)
    status_reason = serializers.CharField(allow_null=True)
    last_verified = serializers.SerializerMethodField()
    card_images = serializers.SerializerMethodField()
    is_active = serializers.BooleanField()
    version = serializers.IntegerField()

    def get_is_expired(self, obj: InsuranceProfile) -> bool:
        return obj.valid_until is not None and obj.valid_until < timezone.localdate()

    def get_last_verified(self, obj: InsuranceProfile) -> dict[str, Any] | None:
        if obj.last_verified_at is None:
            return None
        facility = obj.last_verified_facility
        return {"facility_name": facility.name if facility else None, "at": obj.last_verified_at}

    def get_card_images(self, obj: InsuranceProfile) -> dict[str, Any]:
        return {
            "front": _card(obj.card_front_file),
            "back": _card(obj.card_back_file),
            "can_upload": obj.is_active,
        }


def _card(file: Any) -> dict[str, Any] | None:
    if file is None:
        return None
    return {"upload_id": str(file.pk), "scan_status": file.scan_status}


# ---- health profile ------------------------------------------------------------------------------

HEALTH_MODELS: dict[str, Any] = {
    "allergies": Allergy,
    "conditions": Condition,
    "medications": Medication,
}
HEALTH_KIND = {"allergies": "allergy", "conditions": "condition", "medications": "medication"}


class AllergyInputSerializer(StrictSerializer):
    category = serializers.ChoiceField(choices=AllergyCategory.choices)
    substance_text = serializers.CharField(max_length=120)
    reaction = serializers.CharField(max_length=200, required=False, allow_null=True)
    severity = serializers.ChoiceField(choices=Severity.choices, default=Severity.UNKNOWN)


class ConditionInputSerializer(StrictSerializer):
    display = serializers.CharField(max_length=120)
    status = serializers.ChoiceField(choices=ConditionStatus.choices, default="active")
    onset_date = serializers.DateField(required=False, allow_null=True, validators=[past_date])


class MedicationInputSerializer(StrictSerializer):
    drug_display = serializers.CharField(max_length=120)
    dose_text = serializers.CharField(max_length=120, required=False, allow_null=True)
    started_on = serializers.DateField(required=False, allow_null=True, validators=[past_date])
    stopped_on = serializers.DateField(required=False, allow_null=True)


HEALTH_INPUT: dict[str, type[serializers.Serializer]] = {
    "allergies": AllergyInputSerializer,
    "conditions": ConditionInputSerializer,
    "medications": MedicationInputSerializer,
}


class HealthReviewSerializer(StrictSerializer):
    outcome = serializers.ChoiceField(choices=["verified", "refuted", "entered_in_error"])
    note = serializers.CharField(max_length=200, required=False, allow_blank=True)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs["outcome"] != "verified" and not attrs.get("note", "").strip():
            raise serializers.ValidationError({"note": [_("Add a short note.")]})
        return attrs


class HealthItemSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=HEALTH_KINDS)
    category = serializers.CharField(required=False)
    substance_text = serializers.CharField(required=False)
    reaction = serializers.CharField(required=False, allow_null=True)
    severity = serializers.CharField(required=False)
    display = serializers.CharField(required=False)
    status = serializers.CharField(required=False)
    onset_date = serializers.DateField(required=False, allow_null=True)
    drug_display = serializers.CharField(required=False)
    dose_text = serializers.CharField(required=False, allow_null=True)
    started_on = serializers.DateField(required=False, allow_null=True)
    stopped_on = serializers.DateField(required=False, allow_null=True)
    source = serializers.CharField()  # type: ignore[assignment]
    verification_status = serializers.CharField()
    recorded_at = serializers.DateTimeField()
    reviewed_at = serializers.DateTimeField(allow_null=True)
    review_note = serializers.CharField(allow_null=True)


_KIND_FIELDS = {
    Allergy: ("allergy", ("category", "substance_text", "reaction", "severity")),
    Condition: ("condition", ("display", "status", "onset_date")),
    Medication: ("medication", ("drug_display", "dose_text", "started_on", "stopped_on")),
}


def health_item_data(item: Any) -> dict[str, Any]:
    kind, fields = _KIND_FIELDS[type(item)]
    data: dict[str, Any] = {
        "id": item.pk,
        "kind": kind,
        "source": item.source,
        "verification_status": item.verification_status,
        "recorded_at": item.created_at,
        "reviewed_at": item.reviewed_at,
        "review_note": item.review_note,
    }
    data.update({name: getattr(item, name) for name in fields})
    return HealthItemSerializer(data).data


class HealthProfileSerializer(serializers.Serializer):
    no_known_allergies = serializers.BooleanField(allow_null=True)
    allergies = HealthItemSerializer(many=True, allow_null=True)
    conditions = HealthItemSerializer(many=True, allow_null=True)
    medications = HealthItemSerializer(many=True, allow_null=True)


def health_profile_data(patient: Patient, *, sections: tuple[str, ...]) -> dict[str, Any]:
    data: dict[str, Any] = {"no_known_allergies": patient.no_known_allergies}
    for name, model in HEALTH_MODELS.items():
        if name not in sections:
            data[name] = None
            continue
        items = model.objects.filter(patient=patient, entered_in_error_at__isnull=True).order_by(
            "-created_at"
        )
        data[name] = [health_item_data(item) for item in items]
    return data


# ---- staff: patient summaries and detail ---------------------------------------------------------


class InsuranceBadgeSerializer(serializers.Serializer):
    insurer_code = serializers.CharField()
    status = serializers.CharField()
    is_expired = serializers.BooleanField()


class PatientSummarySerializer(serializers.Serializer):
    facility_patient_id = serializers.UUIDField()
    patient_id = serializers.UUIDField()
    medilink_number = serializers.CharField(allow_null=True)
    file_number = serializers.CharField(allow_null=True)
    full_name = serializers.CharField()
    preferred_name = serializers.CharField(allow_null=True)
    sex = serializers.CharField(allow_null=True)
    date_of_birth = serializers.DateField(allow_null=True)
    is_birth_date_estimated = serializers.BooleanField()
    age_years = serializers.IntegerField(allow_null=True)
    phone_masked = serializers.CharField(allow_null=True)
    national_id_masked = serializers.CharField(allow_null=True)
    insurance = InsuranceBadgeSerializer(many=True)
    has_account = serializers.BooleanField()
    is_staff_member = serializers.BooleanField()
    match = serializers.CharField(allow_null=True)


def _insurance_badges(patient: Patient) -> list[dict[str, Any]]:
    today = timezone.localdate()
    return [
        {
            "insurer_code": p.insurer_code,
            "status": p.status,
            "is_expired": p.valid_until is not None and p.valid_until < today,
        }
        for p in InsuranceProfile.objects.filter(patient=patient, is_active=True).order_by(
            "created_at"
        )
    ]


def patient_summary_data(fp: FacilityPatient, match: str | None = None) -> dict[str, Any]:
    patient = fp.patient
    national = Identifier.objects.filter(
        patient=patient, kind=IdentifierKind.NATIONAL_ID, superseded_at__isnull=True
    ).first()
    return {
        "facility_patient_id": fp.pk,
        "patient_id": patient.pk,
        "medilink_number": patient.medilink_number,
        "file_number": fp.file_number,
        "full_name": patient.full_name,
        "preferred_name": patient.preferred_name,
        "sex": patient.sex,
        "date_of_birth": patient.date_of_birth,
        "is_birth_date_estimated": patient.is_birth_date_estimated,
        "age_years": age_years(patient.date_of_birth, timezone.localdate()),
        "phone_masked": mask_phone(patient.phone_e164),
        "national_id_masked": mask(national.value_last4) if national else None,
        "insurance": _insurance_badges(patient),
        "has_account": PatientLink.objects.active()
        .filter(patient=patient, relationship=Relationship.SELF)
        .exists(),
        "is_staff_member": fp.is_staff_member,
        "match": match,
    }


class FacilityPatientDetailSerializer(PatientSummarySerializer):
    address = serializers.CharField(allow_null=True)
    email = serializers.CharField(allow_null=True)
    emergency_contact = serializers.JSONField(allow_null=True)
    reception_notes = serializers.CharField(allow_null=True)
    identifiers = IdentifierSerializer(many=True)
    has_care_consent = serializers.BooleanField()
    open_claim_reference = serializers.CharField(allow_null=True)
    is_active = serializers.BooleanField()
    merged_into_facility_patient_id = serializers.UUIDField(allow_null=True)
    version = serializers.IntegerField()
    patient_version = serializers.IntegerField()


def facility_patient_detail_data(fp: FacilityPatient) -> dict[str, Any]:
    from medilink.patients.models import ClaimStatus, RecordClaim

    patient = fp.patient
    contact = patient.emergency_contact
    if contact and contact.get("phone_e164"):
        contact = {**contact, "phone_e164": mask_phone(contact["phone_e164"])}
    claim = RecordClaim.objects.filter(
        patient=patient, status=ClaimStatus.AWAITING_RECEPTION
    ).first()
    data = patient_summary_data(fp)
    data.update(
        {
            "address": patient.address,
            "email": patient.email,
            "emergency_contact": contact,
            "reception_notes": fp.reception_notes,
            "identifiers": list(
                Identifier.objects.filter(patient=patient, superseded_at__isnull=True).order_by(
                    "kind"
                )
            ),
            "has_care_consent": consents.has_care_consent(patient),
            "open_claim_reference": claim.reference if claim else None,
            "is_active": fp.is_active,
            "merged_into_facility_patient_id": fp.merged_into_id,
            "version": fp.version,
            "patient_version": patient.version,
        }
    )
    return FacilityPatientDetailSerializer(data).data


class ExternalMatchSerializer(serializers.Serializer):
    patient_ref = serializers.UUIDField()
    full_name = serializers.CharField()
    birth_year = serializers.IntegerField(allow_null=True)
    sex = serializers.CharField(allow_null=True)
    medilink_number = serializers.CharField(allow_null=True)
    matched_on = serializers.CharField()


def external_match_data(match: Any) -> dict[str, Any] | None:
    if match is None:
        return None
    patient = match.patient
    return {
        "patient_ref": patient.pk,
        "full_name": patient.full_name,
        "birth_year": patient.date_of_birth.year if patient.date_of_birth else None,
        "sex": patient.sex,
        "medilink_number": patient.medilink_number,
        "matched_on": match.matched_on,
    }


class SearchSerializer(StrictSerializer):
    query = serializers.CharField(max_length=200)
    by = serializers.ChoiceField(
        choices=[
            "auto",
            "name",
            "phone",
            "national_id",
            "identifier",
            "file_number",
            "medilink_number",
        ],
        default="auto",
    )
    kind = serializers.ChoiceField(choices=IdentifierKind.choices, required=False)
    issuing_country = serializers.CharField(max_length=2, required=False, allow_blank=True)


class SearchResultSerializer(serializers.Serializer):
    results = PatientSummarySerializer(many=True)
    external_match = ExternalMatchSerializer(allow_null=True)


class _AgeMixin(StrictSerializer):
    date_of_birth = serializers.DateField(required=False, allow_null=True, validators=[past_date])
    estimated_age_years = serializers.IntegerField(
        required=False, allow_null=True, min_value=0, max_value=120
    )
    estimated_age_months = serializers.IntegerField(
        required=False, allow_null=True, min_value=0, max_value=23
    )


class DuplicateCheckSerializer(_AgeMixin):
    full_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    sex = serializers.ChoiceField(choices=Sex.choices, required=False, allow_null=True)
    phone_e164 = PhoneField()
    identifier = IdentifierInputSerializer(required=False, allow_null=True)
    medilink_number = serializers.CharField(max_length=20, required=False, allow_blank=True)


class DuplicateMatchSerializer(serializers.Serializer):
    level = serializers.ChoiceField(choices=["exact_identifier", "strong", "possible"])
    patient = PatientSummarySerializer()


class DuplicateCheckResultSerializer(serializers.Serializer):
    matches = DuplicateMatchSerializer(many=True)
    external_match = ExternalMatchSerializer(allow_null=True)
    other_facility_possible_count = serializers.IntegerField()


class CareConsentInputSerializer(StrictSerializer):
    version = serializers.CharField(max_length=32)
    granted = serializers.BooleanField()


class RegisterSerializer(_AgeMixin):
    full_name = serializers.CharField(max_length=200)
    sex = serializers.ChoiceField(choices=Sex.choices)
    phone_e164 = PhoneField()
    identifier = IdentifierInputSerializer(required=False, allow_null=True)
    file_number = serializers.CharField(
        max_length=40, required=False, allow_null=True, allow_blank=True
    )
    insurance = InsuranceInputSerializer(required=False, allow_null=True)
    care_consent = CareConsentInputSerializer()
    confirm_not_duplicate = serializers.BooleanField(default=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if not any(
            attrs.get(name) is not None
            for name in ("date_of_birth", "estimated_age_years", "estimated_age_months")
        ):
            raise serializers.ValidationError(
                {"date_of_birth": [_("Give a date of birth or an age.")]}
            )
        if not attrs["care_consent"]["granted"]:
            raise serializers.ValidationError(
                {"care_consent": [_("Care consent is needed to register.")]}
            )
        return attrs


class ProofSerializer(StrictSerializer):
    medilink_number = serializers.CharField(max_length=20, required=False)
    identifier = IdentifierInputSerializer(required=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if bool(attrs.get("medilink_number")) == bool(attrs.get("identifier")):
            raise serializers.ValidationError(
                _("Give the MediLink number or an identity document.")
            )
        return attrs


class AddExistingSerializer(StrictSerializer):
    patient_ref = serializers.UUIDField()
    proof = ProofSerializer()
    file_number = serializers.CharField(
        max_length=40, required=False, allow_null=True, allow_blank=True
    )
    care_consent = CareConsentInputSerializer()


class StaffPatientUpdateSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)
    patient_version = serializers.IntegerField(min_value=1)
    full_name = serializers.CharField(max_length=200, required=False)
    preferred_name = serializers.CharField(max_length=100, required=False, allow_null=True)
    sex = serializers.ChoiceField(choices=Sex.choices, required=False, allow_null=True)
    date_of_birth = serializers.DateField(required=False, allow_null=True, validators=[past_date])
    is_birth_date_estimated = serializers.BooleanField(required=False)
    phone_e164 = PhoneField()
    email = serializers.EmailField(required=False, allow_null=True)
    address = serializers.CharField(max_length=300, required=False, allow_null=True)
    emergency_contact = EmergencyContactSerializer(required=False, allow_null=True)
    file_number = serializers.CharField(max_length=40, required=False, allow_null=True)
    reception_notes = serializers.CharField(max_length=500, required=False, allow_null=True)


class StaffIdentifierSerializer(IdentifierInputSerializer):
    seen_document = serializers.BooleanField(default=False)


class StaffRevealSerializer(StrictSerializer):
    field = serializers.ChoiceField(choices=["identifier", "phone"])
    identifier_id = serializers.UUIDField(required=False)
    reason_code = serializers.ChoiceField(
        choices=["identity_check", "insurance_claim", "patient_request", "other"]
    )
    reason_text = serializers.CharField(max_length=200, required=False, allow_blank=True)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs["reason_code"] == "other" and not attrs.get("reason_text", "").strip():
            raise serializers.ValidationError({"reason_text": [_("Say why you need it.")]})
        if attrs["field"] == "identifier" and not attrs.get("identifier_id"):
            raise serializers.ValidationError({"identifier_id": [_("Choose the document.")]})
        return attrs


class StaffConsentSerializer(StrictSerializer):
    kind = serializers.ChoiceField(choices=STAFF_CONSENT_KINDS)
    version = serializers.CharField(max_length=32)
    granted = serializers.BooleanField()
    script_read = serializers.BooleanField()

    def validate_script_read(self, value: bool) -> bool:
        if not value:
            raise serializers.ValidationError(_("Read the consent script to the patient first."))
        return value


class ConsentRecordSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    kind = serializers.CharField()
    patient_id = serializers.UUIDField(allow_null=True)
    granted = serializers.BooleanField()
    version = serializers.CharField()
    granted_at = serializers.DateTimeField()
    channel = serializers.CharField()


class ClaimConfirmationSerializer(StrictSerializer):
    claim_reference = serializers.CharField(max_length=12)
    document_kind = serializers.ChoiceField(choices=IdentifierKind.choices)
    document_matches = serializers.BooleanField()

    def validate_document_matches(self, value: bool) -> bool:
        if not value:
            raise serializers.ValidationError(_("Confirm only when the document matches."))
        return value
