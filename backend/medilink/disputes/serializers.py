"""Shapes for S10 part 2a (contract sprint-10b §3). Patient shapes never carry internal notes or
staff comments; evidence carries actions, times and names only."""

from __future__ import annotations

from rest_framework import serializers

from medilink.accounts.serializers import StrictSerializer
from medilink.disputes.models import (
    ActionStatus,
    AuthorRole,
    Channel,
    DisputeStatus,
    DisputeType,
    HandlerLevel,
    Outcome,
    SubjectType,
    Visibility,
)


class RaiseSerializer(StrictSerializer):
    patient_id = serializers.UUIDField()
    subject_type = serializers.ChoiceField(choices=SubjectType.choices)
    subject_id = serializers.UUIDField()
    description = serializers.CharField(min_length=10, max_length=3000)


class CounterRaiseSerializer(StrictSerializer):
    facility_patient_id = serializers.UUIDField()
    subject_type = serializers.ChoiceField(choices=SubjectType.choices)
    subject_id = serializers.UUIDField()
    description = serializers.CharField(min_length=10, max_length=3000)


class DisputeVersionSerializer(StrictSerializer):
    version = serializers.IntegerField()


class MessageInputSerializer(StrictSerializer):
    body = serializers.CharField(min_length=2, max_length=3000)


class StaffMessageInputSerializer(MessageInputSerializer):
    visibility = serializers.ChoiceField(
        choices=[(Visibility.THREAD, "Thread"), (Visibility.INTERNAL, "Internal note")]
    )


class RequestInfoSerializer(DisputeVersionSerializer):
    body = serializers.CharField(min_length=2, max_length=3000)


class CommentRequestInputSerializer(StrictSerializer):
    membership_id = serializers.UUIDField()


class ResolveSerializer(DisputeVersionSerializer):
    outcome = serializers.ChoiceField(choices=Outcome.choices)
    reason = serializers.CharField(min_length=5, max_length=1000)


class StatementSerializer(StrictSerializer):
    statement = serializers.CharField(min_length=10, max_length=3000)


class MessageSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    author_name = serializers.CharField()
    author_role = serializers.ChoiceField(choices=AuthorRole.choices)
    visibility = serializers.ChoiceField(choices=Visibility.choices)
    body = serializers.CharField()
    created_at = serializers.DateTimeField()


class EventSerializer(serializers.Serializer):
    from_status = serializers.CharField(allow_blank=True)
    to_status = serializers.CharField()
    actor_name = serializers.CharField(allow_blank=True)
    reason = serializers.CharField(allow_blank=True)
    occurred_at = serializers.DateTimeField()


class ActionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    outcome = serializers.ChoiceField(choices=Outcome.choices)
    linked_object_type = serializers.CharField(allow_blank=True)
    linked_object_id = serializers.UUIDField(allow_null=True)
    status = serializers.ChoiceField(choices=ActionStatus.choices)
    done_at = serializers.DateTimeField(allow_null=True)


class EvidenceEntrySerializer(serializers.Serializer):
    action = serializers.CharField()
    at = serializers.DateTimeField()
    actor_name = serializers.CharField(allow_blank=True)


class CommentRequestSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    member_name = serializers.CharField()
    membership_id = serializers.UUIDField()
    responded_at = serializers.DateTimeField(allow_null=True)


class DisputeRowSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    patient_id = serializers.UUIDField()
    patient_display_name = serializers.CharField()
    facility_name = serializers.CharField()
    channel = serializers.ChoiceField(choices=Channel.choices)
    type = serializers.ChoiceField(choices=DisputeType.choices)
    subject_type = serializers.ChoiceField(choices=SubjectType.choices)
    subject_id = serializers.UUIDField()
    subject_snapshot = serializers.DictField()
    status = serializers.ChoiceField(choices=DisputeStatus.choices)
    handler_level = serializers.ChoiceField(choices=HandlerLevel.choices)
    acknowledge_by = serializers.DateTimeField()
    decide_by = serializers.DateTimeField(allow_null=True)
    is_overdue = serializers.BooleanField()
    outcome = serializers.CharField(allow_blank=True)
    created_at = serializers.DateTimeField()
    version = serializers.IntegerField()


class StaffDisputeRowSerializer(DisputeRowSerializer):
    flagged = serializers.BooleanField(
        help_text="3 or more rejected disputes (review, never block)"
    )


class PatientDisputeSerializer(DisputeRowSerializer):
    description = serializers.CharField()
    decision_reason = serializers.CharField(allow_blank=True)
    resolved_at = serializers.DateTimeField(allow_null=True)
    closed_at = serializers.DateTimeField(allow_null=True)
    can_accept = serializers.BooleanField()
    can_escalate = serializers.BooleanField()
    can_reopen = serializers.BooleanField()
    can_add_statement = serializers.BooleanField()
    statement = serializers.CharField(allow_blank=True)
    messages = MessageSerializer(many=True)
    events = EventSerializer(many=True)


class StaffDisputeSerializer(StaffDisputeRowSerializer):
    description = serializers.CharField()
    decision_reason = serializers.CharField(allow_blank=True)
    resolved_at = serializers.DateTimeField(allow_null=True)
    statement = serializers.CharField(allow_blank=True)
    can_decide = serializers.BooleanField(help_text="False for an involved handler (FR-DSP-08)")
    messages = MessageSerializer(many=True)
    events = EventSerializer(many=True)
    evidence = EvidenceEntrySerializer(many=True)
    actions = ActionSerializer(many=True)
    comment_requests = CommentRequestSerializer(many=True)
