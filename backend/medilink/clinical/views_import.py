"""S6b legacy import endpoints (contract sprint-06 §3.3 L1, FR-PAT-10)."""

from __future__ import annotations

from typing import Any

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import exceptions, serializers, status
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.accounts.serializers import StrictSerializer
from medilink.authz.stepup import RecentAuthRequired
from medilink.clinical import imports
from medilink.clinical.models import ImportBatch, ImportRowStatus, ImportStatus
from medilink.clinical.views import ClinicalView, _paginated
from medilink.core.pagination import DefaultPagination
from medilink.facilities.views_base import Needs, err

TAGS = ["patient-imports"]
IMPORT = "records.import"
STALE = err("Stale version")


class PatientImportCreateSerializer(StrictSerializer):
    upload_id = serializers.UUIDField()


class PatientImportMappingSerializer(serializers.Serializer):
    full_name = serializers.CharField(required=False, allow_blank=True)
    sex = serializers.CharField(required=False, allow_blank=True)
    date_of_birth = serializers.CharField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)
    file_number = serializers.CharField(required=False, allow_blank=True)
    national_id = serializers.CharField(required=False, allow_blank=True)


class PatientImportMappingInputSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)
    mapping = PatientImportMappingSerializer()


class PatientImportVersionSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)


class PatientImportBatchSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    status = serializers.ChoiceField(choices=ImportStatus.choices)
    file_name = serializers.CharField()
    headers = serializers.ListField(child=serializers.CharField())
    column_mapping = PatientImportMappingSerializer()
    row_count = serializers.IntegerField()
    valid_count = serializers.IntegerField()
    error_count = serializers.IntegerField()
    duplicate_count = serializers.IntegerField()
    created_count = serializers.IntegerField()
    created_by_name = serializers.CharField()
    created_at = serializers.DateTimeField()
    confirmed_at = serializers.DateTimeField(allow_null=True)
    rollback_until = serializers.DateTimeField(allow_null=True)
    can_roll_back = serializers.BooleanField()
    rolled_back_at = serializers.DateTimeField(allow_null=True)
    version = serializers.IntegerField()


class PatientImportRowProblemSerializer(serializers.Serializer):
    field = serializers.CharField()
    code = serializers.CharField()


class PatientImportRowSerializer(serializers.Serializer):
    row_number = serializers.IntegerField()
    status = serializers.ChoiceField(choices=ImportRowStatus.choices)
    full_name = serializers.CharField(allow_blank=True)
    sex = serializers.CharField(allow_null=True)
    date_of_birth = serializers.DateField(allow_null=True)
    phone_e164 = serializers.CharField(allow_null=True)
    file_number = serializers.CharField(allow_null=True)
    has_national_id = serializers.BooleanField()
    problems = PatientImportRowProblemSerializer(many=True)
    matched_patient_id = serializers.UUIDField(allow_null=True)
    created_facility_patient_id = serializers.UUIDField(allow_null=True)


def batch_data(batch: ImportBatch) -> dict[str, Any]:
    from django.utils import timezone

    return {
        "id": batch.pk,
        "status": batch.status,
        "file_name": batch.upload.original_filename,
        "headers": batch.headers,
        "column_mapping": batch.column_mapping,
        "row_count": batch.row_count,
        "valid_count": batch.valid_count,
        "error_count": batch.error_count,
        "duplicate_count": batch.duplicate_count,
        "created_count": batch.created_count,
        "created_by_name": batch.created_by_membership.user.full_name,
        "created_at": batch.created_at,
        "confirmed_at": batch.confirmed_at,
        "rollback_until": batch.rollback_until,
        "can_roll_back": batch.status == ImportStatus.CONFIRMED
        and batch.rollback_until is not None
        and batch.rollback_until > timezone.now(),
        "rolled_back_at": batch.rolled_back_at,
        "version": batch.version,
    }


def row_data(row: Any) -> dict[str, Any]:
    n = row.normalized or {}
    return {
        "row_number": row.row_number,
        "status": row.status,
        "full_name": n.get("full_name") or "",
        "sex": n.get("sex"),
        "date_of_birth": n.get("date_of_birth"),
        "phone_e164": n.get("phone_e164"),
        "file_number": n.get("file_number"),
        "has_national_id": bool(n.get("has_national_id")),
        "problems": row.errors or [],
        "matched_patient_id": row.matched_patient_id,
        "created_facility_patient_id": row.created_facility_patient_id,
    }


class ImportView(ClinicalView):
    def batch(self, batch_id: Any) -> ImportBatch:
        row = (
            ImportBatch.objects.filter(pk=batch_id, facility_id=self.facility_id())
            .select_related("upload", "created_by_membership__user")
            .first()
        )
        if row is None:
            raise exceptions.NotFound()
        return row

    def respond(self, batch_id: Any, code: int = status.HTTP_200_OK) -> Response:
        return Response(
            PatientImportBatchSerializer(batch_data(self.batch(batch_id))).data, status=code
        )


