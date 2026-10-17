"""Request/response schemas for the Sprint 0 auth endpoints (contract §2).

Field lists are explicit; unknown input fields are rejected (mass-assignment protection).
"""

from __future__ import annotations

import re
from typing import Any

from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from medilink.accounts.models import Language, User, normalize_email
from medilink.patients.models import Relationship
from medilink.tenancy.models import FacilityType, RoleCode

LOGIN_STATUS_CHOICES = [
    ("authenticated", "authenticated"),
    ("mfa_required", "mfa_required"),
    ("mfa_setup_required", "mfa_setup_required"),
]
VERSION_RE = re.compile(r"^[A-Za-z0-9._-]{1,32}$")
PASSWORD_MAX_INPUT = 1024  # reject absurd inputs before hashing


class StrictSerializer(serializers.Serializer):
    """Rejects unknown fields instead of silently ignoring them."""

    def to_internal_value(self, data: Any) -> Any:
        if isinstance(data, dict):
            unknown = set(data) - set(self.fields)
            if unknown:
                raise serializers.ValidationError(
                    {name: [_("Unknown field.")] for name in sorted(unknown)}
                )
        return super().to_internal_value(data)


def password_field() -> serializers.CharField:
    return serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        max_length=PASSWORD_MAX_INPUT,
        style={"input_type": "password"},
    )


def run_password_validators(password: str, user: Any) -> None:
    try:
        password_validation.validate_password(password, user=user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(list(exc.messages)) from exc


# --- staff -----------------------------------------------------------------------------------


class FacilitySummarySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    slug = serializers.SlugField()
    facility_type = serializers.ChoiceField(choices=FacilityType.choices)


class MembershipSerializer(serializers.Serializer):
    facility = FacilitySummarySerializer()
    roles = serializers.ListField(child=serializers.ChoiceField(choices=RoleCode.choices))


class StaffMeSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    email = serializers.EmailField()
    full_name = serializers.CharField()
    preferred_language = serializers.ChoiceField(choices=Language.choices)
    is_platform_admin = serializers.BooleanField()
    mfa_enabled = serializers.BooleanField()
    memberships = MembershipSerializer(many=True)
    active_facility_id = serializers.UUIDField(allow_null=True)
    permissions = serializers.ListField(
        child=serializers.CharField(), help_text="Permission codes for the active facility."
    )


class LoginResultSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=LOGIN_STATUS_CHOICES)
    user = StaffMeSerializer(allow_null=True)


class LoginSerializer(StrictSerializer):
    email = serializers.EmailField(max_length=254)
    password = password_field()

    def validate_email(self, value: str) -> str:
        return normalize_email(value)


class StaffLoginSerializer(LoginSerializer):
    pass


class MfaSetupSerializer(serializers.Serializer):
    otpauth_uri = serializers.CharField()
    secret = serializers.CharField(help_text="Base32 secret for manual entry.")


class MfaCodeSerializer(StrictSerializer):
    code = serializers.RegexField(r"^\s*\d{6,8}\s*$", max_length=16)

    def validate_code(self, value: str) -> str:
        return value.strip()


class MfaConfirmResultSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=LOGIN_STATUS_CHOICES)
    user = StaffMeSerializer()
    recovery_codes = serializers.ListField(
        child=serializers.CharField(), help_text="Shown once. Stored hashed; each works once."
    )


class MfaVerifySerializer(StrictSerializer):
    code = serializers.RegexField(r"^\s*\d{6,8}\s*$", max_length=16, required=False)
    recovery_code = serializers.CharField(max_length=32, required=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if bool(attrs.get("code")) == bool(attrs.get("recovery_code")):
            raise serializers.ValidationError(_("Send either a code or a recovery code."))
        if attrs.get("code"):
            attrs["code"] = attrs["code"].strip()
        return attrs


class ActiveFacilitySerializer(StrictSerializer):
    facility_id = serializers.UUIDField()


# --- patient ---------------------------------------------------------------------------------


class PatientProfileSerializer(serializers.Serializer):
    patient_id = serializers.UUIDField()
    display_name = serializers.CharField()
    relationship = serializers.ChoiceField(choices=Relationship.choices)


class PatientMeSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    email = serializers.EmailField()
    full_name = serializers.CharField()
    preferred_language = serializers.ChoiceField(choices=Language.choices)
    email_verified = serializers.BooleanField()
    profiles = PatientProfileSerializer(many=True)


class PatientLoginSerializer(LoginSerializer):
    pass


class PatientRegisterSerializer(StrictSerializer):
    full_name = serializers.CharField(max_length=150)
    email = serializers.EmailField(max_length=254)
    password = password_field()
    preferred_language = serializers.ChoiceField(choices=Language.choices)
    accepted_terms_version = serializers.CharField(max_length=32)
    accepted_privacy_version = serializers.CharField(max_length=32)
    research_consent = serializers.BooleanField()

    default_error_messages = {
        "email_taken": _(
            "An account may already exist for this email. Sign in or reset your password."
        )
    }

    def validate_full_name(self, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise serializers.ValidationError(_("Enter your full name."))
        return value

    def validate_email(self, value: str) -> str:
        email = normalize_email(value)
        if User.objects.filter(email=email).exists():
            raise serializers.ValidationError(self.error_messages["email_taken"])
        return email

    def _validate_version(self, value: str) -> str:
        value = value.strip()
        if not VERSION_RE.fullmatch(value):
            raise serializers.ValidationError(_("Accept the current version to continue."))
        return value

    def validate_accepted_terms_version(self, value: str) -> str:
        return self._validate_version(value)

    def validate_accepted_privacy_version(self, value: str) -> str:
        return self._validate_version(value)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        candidate = User(email=attrs["email"], full_name=attrs["full_name"])
        candidate._password_audience = "patient"  # type: ignore[attr-defined]  # noqa: S105
        try:
            run_password_validators(attrs["password"], candidate)
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({"password": exc.detail}) from exc
        return attrs


# --- audience-neutral ------------------------------------------------------------------------


class PasswordResetSerializer(StrictSerializer):
    email = serializers.EmailField(max_length=254)

    def validate_email(self, value: str) -> str:
        return normalize_email(value)


class PasswordResetConfirmSerializer(StrictSerializer):
    uid = serializers.CharField(max_length=128)
    token = serializers.CharField(max_length=128)
    new_password = password_field()


class DetailSerializer(serializers.Serializer):
    detail = serializers.CharField()
