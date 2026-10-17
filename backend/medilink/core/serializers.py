"""Shared response schemas (health, CSRF token, error envelope)."""

from rest_framework import serializers


class HealthSerializer(serializers.Serializer):
    status = serializers.CharField()
    version = serializers.CharField()


class CsrfTokenSerializer(serializers.Serializer):
    csrf_token = serializers.CharField()


class ErrorDetailSerializer(serializers.Serializer):
    code = serializers.CharField(help_text="Stable machine-readable code, e.g. validation_error.")
    message = serializers.CharField(help_text="Localised human-readable message.")
    fields = serializers.DictField(
        child=serializers.ListField(child=serializers.CharField()),
        help_text="Field name -> messages. Empty object when not a validation error.",
    )
    request_id = serializers.CharField(help_text="Same value as the X-Request-ID header.")


class ErrorSerializer(serializers.Serializer):
    error = ErrorDetailSerializer()
