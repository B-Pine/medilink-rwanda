"""Master data schemas (contract §3.1): `MasterDataItem` per kind.

- Public and staff views: common keys + the kind's columns, with each `<x>_i18n` field returned
  as a localised `<x>` (requested language, then en, then any).
- Platform view: the raw `*_i18n` objects and `missing_languages`.
"""

from __future__ import annotations

from functools import cache
from typing import Any

from django.utils.translation import get_language
from django.utils.translation import gettext_lazy as _
from django.utils.translation.trans_real import parse_accept_lang_header
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from medilink.masterdata import models as m
from medilink.masterdata.kinds import KINDS, LANGUAGES, Kind, localise, missing_languages
from medilink.uploads.serializers import UploadSerializer

REQUIRED_LANGUAGES = _("Kinyarwanda, English and French are required.")
ONE_LANGUAGE = _("At least one translation is required.")
IMMUTABLE = _("This field can't be changed.")
UNKNOWN_PARENT = _("Unknown parent location.")
WRONG_PARENT_LEVEL = _("The parent must be one level up.")


def request_language(request: Any = None) -> str:
    """First supported language of Accept-Language (Django's own negotiation drops `rw`, which
    has no Django locale files), else the active language, else English."""
    header = request.headers.get("Accept-Language", "") if request is not None else ""
    for code, _quality in parse_accept_lang_header(header):
        base = code.split("-")[0].lower()
        if base in LANGUAGES:
            return base
    language = (get_language() or "en").split("-")[0]
    return language if language in LANGUAGES else "en"


def _plain(name: str) -> str:
    return name.removesuffix("_i18n")


class I18nTextField(serializers.DictField):
    """{"rw": "...", "en": "...", "fr": "..."} with only those keys."""

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(child=serializers.CharField(max_length=500, allow_blank=True), **kwargs)

    def to_internal_value(self, data: Any) -> dict[str, str]:
        value = super().to_internal_value(data)
        unknown = set(value) - set(LANGUAGES)
        if unknown:
            raise serializers.ValidationError(f"Unknown languages: {', '.join(sorted(unknown))}")
        return {k: v.strip() for k, v in value.items() if v.strip()}


class I18nListField(serializers.DictField):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__(
            child=serializers.ListField(child=serializers.CharField(max_length=120)), **kwargs
        )

    def to_internal_value(self, data: Any) -> dict[str, list[str]]:
        value = super().to_internal_value(data)
        if set(value) - set(LANGUAGES):
            raise serializers.ValidationError("Unknown languages.")
        return value


def _model_field_names(kind: Kind) -> list[str]:
    return [f for f in kind.fields if f != "parent_code"]


@cache
def platform_serializer(slug: str) -> type[serializers.ModelSerializer]:
    kind = KINDS[slug]

    def get_missing_languages(self: Any, obj: m.MasterDataModel) -> list[str]:
        return missing_languages(obj, kind)

    attrs: dict[str, Any] = {
        "missing_languages": serializers.SerializerMethodField(),
        "get_missing_languages": extend_schema_field(
            serializers.ListField(child=serializers.ChoiceField(choices=LANGUAGES))
        )(get_missing_languages),
    }
    for name in kind.i18n_fields:
        if name == "synonyms_i18n":
            attrs[name] = I18nListField(required=False)
        else:
            attrs[name] = I18nTextField(required=name != "plain_language_i18n")
    if "parent_code" in kind.fields:
        attrs["parent_code"] = serializers.CharField(
            max_length=20, allow_null=True, required=False, source="parent.code"
        )

    def validate(self: Any, data: dict[str, Any]) -> dict[str, Any]:
        errors: dict[str, list[str]] = {}
        if self.instance is not None:
            for name in kind.identity:
                if name in data and data[name] != getattr(self.instance, name):
                    errors[name] = [str(IMMUTABLE)]
            if "parent" in data:
                errors["parent_code"] = [str(IMMUTABLE)]
        for name in kind.i18n_fields:
            if name == "synonyms_i18n" or (name not in data and self.instance is not None):
                continue
            value = data.get(name) or {}
            if kind.all_languages and any(not value.get(code) for code in LANGUAGES):
                errors[name] = [str(REQUIRED_LANGUAGES)]
            elif name != "plain_language_i18n" and not value:
                errors[name] = [str(ONE_LANGUAGE)]
        if slug == "locations" and self.instance is None and not self.context.get("import"):
            parent_code = (data.get("parent") or {}).get("code")
            level = data.get("level")
            expected = m.LEVEL_PARENT.get(level) if level else None
            parent = m.Location.objects.filter(code=parent_code).first() if parent_code else None
            if parent_code and parent is None:
                errors["parent_code"] = [str(UNKNOWN_PARENT)]
            elif (parent.level if parent else None) != expected:
                errors["parent_code"] = [str(WRONG_PARENT_LEVEL)]
        if errors:
            raise serializers.ValidationError(errors)
        if "parent" in data:
            data["parent_code"] = (data.pop("parent") or {}).get("code")
        return data

    attrs["validate"] = validate
    meta = type(
        "Meta",
        (),
        {
            "model": kind.model,
            "fields": [
                "id",
                *kind.fields,
                "is_active",
                "sort_order",
                "version",
                "missing_languages",
                "created_at",
                "updated_at",
            ],
            "read_only_fields": ["id", "version", "created_at", "updated_at"],
        },
    )
    attrs["Meta"] = meta
    name = "".join(part.title() for part in slug.split("-")) + "PlatformItem"
    return type(name, (serializers.ModelSerializer,), attrs)


