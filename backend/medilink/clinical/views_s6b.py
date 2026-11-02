"""S6b endpoints (contract sprint-06 §3.3): R1 results inbox, L2 scans, L3 back-entry, health
attributes, G1/G2 break-glass for the super admin."""

from __future__ import annotations

from typing import Any

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import exceptions, serializers, status
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.accounts.serializers import StrictSerializer
from medilink.authz.platform import PlatformAdmin
from medilink.authz.stepup import RecentAuthRequired
from medilink.clinical import access, break_glass, records
from medilink.clinical import serializers as cs
from medilink.clinical.models import (
    BLOOD_GROUPS,
    PREGNANCY_VALUES,
    AttributeKind,
    BreakGlassReason,
    BreakGlassSession,
    ClinicalScan,
    DocumentType,
    HistoryEntry,
    HistoryKind,
    ResultReview,
    ResultStatus,
    ReviewOutcome,
)
from medilink.clinical.views import ClinicalView, _paginated
from medilink.core.pagination import DefaultPagination
from medilink.facilities.views_base import Needs, err
from medilink.patients.errors import PatientsAPIView
from medilink.uploads.serializers import DownloadLinkSerializer

TAGS = ["clinical"]
PLATFORM_TAGS = ["platform-break-glass"]
VIEW, WRITE, UPLOAD, BACK_ENTRY = (
    "clinical.view",
    "clinical.write",
    "documents.upload",
    "records.import_clinical",
)
REASON_REQUIRED = err("access_reason_required: give a reason for this patient first")

# ---- schemas ----------------------------------------------------------------------------------


class ScanInputSerializer(StrictSerializer):
    upload_id = serializers.UUIDField()
    document_type = serializers.ChoiceField(choices=DocumentType.choices)
    document_date = serializers.DateField()
    description = serializers.CharField(
        max_length=200, required=False, allow_blank=True, default=""
    )


class ScanSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    facility_patient_id = serializers.UUIDField()
    document_type = serializers.ChoiceField(choices=DocumentType.choices)
    document_date = serializers.DateField()
    description = serializers.CharField(allow_blank=True)
    content_type = serializers.CharField()
    uploaded_by_name = serializers.CharField()
    uploaded_at = serializers.DateTimeField()
    review_id = serializers.UUIDField(allow_null=True)


class ResultReviewSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    status = serializers.ChoiceField(choices=ResultStatus.choices)
    scan = ScanSerializer()
    patient_display_name = serializers.CharField()
    facility_patient_id = serializers.UUIDField()
    assigned_to_name = serializers.CharField()
    comment = serializers.CharField(allow_blank=True)
    reviewed_by_name = serializers.CharField(allow_null=True)
    reviewed_at = serializers.DateTimeField(allow_null=True)
    created_at = serializers.DateTimeField()
    version = serializers.IntegerField()


class ReviewInputSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)
    comment = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")


class HistoryEntryInputSerializer(StrictSerializer):
    kind = serializers.ChoiceField(choices=HistoryKind.choices)
    code = serializers.CharField(max_length=10, required=False, allow_blank=True, default="")
    display = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    note = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")
    occurred_on = serializers.DateField(required=False, allow_null=True, default=None)
    source_scan_id = serializers.UUIDField(required=False, allow_null=True, default=None)


class HistoryEntrySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=HistoryKind.choices)
    code = serializers.CharField(allow_blank=True)
    display = serializers.CharField()
    note = serializers.CharField(allow_blank=True)
    occurred_on = serializers.DateField(allow_null=True)
    source_scan_id = serializers.UUIDField(allow_null=True)
    entered_by_name = serializers.CharField()
    entered_at = serializers.DateTimeField()
    is_historical = serializers.BooleanField()


class AttributeInputSerializer(StrictSerializer):
    kind = serializers.ChoiceField(choices=AttributeKind.choices)
    value = serializers.ChoiceField(choices=sorted({*BLOOD_GROUPS, *PREGNANCY_VALUES}))
    due_date = serializers.DateField(required=False, allow_null=True, default=None)


