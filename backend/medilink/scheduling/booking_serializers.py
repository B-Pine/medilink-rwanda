"""S5 request and response shapes (contract sprint-05 §3)."""

from __future__ import annotations

from typing import Any

from rest_framework import serializers

from medilink.masterdata.models import LevelOfCare
from medilink.scheduling.models import BookingSource, BookingStatus


class I18nField(serializers.DictField):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__(child=serializers.CharField(), **kwargs)


# ---- public -------------------------------------------------------------------------------------


class NearSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-3.0, max_value=-1.0)  # Rwanda's latitude band
    lng = serializers.FloatField(min_value=28.8, max_value=31.0)


class FacilitySearchSerializer(serializers.Serializer):
    service_code = serializers.CharField(max_length=40, required=False, allow_blank=True)
    district_code = serializers.CharField(max_length=20, required=False, allow_blank=True)
    sector_code = serializers.CharField(max_length=20, required=False, allow_blank=True)
    near = NearSerializer(required=False, allow_null=True)
    insurer_code = serializers.CharField(max_length=40, required=False, allow_blank=True)
    open_now = serializers.BooleanField(required=False, default=False)
    level_of_care = serializers.ChoiceField(
        choices=LevelOfCare.choices, required=False, allow_blank=True
    )
    available_today = serializers.BooleanField(required=False, default=False)
    page = serializers.IntegerField(required=False, min_value=1, max_value=50, default=1)


class FacilitySearchResultSerializer(serializers.Serializer):
    slug = serializers.CharField()
    name = serializers.CharField()
    type = serializers.CharField()
    ownership = serializers.CharField()
    level_of_care = serializers.CharField()
    district = serializers.CharField()
    sector = serializers.CharField()
    distance_km = serializers.FloatField(allow_null=True)
    open_now = serializers.BooleanField()
    service_code = serializers.CharField()
    service_name_i18n = I18nField()
    accepts_insurance = serializers.ChoiceField(choices=["yes", "no", "unknown"])
    fee_rwf = serializers.IntegerField(allow_null=True)
    patient_share_rwf = serializers.IntegerField(allow_null=True)
    next_slot_at = serializers.DateTimeField(allow_null=True)
    queue_load = serializers.ChoiceField(choices=["low", "medium", "high"], allow_null=True)
    allows_remote_join = serializers.BooleanField()
    referral_hint = serializers.BooleanField()
    lat = serializers.FloatField(allow_null=True)
    lng = serializers.FloatField(allow_null=True)


class FacilitySearchPageSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    page = serializers.IntegerField()
    results = FacilitySearchResultSerializer(many=True)


class PublicFacilityServiceSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    code = serializers.CharField()
    name_i18n = I18nField()
    fee_rwf = serializers.IntegerField(allow_null=True)
    insurers = serializers.ListField(child=serializers.CharField())
    bookable = serializers.BooleanField()
    remote_join = serializers.BooleanField()
    walk_in = serializers.BooleanField()
    queue_load = serializers.CharField(allow_null=True)
    next_slot_at = serializers.DateTimeField(allow_null=True)
    min_age_months = serializers.IntegerField(allow_null=True)
    max_age_months = serializers.IntegerField(allow_null=True)


class PublicFacilityDoctorSerializer(serializers.Serializer):
    membership_id = serializers.UUIDField()
    name = serializers.CharField()
    days = serializers.ListField(child=serializers.IntegerField())
    service_ids = serializers.ListField(child=serializers.UUIDField())


class PublicClosureSerializer(serializers.Serializer):
    date = serializers.DateField()
    reason = serializers.CharField()


class PublicFacilitySerializer(serializers.Serializer):
    slug = serializers.CharField()
    name = serializers.CharField()
    type = serializers.CharField()
    ownership = serializers.CharField()
    level_of_care = serializers.CharField()
    verified = serializers.BooleanField()
    description_i18n = I18nField()
    address = serializers.CharField()
    phone = serializers.CharField()
    district = serializers.CharField()
    sector = serializers.CharField()
    lat = serializers.FloatField(allow_null=True)
    lng = serializers.FloatField(allow_null=True)
    open_now = serializers.BooleanField()
    hours = serializers.ListField(child=serializers.ListField(child=serializers.CharField()))
    closures = PublicClosureSerializer(many=True)
    services = PublicFacilityServiceSerializer(many=True)
    doctors = PublicFacilityDoctorSerializer(many=True)


class PublicSlotSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()
    doctor = serializers.CharField(allow_null=True)
    membership_id = serializers.UUIDField(allow_null=True)
    open_places = serializers.IntegerField()


class SlotDaySerializer(serializers.Serializer):
    date = serializers.DateField()
    slots = PublicSlotSerializer(many=True)


class SlotWeekSerializer(serializers.Serializer):
    service_id = serializers.UUIDField()
    days = SlotDaySerializer(many=True)


class SymptomSerializer(serializers.Serializer):
    code = serializers.CharField()
    name_i18n = I18nField()
    body_system = serializers.CharField()
    is_red_flag = serializers.BooleanField()


