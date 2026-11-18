"""POST /api/v1/staff/uploads/signature/ and /api/v1/patient/uploads/signature/."""

from __future__ import annotations

from typing import Any

from drf_spectacular.utils import extend_schema
from rest_framework import exceptions, serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from medilink.authz.permissions import IsPatientAuthenticated, IsStaffAuthenticated, get_principal
from medilink.core.serializers import ErrorSerializer
from medilink.core.throttling import BurstRateThrottle
from medilink.images import services
from medilink.uploads.throttling import EnvRateThrottle

CONFIGURE = "facility.configure"


class SignatureRateThrottle(EnvRateThrottle):
    """30 signatures an hour per account (THROTTLE_RATE_UPLOAD_SIGNATURE)."""

    scope = "uploads"
    env_var = "THROTTLE_RATE_UPLOAD_SIGNATURE"
    default_rate = "30/hour"

    def get_ident_for(self, request: Any, view: Any) -> str | None:
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated:
            return f"user:{user.pk}"
        return self.get_ident(request)


class UploadsUnavailable(exceptions.APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_code = "uploads_unavailable"
    default_detail = "Image uploads aren't set up on this server."


class SignatureSerializer(serializers.Serializer):
    timestamp = serializers.IntegerField()
    upload_preset = serializers.CharField()
    asset_folder = serializers.CharField()
    tags = serializers.CharField()
    signature = serializers.CharField()
    api_key = serializers.CharField()
    cloud_name = serializers.CharField()
    upload_url = serializers.URLField()


class StaffSignatureRequest(serializers.Serializer):
    kind = serializers.ChoiceField(choices=list(services.STAFF_KINDS))


class PatientSignatureRequest(serializers.Serializer):
    kind = serializers.ChoiceField(choices=list(services.PATIENT_KINDS))


class _SignatureView(APIView):
    request_serializer: type[serializers.Serializer] = StaffSignatureRequest
    throttle_classes = [BurstRateThrottle, SignatureRateThrottle]

    def check_kind(self, request: Request, kind: str) -> None:  # pragma: no cover (overridden)
        return None

    def post(self, request: Request) -> Response:
        body = self.request_serializer(data=request.data)
        body.is_valid(raise_exception=True)
        kind = body.validated_data["kind"]
        self.check_kind(request, kind)
        if not services.is_configured():
            raise UploadsUnavailable()
        return Response(services.sign_upload(kind))


_RESPONSES = {
    200: SignatureSerializer,
    400: ErrorSerializer,
    403: ErrorSerializer,
    503: ErrorSerializer,
}


class StaffSignatureView(_SignatureView):
    permission_classes = [IsStaffAuthenticated]
    request_serializer = StaffSignatureRequest

    def check_kind(self, request: Request, kind: str) -> None:
        # facility images: only who may configure the active facility; an avatar: any staff
        if kind.startswith("facility_"):
            principal = get_principal(request)
            if principal is None or CONFIGURE not in principal.permissions:
                raise exceptions.PermissionDenied()

    @extend_schema(
        operation_id="staff_upload_signature",
        tags=["uploads"],
        request=StaffSignatureRequest,
        responses=_RESPONSES,
        summary="Sign a direct image upload to Cloudinary (facility photo or logo, own avatar)",
    )
    def post(self, request: Request) -> Response:
        return super().post(request)


class PatientSignatureView(_SignatureView):
    permission_classes = [IsPatientAuthenticated]
    request_serializer = PatientSignatureRequest

    def check_kind(self, request: Request, kind: str) -> None:
        return None

    @extend_schema(
        operation_id="patient_upload_signature",
        tags=["uploads"],
        request=PatientSignatureRequest,
        responses=_RESPONSES,
        summary="Sign a direct image upload to Cloudinary (profile photo)",
    )
    def post(self, request: Request) -> Response:
        return super().post(request)
