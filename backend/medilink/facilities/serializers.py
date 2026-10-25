"""Request and response shapes for S2 (contract §3)."""

from __future__ import annotations

from typing import Any

from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from medilink.accounts.models import Council
from medilink.accounts.serializers import StrictSerializer
from medilink.billing.models import TariffKind
from medilink.facilities.models import CalendarEventKind, ServicePointKind, SexRestriction
from medilink.scheduling.models import ExceptionKind

LANGS = ("rw", "en", "fr")


class I18nField(serializers.JSONField):
    """{rw, en, fr}: all three required (names shown to patients)."""

    def __init__(self, *, required_langs: tuple[str, ...] = LANGS, **kwargs: Any) -> None:
        self.required_langs = required_langs
        super().__init__(**kwargs)

    def to_internal_value(self, data: Any) -> dict[str, str]:
        if not isinstance(data, dict):
            raise serializers.ValidationError(
                _("Give the text in Kinyarwanda, English and French.")
            )
        clean = {k: str(v).strip() for k, v in data.items() if k in LANGS and str(v).strip()}
        missing = [lang for lang in self.required_langs if lang not in clean]
        if missing:
            raise serializers.ValidationError(
                _("Give the text in Kinyarwanda, English and French.")
            )
        return clean


# ---- facility ------------------------------------------------------------------------------------


class FacilityProfileSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    slug = serializers.CharField()
    status = serializers.CharField()
    facility_type = serializers.CharField()
    description_i18n = serializers.JSONField()
    phone = serializers.CharField()
    email = serializers.CharField()
    website = serializers.CharField()
    address = serializers.CharField()
    village_code = serializers.CharField()
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, allow_null=True)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, allow_null=True)
    photos = serializers.ListField(child=serializers.UUIDField())
    level_of_care = serializers.CharField()
    version = serializers.IntegerField()


class FacilityProfileUpdateSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)
    description_i18n = I18nField(required=False, required_langs=())
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    website = serializers.URLField(required=False, allow_blank=True)
    address = serializers.CharField(max_length=300, required=False, allow_blank=True)
    village_code = serializers.CharField(max_length=40, required=False, allow_blank=True)
    latitude = serializers.DecimalField(
        max_digits=9, decimal_places=6, required=False, allow_null=True
    )
    longitude = serializers.DecimalField(
        max_digits=9, decimal_places=6, required=False, allow_null=True
    )
    level_of_care = serializers.CharField(max_length=40, required=False, allow_blank=True)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        lat, lng = attrs.get("latitude"), attrs.get("longitude")
        if lat is not None and not (-2.9 <= float(lat) <= -1.0):
            raise serializers.ValidationError({"latitude": [_("This point is outside Rwanda.")]})
        if lng is not None and not (28.8 <= float(lng) <= 30.95):
            raise serializers.ValidationError({"longitude": [_("This point is outside Rwanda.")]})
        return attrs


class PhotoSerializer(StrictSerializer):
    file = serializers.FileField()


class DaySerializer(StrictSerializer):
    weekday = serializers.IntegerField(min_value=0, max_value=6)
    opens_at = serializers.TimeField()
    closes_at = serializers.TimeField()
    break_starts_at = serializers.TimeField(required=False, allow_null=True)
    break_ends_at = serializers.TimeField(required=False, allow_null=True)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs["opens_at"] >= attrs["closes_at"]:
            raise serializers.ValidationError({"closes_at": [_("Closing must be after opening.")]})
        start, end = attrs.get("break_starts_at"), attrs.get("break_ends_at")
        if bool(start) != bool(end):
            raise serializers.ValidationError({"break_ends_at": [_("Give both break times.")]})
        if start and end and not (attrs["opens_at"] < start < end < attrs["closes_at"]):
            raise serializers.ValidationError(
                {"break_starts_at": [_("The break must lie inside the day.")]}
            )
        return attrs


class HoursSerializer(StrictSerializer):
    service_id = serializers.UUIDField(required=False, allow_null=True)
    version = serializers.IntegerField(min_value=1)
    days = DaySerializer(many=True)


class HoursResponseSerializer(serializers.Serializer):
    service_id = serializers.UUIDField(allow_null=True)
    days = DaySerializer(many=True)
    version = serializers.IntegerField()


class CalendarEventSerializer(StrictSerializer):
    id = serializers.UUIDField(read_only=True)
    kind = serializers.ChoiceField(choices=CalendarEventKind.choices)
    service_id = serializers.UUIDField(required=False, allow_null=True)
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()
    is_open = serializers.BooleanField(default=False)
    opens_at = serializers.TimeField(required=False, allow_null=True)
    closes_at = serializers.TimeField(required=False, allow_null=True)
    reason = serializers.CharField(max_length=200, required=False, allow_blank=True)


