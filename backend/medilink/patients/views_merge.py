"""Merge request endpoints: staff (contract §3.3 ST18-ST25) and platform (§3.4 PL1-PL5)."""

from __future__ import annotations

from typing import Any

from django.http import Http404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.authz.platform import PlatformAdmin
from medilink.authz.stepup import RecentAuthRequired
from medilink.core.pagination import DefaultPagination
from medilink.patients import merge_requests as mr
from medilink.patients.errors import PatientsAPIView
from medilink.patients.models import Merge, MergeScope, MergeStatus
from medilink.patients.views_staff import Needs, StaffView, _err
from medilink.uploads.views import idempotency_key

STAFF_TAGS = ["staff-merge-requests"]
PLATFORM_TAGS = ["platform-merge-requests"]
LIST_PARAMS = [
    OpenApiParameter("status", str, enum=[c for c, _ in MergeStatus.choices]),
    OpenApiParameter("page", int),
]


def _paginate(view: Any, request: Request, queryset: Any) -> Response:
    paginator = DefaultPagination()
    page: list[Merge] | None = paginator.paginate_queryset(queryset, request, view=view)
    return paginator.get_paginated_response([mr.merge_data(m) for m in page or []])


# ---- staff ---------------------------------------------------------------------------------------


class _StaffMerge(StaffView):
    def merge(self, merge_id: Any) -> Merge:
        merge = mr.queryset().filter(pk=merge_id, facility_id=self.principal().active_facility_id)
        found = merge.first()
        if found is None:
            raise Http404
        return found


class StaffMergeListView(_StaffMerge):
    permission_classes = [
        Needs(
            "patients.merge_request",
            "patients.merge_approve",
            methods={"POST": ("patients.merge_request",)},
        )
    ]

    @extend_schema(
        operation_id="staff_merge_requests_list",
        tags=STAFF_TAGS,
        parameters=LIST_PARAMS,
        responses={200: mr.MergeRequestSerializer(many=True)},
        summary="This facility's merge requests",
    )
    def get(self, request: Request) -> Response:
        queryset = mr.queryset().filter(facility_id=self.principal().active_facility_id)
        status = request.query_params.get("status")
        if status:
            queryset = queryset.filter(status=status)
        return _paginate(self, request, queryset)

    @extend_schema(
        operation_id="staff_merge_requests_create",
        tags=STAFF_TAGS,
        request=mr.MergeCreateSerializer,
        responses={
            201: mr.MergeRequestSerializer,
            409: _err("open request"),
            422: _err("conflict"),
        },
        summary="Request a merge of two records of this facility",
    )
    def post(self, request: Request) -> Response:
        body = mr.MergeCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        merge = mr.request_merge(
            principal=self.principal(),
            request=request,
            data=body.validated_data,
            idempotency_key=idempotency_key(request),
        )
        return Response(mr.merge_data(merge, with_preview=True), status=201)


class StaffMergeDetailView(_StaffMerge):
    permission_classes = [Needs("patients.merge_request", "patients.merge_approve")]

    @extend_schema(
        operation_id="staff_merge_requests_retrieve",
        tags=STAFF_TAGS,
        responses={200: mr.MergeRequestSerializer},
        summary="A merge request with its preview",
    )
    def get(self, request: Request, merge_id: Any) -> Response:
        return Response(mr.merge_data(self.merge(merge_id), with_preview=True))


class StaffMergeApproveView(_StaffMerge):
    permission_classes = [Needs("patients.merge_approve"), RecentAuthRequired()]

    @extend_schema(
        operation_id="staff_merge_requests_approve",
        tags=STAFF_TAGS,
        request=mr.DecisionSerializer,
        responses={200: mr.MergeRequestSerializer, 422: _err("not allowed here")},
        summary="Approve and run a facility merge (step-up)",
    )
    def post(self, request: Request, merge_id: Any) -> Response:
        body = mr.DecisionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        merge = mr.approve(
            self.merge(merge_id),
            actor=self.principal().user,
            request=request,
            version=body.validated_data["version"],
            reason=body.validated_data.get("decision_reason", ""),
            platform=False,
        )
        return Response(mr.merge_data(merge))


class StaffMergeRejectView(_StaffMerge):
    permission_classes = [Needs("patients.merge_approve")]

    @extend_schema(
        operation_id="staff_merge_requests_reject",
        tags=STAFF_TAGS,
        request=mr.RejectSerializer,
        responses={200: mr.MergeRequestSerializer},
        summary="Reject a merge request",
    )
    def post(self, request: Request, merge_id: Any) -> Response:
        body = mr.RejectSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        merge = mr.reject(
            self.merge(merge_id),
            actor=self.principal().user,
            request=request,
            version=body.validated_data["version"],
            reason=body.validated_data["decision_reason"],
        )
        return Response(mr.merge_data(merge))


class StaffMergeCancelView(_StaffMerge):
    permission_classes = [Needs("patients.merge_request")]

    @extend_schema(
        operation_id="staff_merge_requests_cancel",
        tags=STAFF_TAGS,
        request=None,
        responses={200: mr.MergeRequestSerializer},
        summary="Cancel your own merge request",
    )
    def post(self, request: Request, merge_id: Any) -> Response:
        merge = mr.cancel(self.merge(merge_id), actor=self.principal().user, request=request)
        return Response(mr.merge_data(merge))


