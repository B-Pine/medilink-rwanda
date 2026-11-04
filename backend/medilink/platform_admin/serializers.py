"""Super admin console schemas. Users are shown as accounts only: never a patient's health data."""

from __future__ import annotations

from rest_framework import serializers

from medilink.accounts.models import Language
from medilink.accounts.serializers import StrictSerializer
from medilink.onboarding.serializers import OverviewSerializer

USER_KINDS = ("platform", "staff", "patient")


class AccountReasonSerializer(StrictSerializer):
    reason = serializers.CharField(min_length=5, max_length=300)


class AccountUpdateSerializer(AccountReasonSerializer):
    """What a platform admin may correct on an account; never the email or the password."""

    full_name = serializers.CharField(min_length=2, max_length=150, required=False)
    phone = serializers.CharField(max_length=20, allow_blank=True, required=False)
    preferred_language = serializers.ChoiceField(choices=Language.choices, required=False)


class MembershipRowSerializer(serializers.Serializer):
    facility_id = serializers.UUIDField()
    facility_name = serializers.CharField()
    roles = serializers.ListField(child=serializers.CharField())
    is_active = serializers.BooleanField()
    deactivated_at = serializers.DateTimeField(allow_null=True)
    deactivation_reason = serializers.CharField(allow_blank=True)


class UserRowSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    full_name = serializers.CharField()
    email = serializers.CharField()
    phone = serializers.CharField(allow_blank=True)
    profession = serializers.CharField(allow_blank=True)
    licence_state = serializers.CharField(allow_null=True)
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


class PendingInvitationSerializer(serializers.Serializer):
    facility_id = serializers.UUIDField()
    facility_name = serializers.CharField()
    roles = serializers.ListField(child=serializers.CharField())
    invited_at = serializers.DateTimeField()
    expires_at = serializers.DateTimeField()


class UserDetailSerializer(UserRowSerializer):
    email_verified = serializers.BooleanField()
    verification_pending = serializers.BooleanField(
        help_text="Signed up and has not opened the confirmation link yet: cannot sign in."
    )
    preferred_language = serializers.CharField()
    sign_in_blocked_for = serializers.IntegerField(
        help_text="Seconds left of the block after failed sign-ins or MFA codes (0 = none)."
    )
    sessions = SessionRowSerializer(many=True)
    invitations = PendingInvitationSerializer(many=True)
    events = EventRowSerializer(many=True)
    changes = EventRowSerializer(
        many=True, help_text="What admins changed on this account and its facility access."
    )


class FacilityOptionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()


class UserSummarySerializer(serializers.Serializer):
    total = serializers.IntegerField()
    platform = serializers.IntegerField()
    staff = serializers.IntegerField()
    patient = serializers.IntegerField()
    locked = serializers.IntegerField()
    without_mfa = serializers.IntegerField(help_text="Staff and platform admins.")
    verification_pending = serializers.IntegerField()
    facilities = FacilityOptionSerializer(many=True, help_text="Facilities that have staff.")


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