class BreakGlassInputSerializer(StrictSerializer):
    patient_id = serializers.UUIDField()
    facility_id = serializers.UUIDField()
    reason_code = serializers.ChoiceField(choices=BreakGlassReason.choices)
    reason_text = serializers.CharField(min_length=20, max_length=500)


class BreakGlassReviewSerializer(StrictSerializer):
    outcome = serializers.ChoiceField(choices=ReviewOutcome.choices)
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


class BreakGlassSessionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    user_name = serializers.CharField()
    patient_id = serializers.UUIDField()
    facility_id = serializers.UUIDField()
    facility_name = serializers.CharField()
    reason_code = serializers.ChoiceField(choices=BreakGlassReason.choices)
    reason_text = serializers.CharField()
    starts_at = serializers.DateTimeField()
    expires_at = serializers.DateTimeField()
    ended_at = serializers.DateTimeField(allow_null=True)
    is_open = serializers.BooleanField()
    reviewed_by_name = serializers.CharField(allow_null=True)
    reviewed_at = serializers.DateTimeField(allow_null=True)
    review_outcome = serializers.CharField(allow_blank=True)
    review_note = serializers.CharField(allow_blank=True)


class BreakGlassPatientSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    display_name = serializers.CharField()
    date_of_birth = serializers.DateField(allow_null=True)
    sex = serializers.CharField(allow_null=True)


class BreakGlassHistorySerializer(serializers.Serializer):
    session_id = serializers.UUIDField()
    expires_at = serializers.DateTimeField()
    patient = BreakGlassPatientSerializer()
    facility_patient_id = serializers.UUIDField()
    summary = cs.ProblemSummarySerializer()
    items = cs.HistoryItemSerializer(many=True)


# ---- data -------------------------------------------------------------------------------------


def scan_data(scan: ClinicalScan) -> dict[str, Any]:
    review = getattr(scan, "review", None)
    return {
        "id": scan.pk,
        "facility_patient_id": scan.facility_patient_id,
        "document_type": scan.document_type,
        "document_date": scan.document_date,
        "description": scan.description,
        "content_type": scan.upload.content_type,
        "uploaded_by_name": scan.uploaded_by_membership.user.full_name,
        "uploaded_at": scan.created_at,
        "review_id": review.pk if review else None,
    }


def review_data(review: ResultReview) -> dict[str, Any]:
    patient = review.patient
    return {
        "id": review.pk,
        "status": review.status,
        "scan": scan_data(review.scan),
        "patient_display_name": str(patient.preferred_name or patient.full_name),
        "facility_patient_id": review.facility_patient_id,
        "assigned_to_name": review.assigned_membership.user.full_name,
        "comment": records.review_comment(review),
        "reviewed_by_name": (
            review.reviewed_by_membership.user.full_name if review.reviewed_by_membership else None
        ),
        "reviewed_at": review.reviewed_at,
        "created_at": review.created_at,
        "version": review.version,
    }


def entry_data(entry: HistoryEntry) -> dict[str, Any]:
    return {
        "id": entry.pk,
        "kind": entry.kind,
        "code": entry.code,
        "display": entry.display,
        "note": records.history_note(entry),
        "occurred_on": entry.occurred_on,
        "source_scan_id": entry.source_scan_id,
        "entered_by_name": entry.entered_by_membership.user.full_name,
        "entered_at": entry.created_at,
        "is_historical": True,
    }


def session_data(session: BreakGlassSession) -> dict[str, Any]:
    return {
        "id": session.pk,
        "user_name": session.user.full_name,
        "patient_id": session.patient_id,
        "facility_id": session.facility_id,
        "facility_name": session.facility.name,
        "reason_code": session.reason_code,
        "reason_text": session.reason_text,
        "starts_at": session.starts_at,
        "expires_at": session.expires_at,
        "ended_at": session.ended_at,
        "is_open": break_glass.is_open(session),
        "reviewed_by_name": session.reviewed_by.full_name if session.reviewed_by else None,
        "reviewed_at": session.reviewed_at,
        "review_outcome": session.review_outcome,
        "review_note": session.review_note,
    }