class StaffMergeEscalateView(_StaffMerge):
    permission_classes = [Needs("patients.merge_request")]

    @extend_schema(
        operation_id="staff_merge_requests_escalate",
        tags=STAFF_TAGS,
        request=None,
        responses={200: mr.MergeRequestSerializer, 422: _err("another approver exists")},
        summary="Send your request to the platform team (no other approver here)",
    )
    def post(self, request: Request, merge_id: Any) -> Response:
        merge = mr.escalate(self.merge(merge_id), actor=self.principal().user, request=request)
        return Response(mr.merge_data(merge))


class StaffMergeUndoView(_StaffMerge):
    permission_classes = [Needs("patients.merge_approve"), RecentAuthRequired()]

    @extend_schema(
        operation_id="staff_merge_requests_undo",
        tags=STAFF_TAGS,
        request=mr.UndoSerializer,
        responses={200: mr.UndoResultSerializer},
        summary="Undo a facility merge (step-up)",
    )
    def post(self, request: Request, merge_id: Any) -> Response:
        body = mr.UndoSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        merge, skipped = mr.undo(
            self.merge(merge_id),
            actor=self.principal().user,
            request=request,
            version=body.validated_data["version"],
            reason=body.validated_data["reason"],
            platform=False,
        )
        return Response({"merge": mr.merge_data(merge), "skipped_rows": skipped})


# ---- platform ------------------------------------------------------------------------------------


def _platform_queryset() -> Any:
    from django.db.models import Q

    return mr.queryset().filter(
        Q(scope__in=[MergeScope.CROSS_FACILITY, MergeScope.CLAIM]) | Q(is_escalated=True)
    )


class _PlatformMerge(PatientsAPIView):
    permission_classes = [PlatformAdmin]

    def merge(self, merge_id: Any) -> Merge:
        merge = _platform_queryset().filter(pk=merge_id).first()
        if merge is None:
            raise Http404
        return merge


class PlatformMergeListView(_PlatformMerge):
    @extend_schema(
        operation_id="platform_merge_requests_list",
        tags=PLATFORM_TAGS,
        parameters=[
            *LIST_PARAMS,
            OpenApiParameter("scope", str, enum=[c for c, _ in MergeScope.choices]),
        ],
        responses={200: mr.MergeRequestSerializer(many=True)},
        summary="Cross-facility, escalated and claim merges",
    )
    def get(self, request: Request) -> Response:
        queryset = _platform_queryset()
        for name in ("status", "scope"):
            value = request.query_params.get(name)
            if value:
                queryset = queryset.filter(**{name: value})
        return _paginate(self, request, queryset)


class PlatformMergeDetailView(_PlatformMerge):
    @extend_schema(
        operation_id="platform_merge_requests_retrieve",
        tags=PLATFORM_TAGS,
        responses={200: mr.MergeRequestSerializer},
        summary="A merge request with preview counts (no clinical data)",
    )
    def get(self, request: Request, merge_id: Any) -> Response:
        return Response(mr.merge_data(self.merge(merge_id), with_preview=True))


class PlatformMergeApproveView(_PlatformMerge):
    permission_classes = [PlatformAdmin, RecentAuthRequired()]

    @extend_schema(
        operation_id="platform_merge_requests_approve",
        tags=PLATFORM_TAGS,
        request=mr.DecisionSerializer,
        responses={200: mr.MergeRequestSerializer},
        summary="Approve and run a merge (step-up)",
    )
    def post(self, request: Request, merge_id: Any) -> Response:
        body = mr.DecisionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        merge = mr.approve(
            self.merge(merge_id),
            actor=request.user,
            request=request,
            version=body.validated_data["version"],
            reason=body.validated_data.get("decision_reason", ""),
            platform=True,
        )
        return Response(mr.merge_data(merge))


class PlatformMergeRejectView(_PlatformMerge):
    @extend_schema(
        operation_id="platform_merge_requests_reject",
        tags=PLATFORM_TAGS,
        request=mr.RejectSerializer,
        responses={200: mr.MergeRequestSerializer},
        summary="Reject a merge request",
    )
    def post(self, request: Request, merge_id: Any) -> Response:
        body = mr.RejectSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        merge = mr.reject(
            self.merge(merge_id),
            actor=request.user,
            request=request,
            version=body.validated_data["version"],
            reason=body.validated_data["decision_reason"],
        )
        return Response(mr.merge_data(merge))


class PlatformMergeUndoView(_PlatformMerge):
    permission_classes = [PlatformAdmin, RecentAuthRequired()]

    @extend_schema(
        operation_id="platform_merge_requests_undo",
        tags=PLATFORM_TAGS,
        request=mr.UndoSerializer,
        responses={200: mr.UndoResultSerializer},
        summary="Undo any merge, including claims (step-up)",
    )
    def post(self, request: Request, merge_id: Any) -> Response:
        body = mr.UndoSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        merge, skipped = mr.undo(
            self.merge(merge_id),
            actor=request.user,
            request=request,
            version=body.validated_data["version"],
            reason=body.validated_data["reason"],
            platform=True,
        )
        return Response({"merge": mr.merge_data(merge), "skipped_rows": skipped})
