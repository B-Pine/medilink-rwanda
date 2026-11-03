"""Super admin console schemas. Users are shown as accounts only: never a patient's health data."""

from __future__ import annotations

from rest_framework import serializers

from medilink.accounts.serializers import StrictSerializer
from medilink.onboarding.serializers import OverviewSerializer

USER_KINDS = ("platform", "staff", "patient")


class AccountReasonSerializer(StrictSerializer):
    reason = serializers.CharField(min_length=5, max_length=300)


class MembershipRowSerializer(serializers.Serializer):
    facility_id = serializers.UUIDField()
    facility_name = serializers.CharField()
    roles = serializers.ListField(child=serializers.CharField())
    is_active = serializers.BooleanField()


class UserRowSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    full_name = serializers.CharField()
    email = serializers.CharField()
    kind = serializers.ChoiceField(choices=USER_KINDS)  # enum: UserKindEnum
    is_active = serializers.BooleanField()
    mfa_enabled = serializers.BooleanField()
    facilities = MembershipRowSerializer(many=True)
    last_login = serializers.DateTimeField(allow_null=True)
    created_at = serializers.DateTimeField()


class SessionRowSerializer(serializers.Serializer):
    ref = serializers.CharField(help_text="Short, non-secret reference of the session.")
    audience = serializers.CharField()
    created_at = serializers.DateTimeField(allow_null=True)
    expires_at = serializers.DateTimeField()


class EventRowSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    occurred_at = serializers.DateTimeField()
    action = serializers.CharField()
    outcome = serializers.ChoiceField(choices=["success", "failure", "info"])
    actor_id = serializers.UUIDField(allow_null=True)
    actor_name = serializers.CharField(allow_blank=True)
    actor_email = serializers.CharField(allow_blank=True)
    actor_role = serializers.CharField(allow_blank=True)
    facility_name = serializers.CharField(allow_blank=True)
    object_type = serializers.CharField(allow_blank=True)
    object_ref = serializers.CharField(allow_blank=True)
    reason = serializers.CharField(allow_blank=True)
    ip = serializers.CharField(allow_blank=True)
    device = serializers.CharField(allow_blank=True)


class UserDetailSerializer(UserRowSerializer):
    email_verified = serializers.BooleanField()
    sessions = SessionRowSerializer(many=True)
    events = EventRowSerializer(many=True)


class MapPointSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    slug = serializers.CharField()
    name = serializers.CharField()
    type = serializers.CharField()
    district = serializers.CharField(allow_blank=True)
    lat = serializers.FloatField()
    lng = serializers.FloatField()
    waiting = serializers.IntegerField()
    stale = serializers.BooleanField()


class AttentionSerializer(serializers.Serializer):
    applications_waiting = serializers.IntegerField()
    licences_expiring = serializers.IntegerField()
    licences_expired = serializers.IntegerField()
    disputes_escalated = serializers.IntegerField()
    break_glass_to_review = serializers.IntegerField()
    stale_facilities = serializers.IntegerField()
    locked_accounts = serializers.IntegerField()


class SecuritySummarySerializer(serializers.Serializer):
    failed_logins_24h = serializers.IntegerField()
    successful_logins_24h = serializers.IntegerField()
    staff_total = serializers.IntegerField()
    staff_with_mfa = serializers.IntegerField()
    active_sessions = serializers.IntegerField()


class CommandCenterSerializer(serializers.Serializer):
    generated_at = serializers.DateTimeField()
    overview = OverviewSerializer()
    waiting_now = serializers.IntegerField()
    live_facilities = serializers.IntegerField()
    attention = AttentionSerializer()
    security = SecuritySummarySerializer()
    map = MapPointSerializer(many=True)
    activity = EventRowSerializer(many=True)
