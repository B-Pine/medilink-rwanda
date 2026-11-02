"""S7b patient and public endpoints (contract sprint-07 §3.3 D4, D5, V1).

Patients: `documents_patient_documents(account)` (SECURITY DEFINER) lists the released documents
of their profiles (self and guardian; delegates only when the consultation is not restricted);
each one is then read in its facility's RLS context.

Public: verification shows a minimal projection by code and the details only after a
date-of-birth match; every attempt, rate-limited or not, goes to `documents_verification_log`.
A share link opens one document until it expires or is revoked.
"""

from __future__ import annotations

from typing import Any

from django.db import connection, connections, transaction
from django.db.models import F
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import exceptions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from medilink.audit.services import record
from medilink.authz.permissions import IsPatientAuthenticated, PublicEndpoint
from medilink.core.exceptions import error_payload
from medilink.documents import serializers as s
from medilink.documents import services
from medilink.documents.models import (
    Document,
    ShareLink,
    VerificationLog,
    VerificationRecord,
    VerificationResult,
)
from medilink.documents.views import document_data
from medilink.facilities.views_base import err
from medilink.patients.errors import PatientsAPIView
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import Facility
from medilink.uploads.throttling import EnvRateThrottle

TAGS = ["patient-documents"]
DOB_MISMATCH = _("That date of birth doesn't match this document.")


