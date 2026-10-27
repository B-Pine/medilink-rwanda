"""S4 request and response shapes (contract sprint-04 §3)."""

from __future__ import annotations

from typing import Any

from rest_framework import serializers

from medilink.accounts.serializers import StrictSerializer
from medilink.visits.models import DutyState, PriorityClass, Stage, TicketState, VisitSource


class CheckInSerializer(StrictSerializer):
    # S5: a booking brings its own patient and service (contract sprint-05 §3.3 R6)
    booking_id = serializers.UUIDField(required=False, allow_null=True)
    facility_patient_id = serializers.UUIDField(required=False)
    service_id = serializers.UUIDField(required=False)
    source = serializers.ChoiceField(  # type: ignore[assignment]  # API field name
        choices=[VisitSource.WALK_IN, VisitSource.EMERGENCY], default=VisitSource.WALK_IN
    )
    priority_class = serializers.ChoiceField(
        choices=PriorityClass.choices, required=False, allow_null=True
    )
    priority_reason_code = serializers.CharField(
        max_length=40, required=False, allow_blank=True, allow_null=True
    )
    reason_text = serializers.CharField(
        max_length=1000, required=False, allow_blank=True, allow_null=True
    )
    insurance_profile_id = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if not attrs.get("booking_id") and not (
            attrs.get("facility_patient_id") and attrs.get("service_id")
        ):
            raise serializers.ValidationError(
                {"facility_patient_id": ["Choose a patient and a service, or a booking."]}
            )
        return attrs


class TicketRowSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    visit_id = serializers.UUIDField()
    number = serializers.CharField()
    state = serializers.ChoiceField(choices=TicketState.choices)
    stage = serializers.ChoiceField(choices=Stage.choices)
    service_id = serializers.UUIDField()
    display_name = serializers.CharField()
    age_years = serializers.IntegerField(allow_null=True)
    sex = serializers.CharField(allow_null=True)
    flags = serializers.ListField(child=serializers.CharField())
    priority_rank = serializers.IntegerField()
    arrival_at = serializers.DateTimeField()
    called_at = serializers.DateTimeField(allow_null=True)
    assigned_membership_id = serializers.UUIDField(allow_null=True)
    service_point = serializers.CharField(allow_null=True)
    step_out_until = serializers.DateTimeField(allow_null=True)
    position = serializers.IntegerField(allow_null=True)
    version = serializers.IntegerField()


class CheckInResponseSerializer(serializers.Serializer):
    visit_id = serializers.UUIDField()
    created = serializers.BooleanField()
    ticket = TicketRowSerializer()


class EstimateSerializer(serializers.Serializer):
    min = serializers.IntegerField(allow_null=True)
    max = serializers.IntegerField(allow_null=True)
    status = serializers.CharField(allow_null=True)
    until = serializers.DateTimeField(allow_null=True)


class DutyRowSerializer(serializers.Serializer):
    membership_id = serializers.UUIDField()
    full_name = serializers.CharField()
    state = serializers.ChoiceField(choices=DutyState.choices)
    service_point_id = serializers.UUIDField(allow_null=True)
    service_point = serializers.CharField(allow_null=True)
    until_at = serializers.DateTimeField(allow_null=True)


class QueueGroupSerializer(serializers.Serializer):
    service_id = serializers.UUIDField()
    stage = serializers.ChoiceField(choices=Stage.choices)
    waiting = TicketRowSerializer(many=True)
    called = TicketRowSerializer(many=True)
    in_service = TicketRowSerializer(many=True)
    average_minutes = serializers.FloatField()
    estimate_next = EstimateSerializer()


class BoardSerializer(serializers.Serializer):
    queues = QueueGroupSerializer(many=True)
    duty = DutyRowSerializer(many=True)
    updated_at = serializers.DateTimeField()


class MineSerializer(serializers.Serializer):
    current = TicketRowSerializer(allow_null=True)
    waiting = TicketRowSerializer(many=True)
    duty = DutyRowSerializer(allow_null=True)
    service_ids = serializers.ListField(child=serializers.UUIDField())


class CallNextSerializer(StrictSerializer):
    service_id = serializers.UUIDField()
    stage = serializers.ChoiceField(choices=Stage.choices, default=Stage.CONSULTATION)
    service_point_id = serializers.UUIDField(required=False, allow_null=True)


class TicketActionSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)
    stage = serializers.ChoiceField(choices=Stage.choices, required=False)
    service_id = serializers.UUIDField(required=False)
    reason_code = serializers.CharField(max_length=40, required=False, allow_blank=True)
    reason_text = serializers.CharField(max_length=300, required=False, allow_blank=True)
    minutes = serializers.IntegerField(min_value=1, max_value=240, required=False)
    priority_class = serializers.ChoiceField(
        choices=PriorityClass.choices, required=False, allow_null=True
    )
    before_ticket_id = serializers.UUIDField(required=False)
    client_occurred_at = serializers.DateTimeField(required=False)


class TicketEventSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    action = serializers.CharField()
    from_state = serializers.CharField()
    to_state = serializers.CharField()
    actor_name = serializers.CharField(allow_null=True)
    reason_code = serializers.CharField()
    occurred_at = serializers.DateTimeField()
    ticket_number = serializers.CharField()


class VisitDetailSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    facility_patient_id = serializers.UUIDField()
    display_name = serializers.CharField()
    source = serializers.ChoiceField(choices=VisitSource.choices)  # type: ignore[assignment]
    status = serializers.CharField()
    is_emergency = serializers.BooleanField()
    priority_class = serializers.CharField(allow_null=True)
    checked_in_at = serializers.DateTimeField(allow_null=True)
    tickets = TicketRowSerializer(many=True)
    events = TicketEventSerializer(many=True)


class DutyUpdateSerializer(StrictSerializer):
    state = serializers.ChoiceField(choices=DutyState.choices)
    service_point_id = serializers.UUIDField(required=False, allow_null=True)
    until_at = serializers.DateTimeField(required=False, allow_null=True)


class ReorderRowSerializer(serializers.Serializer):
    event_id = serializers.UUIDField()
    ticket_number = serializers.CharField()
    actor_name = serializers.CharField(allow_null=True)
    reason_code = serializers.CharField()
    reason_text = serializers.CharField()
    old_position = serializers.CharField(allow_null=True)
    new_position = serializers.CharField(allow_null=True)
    occurred_at = serializers.DateTimeField()
    reviewed = serializers.BooleanField()


class ReviewSerializer(StrictSerializer):
    comment = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class DisplayLinkSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    label = serializers.CharField()  # type: ignore[assignment]
    service_ids = serializers.ListField(child=serializers.UUIDField())
    revoked_at = serializers.DateTimeField(allow_null=True)
    last_seen_at = serializers.DateTimeField(allow_null=True)
    created_at = serializers.DateTimeField()


class DisplayLinkCreateSerializer(StrictSerializer):
    label = serializers.CharField(max_length=80)  # type: ignore[assignment]
    service_ids = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=8)


class DisplayLinkCreatedSerializer(serializers.Serializer):
    link = DisplayLinkSerializer()
    token = serializers.CharField()


class DisplayServiceSerializer(serializers.Serializer):
    service_id = serializers.UUIDField()
    name_i18n = serializers.DictField()
    now_serving = serializers.ListField(child=serializers.DictField())
    next = serializers.ListField(child=serializers.CharField())


class DisplaySerializer(serializers.Serializer):
    facility_name = serializers.CharField()
    services = DisplayServiceSerializer(many=True)
    updated_at = serializers.DateTimeField()


class PatientVisitSerializer(serializers.Serializer):
    visit_id = serializers.UUIDField()
    patient_id = serializers.UUIDField()
    patient_display_name = serializers.CharField()
    facility_id = serializers.UUIDField()
    facility_name = serializers.CharField()
    service_name_i18n = serializers.DictField()
    ticket_number = serializers.CharField()
    state = serializers.ChoiceField(choices=TicketState.choices)
    stage = serializers.ChoiceField(choices=Stage.choices)
    service_point = serializers.CharField(allow_null=True)
    ahead = serializers.IntegerField()
    estimate = EstimateSerializer()
    leave_by = serializers.DateTimeField(allow_null=True)
    travel_minutes = serializers.IntegerField(allow_null=True)
    version = serializers.IntegerField()
    updated_at = serializers.DateTimeField()


class TravelTimeSerializer(StrictSerializer):
    minutes = serializers.IntegerField(min_value=0, max_value=600)