SCAN_RELATED = ("upload", "uploaded_by_membership__user", "review")
REVIEW_RELATED = (
    "patient",
    "assigned_membership__user",
    "reviewed_by_membership__user",
    "scan__upload",
    "scan__uploaded_by_membership__user",
)

# ---- staff ------------------------------------------------------------------------------------


class ScansView(ClinicalView):
    permission_classes = [Needs(VIEW, UPLOAD, BACK_ENTRY, methods={"GET": (VIEW,)})]

    @extend_schema(
        operation_id="staff_patient_scans",
        tags=TAGS,
        responses={200: ScanSerializer(many=True), 403: REASON_REQUIRED},
        summary="Scanned documents and outside results of a patient here (L2)",
    )
    def get(self, request: Request, facility_patient_id: Any) -> Response:
        record = self.facility_patient(facility_patient_id)
        access.require_access(self.principal(), record)
        rows = ClinicalScan.objects.filter(facility_patient=record).select_related(*SCAN_RELATED)
        return Response(ScanSerializer([scan_data(x) for x in rows], many=True).data)

    @extend_schema(
        operation_id="staff_patient_scan_add",
        tags=TAGS,
        request=ScanInputSerializer,
        responses={201: ScanSerializer, 422: err("Unknown upload, future date, or no reviewer")},
        summary="Attach an uploaded scan or outside result to the patient (L2)",
    )
    def post(self, request: Request, facility_patient_id: Any) -> Response:
        record = self.facility_patient(facility_patient_id)
        body = ScanInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        scan = records.add_scan(
            record, membership=self.membership(), request=request, **body.validated_data
        )
        scan = ClinicalScan.objects.select_related(*SCAN_RELATED).get(pk=scan.pk)
        return Response(ScanSerializer(scan_data(scan)).data, status=status.HTTP_201_CREATED)


class ScanLinkView(ClinicalView):
    permission_classes = [Needs(VIEW)]

    @extend_schema(
        operation_id="staff_scan_download_link",
        tags=TAGS,
        request=None,
        responses={200: DownloadLinkSerializer, 403: REASON_REQUIRED},
        summary="5-minute download link to a scan, audited in the access history",
    )
    def post(self, request: Request, scan_id: Any) -> Response:
        scan = (
            ClinicalScan.objects.filter(pk=scan_id, facility_id=self.facility_id())
            .select_related("upload", "patient", "facility_patient")
            .first()
        )
        if scan is None:
            raise exceptions.NotFound()
        access.require_access(self.principal(), scan.facility_patient)
        link = records.scan_link(scan, request=request)
        return Response(
            DownloadLinkSerializer(
                {"url": link.url, "expires_at": link.expires_at, "disposition": link.disposition}
            ).data
        )


class ResultsInboxView(ClinicalView):
    permission_classes = [Needs(VIEW)]

    @extend_schema(
        operation_id="staff_results_inbox",
        tags=TAGS,
        parameters=[
            OpenApiParameter("status", str, enum=list(ResultStatus.values)),
            OpenApiParameter("page", int),
            OpenApiParameter("page_size", int),
        ],
        responses={200: _paginated("PaginatedResultReviewList", ResultReviewSerializer)},
        summary="Outside results assigned to me, oldest first (R1)",
    )
    def get(self, request: Request) -> Response:
        state = request.query_params.get("status", ResultStatus.PENDING)
        rows = ResultReview.objects.filter(
            facility_id=self.facility_id(), assigned_membership=self.membership()
        ).select_related(*REVIEW_RELATED)
        if state in ResultStatus.values:
            rows = rows.filter(status=state)
        paginator = DefaultPagination()
        page = list(
            paginator.paginate_queryset(rows.order_by("created_at"), request, view=self) or []
        )
        return paginator.get_paginated_response(
            [ResultReviewSerializer(review_data(r)).data for r in page]
        )


