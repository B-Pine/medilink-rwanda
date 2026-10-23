"""Public facility application endpoints (contract §3.2). "Applicant" = the applicant cookie
matches this application, otherwise 404."""

from __future__ import annotations

from typing import Any

from django.db import transaction
from django.http import Http404
from django.utils.translation import gettext_lazy as _
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import exceptions, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from medilink.audit.services import record
from medilink.authz.permissions import PublicEndpoint
from medilink.core.serializers import ErrorSerializer
from medilink.core.throttling import BurstRateThrottle
from medilink.masterdata.serializers import request_language
from medilink.onboarding import applicant, services
from medilink.onboarding import serializers as s
from medilink.onboarding.models import Application, ApplicationDocument
from medilink.onboarding.throttling import (
    ApplicationEmailThrottle,
    ApplicationIPThrottle,
    ResumeEmailThrottle,
    ResumeIPThrottle,
)
from medilink.uploads.services import UploadRejected
from medilink.uploads.throttling import UploadRateThrottle

INVALID_LINK = _("This link is invalid or has expired. Ask for a new link.")
TAG = ["facility-applications"]
IDEMPOTENCY = OpenApiParameter("Idempotency-Key", str, OpenApiParameter.HEADER)


def _err(description: str) -> OpenApiResponse:
    return OpenApiResponse(response=ErrorSerializer, description=description)


def idempotency_key(request: Request) -> str | None:
    return request.headers.get("Idempotency-Key", "").strip()[:200] or None


def respond(request: Request, data: Any, status_code: int = 200) -> Response:
    """Response that slides the applicant cookie."""
    response = Response(data, status=status_code)
    token = getattr(request._request, "_applicant_token", None)
    if token:
        applicant.set_cookie(response, token)
    return response


def app_data(request: Request, application: Application) -> dict[str, Any]:
    application.refresh_from_db()
    return s.application_data(application, language=request_language(request))


class _Public(APIView):
    permission_classes = [PublicEndpoint]
    authentication_classes: list[Any] = []


class StartView(_Public):
    throttle_classes = [BurstRateThrottle, ApplicationIPThrottle, ApplicationEmailThrottle]

    @extend_schema(
        tags=TAG,
        operation_id="public_facility_application_start",
        request=s.StartApplicationInput,
        responses={201: s.ApplicantApplicationSerializer, 400: _err("Validation error")},
        summary="Start a facility application (sets the applicant cookie, emails a resume link)",
    )
    def post(self, request: Request) -> Response:
        body = s.StartApplicationInput(data=request.data)
        body.is_valid(raise_exception=True)
        if body.validated_data.get("website"):  # honeypot: pretend it worked
            raise exceptions.ValidationError({"website": ["Leave this field empty."]})
        application = services.start_application(
            applicant=body.validated_data["applicant"],
            facility_name=body.validated_data["facility_name"],
            preferred_language=body.validated_data["preferred_language"],
            request=request,
        )
        token = applicant.start_session(application)
        response = Response(app_data(request, application), status=status.HTTP_201_CREATED)
        applicant.set_cookie(response, token)
        return response


class ResumeLinksView(_Public):
    throttle_classes = [BurstRateThrottle, ResumeIPThrottle, ResumeEmailThrottle]

    @extend_schema(
        tags=TAG,
        operation_id="public_facility_application_resume_links",
        request=s.EmailInput,
        responses={202: OpenApiResponse(description="Always accepted (no enumeration)")},
        summary="Email a resume link for each open application of this address",
    )
    def post(self, request: Request) -> Response:
        body = s.EmailInput(data=request.data)
        body.is_valid(raise_exception=True)
        services.request_resume_links(body.validated_data["email"])
        return Response(status=status.HTTP_202_ACCEPTED)


class ResumeView(_Public):
    throttle_classes = [BurstRateThrottle, ResumeIPThrottle]

    @extend_schema(
        tags=TAG,
        operation_id="public_facility_application_resume",
        request=s.TokenInput,
        responses={200: s.ApplicantApplicationSerializer, 400: _err("Invalid or expired link")},
        summary="Exchange a resume token for an applicant session",
    )
    def post(self, request: Request) -> Response:
        body = s.TokenInput(data=request.data)
        body.is_valid(raise_exception=True)
        with transaction.atomic():
            application = applicant.redeem_resume_token(body.validated_data["token"])
            if application is None:
                raise exceptions.ValidationError({"token": [str(INVALID_LINK)]})
            token = applicant.start_session(application)
            record(
                "facility_application.resumed",
                request=request,
                actor_role="applicant",
                object_type="facility_application",
                object_id=application.pk,
            )
        response = Response(app_data(request, application))
        applicant.set_cookie(response, token)
        return response


