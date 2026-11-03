"""S10 part 1 schemas (contract sprint-10 §3.2)."""

from __future__ import annotations

from typing import Any

from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from medilink.accounts.models import User
from medilink.support.models import (
    LANGUAGES,
    ArticleCategory,
    Audience,
    AuthorKind,
    CloseReason,
    ContactMessage,
    ContactStatus,
    HelpArticle,
    RequestPriority,
    SupportMessage,
    SupportRequest,
    Topic,
)

SUPPORT_NAME = "MediLink support"
SUPPORT_CLOSE_REASONS = [c for c in CloseReason.values if c != CloseReason.WITHDRAWN]
TITLE_MAX, SUMMARY_MAX, BODY_MAX = 120, 300, 8000


def i18n_serializer(name: str, max_length: int) -> type[serializers.Serializer[Any]]:
    """`{"rw", "en", "fr"}` text object; any other key is refused."""

    def to_internal_value(self: Any, data: Any) -> Any:
        if isinstance(data, dict):
            unknown = sorted(set(data) - set(LANGUAGES))
            if unknown:
                raise serializers.ValidationError(_("Use only the languages rw, en and fr."))
        value = serializers.Serializer.to_internal_value(self, data)
        return {k: v.strip() for k, v in value.items() if v and v.strip()}

    attrs: dict[str, Any] = {
        lang: serializers.CharField(
            required=False, allow_blank=True, max_length=max_length, trim_whitespace=False
        )
        for lang in LANGUAGES
    }
    attrs["to_internal_value"] = to_internal_value
    return type(name, (serializers.Serializer,), attrs)


I18nTitle = i18n_serializer("I18nTitle", TITLE_MAX)
I18nSummary = i18n_serializer("I18nSummary", SUMMARY_MAX)
I18nBody = i18n_serializer("I18nBody", BODY_MAX)


class SupportPersonSerializer(serializers.ModelSerializer[User]):
    class Meta:
        model = User
        fields = ["id", "full_name"]


class SupportFacilityRefSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    name = serializers.CharField()


# ---- Help articles --------------------------------------------------------------------------


class HelpArticleSummarySerializer(serializers.ModelSerializer[HelpArticle]):
    title_i18n = I18nTitle()
    summary_i18n = I18nSummary()

    class Meta:
        model = HelpArticle
        fields = [
            "id",
            "slug",
            "audience",
            "category",
            "title_i18n",
            "summary_i18n",
            "sort_order",
            "updated_at",
        ]


class HelpArticleSerializer(HelpArticleSummarySerializer):
    body_i18n = I18nBody()

    class Meta(HelpArticleSummarySerializer.Meta):
        fields = [*HelpArticleSummarySerializer.Meta.fields, "body_i18n"]


class PlatformHelpArticleSummarySerializer(HelpArticleSummarySerializer):
    missing_languages = serializers.SerializerMethodField()
    created_by = SupportPersonSerializer(read_only=True)
    updated_by = SupportPersonSerializer(read_only=True)

    class Meta(HelpArticleSummarySerializer.Meta):
        fields = [
            *HelpArticleSummarySerializer.Meta.fields,
            "status",
            "published_at",
            "missing_languages",
            "created_by",
            "updated_by",
            "version",
            "created_at",
        ]

    def get_missing_languages(self, obj: HelpArticle) -> list[str]:
        return obj.missing_languages()


class PlatformHelpArticleSerializer(PlatformHelpArticleSummarySerializer):
    body_i18n = I18nBody()

    class Meta(PlatformHelpArticleSummarySerializer.Meta):
        fields = [*PlatformHelpArticleSummarySerializer.Meta.fields, "body_i18n"]


class HelpArticleWriteSerializer(serializers.Serializer[Any]):
    slug = serializers.RegexField(
        r"^[a-z0-9]+(-[a-z0-9]+)*$",
        max_length=80,
        error_messages={"invalid": _("Use lowercase letters, numbers and single hyphens.")},
    )
    audience = serializers.ChoiceField(choices=Audience.choices)
    category = serializers.ChoiceField(choices=ArticleCategory.choices)
    title_i18n = I18nTitle()
    summary_i18n = I18nSummary(required=False)
    body_i18n = I18nBody(required=False)
    sort_order = serializers.IntegerField(min_value=0, max_value=999, required=False)
    version = serializers.IntegerField(min_value=1, required=False)

    def validate_slug(self, value: str) -> str:
        taken = HelpArticle.objects.filter(slug=value)
        instance = self.context.get("instance")
        if instance is not None:
            taken = taken.exclude(pk=instance.pk)
        if taken.exists():
            raise serializers.ValidationError(_("Another article already uses this address."))
        return value

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if self.partial and "version" not in attrs:
            raise serializers.ValidationError({"version": [_("This field is required.")]})
        return attrs


