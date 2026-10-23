"""Super admin console endpoints (contract §3.5). Every view: PlatformAdmin; step-up where the
contract marks it."""

from __future__ import annotations

from typing import Any

from django.db.models import Q, QuerySet
from django.http import Http404
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import exceptions, status
from rest_framework.generics import GenericAPIView
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from medilink.audit.services import record
from medilink.authz.permissions import get_principal
from medilink.authz.platform import PlatformAdmin
from medilink.authz.stepup import RecentAuthRequired
from medilink.core.exceptions import BusinessRuleViolation, error_response
from medilink.core.pagination import DefaultPagination
from medilink.core.serializers import ErrorSerializer
from medilink.core.throttling import BurstRateThrottle
from medilink.masterdata.serializers import request_language
from medilink.onboarding import serializers as s
from medilink.onboarding import services
from medilink.onboarding.models import (
    Application,
    ApplicationDocument,
    ApplicationEvent,
    ApplicationStatus,
    EventKind,
    FacilityFeatureFlag,
    FacilityLicence,
    FacilityStatusEvent,
    FeatureFlag,
)
from medilink.onboarding.views_public import IDEMPOTENCY, add_document, idempotency_key
from medilink.tenancy.models import Facility
from medilink.uploads.serializers import DownloadLinkRequestSerializer, DownloadLinkSerializer
from medilink.uploads.services import NotClean, download_link
from medilink.uploads.throttling import UploadRateThrottle

TAG = ["platform"]
STEP_UP = RecentAuthRequired()


def _err(description: str) -> OpenApiResponse:
    return OpenApiResponse(response=ErrorSerializer, description=description)


def _actor(request: Request) -> Any:
    principal = get_principal(request)
    if principal is None or principal.user is None:
        raise exceptions.NotAuthenticated()
    return principal.user


def _application(application_id: Any, lock: bool = False) -> Application:
    qs = Application.objects.select_related("reviewer")
    if lock:
        qs = qs.select_for_update(of=("self",))
    application = qs.filter(pk=application_id).first()
    if application is None:
        raise Http404
    return application


def _platform_data(request: Request, application: Application) -> dict[str, Any]:
    application.refresh_from_db()
    return s.application_data(application, platform=True, language=request_language(request))


class _Platform(APIView):
    permission_classes = [PlatformAdmin]
    parser_classes = [JSONParser]


class _StepUp(_Platform):
    permission_classes = [PlatformAdmin, STEP_UP]


# ---- overview and applications ------------------------------------------------------------------


class OverviewView(_Platform):
    @extend_schema(
        tags=TAG, operation_id="platform_overview", responses={200: s.OverviewSerializer}
    )
    def get(self, request: Request) -> Response:
        return Response(s.overview_data())