class CalendarRangeSerializer(serializers.Serializer):
    starts = serializers.CharField()
    ends = serializers.CharField()


class CalendarDaySerializer(serializers.Serializer):
    date = serializers.DateField()
    open = CalendarRangeSerializer(many=True)
    closed_reason = serializers.CharField(allow_null=True)
    holiday_name = serializers.CharField(allow_null=True)
    umuganda = serializers.BooleanField()


class CalendarSerializer(serializers.Serializer):
    days = CalendarDaySerializer(many=True)


class SettingsUpdateSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)
    section = serializers.ChoiceField(
        choices=["queue", "booking", "billing", "documents", "notifications", "umuganda"]
    )
    values = serializers.DictField()


class SettingsSerializer(serializers.Serializer):
    queue = serializers.DictField()
    booking = serializers.DictField()
    billing = serializers.DictField()
    documents = serializers.DictField()
    notifications = serializers.DictField()
    umuganda = serializers.CharField()
    version = serializers.IntegerField()
    schema = serializers.DictField()


class BrandingSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)
    letterhead_upload_id = serializers.UUIDField(required=False, allow_null=True)
    logo_upload_id = serializers.UUIDField(required=False, allow_null=True)
    stamp_upload_id = serializers.UUIDField(required=False, allow_null=True)
    footer_text = serializers.CharField(max_length=300, required=False, allow_blank=True)


class BrandingResponseSerializer(serializers.Serializer):
    letterhead_upload_id = serializers.UUIDField(allow_null=True)
    logo_upload_id = serializers.UUIDField(allow_null=True)
    stamp_upload_id = serializers.UUIDField(allow_null=True)
    footer_text = serializers.CharField()
    version = serializers.IntegerField()


class ConfigChangeSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    entity = serializers.CharField()
    entity_id = serializers.CharField()
    field = serializers.CharField()
    old_value = serializers.JSONField(allow_null=True)
    new_value = serializers.JSONField(allow_null=True)
    actor_name = serializers.CharField(allow_null=True)
    changed_at = serializers.DateTimeField()


class ChecklistItemSerializer(serializers.Serializer):
    code = serializers.CharField()
    done = serializers.BooleanField()
    count = serializers.IntegerField()
    link = serializers.CharField()


class ChecklistSerializer(serializers.Serializer):
    items = ChecklistItemSerializer(many=True)
    complete = serializers.BooleanField()
    status = serializers.CharField()


class GoLiveSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=0)


# ---- catalogue -----------------------------------------------------------------------------------


class DepartmentSerializer(StrictSerializer):
    id = serializers.UUIDField(read_only=True)
    name_i18n = I18nField()
    sort_order = serializers.IntegerField(min_value=0, required=False, default=0)
    is_active = serializers.BooleanField(required=False, default=True)


class DepartmentUpdateSerializer(DepartmentSerializer):
    name_i18n = I18nField(required=False)
    sort_order = serializers.IntegerField(min_value=0, required=False)
    is_active = serializers.BooleanField(required=False)


class ServiceSerializer(StrictSerializer):
    id = serializers.UUIDField(read_only=True)
    version = serializers.IntegerField(read_only=True)
    department_id = serializers.UUIDField()
    catalogue_item_code = serializers.CharField(
        max_length=40, required=False, allow_blank=True, default=""
    )
    name_i18n = I18nField()
    duration_minutes = serializers.IntegerField(min_value=5, max_value=240, default=15)
    is_bookable = serializers.BooleanField(default=True)
    allows_walk_in = serializers.BooleanField(default=True)
    allows_remote_join = serializers.BooleanField(default=False)
    ticket_prefix = serializers.RegexField(r"^[A-Za-z]{1,3}$", max_length=3)
    min_age_months = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    max_age_months = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    sex_restriction = serializers.ChoiceField(
        choices=SexRestriction.choices, required=False, allow_null=True
    )
    is_active = serializers.BooleanField(read_only=True)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        low, high = attrs.get("min_age_months"), attrs.get("max_age_months")
        if low is not None and high is not None and low > high:
            raise serializers.ValidationError(
                {"max_age_months": [_("The maximum age must be above the minimum.")]}
            )
        return attrs


class ServiceUpdateSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)
    department_id = serializers.UUIDField(required=False)
    catalogue_item_code = serializers.CharField(max_length=40, required=False, allow_blank=True)
    name_i18n = I18nField(required=False)
    duration_minutes = serializers.IntegerField(min_value=5, max_value=240, required=False)
    is_bookable = serializers.BooleanField(required=False)
    allows_walk_in = serializers.BooleanField(required=False)
    allows_remote_join = serializers.BooleanField(required=False)
    ticket_prefix = serializers.RegexField(r"^[A-Za-z]{1,3}$", max_length=3, required=False)
    min_age_months = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    max_age_months = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    sex_restriction = serializers.ChoiceField(
        choices=SexRestriction.choices, required=False, allow_null=True
    )
    is_active = serializers.BooleanField(required=False)


