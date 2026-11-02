"""Shapes for S7b (contract sprint-07 §3.3). Responses never carry the PDF's clinical text: it is
read from the file itself, or, on the public page, after a date-of-birth match."""

from __future__ import annotations

import datetime as dt

from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from medilink.accounts.serializers import StrictSerializer
from medilink.documents.models import DocumentKind, Urgency, VerificationResult, VerificationStatus

MAX_SICK_DAYS = 90


# ---- CR1: letters and requests ------------------------------------------------------------------


class ReferralInputSerializer(StrictSerializer):
    to_facility_name = serializers.CharField(max_length=200)
    specialty = serializers.CharField(max_length=100)
    reason = serializers.CharField(max_length=2000)
    urgency = serializers.ChoiceField(choices=Urgency.choices, default=Urgency.ROUTINE)


class LabTestSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=20, allow_blank=True, default="")
    name = serializers.CharField(max_length=120)


class LabRequestInputSerializer(StrictSerializer):
    tests = serializers.ListField(child=LabTestSerializer(), min_length=1, max_length=20)
    reason = serializers.CharField(max_length=2000)


class SickNoteInputSerializer(StrictSerializer):
    rest_from = serializers.DateField()
    rest_to = serializers.DateField()
    show_diagnosis = serializers.BooleanField(default=False)

    def validate(self, attrs: dict) -> dict:
        start, end = attrs["rest_from"], attrs["rest_to"]
        if end < start:
            raise serializers.ValidationError({"rest_to": [_("The last day is before the first.")]})
        if (end - start) > dt.timedelta(days=MAX_SICK_DAYS - 1):
            raise serializers.ValidationError(
                {"rest_to": [_("A sick note covers 90 days at most.")]}
            )
        return attrs


class SourceSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    author_name = serializers.CharField()
    signed_at = serializers.DateTimeField(allow_null=True)
    document_id = serializers.UUIDField(allow_null=True)


class ReferralSerializer(SourceSerializer):
    to_facility_name = serializers.CharField()
    specialty = serializers.CharField()
    reason = serializers.CharField()
    urgency = serializers.ChoiceField(choices=Urgency.choices)


class LabRequestSerializer(SourceSerializer):
    tests = LabTestSerializer(many=True)
    reason = serializers.CharField()


class SickNoteSerializer(SourceSerializer):
    rest_from = serializers.DateField()
    rest_to = serializers.DateField()
    show_diagnosis = serializers.BooleanField()


# ---- documents ----------------------------------------------------------------------------------


class DocumentRowSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=DocumentKind.choices)
    number = serializers.CharField()
    document_date = serializers.DateField()
    patient_id = serializers.UUIDField()
    facility_name = serializers.CharField()
    author_name = serializers.CharField()
    status = serializers.ChoiceField(choices=VerificationStatus.choices)
    version_no = serializers.IntegerField(help_text="0 while the first version is rendering")
    released_at = serializers.DateTimeField(allow_null=True)


class VersionSerializer(serializers.Serializer):
    version_no = serializers.IntegerField()
    created_at = serializers.DateTimeField()
    superseded_at = serializers.DateTimeField(allow_null=True)
    size_bytes = serializers.IntegerField()


class ShareLinkSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    expires_at = serializers.DateTimeField()
    revoked_at = serializers.DateTimeField(allow_null=True)
    access_count = serializers.IntegerField()
    last_accessed_at = serializers.DateTimeField(allow_null=True)


class DocumentSerializer(DocumentRowSerializer):
    verification_code = serializers.CharField()
    versions = VersionSerializer(many=True)


class PatientDocumentSerializer(DocumentSerializer):
    share_links = ShareLinkSerializer(many=True)


class LinkSerializer(serializers.Serializer):
    url = serializers.URLField()
    expires_at = serializers.DateTimeField()


class ShareLinkCreateSerializer(StrictSerializer):
    expires_in_days = serializers.IntegerField(min_value=1, max_value=30)


class NewShareLinkSerializer(ShareLinkSerializer):
    token = serializers.CharField(help_text="Shown once; only its SHA-256 is stored")
    url = serializers.URLField()


# ---- public -------------------------------------------------------------------------------------


class DocumentVerificationSerializer(serializers.Serializer):
    code = serializers.CharField()
    kind = serializers.ChoiceField(choices=DocumentKind.choices)
    number = serializers.CharField()
    status = serializers.ChoiceField(choices=VerificationStatus.choices)
    issued_at = serializers.DateTimeField()
    valid_until = serializers.DateTimeField(allow_null=True)
    facility_name = serializers.CharField()
    author_name = serializers.CharField()
    author_licence = serializers.CharField(allow_blank=True)
    version_no = serializers.IntegerField()


class DocumentVerificationDetailsInputSerializer(StrictSerializer):
    date_of_birth = serializers.DateField()


class DetailSectionSerializer(serializers.Serializer):
    heading = serializers.CharField(allow_blank=True)
    lines = serializers.ListField(child=serializers.CharField())


class DocumentVerificationDetailsSerializer(DocumentVerificationSerializer):
    patient_name = serializers.CharField()
    sections = DetailSectionSerializer(many=True)


class SharedDocumentSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=DocumentKind.choices)
    number = serializers.CharField()
    document_date = serializers.DateField()
    facility_name = serializers.CharField()
    expires_at = serializers.DateTimeField(help_text="When the share link stops working")
    download = LinkSerializer()


VERIFY_RESULTS = VerificationResult