class ResultReviewView(ClinicalView):
    permission_classes = [Needs(VIEW)]

    @extend_schema(
        operation_id="staff_result_review",
        tags=TAGS,
        request=ReviewInputSerializer,
        responses={
            200: ResultReviewSerializer,
            409: err("Stale version"),
            422: err("Already reviewed or assigned to another doctor"),
        },
        summary="Mark an outside result reviewed, with an optional comment (R1)",
    )
    def post(self, request: Request, review_id: Any) -> Response:
        review = ResultReview.objects.filter(pk=review_id, facility_id=self.facility_id()).first()
        if review is None:
            raise exceptions.NotFound()
        body = ReviewInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        records.review_result(
            review.pk,
            version=body.validated_data["version"],
            comment=body.validated_data["comment"],
            membership=self.membership(),
            request=request,
        )
        row = ResultReview.objects.select_related(*REVIEW_RELATED).get(pk=review.pk)
        return Response(ResultReviewSerializer(review_data(row)).data)


class HistoryEntriesView(ClinicalView):
    permission_classes = [Needs(VIEW, BACK_ENTRY, methods={"GET": (VIEW,), "POST": (BACK_ENTRY,)})]

    @extend_schema(
        operation_id="staff_patient_history_entries",
        tags=TAGS,
        responses={200: HistoryEntrySerializer(many=True), 403: REASON_REQUIRED},
        summary="Back-entered history of a patient here, labelled historical (L3)",
    )
    def get(self, request: Request, facility_patient_id: Any) -> Response:
        record = self.facility_patient(facility_patient_id)
        access.require_access(self.principal(), record)
        rows = HistoryEntry.objects.filter(facility_patient=record).select_related(
            "entered_by_membership__user"
        )
        return Response(HistoryEntrySerializer([entry_data(e) for e in rows], many=True).data)

    @extend_schema(
        operation_id="staff_patient_history_entry_add",
        tags=TAGS,
        request=HistoryEntryInputSerializer,
        responses={201: HistoryEntrySerializer, 403: REASON_REQUIRED, 422: err("Unknown code")},
        summary="Back-enter a past diagnosis, allergy, condition, medicine or procedure (L3)",
    )
    def post(self, request: Request, facility_patient_id: Any) -> Response:
        record = self.facility_patient(facility_patient_id)
        access.require_access(self.principal(), record)
        body = HistoryEntryInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        entry = records.add_history_entry(
            record, membership=self.membership(), request=request, **body.validated_data
        )
        entry = HistoryEntry.objects.select_related("entered_by_membership__user").get(pk=entry.pk)
        return Response(
            HistoryEntrySerializer(entry_data(entry)).data, status=status.HTTP_201_CREATED
        )


class HealthAttributesView(ClinicalView):
    permission_classes = [Needs(VIEW, WRITE, methods={"GET": (VIEW,), "POST": (WRITE,)})]

    @extend_schema(
        operation_id="staff_patient_health_attributes",
        tags=TAGS,
        responses={200: cs.HealthAttributesSerializer, 403: REASON_REQUIRED},
        summary="Blood group and pregnancy status",
    )
    def get(self, request: Request, facility_patient_id: Any) -> Response:
        record = self.facility_patient(facility_patient_id)
        access.require_access(self.principal(), record)
        return Response(
            cs.HealthAttributesSerializer(records.attributes_data(record.patient_id)).data
        )

    @extend_schema(
        operation_id="staff_patient_health_attribute_record",
        tags=TAGS,
        request=AttributeInputSerializer,
        responses={201: cs.HealthAttributesSerializer, 422: err("Value or due date")},
        summary="Record blood group or pregnancy status (latest wins)",
    )
    def post(self, request: Request, facility_patient_id: Any) -> Response:
        record = self.facility_patient(facility_patient_id)
        access.require_access(self.principal(), record)
        body = AttributeInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        records.record_attribute(
            record, membership=self.membership(), request=request, **body.validated_data
        )
        return Response(
            cs.HealthAttributesSerializer(records.attributes_data(record.patient_id)).data,
            status=status.HTTP_201_CREATED,
        )


# ---- platform: break-glass --------------------------------------------------------------------


class _Platform(PatientsAPIView):
    permission_classes = [PlatformAdmin]