class ApplicationView(_Public):
    parser_classes = [JSONParser]

    @extend_schema(
        tags=TAG,
        operation_id="public_facility_application_retrieve",
        responses={200: s.ApplicantApplicationSerializer, 404: _err("Not found")},
    )
    def get(self, request: Request, application_id: Any) -> Response:
        application = applicant.application_for_request(request._request, application_id)
        return respond(request, app_data(request, application))

    @extend_schema(
        tags=TAG,
        operation_id="public_facility_application_update",
        request=s.ApplicationPatchInput,
        responses={
            200: s.ApplicantApplicationSerializer,
            400: _err("Validation error"),
            409: _err("Version conflict"),
            422: _err("Not editable"),
        },
        summary="Autosave",
    )
    def patch(self, request: Request, application_id: Any) -> Response:
        body = s.ApplicationPatchInput(data=request.data)
        body.is_valid(raise_exception=True)
        application = applicant.application_for_request(request._request, application_id, lock=True)
        data = dict(body.validated_data)
        version = data.pop("version")
        services.update_application(application, data, version=version)
        return respond(request, app_data(request, application))


class DocumentsView(_Public):
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [BurstRateThrottle, UploadRateThrottle]

    @property
    def upload_throttle_application_id(self) -> Any:
        return self.kwargs.get("application_id")

    @extend_schema(
        tags=TAG,
        operation_id="public_facility_application_document_create",
        request={"multipart/form-data": s.DocumentInput},
        parameters=[IDEMPOTENCY],
        responses={
            201: s.ApplicationDocumentSerializer,
            400: _err("Type, size or kind"),
            422: _err("Not editable or limits reached"),
        },
    )
    def post(self, request: Request, application_id: Any) -> Response:
        application = applicant.application_for_request(request._request, application_id, lock=True)
        return respond(
            request,
            add_document(request, application, actor=None),
            status.HTTP_201_CREATED,
        )


def add_document(request: Request, application: Application, actor: Any) -> dict[str, Any]:
    body = s.DocumentInput(data=request.data)
    body.is_valid(raise_exception=True)
    data = dict(body.validated_data)
    try:
        document = services.add_document(
            application,
            django_file=data.pop("file"),
            actor=actor,
            idempotency_key=idempotency_key(request),
            request=request,
            **data,
        )
    except UploadRejected as exc:
        raise exceptions.ValidationError({exc.field: [str(exc.message)]}) from None
    return s.document_data(document)


def _document(application: Application, document_id: Any) -> ApplicationDocument:
    document = (
        ApplicationDocument.objects.current()
        .select_related("file", "application")
        .filter(application=application, pk=document_id)
        .first()
    )
    if document is None:
        raise Http404
    return document


class DocumentView(_Public):
    parser_classes = [JSONParser]

    @extend_schema(
        tags=TAG,
        operation_id="public_facility_application_document_update",
        request=s.DocumentPatchInput,
        responses={200: s.ApplicationDocumentSerializer, 422: _err("Not editable")},
    )
    def patch(self, request: Request, application_id: Any, document_id: Any) -> Response:
        body = s.DocumentPatchInput(data=request.data)
        body.is_valid(raise_exception=True)
        application = applicant.application_for_request(request._request, application_id)
        document = services.update_document(
            _document(application, document_id), body.validated_data
        )
        return respond(request, s.document_data(document))

    @extend_schema(
        tags=TAG,
        operation_id="public_facility_application_document_delete",
        responses={204: OpenApiResponse(description="Deleted"), 422: _err("Not editable")},
    )
    def delete(self, request: Request, application_id: Any, document_id: Any) -> Response:
        application = applicant.application_for_request(request._request, application_id)
        services.delete_document(_document(application, document_id))
        return respond(request, None, status.HTTP_204_NO_CONTENT)


class SubmitView(_Public):
    parser_classes = [JSONParser]

    @extend_schema(
        tags=TAG,
        operation_id="public_facility_application_submit",
        request=s.SubmitInput,
        parameters=[IDEMPOTENCY],
        responses={
            200: s.ApplicantApplicationSerializer,
            400: _err("Missing items as dotted fields"),
            409: _err("Version conflict"),
            422: _err("Uploads not yet clean"),
        },
    )
    def post(self, request: Request, application_id: Any) -> Response:
        body = s.SubmitInput(data=request.data)
        body.is_valid(raise_exception=True)
        application = applicant.application_for_request(request._request, application_id, lock=True)
        services.submit(
            application,
            version=body.validated_data["version"],
            terms_version=body.validated_data["accepted_terms_version"],
            dpa_version=body.validated_data["accepted_dpa_version"],
            ncsa_confirmed=body.validated_data["ncsa_registration_confirmed"],
            idempotency_key=idempotency_key(request),
            request=request,
        )
        return respond(request, app_data(request, application))


class EndSessionView(_Public):
    @extend_schema(
        tags=TAG,
        operation_id="public_facility_application_end_session",
        request=None,
        responses={204: OpenApiResponse(description="Applicant session ended")},
        summary="Continue later (shared computers)",
    )
    def post(self, request: Request, application_id: Any) -> Response:
        try:
            application = applicant.application_for_request(request._request, application_id)
        except Http404:
            application = None
        if application is not None:
            applicant.end_session(application)
        response = Response(status=status.HTTP_204_NO_CONTENT)
        applicant.clear_cookie(response)
        return response
