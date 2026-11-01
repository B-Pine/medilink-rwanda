"""S5b request and response shapes (contract sprint-05 §3.2 B10-B11, §3.3 R7-R9)."""

from __future__ import annotations

from typing import Any

from rest_framework import serializers

from medilink.accounts.serializers import StrictSerializer
from medilink.scheduling.booking_serializers import StaffBookingSerializer
from medilink.scheduling.models import (
    DisruptionAction,
    DisruptionKind,
    DisruptionStatus,
    FollowUpMode,
    FollowUpStatus,
    PatientResponse,
)

# ---- R7 disruptions ----------------------------------------------------------------------------


class DisruptionCreateSerializer(StrictSerializer):
    kind = serializers.ChoiceField(choices=DisruptionKind.choices)
    membership_id = serializers.UUIDField(required=False, allow_null=True)
    service_id = serializers.UUIDField(required=False, allow_null=True)
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()
    reason = serializers.CharField(max_length=300)


class ApplyStepSerializer(StrictSerializer):
    id = serializers.UUIDField()
    action = serializers.ChoiceField(choices=DisruptionAction.choices)
    membership_id = serializers.UUIDField(required=False, allow_null=True)


class DisruptionApplySerializer(StrictSerializer):
    """Either `items` (one action per item) or `all` (one action for every item not applied)."""

    items = serializers.ListField(child=ApplyStepSerializer(), required=False, max_length=500)
    all = serializers.ChoiceField(choices=DisruptionAction.choices, required=False)
    membership_id = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if ("items" in attrs) == ("all" in attrs):
            raise serializers.ValidationError({"items": ["Send either items or all."]})
        return attrs


class DisruptionCountsSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    not_applied = serializers.IntegerField()
    pending = serializers.IntegerField()
    accepted = serializers.IntegerField()
    declined = serializers.IntegerField()
    rebooked_other = serializers.IntegerField()
    cancelled = serializers.IntegerField()


class DisruptionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=DisruptionKind.choices)
    membership_id = serializers.UUIDField(allow_null=True)
    doctor = serializers.CharField(allow_null=True)
    service_id = serializers.UUIDField(allow_null=True)
    service_name_i18n = serializers.DictField(child=serializers.CharField(), allow_null=True)
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()
    reason = serializers.CharField()
    status = serializers.ChoiceField(choices=DisruptionStatus.choices)
    created_by = serializers.CharField(allow_null=True)
    created_at = serializers.DateTimeField()
    resolved_at = serializers.DateTimeField(allow_null=True)
    counts = DisruptionCountsSerializer()
    version = serializers.IntegerField()


class DisruptionItemSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    target = serializers.ChoiceField(choices=["booking", "ticket"])
    booking_id = serializers.UUIDField(allow_null=True)
    booking_code = serializers.CharField(allow_null=True)
    ticket_id = serializers.UUIDField(allow_null=True)
    ticket_number = serializers.CharField(allow_null=True)
    facility_patient_id = serializers.UUIDField(allow_null=True)
    display_name = serializers.CharField()
    contact_phone = serializers.CharField(allow_null=True)
    service_id = serializers.UUIDField()
    starts_at = serializers.DateTimeField()
    doctor = serializers.CharField(allow_null=True)
    previous_starts_at = serializers.DateTimeField(allow_null=True)
    previous_doctor = serializers.CharField(allow_null=True)
    action = serializers.ChoiceField(choices=DisruptionAction.choices, allow_null=True)
    patient_response = serializers.ChoiceField(choices=PatientResponse.choices)
    reply_by = serializers.DateTimeField(allow_null=True)
    auto_accept = serializers.BooleanField(allow_null=True)
    new_booking_id = serializers.UUIDField(allow_null=True)
    applied_at = serializers.DateTimeField(allow_null=True)
    resolved_at = serializers.DateTimeField(allow_null=True)
    version = serializers.IntegerField()


class DisruptionDetailSerializer(serializers.Serializer):
    disruption = DisruptionSerializer()
    items = DisruptionItemSerializer(many=True)
    # item id -> reason code for the items an apply could not change
    problems = serializers.DictField(child=serializers.CharField(), required=False)


class DisruptionPageSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    results = DisruptionSerializer(many=True)


# ---- R8 follow-up ------------------------------------------------------------------------------


class FollowUpCreateSerializer(StrictSerializer):
    in_days = serializers.IntegerField(min_value=1, max_value=365)
    mode = serializers.ChoiceField(choices=FollowUpMode.choices)


class FollowUpSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    visit_id = serializers.UUIDField()
    due_on = serializers.DateField()
    mode = serializers.ChoiceField(choices=FollowUpMode.choices)
    status = serializers.ChoiceField(choices=FollowUpStatus.choices)
    booking = StaffBookingSerializer(allow_null=True)
    created_at = serializers.DateTimeField()
    version = serializers.IntegerField()


# ---- R9 calendar -------------------------------------------------------------------------------


class StaffCalendarBlockSerializer(serializers.Serializer):
    service_id = serializers.UUIDField()
    membership_id = serializers.UUIDField(allow_null=True)
    doctor = serializers.CharField(allow_null=True)
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()
    capacity = serializers.IntegerField()
    booked = serializers.IntegerField()
    bookings = StaffBookingSerializer(many=True)


class StaffCalendarDisruptionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=DisruptionKind.choices)
    membership_id = serializers.UUIDField(allow_null=True)
    service_id = serializers.UUIDField(allow_null=True)
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()
    status = serializers.ChoiceField(choices=DisruptionStatus.choices)


class StaffCalendarDaySerializer(serializers.Serializer):
    date = serializers.DateField()
    blocks = StaffCalendarBlockSerializer(many=True)
    other_bookings = StaffBookingSerializer(many=True)


class StaffCalendarDoctorSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()


class StaffCalendarServiceSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name_i18n = serializers.DictField(child=serializers.CharField())


class StaffCalendarSerializer(serializers.Serializer):
    view = serializers.ChoiceField(choices=["day", "week"])
    from_date = serializers.DateField()
    to_date = serializers.DateField()
    only_own = serializers.BooleanField()
    services = StaffCalendarServiceSerializer(many=True)
    doctors = StaffCalendarDoctorSerializer(many=True)
    days = StaffCalendarDaySerializer(many=True)
    disruptions = StaffCalendarDisruptionSerializer(many=True)


# ---- B10, B11 patient ----------------------------------------------------------------------------


class RespondSerializer(StrictSerializer):
    """`{response: accept|cancel}` or `{hold_id}` for another time."""

    response = serializers.ChoiceField(choices=["accept", "cancel"], required=False)
    hold_id = serializers.UUIDField(required=False)
    version = serializers.IntegerField(min_value=1, required=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if ("response" in attrs) == ("hold_id" in attrs):
            raise serializers.ValidationError({"response": ["Send either response or hold_id."]})
        return attrs


class CalendarFeedSerializer(serializers.Serializer):
    is_active = serializers.BooleanField()
    created_at = serializers.DateTimeField(allow_null=True)
    last_accessed_at = serializers.DateTimeField(allow_null=True)


class CalendarFeedCreatedSerializer(serializers.Serializer):
    url = serializers.CharField()
    created_at = serializers.DateTimeField()
