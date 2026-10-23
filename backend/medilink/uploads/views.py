"""Upload endpoints (contract §3.3, §3.4): /staff/uploads/, /patient/uploads/, and the dev/test-only
/files/{token}/ route that serves local-storage downloads."""

from __future__ import annotations

from typing import Any

from django.http import FileResponse, Http404, HttpRequest
from django.utils.translation import gettext_lazy as _
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import exceptions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from medilink.authz.permissions import (
    IsPatientAuthenticated,
    IsStaffAuthenticated,
    get_principal,
)
from medilink.core.exceptions import BusinessRuleViolation
from medilink.core.serializers import ErrorSerializer
from medilink.core.throttling import BurstRateThrottle
from medilink.uploads import services
from medilink.uploads.models import UploadedFile
from medilink.uploads.purposes import get_purpose
from medilink.uploads.serializers import (
    DownloadLinkRequestSerializer,
    DownloadLinkSerializer,
    UploadCreateSerializer,
    UploadSerializer,
)
from medilink.uploads.storage import (
    LocalFileSystemStorage,
    content_disposition,
    get_storage,
    read_local_token,
)
from medilink.uploads.throttling import UploadRateThrottle

NOT_CLEAN = _("This file can't be opened until its security check has finished.")

IDEMPOTENCY_HEADER = OpenApiParameter(
    "Idempotency-Key",
    str,
    OpenApiParameter.HEADER,
    required=False,
    description="Repeating an upload with the same key returns the original upload.",
)


def _err(description: str) -> OpenApiResponse:
    return OpenApiResponse(response=ErrorSerializer, description=description)


def idempotency_key(request: Request) -> str | None:
    value = request.headers.get("Idempotency-Key", "").strip()
    return value[:200] or None


def rejected(exc: services.UploadRejected) -> exceptions.ValidationError:
    return exceptions.ValidationError({exc.field: [str(exc.message)]})


def readable_file(request: Request, upload_id: Any, audience: str) -> UploadedFile:
    """The upload if the caller may read it: its uploader while unattached, else the purpose's
    `can_read`. Anything else is 404 (no existence leak)."""
    principal = get_principal(request)
    file = UploadedFile.objects.filter(pk=upload_id, deleted_at__isnull=True).first()
    if file is None or principal is None or principal.user is None:
        raise Http404
    spec = get_purpose(file.purpose)
    if spec is None or audience not in spec.audiences:
        raise Http404
    if not file.is_attached:
        if file.uploaded_by_id == principal.user.pk and file.uploaded_via == audience:
            return file
        raise Http404
    if spec.can_read(principal, file):
        return file
    raise Http404


class _UploadCreateView(APIView):
    audience = ""
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [BurstRateThrottle, UploadRateThrottle]

    def post(self, request: Request) -> Response:
        serializer = UploadCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        principal = get_principal(request)
        if principal is None or principal.user is None:  # the permission class ensures it
            raise exceptions.NotAuthenticated()
        code = serializer.validated_data["purpose"]
        spec = get_purpose(code)
        if spec is None or self.audience not in spec.audiences:
            raise exceptions.ValidationError({"purpose": [str(services.MESSAGES["purpose"])]})
        data: Any = request.data
        fields = {k: v for k, v in data.items() if k not in ("file", "purpose")}
        if not spec.can_upload(principal, fields):
            raise exceptions.PermissionDenied()
        try:
            file = services.receive(
                actor=principal.user,
                audience=self.audience,
                purpose=code,
                django_file=serializer.validated_data["file"],
                idempotency_key=idempotency_key(request),
                facility_id=principal.active_facility_id if spec.owner_kind == "facility" else None,
                request=request,
            )
        except services.UploadRejected as exc:
            raise rejected(exc) from None
        return Response(UploadSerializer(file).data, status=status.HTTP_201_CREATED)