class ServiceResponseSerializer(serializers.Serializer):
    service = ServiceSerializer()
    warnings = serializers.ListField(child=serializers.DictField())


class ServicePointSerializer(StrictSerializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(max_length=80)
    kind = serializers.ChoiceField(choices=ServicePointKind.choices)
    service_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    is_active = serializers.BooleanField(required=False, default=True)


class ServicePointUpdateSerializer(StrictSerializer):
    name = serializers.CharField(max_length=80, required=False)
    kind = serializers.ChoiceField(choices=ServicePointKind.choices, required=False)
    service_ids = serializers.ListField(child=serializers.UUIDField(), required=False)
    is_active = serializers.BooleanField(required=False)


# ---- schedules -----------------------------------------------------------------------------------


class TemplateSerializer(StrictSerializer):
    id = serializers.UUIDField(read_only=True)
    version = serializers.IntegerField(read_only=True)
    membership_id = serializers.UUIDField()
    service_id = serializers.UUIDField()
    service_point_id = serializers.UUIDField(required=False, allow_null=True)
    weekday = serializers.IntegerField(min_value=0, max_value=6)
    starts_at = serializers.TimeField()
    ends_at = serializers.TimeField()
    slot_minutes = serializers.IntegerField(min_value=5, max_value=240)
    capacity = serializers.IntegerField(min_value=1, max_value=50, default=1)
    bookable_share_pct = serializers.IntegerField(min_value=0, max_value=100, default=100)
    valid_from = serializers.DateField(required=False)
    valid_to = serializers.DateField(read_only=True, allow_null=True)


class TemplateUpdateSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)
    service_id = serializers.UUIDField(required=False)
    service_point_id = serializers.UUIDField(required=False, allow_null=True)
    weekday = serializers.IntegerField(min_value=0, max_value=6, required=False)
    starts_at = serializers.TimeField(required=False)
    ends_at = serializers.TimeField(required=False)
    slot_minutes = serializers.IntegerField(min_value=5, max_value=240, required=False)
    capacity = serializers.IntegerField(min_value=1, max_value=50, required=False)
    bookable_share_pct = serializers.IntegerField(min_value=0, max_value=100, required=False)


class WarningSerializer(serializers.Serializer):
    kind = serializers.CharField()
    weekday = serializers.IntegerField(required=False)
    starts_at = serializers.CharField(required=False)
    ends_at = serializers.CharField(required=False)
    count = serializers.IntegerField(required=False)


class TemplateResponseSerializer(serializers.Serializer):
    template = TemplateSerializer()
    warnings = WarningSerializer(many=True)


class ExceptionSerializer(StrictSerializer):
    id = serializers.UUIDField(read_only=True)
    membership_id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=ExceptionKind.choices)
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()
    service_id = serializers.UUIDField(required=False, allow_null=True)
    reason = serializers.CharField(max_length=200, required=False, allow_blank=True)
    status = serializers.CharField(read_only=True)
    decision_note = serializers.CharField(read_only=True)
    member_name = serializers.CharField(read_only=True)


class ExceptionResponseSerializer(serializers.Serializer):
    exception = ExceptionSerializer()
    warnings = WarningSerializer(many=True)


class ExceptionDecisionSerializer(StrictSerializer):
    decision_note = serializers.CharField(
        max_length=200, required=False, allow_blank=True, default=""
    )


class BlockSerializer(serializers.Serializer):
    membership_id = serializers.UUIDField()
    template_id = serializers.UUIDField(allow_null=True)
    service_id = serializers.UUIDField()
    service_point_id = serializers.UUIDField(allow_null=True)
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()
    slot_minutes = serializers.IntegerField(allow_null=True)
    capacity = serializers.IntegerField()
    bookable_share_pct = serializers.IntegerField()


class ScheduleOverviewMemberSerializer(serializers.Serializer):
    membership_id = serializers.UUIDField()
    full_name = serializers.CharField()
    blocks = BlockSerializer(many=True)
    exceptions = ExceptionSerializer(many=True)


class ScheduleOverviewSerializer(serializers.Serializer):
    members = ScheduleOverviewMemberSerializer(many=True)


# ---- billing setup -------------------------------------------------------------------------------


class TariffSerializer(StrictSerializer):
    id = serializers.UUIDField(read_only=True)
    version = serializers.IntegerField(read_only=True)
    code = serializers.RegexField(r"^[A-Za-z0-9._-]{1,40}$")
    name_i18n = I18nField()
    kind = serializers.ChoiceField(choices=TariffKind.choices)
    service_id = serializers.UUIDField(required=False, allow_null=True)
    amount_rwf = serializers.IntegerField(min_value=0, max_value=100_000_000)
    valid_from = serializers.DateField(required=False)
    valid_to = serializers.DateField(read_only=True, allow_null=True)


class TariffChangeSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)
    amount_rwf = serializers.IntegerField(min_value=0, max_value=100_000_000, required=False)
    name_i18n = I18nField(required=False)
    valid_from = serializers.DateField(required=False)


class TariffChangeResponseSerializer(serializers.Serializer):
    previous = TariffSerializer()
    current = TariffSerializer()


class InsurerRuleSerializer(StrictSerializer):
    id = serializers.UUIDField(read_only=True)
    version = serializers.IntegerField(read_only=True)
    insurer_code = serializers.CharField(max_length=40)
    applies_to_all_services = serializers.BooleanField(default=True)
    service_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    patient_share_bp = serializers.IntegerField(min_value=0, max_value=10_000)
    requires_referral = serializers.BooleanField(default=False)
    excluded_tariff_codes = serializers.ListField(
        child=serializers.CharField(max_length=40), required=False, default=list
    )
    ceiling_per_visit_rwf = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    valid_from = serializers.DateField(required=False)
    valid_to = serializers.DateField(read_only=True, allow_null=True)


class InsurerRuleChangeSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)
    applies_to_all_services = serializers.BooleanField(required=False)
    service_ids = serializers.ListField(child=serializers.UUIDField(), required=False)
    patient_share_bp = serializers.IntegerField(min_value=0, max_value=10_000, required=False)
    requires_referral = serializers.BooleanField(required=False)
    excluded_tariff_codes = serializers.ListField(
        child=serializers.CharField(max_length=40), required=False
    )
    ceiling_per_visit_rwf = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    valid_from = serializers.DateField(required=False)


class InsurerRuleChangeResponseSerializer(serializers.Serializer):
    previous = InsurerRuleSerializer()
    current = InsurerRuleSerializer()


# ---- staff ---------------------------------------------------------------------------------------


class RoleSerializer(serializers.Serializer):
    code = serializers.CharField()
    name = serializers.CharField()
    permissions = serializers.ListField(child=serializers.CharField())


class ClinicianSerializer(serializers.Serializer):
    council = serializers.CharField()
    licence_number = serializers.CharField()
    specialty = serializers.CharField()
    attested_at = serializers.DateTimeField(allow_null=True)


class StaffMembershipSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    user_id = serializers.UUIDField()
    full_name = serializers.CharField()
    email = serializers.EmailField()
    roles = serializers.ListField(child=serializers.CharField())
    service_points = serializers.ListField(child=serializers.UUIDField())
    is_active = serializers.BooleanField()
    mfa_enabled = serializers.BooleanField()
    clinician = ClinicianSerializer(allow_null=True)
    joined_at = serializers.DateTimeField()
    deactivation_reason = serializers.CharField()
    version = serializers.IntegerField()


class MembershipUpdateSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)
    role_codes = serializers.ListField(child=serializers.CharField(max_length=32), required=False)
    service_point_ids = serializers.ListField(child=serializers.UUIDField(), required=False)


class ReasonSerializer(StrictSerializer):
    reason = serializers.CharField(max_length=300)


class InvitationCreateSerializer(StrictSerializer):
    email = serializers.EmailField()
    role_codes = serializers.ListField(child=serializers.CharField(max_length=32), min_length=1)
    service_point_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, default=list
    )


class InvitationSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    email = serializers.EmailField()
    role_codes = serializers.ListField(child=serializers.CharField())
    service_point_ids = serializers.ListField(child=serializers.UUIDField())
    status = serializers.ChoiceField(choices=["pending", "accepted", "revoked", "expired"])
    expires_at = serializers.DateTimeField()
    invited_by = serializers.CharField(allow_null=True)
    created_at = serializers.DateTimeField()


class ClinicianProfileSerializer(StrictSerializer):
    council = serializers.ChoiceField(choices=Council.choices)
    licence_number = serializers.RegexField(r"^[A-Za-z0-9/._-]{2,40}$")
    specialty = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")


class TokenSerializer(StrictSerializer):
    token = serializers.CharField(max_length=200)


class InvitationLookupSerializer(serializers.Serializer):
    facility_name = serializers.CharField()
    invited_by = serializers.CharField(allow_null=True)
    role_codes = serializers.ListField(child=serializers.CharField())
    email_masked = serializers.CharField()
    account_exists = serializers.BooleanField()
    expires_at = serializers.DateTimeField()


class AcceptNewSerializer(StrictSerializer):
    token = serializers.CharField(max_length=200)
    full_name = serializers.CharField(max_length=150, required=False)
    password = serializers.CharField(max_length=128, required=False, write_only=True)