class ImportsView(ImportView):
    permission_classes = [Needs(IMPORT)]

    @extend_schema(
        operation_id="staff_patient_imports",
        tags=TAGS,
        parameters=[OpenApiParameter("page", int), OpenApiParameter("page_size", int)],
        responses={200: _paginated("PaginatedImportBatchList", PatientImportBatchSerializer)},
        summary="Register imports of this facility, newest first (L1)",
    )
    def get(self, request: Request) -> Response:
        rows = ImportBatch.objects.filter(facility_id=self.facility_id()).select_related(
            "upload", "created_by_membership__user"
        )
        paginator = DefaultPagination()
        page = list(paginator.paginate_queryset(rows, request, view=self) or [])
        return paginator.get_paginated_response(
            [PatientImportBatchSerializer(batch_data(b)).data for b in page]
        )

    @extend_schema(
        operation_id="staff_patient_import_create",
        tags=TAGS,
        request=PatientImportCreateSerializer,
        responses={
            201: PatientImportBatchSerializer,
            422: err("Not a CSV, empty, or too many rows"),
        },
        summary="Start an import from an uploaded CSV; suggests a column mapping (L1)",
    )
    def post(self, request: Request) -> Response:
        body = PatientImportCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        batch = imports.create_batch(
            upload_id=body.validated_data["upload_id"],
            membership=self.membership(),
            request=request,
        )
        return self.respond(batch.pk, status.HTTP_201_CREATED)


class ImportDetailView(ImportView):
    permission_classes = [Needs(IMPORT)]

    @extend_schema(
        operation_id="staff_patient_import_detail",
        tags=TAGS,
        responses={200: PatientImportBatchSerializer},
        summary="An import with its counts (L1)",
    )
    def get(self, request: Request, batch_id: Any) -> Response:
        return self.respond(batch_id)


class ImportMappingView(ImportView):
    permission_classes = [Needs(IMPORT)]

    @extend_schema(
        operation_id="staff_patient_import_mapping",
        tags=TAGS,
        request=PatientImportMappingInputSerializer,
        responses={200: PatientImportBatchSerializer, 409: STALE, 422: err("Mapping or state")},
        summary="Map columns and preview: errors and likely duplicates, nothing saved (L1)",
    )
    def put(self, request: Request, batch_id: Any) -> Response:
        batch = self.batch(batch_id)
        body = PatientImportMappingInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        imports.set_mapping(
            batch.pk,
            version=body.validated_data["version"],
            mapping=dict(body.validated_data["mapping"]),
            request=request,
        )
        return self.respond(batch.pk)


class ImportRowsView(ImportView):
    permission_classes = [Needs(IMPORT)]

    @extend_schema(
        operation_id="staff_patient_import_rows",
        tags=TAGS,
        parameters=[
            OpenApiParameter("status", str, enum=list(ImportRowStatus.values)),
            OpenApiParameter("page", int),
            OpenApiParameter("page_size", int),
        ],
        responses={200: _paginated("PaginatedImportRowList", PatientImportRowSerializer)},
        summary="Preview rows with their errors and likely duplicates (L1)",
    )
    def get(self, request: Request, batch_id: Any) -> Response:
        batch = self.batch(batch_id)
        rows = batch.rows.all()
        state = request.query_params.get("status")
        if state in ImportRowStatus.values:
            rows = rows.filter(status=state)
        paginator = DefaultPagination()
        page = list(paginator.paginate_queryset(rows, request, view=self) or [])
        return paginator.get_paginated_response(
            [PatientImportRowSerializer(row_data(r)).data for r in page]
        )


class ImportConfirmView(ImportView):
    permission_classes = [Needs(IMPORT), RecentAuthRequired()]

    @extend_schema(
        operation_id="staff_patient_import_confirm",
        tags=TAGS,
        request=PatientImportVersionSerializer,
        responses={200: PatientImportBatchSerializer, 403: err("step_up_required"), 409: STALE},
        summary="Create the valid rows' patients and facility records (L1)",
    )
    def post(self, request: Request, batch_id: Any) -> Response:
        batch = self.batch(batch_id)
        body = PatientImportVersionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        imports.confirm(
            batch.pk,
            version=body.validated_data["version"],
            membership=self.membership(),
            request=request,
        )
        return self.respond(batch.pk)


class ImportRollbackView(ImportView):
    permission_classes = [Needs(IMPORT), RecentAuthRequired()]

    @extend_schema(
        operation_id="staff_patient_import_rollback",
        tags=TAGS,
        request=PatientImportVersionSerializer,
        responses={
            200: PatientImportBatchSerializer,
            403: err("step_up_required"),
            422: err("Window passed or a visit is attached"),
        },
        summary="Roll back within 7 days when no imported patient has a visit (L1)",
    )
    def post(self, request: Request, batch_id: Any) -> Response:
        batch = self.batch(batch_id)
        body = PatientImportVersionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        imports.rollback(batch.pk, version=body.validated_data["version"], request=request)
        return self.respond(batch.pk)
