"""Upload schemas (contract §3.1): the same `Upload` in every audience, then `DownloadLink`."""

from __future__ import annotations

from typing import Any

from rest_framework import serializers

from medilink.uploads.models import ScanStatus, UploadedFile


class UploadSerializer(serializers.ModelSerializer):
    status = serializers.ChoiceField(source="scan_status", choices=ScanStatus.choices)
    rejection_reason = serializers.SerializerMethodField()
    sha256 = serializers.SerializerMethodField()
    is_attached = serializers.BooleanField()

    class Meta:
        model = UploadedFile
        fields = [
            "id",
            "purpose",
            "status",
            "rejection_reason",
            "content_type",
            "size_bytes",
            "original_filename",
            "sha256",
            "created_at",
            "scanned_at",
            "is_attached",
        ]
        read_only_fields = fields

    def get_rejection_reason(self, obj: UploadedFile) -> str | None:
        return obj.rejection_reason or None

    def get_sha256(self, obj: UploadedFile) -> str:
        return obj.sha256 or obj.original_sha256


class UploadCreateSerializer(serializers.Serializer):
    file = serializers.FileField(allow_empty_file=False, use_url=False)
    purpose = serializers.CharField(max_length=64)


class DownloadLinkRequestSerializer(serializers.Serializer):
    disposition = serializers.ChoiceField(choices=["inline", "attachment"], default="inline")


class DownloadLinkSerializer(serializers.Serializer):
    url = serializers.URLField()
    expires_at = serializers.DateTimeField()
    disposition = serializers.ChoiceField(choices=["inline", "attachment"])

    def to_representation(self, instance: Any) -> dict[str, Any]:
        return {
            "url": instance.url,
            "expires_at": serializers.DateTimeField().to_representation(instance.expires_at),
            "disposition": instance.disposition,
        }