# ---- Support requests -----------------------------------------------------------------------


class SupportMessageSerializer(serializers.ModelSerializer[SupportMessage]):
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = SupportMessage
        fields = ["id", "author_kind", "author_name", "body", "created_at"]

    def get_author_name(self, obj: SupportMessage) -> str:
        if obj.author_kind == AuthorKind.SUPPORT:
            return SUPPORT_NAME
        return obj.author.full_name


class PlatformSupportMessageSerializer(SupportMessageSerializer):
    def get_author_name(self, obj: SupportMessage) -> str:
        return obj.author.full_name


class SupportRequestListSerializer(serializers.ModelSerializer[SupportRequest]):
    facility = SupportFacilityRefSerializer(allow_null=True, read_only=True)
    requester = SupportPersonSerializer(read_only=True)
    message_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = SupportRequest
        fields = [
            "id",
            "reference",
            "topic",
            "subject",
            "status",
            "close_reason",
            "facility",
            "requester",
            "message_count",
            "last_message_at",
            "closed_at",
            "created_at",
            "version",
        ]


class SupportRequestSerializer(SupportRequestListSerializer):
    messages = SupportMessageSerializer(many=True, read_only=True)

    class Meta(SupportRequestListSerializer.Meta):
        fields = [*SupportRequestListSerializer.Meta.fields, "messages"]


PLATFORM_EXTRA = [
    "requester_audience",
    "priority",
    "assigned_to",
    "language",
    "client_label",
    "client_path",
    "closed_by",
]


class PlatformSupportRequestListSerializer(SupportRequestListSerializer):
    assigned_to = SupportPersonSerializer(allow_null=True, read_only=True)
    closed_by = SupportPersonSerializer(allow_null=True, read_only=True)

    class Meta(SupportRequestListSerializer.Meta):
        fields = [*SupportRequestListSerializer.Meta.fields, *PLATFORM_EXTRA]


class PlatformSupportRequestSerializer(PlatformSupportRequestListSerializer):
    messages = PlatformSupportMessageSerializer(many=True, read_only=True)

    class Meta(PlatformSupportRequestListSerializer.Meta):
        fields = [*PlatformSupportRequestListSerializer.Meta.fields, "messages"]


class SupportRequestCreateSerializer(serializers.Serializer[Any]):
    topic = serializers.ChoiceField(choices=Topic.choices)
    subject = serializers.CharField(min_length=3, max_length=120)
    body = serializers.CharField(min_length=10, max_length=4000)
    client_path = serializers.RegexField(
        r"^/[A-Za-z0-9/_-]*$", max_length=200, required=False, default=""
    )


class MessageCreateSerializer(serializers.Serializer[Any]):
    body = serializers.CharField(min_length=1, max_length=4000)


class RequesterCloseSerializer(serializers.Serializer[Any]):
    """No fields: a requester always closes with `withdrawn`."""


class SupportCloseSerializer(serializers.Serializer[Any]):
    reason = serializers.ChoiceField(choices=SUPPORT_CLOSE_REASONS)
    body = serializers.CharField(max_length=4000, required=False, allow_blank=True, default="")


class TriageSerializer(serializers.Serializer[Any]):
    priority = serializers.ChoiceField(choices=RequestPriority.choices, required=False)
    topic = serializers.ChoiceField(choices=Topic.choices, required=False)
    assigned_to_id = serializers.UUIDField(required=False, allow_null=True)
    version = serializers.IntegerField(min_value=1)


# ---- the public Contact page (upgrade 11 §13) ---------------------------------------------------


class PublicContactSerializer(serializers.Serializer[Any]):
    name = serializers.CharField(min_length=2, max_length=120)
    reach = serializers.CharField(min_length=5, max_length=120, help_text="Email or phone")
    subject = serializers.CharField(min_length=3, max_length=120)
    message = serializers.CharField(min_length=10, max_length=4000)


class ContactReceiptSerializer(serializers.Serializer[Any]):
    reference = serializers.CharField()


class PlatformContactMessageSerializer(serializers.ModelSerializer[ContactMessage]):
    handled_by = SupportPersonSerializer(allow_null=True)
    message = serializers.CharField(source="body")
    status = serializers.ChoiceField(choices=ContactStatus.choices)

    class Meta:
        model = ContactMessage
        fields = [
            "id",
            "reference",
            "name",
            "reach",
            "subject",
            "message",
            "language",
            "status",
            "created_at",
            "handled_by",
            "handled_at",
            "note",
        ]


class ContactHandleSerializer(serializers.Serializer[Any]):
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