@cache
def localised_serializer(slug: str) -> type[serializers.Serializer]:
    kind = KINDS[slug]
    attrs: dict[str, Any] = {
        "id": serializers.UUIDField(read_only=True),
        "is_active": serializers.BooleanField(read_only=True),
        "version": serializers.IntegerField(read_only=True),
    }
    plain_fields = [f for f in _model_field_names(kind) if f not in kind.i18n_fields]
    model_fields = {f.name: f for f in kind.model._meta.get_fields() if hasattr(f, "attname")}
    for name in plain_fields:
        field = model_fields[name]
        internal = field.get_internal_type()
        if internal == "BooleanField":
            attrs[name] = serializers.BooleanField(read_only=True)
        elif internal in ("PositiveIntegerField", "IntegerField"):
            attrs[name] = serializers.IntegerField(read_only=True, allow_null=True)
        elif internal == "DateField":
            attrs[name] = serializers.DateField(read_only=True)
        else:
            attrs[name] = serializers.CharField(read_only=True, allow_null=True)
    for name in kind.i18n_fields:
        if name == "synonyms_i18n":
            attrs["synonyms"] = serializers.ListField(child=serializers.CharField(), read_only=True)
        else:
            attrs[_plain(name)] = serializers.CharField(read_only=True)
    if slug == "locations":
        attrs["parent_code"] = serializers.CharField(read_only=True, allow_null=True)
        attrs["has_children"] = serializers.BooleanField(read_only=True)

    def to_representation(self: Any, instance: Any) -> dict[str, Any]:
        language = request_language(self.context.get("request"))
        data: dict[str, Any] = {
            "id": str(instance.pk),
            "is_active": instance.is_active,
            "version": instance.version,
        }
        for name in plain_fields:
            value = getattr(instance, name)
            data[name] = value.isoformat() if hasattr(value, "isoformat") else value
        for name in kind.i18n_fields:
            value = getattr(instance, name) or {}
            if name == "synonyms_i18n":
                data["synonyms"] = list(value.get(language) or value.get("en") or [])
            else:
                data[_plain(name)] = localise(value, language)
        if slug == "locations":
            data["parent_code"] = instance.parent.code if instance.parent_id else None
            data["has_children"] = bool(getattr(instance, "has_children", False))
        return data

    attrs["to_representation"] = to_representation
    name = "".join(part.title() for part in slug.split("-")) + "Item"
    return type(name, (serializers.Serializer,), attrs)


class MasterDataChangeSerializer(serializers.ModelSerializer):
    actor = serializers.SerializerMethodField()

    class Meta:
        model = m.MasterDataChange
        fields = ["id", "row_version", "action", "old", "new", "actor", "changed_at"]

    def get_actor(self, obj: m.MasterDataChange) -> dict[str, str] | None:
        if obj.actor is None:
            return None
        return {"id": str(obj.actor_id), "full_name": obj.actor.full_name}


class ImportSummarySerializer(serializers.Serializer):
    rows = serializers.IntegerField()
    create = serializers.IntegerField()  # type: ignore[assignment]  # read-only schema
    update = serializers.IntegerField()  # type: ignore[assignment]
    retire = serializers.IntegerField()
    unchanged = serializers.IntegerField()
    errors = serializers.IntegerField()  # type: ignore[assignment]  # shadows .errors


class ImportErrorSerializer(serializers.Serializer):
    line = serializers.IntegerField()
    field = serializers.CharField(allow_blank=True)
    message = serializers.CharField()


class ImportSampleChangeSerializer(serializers.Serializer):
    code = serializers.CharField()
    action = serializers.CharField()
    changes = serializers.DictField()


class MasterDataImportSerializer(serializers.ModelSerializer):
    upload = serializers.SerializerMethodField()
    summary = serializers.SerializerMethodField()
    errors = serializers.SerializerMethodField()  # type: ignore[assignment]
    sample_changes = serializers.SerializerMethodField()

    class Meta:
        model = m.MasterDataImport
        fields = [
            "id",
            "kind",
            "mode",
            "status",
            "upload",
            "expires_at",
            "confirmed_at",
            "applied_at",
            "summary",
            "errors",
            "sample_changes",
        ]

    @extend_schema_field(UploadSerializer)
    def get_upload(self, obj: m.MasterDataImport) -> dict[str, Any]:
        return dict(UploadSerializer(obj.file).data)

    @extend_schema_field(ImportSummarySerializer)
    def get_summary(self, obj: m.MasterDataImport) -> dict[str, int]:
        keys = ("rows", "create", "update", "retire", "unchanged", "errors")
        return {key: int(obj.summary.get(key, 0)) for key in keys}

    @extend_schema_field(ImportErrorSerializer(many=True))
    def get_errors(self, obj: m.MasterDataImport) -> list[dict[str, Any]]:
        return list((obj.plan or {}).get("errors", []))[:200]

    @extend_schema_field(ImportSampleChangeSerializer(many=True))
    def get_sample_changes(self, obj: m.MasterDataImport) -> list[dict[str, Any]]:
        changes = [c for c in (obj.plan or {}).get("changes", []) if c["action"] != "unchanged"]
        return [
            {"code": c["code"], "action": c["action"], "changes": c.get("changes", {})}
            for c in changes[:20]
        ]


class ImportCreateSerializer(serializers.Serializer):
    file = serializers.FileField(allow_empty_file=False, use_url=False)
    mode = serializers.ChoiceField(choices=m.ImportMode.choices, default=m.ImportMode.UPSERT)