class BreakGlassView(_Platform):
    permission_classes = [PlatformAdmin, RecentAuthRequired(methods=("POST",))]

    @extend_schema(
        operation_id="platform_break_glass_sessions",
        tags=PLATFORM_TAGS,
        parameters=[
            OpenApiParameter("needs_review", bool),
            OpenApiParameter("page", int),
            OpenApiParameter("page_size", int),
        ],
        responses={200: _paginated("PaginatedBreakGlassSessionList", BreakGlassSessionSerializer)},
        summary="Break-glass sessions; the weekly review list (G1)",
    )
    def get(self, request: Request) -> Response:
        rows = BreakGlassSession.objects.select_related("user", "facility", "reviewed_by")
        if request.query_params.get("needs_review") == "true":
            rows = rows.filter(reviewed_at__isnull=True)
        paginator = DefaultPagination()
        page = list(
            paginator.paginate_queryset(rows.order_by("-starts_at"), request, view=self) or []
        )
        return paginator.get_paginated_response(
            [BreakGlassSessionSerializer(session_data(x)).data for x in page]
        )

    @extend_schema(
        operation_id="platform_break_glass_open",
        tags=PLATFORM_TAGS,
        request=BreakGlassInputSerializer,
        responses={
            201: BreakGlassSessionSerializer,
            403: err("step_up_required"),
            409: err("A session is already open"),
            422: err("No record at that facility"),
        },
        summary="Open 60 minutes of read-only emergency access to one patient (G1)",
    )
    def post(self, request: Request) -> Response:
        body = BreakGlassInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        session = break_glass.open_session(
            user=request.user, request=request, **body.validated_data
        )
        session = BreakGlassSession.objects.select_related("user", "facility").get(pk=session.pk)
        return Response(
            BreakGlassSessionSerializer(session_data(session)).data, status=status.HTTP_201_CREATED
        )


class BreakGlassReviewView(_Platform):
    permission_classes = [PlatformAdmin, RecentAuthRequired()]

    @extend_schema(
        operation_id="platform_break_glass_review",
        tags=PLATFORM_TAGS,
        request=BreakGlassReviewSerializer,
        responses={200: BreakGlassSessionSerializer, 422: err("Your own session or reviewed")},
        summary="Review another super admin's session (G1)",
    )
    def post(self, request: Request, session_id: Any) -> Response:
        if not BreakGlassSession.objects.filter(pk=session_id).exists():
            raise exceptions.NotFound()
        body = BreakGlassReviewSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        break_glass.review_session(
            session_id, user=request.user, request=request, **body.validated_data
        )
        session = BreakGlassSession.objects.select_related("user", "facility", "reviewed_by").get(
            pk=session_id
        )
        return Response(BreakGlassSessionSerializer(session_data(session)).data)


class BreakGlassEndView(_Platform):
    @extend_schema(
        operation_id="platform_break_glass_end",
        tags=PLATFORM_TAGS,
        request=None,
        responses={200: BreakGlassSessionSerializer, 422: err("Not yours or already ended")},
        summary="End my session before the 60 minutes are up",
    )
    def post(self, request: Request, session_id: Any) -> Response:
        if not BreakGlassSession.objects.filter(pk=session_id).exists():
            raise exceptions.NotFound()
        break_glass.end_session(session_id, user=request.user, request=request)
        session = BreakGlassSession.objects.select_related("user", "facility", "reviewed_by").get(
            pk=session_id
        )
        return Response(BreakGlassSessionSerializer(session_data(session)).data)


class BreakGlassHistoryView(_Platform):
    @extend_schema(
        operation_id="platform_break_glass_history",
        tags=PLATFORM_TAGS,
        responses={200: BreakGlassHistorySerializer, 422: err("No open session for this patient")},
        summary="Read-only timeline and summary during an open session (G2)",
    )
    def get(self, request: Request, session_id: Any, patient_id: Any) -> Response:
        session = break_glass.usable(session_id, patient_id, user=request.user)
        return Response(
            BreakGlassHistorySerializer(break_glass.read_history(session, request=request)).data
        )