class ApplicationsView(GenericAPIView):
    permission_classes = [PlatformAdmin]
    parser_classes = [JSONParser]
    pagination_class = DefaultPagination

    def get_queryset(self) -> QuerySet[Application]:
        params = self.request.query_params
        qs = Application.objects.select_related("reviewer")
        statuses = params.getlist("status")
        if statuses:
            qs = qs.filter(status__in=statuses)
        else:
            qs = qs.exclude(status=ApplicationStatus.DRAFT)  # drafts only when asked for
        if params.get("district"):
            qs = qs.filter(district_code=params["district"])
        if params.get("facility_type"):
            qs = qs.filter(facility_type=params["facility_type"])
        if params.get("created_by_platform") in ("true", "false"):
            qs = qs.filter(
                created_by_platform_admin__isnull=params["created_by_platform"] == "false"
            )
        q = params.get("q", "").strip()[:100]
        if q:
            qs = qs.filter(Q(facility_name__icontains=q) | Q(applicant_name__icontains=q))
        ordering = params.get("ordering", "submitted_at")
        allowed = {"submitted_at", "-submitted_at", "last_activity_at", "-last_activity_at"}
        return qs.order_by(ordering if ordering in allowed else "submitted_at", "created_at")

    @extend_schema(
        tags=TAG,
        operation_id="platform_facility_applications_list",
        parameters=[
            OpenApiParameter("status", str, many=True, enum=ApplicationStatus.values),
            OpenApiParameter("district", str),
            OpenApiParameter("facility_type", str),
            OpenApiParameter("created_by_platform", bool),
            OpenApiParameter("q", str),
            OpenApiParameter(
                "ordering",
                str,
                enum=["submitted_at", "-submitted_at", "last_activity_at", "-last_activity_at"],
            ),
        ],
        responses={200: s.ApplicationSummarySerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        page = self.paginate_queryset(self.get_queryset()) or []
        return self.get_paginated_response([s.summary_data(a) for a in page])

    @extend_schema(
        tags=TAG,
        operation_id="platform_facility_applications_create",
        request=s.PlatformCreateInput,
        responses={201: s.PlatformApplicationSerializer, 400: _err("Validation error")},
        summary="Create an application on the facility's behalf",
    )
    def post(self, request: Request) -> Response:
        body = s.PlatformCreateInput(data=request.data)
        body.is_valid(raise_exception=True)
        data = dict(body.validated_data)
        send_link = data.pop("send_link")
        application = services.create_by_platform(
            data=data, actor=_actor(request), send_link=send_link, request=request
        )
        return Response(_platform_data(request, application), status=status.HTTP_201_CREATED)


class ApplicationView(_Platform):
    @extend_schema(
        tags=TAG,
        operation_id="platform_facility_application_retrieve",
        responses={200: s.PlatformApplicationSerializer, 404: _err("Not found")},
    )
    def get(self, request: Request, application_id: Any) -> Response:
        return Response(_platform_data(request, _application(application_id)))

    @extend_schema(
        tags=TAG,
        operation_id="platform_facility_application_update",
        request=s.ApplicationPatchInput,
        responses={
            200: s.PlatformApplicationSerializer,
            400: _err("Validation error"),
            409: _err("Version conflict"),
            422: _err("Not editable"),
        },
    )
    def patch(self, request: Request, application_id: Any) -> Response:
        body = s.ApplicationPatchInput(data=request.data)
        body.is_valid(raise_exception=True)
        application = _application(application_id, lock=True)
        data = dict(body.validated_data)
        version = data.pop("version")
        services.update_application(
            application, data, version=version, actor=_actor(request), request=request
        )
        return Response(_platform_data(request, application))


class DocumentsView(_Platform):
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [BurstRateThrottle, UploadRateThrottle]

    @extend_schema(
        tags=TAG,
        operation_id="platform_facility_application_document_create",
        request={"multipart/form-data": s.DocumentInput},
        parameters=[IDEMPOTENCY],
        responses={201: s.ApplicationDocumentSerializer, 400: _err("Type, size or kind")},
    )
    def post(self, request: Request, application_id: Any) -> Response:
        application = _application(application_id, lock=True)
        return Response(
            add_document(request, application, actor=_actor(request)),
            status=status.HTTP_201_CREATED,
        )


class SendResumeLinkView(_Platform):
    @extend_schema(
        tags=TAG,
        operation_id="platform_facility_application_send_resume_link",
        request=None,
        responses={
            202: OpenApiResponse(description="Sent"),
            422: _err("Not draft or changes requested"),
        },
    )
    def post(self, request: Request, application_id: Any) -> Response:
        services.send_resume_link(
            _application(application_id), actor=_actor(request), request=request
        )
        return Response(status=status.HTTP_202_ACCEPTED)


class StartReviewView(_Platform):
    @extend_schema(
        tags=TAG,
        operation_id="platform_facility_application_start_review",
        request=s.VersionInput,
        responses={
            200: s.PlatformApplicationSerializer,
            409: _err("Conflict"),
            422: _err("Status"),
        },
    )
    def post(self, request: Request, application_id: Any) -> Response:
        body = s.VersionInput(data=request.data)
        body.is_valid(raise_exception=True)
        application = _application(application_id, lock=True)
        services.start_review(
            application,
            version=body.validated_data["version"],
            actor=_actor(request),
            request=request,
        )
        return Response(_platform_data(request, application))


def _app_document(application_id: Any, document_id: Any) -> ApplicationDocument:
    document = (
        ApplicationDocument.objects.current()
        .select_related("file", "application")
        .filter(application_id=application_id, pk=document_id)
        .first()
    )
    if document is None:
        raise Http404
    return document


class DocumentReviewView(_Platform):
    @extend_schema(
        tags=TAG,
        operation_id="platform_facility_application_document_review",
        request=s.DocumentReviewInput,
        responses={200: s.ApplicationDocumentSerializer, 422: _err("Not under review")},
    )
    def post(self, request: Request, application_id: Any, document_id: Any) -> Response:
        body = s.DocumentReviewInput(data=request.data)
        body.is_valid(raise_exception=True)
        document = services.review_document(
            _app_document(application_id, document_id),
            review_status=body.validated_data["review_status"],
            comment=body.validated_data.get("comment", ""),
            actor=_actor(request),
            request=request,
        )
        return Response(s.document_data(document))


class DocumentLinkView(_Platform):
    @extend_schema(
        tags=TAG,
        operation_id="platform_facility_application_document_download_link",
        request=DownloadLinkRequestSerializer,
        responses={200: DownloadLinkSerializer, 404: _err("Not found"), 422: _err("Not clean")},
    )
    def post(self, request: Request, application_id: Any, document_id: Any) -> Response:
        body = DownloadLinkRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        document = _app_document(application_id, document_id)
        actor = _actor(request)
        try:
            link = download_link(
                document.file,
                disposition=body.validated_data["disposition"],
                request=request,
                actor=actor,
            )
        except NotClean:
            raise BusinessRuleViolation() from None
        record(
            "facility_application.document_viewed",
            request=request,
            actor=actor,
            object_type="facility_application",
            object_id=document.application_id,
            metadata={"document_id": document.pk},
        )
        return Response(DownloadLinkSerializer(link).data)


class RequestChangesView(_Platform):
    @extend_schema(
        tags=TAG,
        operation_id="platform_facility_application_request_changes",
        request=s.RequestChangesInput,
        parameters=[IDEMPOTENCY],
        responses={
            200: s.PlatformApplicationSerializer,
            409: _err("Conflict"),
            422: _err("Status"),
        },
    )
    def post(self, request: Request, application_id: Any) -> Response:
        body = s.RequestChangesInput(data=request.data)
        body.is_valid(raise_exception=True)
        application = _application(application_id, lock=True)
        services.request_changes(
            application,
            version=body.validated_data["version"],
            general_comment=body.validated_data.get("general_comment", ""),
            items=[dict(item) for item in body.validated_data["items"]],
            actor=_actor(request),
            idempotency_key=idempotency_key(request),
            request=request,
        )
        return Response(_platform_data(request, application))


class ApproveView(_StepUp):
    @extend_schema(
        tags=TAG,
        operation_id="platform_facility_application_approve",
        request=s.ApproveInput,
        parameters=[IDEMPOTENCY],
        responses={
            200: s.ApproveResultSerializer,
            400: _err("fields.slug taken"),
            403: _err("step_up_required"),
            409: _err("Conflict"),
            422: _err("Approval gate"),
        },
    )
    def post(self, request: Request, application_id: Any) -> Response:
        body = s.ApproveInput(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        application = _application(application_id, lock=True)
        application, facility = services.approve(
            application,
            version=data["version"],
            slug=data["slug"],
            organization_name=data["organization_name"],
            facility_type=data["facility_type"],
            ownership=data["ownership"],
            licences=[dict(lic) for lic in data["licences"]],
            actor=_actor(request),
            idempotency_key=idempotency_key(request),
            request=request,
        )
        return Response(
            {
                "application": _platform_data(request, application),
                "facility": s.facility_data(facility),
            }
        )


class RejectView(_StepUp):
    @extend_schema(
        tags=TAG,
        operation_id="platform_facility_application_reject",
        request=s.ReasonInput,
        parameters=[IDEMPOTENCY],
        responses={
            200: s.PlatformApplicationSerializer,
            400: _err("Reason"),
            403: _err("step_up_required"),
            409: _err("Conflict"),
            422: _err("Status"),
        },
    )
    def post(self, request: Request, application_id: Any) -> Response:
        body = s.ReasonInput(data=request.data)
        body.is_valid(raise_exception=True)
        application = _application(application_id, lock=True)
        services.reject(
            application,
            version=body.validated_data["version"],
            reason_code=body.validated_data["reason_code"],
            reason_text=body.validated_data.get("reason_text", ""),
            actor=_actor(request),
            idempotency_key=idempotency_key(request),
            request=request,
        )
        return Response(_platform_data(request, application))


class NotesView(_Platform):
    @extend_schema(
        tags=TAG,
        operation_id="platform_facility_application_notes_list",
        responses={200: s.ApplicationEventSerializer(many=True)},
    )
    def get(self, request: Request, application_id: Any) -> Response:
        application = _application(application_id)
        notes = ApplicationEvent.objects.filter(application=application, kind=EventKind.NOTE)
        return Response(
            [s.event_data(e) for e in notes.select_related("actor").order_by("occurred_at")]
        )

    @extend_schema(
        tags=TAG,
        operation_id="platform_facility_application_notes_create",
        request=s.NoteInput,
        responses={201: s.ApplicationEventSerializer, 400: _err("Validation error")},
    )
    def post(self, request: Request, application_id: Any) -> Response:
        body = s.NoteInput(data=request.data)
        body.is_valid(raise_exception=True)
        event = services.add_note(
            _application(application_id),
            note_kind=body.validated_data["note_kind"],
            text=body.validated_data["text"],
            occurred_on=body.validated_data.get("occurred_on"),
            actor=_actor(request),
            request=request,
        )
        return Response(s.event_data(event), status=status.HTTP_201_CREATED)


class EventsView(_Platform):
    @extend_schema(
        tags=TAG,
        operation_id="platform_facility_application_events",
        responses={200: s.ApplicationEventSerializer(many=True)},
    )
    def get(self, request: Request, application_id: Any) -> Response:
        application = _application(application_id)
        events = ApplicationEvent.objects.filter(application=application).select_related("actor")
        return Response([s.event_data(e) for e in events.order_by("occurred_at")])


# ---- facilities ----------------------------------------------------------------------------------


def _facility(facility_id: Any) -> Facility:
    facility = Facility.objects.filter(pk=facility_id).first()
    if facility is None:
        raise Http404
    return facility


class FacilitiesView(GenericAPIView):
    permission_classes = [PlatformAdmin]
    pagination_class = DefaultPagination

    def get_queryset(self) -> QuerySet[Facility]:
        params = self.request.query_params
        qs = Facility.objects.all()
        if params.get("status"):
            qs = qs.filter(status=params["status"])
        if params.get("facility_type"):
            qs = qs.filter(facility_type=params["facility_type"])
        if params.get("district"):
            ids = Application.objects.filter(district_code=params["district"]).values("facility_id")
            qs = qs.filter(pk__in=ids)
        q = params.get("q", "").strip()[:100]
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(slug__icontains=q))
        ordering = params.get("ordering", "name")
        return qs.order_by(
            ordering if ordering in {"name", "-name", "created_at", "-created_at"} else "name"
        )

    @extend_schema(
        tags=TAG,
        operation_id="platform_facilities_list",
        parameters=[
            OpenApiParameter("status", str),
            OpenApiParameter("facility_type", str),
            OpenApiParameter("district", str),
            OpenApiParameter(
                "licence_state", str, enum=["valid", "expiring", "expired", "missing"]
            ),
            OpenApiParameter("q", str),
            OpenApiParameter(
                "ordering",
                str,
                enum=["name", "-name", "created_at", "-created_at", "next_licence_expiry"],
            ),
        ],
        responses={200: s.PlatformFacilitySerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        rows = [s.facility_data(f) for f in self.get_queryset()]
        state = request.query_params.get("licence_state")
        if state:
            rows = [r for r in rows if r["licence_state"] == state]
        if request.query_params.get("ordering") == "next_licence_expiry":
            rows.sort(
                key=lambda r: (r["next_licence_expiry"] is None, r["next_licence_expiry"] or "")
            )
        page = self.paginate_queryset(rows)
        return self.get_paginated_response(page)


class FacilityView(_Platform):
    @extend_schema(
        tags=TAG,
        operation_id="platform_facility_retrieve",
        responses={200: s.PlatformFacilityDetailSerializer, 404: _err("Not found")},
    )
    def get(self, request: Request, facility_id: Any) -> Response:
        return Response(s.facility_data(_facility(facility_id), detail=True))


class StatusEventsView(_Platform):
    @extend_schema(
        tags=TAG,
        operation_id="platform_facility_status_events",
        responses={200: s.StatusEventSerializer(many=True)},
    )
    def get(self, request: Request, facility_id: Any) -> Response:
        facility = _facility(facility_id)
        events = FacilityStatusEvent.objects.filter(facility=facility).select_related("actor")
        language = request_language(request)
        return Response([s.status_event_data(e, language) for e in events.order_by("occurred_at")])


def _status_view(action: str, needs_step_up: bool, body_class: type) -> type[APIView]:
    def post(self: Any, request: Request, facility_id: Any) -> Response:
        body = body_class(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        try:
            facility = services.change_facility_status(
                _facility(facility_id),
                action,
                version=data["version"],
                actor=_actor(request),
                reason_code=data.get("reason_code", ""),
                reason_text=data.get("reason_text", ""),
                confirm_slug=data.get("confirm_slug"),
                idempotency_key=idempotency_key(request),
                request=request,
            )
        except services.GoLiveFailed as exc:
            fields = {
                f"checks.{code}": [p["message"] for p in problems]
                for code, problems in exc.failing.items()
            }
            return error_response(422, "business_rule_violation", exc.detail, fields)
        return Response(s.facility_data(facility))

    name = "".join(part.title() for part in action.split("_")) + "View"
    view = type(
        name,
        (_StepUp if needs_step_up else _Platform,),
        {
            "post": extend_schema(
                tags=TAG,
                operation_id=f"platform_facility_{action}",
                request=body_class,
                parameters=[IDEMPOTENCY],
                responses={
                    200: s.PlatformFacilitySerializer,
                    400: _err("Reason or confirmation"),
                    403: _err("step_up_required"),
                    409: _err("Conflict"),
                    422: _err("Status or failing go-live checks"),
                },
            )(post)
        },
    )
    return view


StartSetupView = _status_view("start_setup", False, s.VersionInput)
GoLiveView = _status_view("go_live", True, s.VersionInput)
SuspendView = _status_view("suspend", True, s.ReasonInput)
ReactivateView = _status_view("reactivate", True, s.ReasonInput)
DeactivateView = _status_view("deactivate", True, s.DeactivateInput)


class LicencesView(_Platform):
    permission_classes = [PlatformAdmin, RecentAuthRequired(methods=("POST",))]

    @extend_schema(
        tags=TAG,
        operation_id="platform_facility_licences_list",
        responses={200: s.LicenceSerializer(many=True)},
    )
    def get(self, request: Request, facility_id: Any) -> Response:
        facility = _facility(facility_id)
        licences = FacilityLicence.objects.filter(facility=facility).select_related("verified_by")
        return Response([s.licence_data(lic) for lic in licences.order_by("-created_at")])

    @extend_schema(
        tags=TAG,
        operation_id="platform_facility_licences_create",
        request=s.NewLicenceInput,
        responses={
            201: s.LicenceSerializer,
            400: _err("Validation error"),
            403: _err("step_up_required"),
            422: _err("Renewing a superseded licence"),
        },
    )
    def post(self, request: Request, facility_id: Any) -> Response:
        body = s.NewLicenceInput(data=request.data)
        body.is_valid(raise_exception=True)
        licence = services.add_licence(
            _facility(facility_id), data=body.validated_data, actor=_actor(request), request=request
        )
        return Response(s.licence_data(licence), status=status.HTTP_201_CREATED)


class LicenceView(_StepUp):
    @extend_schema(
        tags=TAG,
        operation_id="platform_facility_licence_update",
        request=s.LicencePatchInput,
        responses={200: s.LicenceSerializer, 409: _err("Conflict"), 422: _err("Superseded")},
        summary="Correct a licence (a renewal is a new licence)",
    )
    def patch(self, request: Request, facility_id: Any, licence_id: Any) -> Response:
        body = s.LicencePatchInput(data=request.data)
        body.is_valid(raise_exception=True)
        licence = FacilityLicence.objects.filter(pk=licence_id, facility_id=facility_id).first()
        if licence is None:
            raise Http404
        data = dict(body.validated_data)
        version = data.pop("version")
        licence = services.correct_licence(
            licence, data=data, version=version, actor=_actor(request), request=request
        )
        return Response(s.licence_data(licence))


def _flag(code: str) -> FeatureFlag:
    flag = FeatureFlag.objects.filter(code=code, is_active=True).first()
    if flag is None:
        raise Http404
    return flag


class FacilityFlagsView(_Platform):
    @extend_schema(
        tags=TAG,
        operation_id="platform_facility_feature_flags",
        responses={200: s.FacilityFeatureFlagSerializer(many=True)},
    )
    def get(self, request: Request, facility_id: Any) -> Response:
        facility = _facility(facility_id)
        overrides = {
            o.flag_id: o
            for o in FacilityFeatureFlag.objects.filter(facility=facility).select_related("set_by")
        }
        flags = FeatureFlag.objects.filter(is_active=True).order_by("code")
        return Response([s.facility_flag_data(f, overrides.get(f.pk)) for f in flags])


class FacilityFlagView(_StepUp):
    @extend_schema(
        tags=TAG,
        operation_id="platform_facility_feature_flag_set",
        request=s.FacilityFlagInput,
        responses={200: s.FacilityFeatureFlagSerializer, 404: _err("Unknown flag")},
    )
    def put(self, request: Request, facility_id: Any, code: str) -> Response:
        body = s.FacilityFlagInput(data=request.data)
        body.is_valid(raise_exception=True)
        flag = _flag(code)
        override = services.set_facility_flag(
            _facility(facility_id),
            flag,
            is_enabled=body.validated_data["is_enabled"],
            note=body.validated_data.get("note", ""),
            actor=_actor(request),
            request=request,
        )
        return Response(s.facility_flag_data(flag, override))

    @extend_schema(
        tags=TAG,
        operation_id="platform_facility_feature_flag_clear",
        responses={
            204: OpenApiResponse(description="Back to the default"),
            404: _err("Unknown flag"),
        },
    )
    def delete(self, request: Request, facility_id: Any, code: str) -> Response:
        services.clear_facility_flag(
            _facility(facility_id), _flag(code), actor=_actor(request), request=request
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class FlagsView(_Platform):
    @extend_schema(
        tags=TAG,
        operation_id="platform_feature_flags_list",
        responses={200: s.FeatureFlagSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        return Response([s.flag_data(f) for f in FeatureFlag.objects.order_by("code")])


class FlagView(_Platform):
    permission_classes = [PlatformAdmin, RecentAuthRequired(methods=("PATCH",))]

    @extend_schema(
        tags=TAG,
        operation_id="platform_feature_flag_update",
        request=s.FlagPatchInput,
        responses={200: s.FeatureFlagSerializer, 404: _err("Unknown flag"), 409: _err("Conflict")},
    )
    def patch(self, request: Request, code: str) -> Response:
        body = s.FlagPatchInput(data=request.data)
        body.is_valid(raise_exception=True)
        flag = FeatureFlag.objects.filter(code=code).first()
        if flag is None:
            raise Http404
        data = dict(body.validated_data)
        version = data.pop("version")
        flag = services.update_flag(
            flag, data=data, version=version, actor=_actor(request), request=request
        )
        return Response(s.flag_data(flag))