# ---- booking ------------------------------------------------------------------------------------


class HoldSerializer(serializers.Serializer):
    hold_id = serializers.UUIDField()
    expires_at = serializers.DateTimeField()


class SlotTakenSerializer(serializers.Serializer):
    """409 body: the error envelope plus up to 3 nearby open times."""

    error = serializers.DictField()
    alternatives = PublicSlotSerializer(many=True)


class SymptomInputSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=40)
    duration_days = serializers.IntegerField(min_value=0, max_value=3650, required=False)
    severity = serializers.ChoiceField(
        choices=["mild", "moderate", "severe"], required=False, allow_blank=True
    )


class BookSerializer(serializers.Serializer):
    hold_id = serializers.UUIDField()
    patient_id = serializers.UUIDField()
    insurance_profile_id = serializers.UUIDField(required=False, allow_null=True)
    symptoms = serializers.ListField(child=SymptomInputSerializer(), min_length=1, max_length=5)
    reason_text = serializers.CharField(max_length=500, required=False, allow_blank=True)


class StaffBookSerializer(serializers.Serializer):
    hold_id = serializers.UUIDField()
    facility_patient_id = serializers.UUIDField()
    insurance_profile_id = serializers.UUIDField(required=False, allow_null=True)
    contact_phone = serializers.CharField(max_length=16, required=False, allow_blank=True)
    symptoms = serializers.ListField(child=SymptomInputSerializer(), min_length=1, max_length=5)
    reason_text = serializers.CharField(max_length=500, required=False, allow_blank=True)


class VersionSerializer(serializers.Serializer):
    version = serializers.IntegerField(min_value=1)


class StaffCancelSerializer(VersionSerializer):
    reason_code = serializers.CharField(max_length=40)


class RescheduleSerializer(VersionSerializer):
    hold_id = serializers.UUIDField()


class ReverseNoShowSerializer(VersionSerializer):
    reason_code = serializers.CharField(max_length=40)
    reason_text = serializers.CharField(max_length=300, required=False, allow_blank=True)


class RemoteJoinSerializer(serializers.Serializer):
    facility_slug = serializers.SlugField(max_length=120)
    service_id = serializers.UUIDField()
    patient_id = serializers.UUIDField()


class CostSerializer(serializers.Serializer):
    fee_rwf = serializers.IntegerField(allow_null=True)
    patient_share_rwf = serializers.IntegerField(allow_null=True)
    insurer_code = serializers.CharField(allow_null=True)
    insurer_accepted = serializers.BooleanField(allow_null=True)


class BookedSymptomSerializer(serializers.Serializer):
    code = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]  # API field name
    duration_days = serializers.IntegerField(allow_null=True)
    severity = serializers.CharField()


class BookingSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    booking_code = serializers.CharField()
    status = serializers.ChoiceField(choices=BookingStatus.choices)
    source = serializers.ChoiceField(  # type: ignore[assignment]  # API field name
        choices=BookingSource.choices
    )
    patient_id = serializers.UUIDField()
    patient_display_name = serializers.CharField()
    facility_slug = serializers.CharField()
    facility_name = serializers.CharField()
    service_id = serializers.UUIDField()
    service_name_i18n = I18nField()
    doctor = serializers.CharField(allow_null=True)
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField(allow_null=True)
    service_point = serializers.CharField(allow_null=True)
    cost = CostSerializer()
    symptoms = BookedSymptomSerializer(many=True)
    can_change = serializers.BooleanField()
    change_until = serializers.DateTimeField()
    rescheduled_to_id = serializers.UUIDField(allow_null=True)
    pending_change = serializers.DictField(allow_null=True)
    version = serializers.IntegerField()


class BookingListSerializer(serializers.Serializer):
    results = BookingSerializer(many=True)


class LimitsSerializer(serializers.Serializer):
    max_active = serializers.IntegerField()
    active = serializers.IntegerField()
    strikes = serializers.IntegerField()
    warning = serializers.BooleanField()
    limited = serializers.BooleanField()


class StaffBookingSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    booking_code = serializers.CharField()
    status = serializers.ChoiceField(choices=BookingStatus.choices)
    source = serializers.ChoiceField(  # type: ignore[assignment]  # API field name
        choices=BookingSource.choices
    )
    patient_id = serializers.UUIDField()
    facility_patient_id = serializers.UUIDField(allow_null=True)
    display_name = serializers.CharField()
    age_years = serializers.IntegerField(allow_null=True)
    sex = serializers.CharField(allow_null=True)
    service_id = serializers.UUIDField()
    membership_id = serializers.UUIDField(allow_null=True)
    doctor = serializers.CharField(allow_null=True)
    starts_at = serializers.DateTimeField()
    symptoms = BookedSymptomSerializer(many=True)
    late = serializers.BooleanField()
    visit_id = serializers.UUIDField(allow_null=True)
    version = serializers.IntegerField()


class StaffBookingPageSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    results = StaffBookingSerializer(many=True)