class _UploadDetailView(APIView):
    audience = ""

    def get(self, request: Request, upload_id: Any) -> Response:
        return Response(UploadSerializer(readable_file(request, upload_id, self.audience)).data)


class _DownloadLinkView(APIView):
    audience = ""

    def post(self, request: Request, upload_id: Any) -> Response:
        file = readable_file(request, upload_id, self.audience)
        body = DownloadLinkRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            link = services.download_link(
                file,
                principal=get_principal(request),
                disposition=body.validated_data["disposition"],
                request=request,
            )
        except services.NotClean:
            raise BusinessRuleViolation(NOT_CLEAN) from None
        return Response(DownloadLinkSerializer(link).data)


_create_schema = extend_schema(
    tags=["uploads"],
    request={"multipart/form-data": UploadCreateSerializer},
    parameters=[IDEMPOTENCY_HEADER],
    responses={
        201: UploadSerializer,
        400: _err("Unknown purpose, wrong audience, file type or size"),
        403: _err("Not allowed to upload for this purpose"),
    },
)
_detail_schema = extend_schema(
    tags=["uploads"], responses={200: UploadSerializer, 404: _err("Not found")}
)
_link_schema = extend_schema(
    tags=["uploads"],
    request=DownloadLinkRequestSerializer,
    responses={
        200: DownloadLinkSerializer,
        404: _err("Not found"),
        422: _err("The file isn't clean (yet)"),
    },
)


class StaffUploadCreateView(_UploadCreateView):
    audience = "staff"
    permission_classes = [IsStaffAuthenticated]

    @_create_schema
    def post(self, request: Request) -> Response:
        return super().post(request)


class StaffUploadDetailView(_UploadDetailView):
    audience = "staff"
    permission_classes = [IsStaffAuthenticated]

    @_detail_schema
    def get(self, request: Request, upload_id: Any) -> Response:
        return super().get(request, upload_id)


class StaffDownloadLinkView(_DownloadLinkView):
    audience = "staff"
    permission_classes = [IsStaffAuthenticated]

    @_link_schema
    def post(self, request: Request, upload_id: Any) -> Response:
        return super().post(request, upload_id)


class PatientUploadCreateView(_UploadCreateView):
    audience = "patient"
    permission_classes = [IsPatientAuthenticated]

    @_create_schema
    def post(self, request: Request) -> Response:
        return super().post(request)


class PatientUploadDetailView(_UploadDetailView):
    audience = "patient"
    permission_classes = [IsPatientAuthenticated]

    @_detail_schema
    def get(self, request: Request, upload_id: Any) -> Response:
        return super().get(request, upload_id)


class PatientDownloadLinkView(_DownloadLinkView):
    audience = "patient"
    permission_classes = [IsPatientAuthenticated]

    @_link_schema
    def post(self, request: Request, upload_id: Any) -> Response:
        return super().post(request, upload_id)


def serve_local_file(request: HttpRequest, token: str) -> FileResponse:
    """Dev/test only: serve a local-storage download with the §2.4 headers. Not in the schema;
    not mounted with S3-compatible storage."""
    storage = get_storage()
    payload = read_local_token(token)
    if request.method not in ("GET", "HEAD") or payload is None:
        raise Http404
    if not isinstance(storage, LocalFileSystemStorage):
        raise Http404
    try:
        if not storage.exists(payload["b"], payload["k"]):
            raise Http404
        handle = storage.open(payload["b"], payload["k"])
    except (KeyError, ValueError):
        raise Http404 from None
    response = FileResponse(handle, content_type=str(payload.get("c", "application/octet-stream")))
    response["Content-Disposition"] = content_disposition(
        "attachment" if payload.get("d") == "attachment" else "inline",
        str(payload.get("f", "file")),
    )
    response["X-Content-Type-Options"] = "nosniff"
    response["Content-Security-Policy"] = "sandbox; default-src 'none'"
    response["Cache-Control"] = "private, no-store"
    response["Cross-Origin-Resource-Policy"] = "same-site"
    return response