def readable_documents(account_id: Any) -> list[tuple[Any, Any, Any]]:
    """(document_id, facility_id, patient_id), newest first."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT document_id, facility_id, patient_id FROM documents_patient_documents(%s)",
            [account_id],
        )
        return list(cursor.fetchall())


def _load(document_id: Any, facility_id: Any, user_id: Any) -> Document:
    with rls_context(facility_id=facility_id, user_id=user_id):
        return (
            Document.objects.select_related("verification", "patient")
            .prefetch_related("versions")
            .get(pk=document_id)
        )


def _facility_name(facility_id: Any) -> str:
    return str(Facility.objects.values_list("name", flat=True).get(pk=facility_id))


class PatientDocumentsBase(PatientsAPIView):
    permission_classes = [IsPatientAuthenticated]

    def find(self, document_id: Any) -> tuple[Any, Any]:
        for doc_id, facility_id, _patient in readable_documents(self.request.user.pk):
            if str(doc_id) == str(document_id):
                return doc_id, facility_id
        raise exceptions.NotFound()

    def data(self, document_id: Any) -> dict[str, Any]:
        doc_id, facility_id = self.find(document_id)
        d = _load(doc_id, facility_id, self.request.user.pk)
        links = ShareLink.objects.filter(
            document_id=doc_id, created_by_account_id=self.request.user.pk
        ).order_by("-created_at")
        return {
            **document_data(d, _facility_name(facility_id)),
            "share_links": [
                {
                    "id": link.pk,
                    "expires_at": link.expires_at,
                    "revoked_at": link.revoked_at,
                    "access_count": link.access_count,
                    "last_accessed_at": link.last_accessed_at,
                }
                for link in links
            ],
        }


class PatientDocumentsView(PatientDocumentsBase):
    @extend_schema(
        operation_id="patient_documents",
        tags=TAGS,
        parameters=[
            OpenApiParameter("patient_id", str),
            OpenApiParameter("kind", str),
            OpenApiParameter("page", int),
            OpenApiParameter("page_size", int),
        ],
        responses={200: s.DocumentRowSerializer(many=True)},
        summary="Documents of my profiles, newest first (D4)",
    )
    def get(self, request: Request) -> Response:
        from medilink.core.pagination import DefaultPagination
        from medilink.documents.views import document_row, verification_of

        rows = readable_documents(request.user.pk)
        wanted = request.query_params.get("patient_id")
        if wanted:
            rows = [r for r in rows if str(r[2]) == wanted]
        kind = request.query_params.get("kind")
        paginator = DefaultPagination()
        loaded = [(_load(d, f, request.user.pk), f) for d, f, _p in rows]
        if kind:
            loaded = [(d, f) for d, f in loaded if d.kind == kind]
        page = paginator.paginate_queryset(loaded, request, view=self) or []
        names: dict[Any, str] = {}
        data = []
        for d, f in page:
            names.setdefault(f, _facility_name(f))
            data.append(s.DocumentRowSerializer(document_row(d, verification_of(d), names[f])).data)
        return paginator.get_paginated_response(data)


class PatientDocumentView(PatientDocumentsBase):
    @extend_schema(
        operation_id="patient_document",
        tags=TAGS,
        responses={200: s.PatientDocumentSerializer},
        summary="One document with its versions and my share links (D4)",
    )
    def get(self, request: Request, document_id: Any) -> Response:
        return Response(s.PatientDocumentSerializer(self.data(document_id)).data)


class PatientDownloadLinkView(PatientDocumentsBase):
    @extend_schema(
        operation_id="patient_document_download_link",
        tags=TAGS,
        request=None,
        responses={200: s.LinkSerializer, 422: err("Still rendering")},
        summary="Signed link to the current version, 5 minutes (D4)",
    )
    def post(self, request: Request, document_id: Any) -> Response:
        doc_id, facility_id = self.find(document_id)
        with rls_context(facility_id=facility_id, user_id=request.user.pk):
            d = Document.objects.get(pk=doc_id)
            link = services.download_link(d)
            services._audit("documents.downloaded", d, request, by="patient")
        return Response(s.LinkSerializer({"url": link.url, "expires_at": link.expires_at}).data)


class PatientArchiveView(PatientDocumentsBase):
    @extend_schema(
        operation_id="patient_documents_archive",
        tags=TAGS,
        request=None,
        parameters=[OpenApiParameter("patient_id", str)],
        responses={200: s.LinkSerializer},
        summary="All my documents as a ZIP: a 5-minute link (D4); 100 at most",
    )
    def post(self, request: Request) -> Response:
        rows = readable_documents(request.user.pk)
        wanted = request.query_params.get("patient_id")
        if wanted:
            rows = [r for r in rows if str(r[2]) == wanted]
        files: list[tuple[str, str]] = []
        for doc_id, facility_id, _p in rows[: services.ARCHIVE_LIMIT]:
            with rls_context(facility_id=facility_id, user_id=request.user.pk):
                d = Document.objects.get(pk=doc_id)
                version = d.versions.filter(superseded_at__isnull=True).first()
                if version is not None:  # still rendering: left out
                    files.append((services.filename(d), version.storage_key))
        link = services.archive(files)
        return Response(s.LinkSerializer({"url": link.url, "expires_at": link.expires_at}).data)


class ShareLinksView(PatientDocumentsBase):
    @extend_schema(
        operation_id="patient_document_share_link_create",
        tags=TAGS,
        request=s.ShareLinkCreateSerializer,
        responses={201: s.NewShareLinkSerializer},
        summary="Expiring share link for one document; the token is shown once (D5)",
    )
    def post(self, request: Request, document_id: Any) -> Response:
        body = s.ShareLinkCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        doc_id, facility_id = self.find(document_id)
        with rls_context(facility_id=facility_id, user_id=request.user.pk):
            d = Document.objects.get(pk=doc_id)
            new = services.share(
                d,
                account=request.user,
                days=body.validated_data["expires_in_days"],
                request=request,
            )
        from django.conf import settings

        link = new.link
        data = {
            "id": link.pk,
            "expires_at": link.expires_at,
            "revoked_at": None,
            "access_count": 0,
            "last_accessed_at": None,
            "token": new.token,
            "url": f"{settings.PATIENT_APP_URL.rstrip('/')}/shared/{new.token}",
        }
        return Response(s.NewShareLinkSerializer(data).data, status=status.HTTP_201_CREATED)


class ShareLinkView(PatientDocumentsBase):
    @extend_schema(
        operation_id="patient_document_share_link_revoke",
        tags=TAGS,
        responses={204: None},
        summary="Revoke a share link I made (D5)",
    )
    def delete(self, request: Request, document_id: Any, link_id: Any) -> Response:
        doc_id, facility_id = self.find(document_id)
        link = ShareLink.objects.filter(
            pk=link_id, document_id=doc_id, created_by_account_id=request.user.pk
        ).first()
        if link is None:
            raise exceptions.NotFound()
        with rls_context(facility_id=facility_id, user_id=request.user.pk):
            services.revoke_share(link, Document.objects.get(pk=doc_id), request=request)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---- public -------------------------------------------------------------------------------------


class VerifyThrottle(EnvRateThrottle):
    scope = "verify"
    env_var = "THROTTLE_RATE_VERIFY"
    default_rate = "30/min"

    def get_ident_for(self, request: Any, view: Any) -> str | None:
        return self.get_ident(request)


class SharedThrottle(VerifyThrottle):
    scope = "shared_document"
    env_var = "THROTTLE_RATE_SHARED_DOCUMENT"


def _client(request: Request) -> bytes:
    return services.client_hash(VerifyThrottle().get_ident(request) or "")


def _projection(r: VerificationRecord) -> dict[str, Any]:
    return {
        "code": r.code,
        "kind": r.kind,
        "number": r.number,
        "status": r.status,
        "issued_at": r.issued_at,
        "valid_until": r.valid_until,
        "facility_name": r.facility_name,
        "author_name": r.author_name,
        "author_licence": r.author_licence,
        "version_no": r.version_no,
    }


class _VerifyBase(APIView):
    permission_classes = [PublicEndpoint]
    authentication_classes: list[Any] = []
    throttle_classes = [VerifyThrottle]

    log_throttled = True

    def handle_exception(self, exc: Exception) -> Response:
        response = super().handle_exception(exc)
        if self.log_throttled and isinstance(exc, exceptions.Throttled):
            # the request runs in a transaction the error marks for rollback; nothing was written
            # before the throttle check, so keep the transaction to record the attempt
            for conn in connections.all(initialized_only=True):
                if conn.in_atomic_block:
                    transaction.set_rollback(False, using=conn.alias)
            VerificationLog.objects.create(
                client_hash=_client(self.request), result=VerificationResult.RATE_LIMITED
            )
        return response

    def record_for(self, code: str) -> VerificationRecord | None:
        return VerificationRecord.objects.filter(
            code=services.normalise_code(code), revoked_at__isnull=True
        ).first()

    def not_found(self, *, detailed: bool = False) -> Response:
        # returned, not raised: a raised error would roll the log row back
        VerificationLog.objects.create(
            client_hash=_client(self.request),
            result=VerificationResult.NOT_FOUND,
            detailed=detailed,
        )
        return Response(error_payload("not_found"), status=status.HTTP_404_NOT_FOUND)

    def no_store(self, response: Response) -> Response:
        response["Cache-Control"] = "no-store"
        return response


class VerifyView(_VerifyBase):
    @extend_schema(
        operation_id="public_verify",
        tags=["public"],
        responses={
            200: s.DocumentVerificationSerializer,
            404: err("Unknown code"),
            429: err("Too many"),
        },
        summary="Check a document by the code under its QR code (V1); every attempt is logged",
    )
    def get(self, request: Request, code: str) -> Response:
        found = self.record_for(code)
        if found is None:
            return self.not_found()
        VerificationLog.objects.create(
            verification_record=found, client_hash=_client(request), result="valid"
        )
        return self.no_store(Response(s.DocumentVerificationSerializer(_projection(found)).data))


class VerifyDetailsView(_VerifyBase):
    @extend_schema(
        operation_id="public_verify_details",
        tags=["public"],
        request=s.DocumentVerificationDetailsInputSerializer,
        responses={
            200: s.DocumentVerificationDetailsSerializer,
            404: err("Unknown code"),
            422: err("The date of birth does not match"),
            429: err("Too many"),
        },
        summary="The document's content after a date-of-birth match (V1)",
    )
    def post(self, request: Request, code: str) -> Response:
        body = s.DocumentVerificationDetailsInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        found = self.record_for(code)
        if found is None:
            return self.not_found(detailed=True)
        if not services.dob_matches(found, body.validated_data["date_of_birth"]):
            VerificationLog.objects.create(
                verification_record=found,
                client_hash=_client(request),
                result=VerificationResult.DOB_MISMATCH,
                detailed=True,
            )
            return Response(
                error_payload("business_rule_violation", DOB_MISMATCH),
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        VerificationLog.objects.create(
            verification_record=found,
            client_hash=_client(request),
            result=VerificationResult.VALID,
            detailed=True,
        )
        extra = services.details(found)
        data = {
            **_projection(found),
            "patient_name": extra.get("patient_name", ""),
            "sections": extra.get("sections", []),
        }
        return self.no_store(Response(s.DocumentVerificationDetailsSerializer(data).data))


class SharedDocumentView(_VerifyBase):
    throttle_classes = [SharedThrottle]
    log_throttled = False

    @extend_schema(
        operation_id="public_shared_document",
        tags=["public"],
        responses={
            200: s.SharedDocumentSerializer,
            404: OpenApiResponse(description="Unknown, expired or revoked"),
        },
        summary="A document a patient shared: metadata and a 5-minute link (D5)",
    )
    def get(self, request: Request, token: str) -> Response:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT link_id, document_id, facility_id FROM documents_share_target(%s)",
                [services.token_hash(token)],
            )
            row = cursor.fetchone()
        if row is None:
            raise exceptions.NotFound()
        link_id, document_id, facility_id = row
        with transaction.atomic():
            ShareLink.objects.filter(pk=link_id).update(
                access_count=F("access_count") + 1, last_accessed_at=timezone.now()
            )
            link = ShareLink.objects.get(pk=link_id)
            with rls_context(facility_id=facility_id):
                d = Document.objects.get(pk=document_id)
                download = services.download_link(d)
                record(
                    "documents.downloaded",
                    request=request,
                    facility_id=facility_id,
                    object_type="documents.document",
                    object_id=d.pk,
                    metadata={"document_id": str(d.pk), "kind": d.kind, "by": "share_link"},
                )
        data = {
            "kind": d.kind,
            "number": d.number,
            "document_date": d.document_date,
            "facility_name": _facility_name(facility_id),
            "expires_at": link.expires_at,
            "download": {"url": download.url, "expires_at": download.expires_at},
        }
        return self.no_store(Response(s.SharedDocumentSerializer(data).data))
