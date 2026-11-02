"""S7b staff endpoints (contract sprint-07 §3.3): letters and requests (CR1), documents (D1),
download links (D2) and printing (D3).

Clinicians read documents under the S6 relationship rule; reception and the pharmacy print what
was released to the patient (`documents.print`) and see metadata only. Every link is audited
with the patient (access history).
"""

from __future__ import annotations

from typing import Any

from django.db import transaction
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import exceptions, status
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.authz.stepup import has_recent_auth
from medilink.clinical import access
from medilink.clinical.models import Consultation, ConsultationStatus
from medilink.core.exceptions import BusinessRuleViolation, StepUpRequired
from medilink.documents import serializers as s
from medilink.documents import services
from medilink.documents.models import (
    Document,
    DocumentKind,
    LabRequest,
    Referral,
    SickNote,
    VerificationRecord,
)
from medilink.facilities.views_base import FacilityView, Needs, err, paginated
from medilink.patients.audit import record_patient_event
from medilink.patients.models import FacilityPatient
from medilink.tenancy.models import Facility

TAGS = ["documents"]
CLINICAL_VIEW, CLINICAL_WRITE, PRINT = "clinical.view", "clinical.write", "documents.print"
NOT_AUTHOR = "Only the consultation's author writes its letters and requests."
NOT_SIGNABLE = "This consultation can't take letters or requests."


def _author_name(row: Any) -> str:
    return str(row.author_membership.user.full_name)


def referral_data(row: Referral) -> dict[str, Any]:
    return {
        "id": row.pk,
        "author_name": _author_name(row),
        "signed_at": row.signed_at,
        "document_id": row.document_id,
        "to_facility_name": row.to_facility_name,
        "specialty": row.specialty,
        "reason": services.reason(row),
        "urgency": row.urgency,
    }


def lab_request_data(row: LabRequest) -> dict[str, Any]:
    return {
        "id": row.pk,
        "author_name": _author_name(row),
        "signed_at": row.signed_at,
        "document_id": row.document_id,
        "tests": list(row.tests),
        "reason": services.reason(row),
    }


def sick_note_data(row: SickNote) -> dict[str, Any]:
    return {
        "id": row.pk,
        "author_name": _author_name(row),
        "signed_at": row.signed_at,
        "document_id": row.document_id,
        "rest_from": row.rest_from,
        "rest_to": row.rest_to,
        "show_diagnosis": row.show_diagnosis,
    }


def document_row(
    d: Document, record_: VerificationRecord | None, facility_name: str
) -> dict[str, Any]:
    versions = list(d.versions.all())
    return {
        "id": d.pk,
        "kind": d.kind,
        "number": d.number,
        "document_date": d.document_date,
        "patient_id": d.patient_id,
        "facility_name": facility_name,
        "author_name": record_.author_name if record_ else "",
        "status": record_.status if record_ else "active",
        "version_no": max((v.version_no for v in versions), default=0),
        "released_at": d.released_at,
    }


def verification_of(d: Document) -> VerificationRecord | None:
    try:
        return d.verification
    except VerificationRecord.DoesNotExist:
        return None


def document_data(d: Document, facility_name: str) -> dict[str, Any]:
    record_ = verification_of(d)
    return {
        **document_row(d, record_, facility_name),
        "verification_code": record_.code if record_ else "",
        "versions": [
            {
                "version_no": v.version_no,
                "created_at": v.created_at,
                "superseded_at": v.superseded_at,
                "size_bytes": v.size_bytes,
            }
            for v in d.versions.all()
        ],
    }


class DocumentsView(FacilityView):
    def facility_id(self) -> Any:
        return self.principal().active_facility_id

    def consultation(self, consultation_id: Any) -> Consultation:
        row = (
            Consultation.objects.filter(pk=consultation_id, facility_id=self.facility_id())
            .select_related("facility_patient", "patient")
            .first()
        )
        if row is None:
            raise exceptions.NotFound()
        return row

    def document(self, document_id: Any) -> Document:
        row = (
            Document.objects.filter(pk=document_id, facility_id=self.facility_id())
            .select_related("patient", "facility_patient")
            .first()
        )
        if row is None or (row.released_at is None and not self.can(CLINICAL_VIEW)):
            raise exceptions.NotFound()
        return row

    def check_read(self, facility_patient: FacilityPatient) -> None:
        """Clinicians: S6 relationship rule. Print-only roles see released metadata (D1)."""
        if self.can(CLINICAL_VIEW):
            access.require_access(self.principal(), facility_patient)

    def facility_name(self) -> str:
        return str(Facility.objects.values_list("name", flat=True).get(pk=self.facility_id()))


# ---- CR1 -----------------------------------------------------------------------------------------


class _SourcesView(DocumentsView):
    permission_classes = [Needs(CLINICAL_VIEW, methods={"POST": (CLINICAL_WRITE,)})]
    kind: str = ""
    model: Any = None
    input_serializer: Any = None
    output_serializer: Any = None

    def data(self, row: Any) -> dict[str, Any]:
        raise NotImplementedError

    def fill(self, row: Any, data: dict[str, Any]) -> None:
        raise NotImplementedError

    def list_rows(self, request: Request, consultation_id: Any) -> Response:
        c = self.consultation(consultation_id)
        access.require_access(self.principal(), c.facility_patient)
        rows = self.model.objects.filter(consultation=c).select_related("author_membership__user")
        return Response(
            [self.output_serializer(self.data(r)).data for r in rows.order_by("created_at")]
        )

    def create_row(self, request: Request, consultation_id: Any) -> Response:
        c = self.consultation(consultation_id)
        body = self.input_serializer(data=request.data)
        body.is_valid(raise_exception=True)
        membership = self.principal().membership
        if c.author_membership_id != getattr(membership, "pk", None):
            raise BusinessRuleViolation(NOT_AUTHOR)
        if c.status == ConsultationStatus.ENTERED_IN_ERROR:
            raise BusinessRuleViolation(NOT_SIGNABLE)
        signed = c.status == ConsultationStatus.SIGNED
        if signed and not has_recent_auth(request):
            raise StepUpRequired()  # signed on creation: a signing act (contract CR1)
        with transaction.atomic():
            row = self.model(
                facility_id=c.facility_id, consultation=c, author_membership=membership
            )
            self.fill(row, body.validated_data)
            row.save()
            if signed:
                services.sign_source(row, self.kind, request=request)
        row = self.model.objects.select_related("author_membership__user").get(pk=row.pk)
        return Response(self.output_serializer(self.data(row)).data, status=status.HTTP_201_CREATED)


def _cr1_schema(kind: str, input_s: Any, output_s: Any, label: str) -> tuple[Any, Any]:
    get = extend_schema(
        operation_id=f"staff_consultation_{kind}s",
        tags=TAGS,
        responses={200: output_s(many=True)},
        summary=f"The consultation's {label} (CR1)",
    )
    post = extend_schema(
        operation_id=f"staff_consultation_{kind}_create",
        tags=TAGS,
        request=input_s,
        responses={
            201: output_s,
            403: err("step_up_required after signing, or access_reason_required"),
            422: err("Not the author, or the consultation was entered in error"),
        },
        summary=f"Write a {label[:-1] if label.endswith('s') else label}: draft with the "
        "consultation, or signed at once after it (CR1)",
    )
    return get, post


_ref_get, _ref_post = _cr1_schema(
    "referral", s.ReferralInputSerializer, s.ReferralSerializer, "referral letters"
)
_lab_get, _lab_post = _cr1_schema(
    "lab_request", s.LabRequestInputSerializer, s.LabRequestSerializer, "lab requests"
)
_sick_get, _sick_post = _cr1_schema(
    "sick_note", s.SickNoteInputSerializer, s.SickNoteSerializer, "sick notes"
)


class ReferralsView(_SourcesView):
    kind, model = DocumentKind.REFERRAL, Referral
    input_serializer, output_serializer = s.ReferralInputSerializer, s.ReferralSerializer

    def data(self, row: Any) -> dict[str, Any]:
        return referral_data(row)

    def fill(self, row: Any, data: dict[str, Any]) -> None:
        row.to_facility_name = data["to_facility_name"].strip()
        row.specialty = data["specialty"].strip()
        row.urgency = data["urgency"]
        services.set_reason(row, data["reason"].strip())

    @_ref_get
    def get(self, request: Request, consultation_id: Any) -> Response:
        return self.list_rows(request, consultation_id)

    @_ref_post
    def post(self, request: Request, consultation_id: Any) -> Response:
        return self.create_row(request, consultation_id)


class LabRequestsView(_SourcesView):
    kind, model = DocumentKind.LAB_REQUEST, LabRequest
    input_serializer, output_serializer = s.LabRequestInputSerializer, s.LabRequestSerializer

    def data(self, row: Any) -> dict[str, Any]:
        return lab_request_data(row)

    def fill(self, row: Any, data: dict[str, Any]) -> None:
        row.tests = [{"code": t["code"].strip(), "name": t["name"].strip()} for t in data["tests"]]
        services.set_reason(row, data["reason"].strip())

    @_lab_get
    def get(self, request: Request, consultation_id: Any) -> Response:
        return self.list_rows(request, consultation_id)

    @_lab_post
    def post(self, request: Request, consultation_id: Any) -> Response:
        return self.create_row(request, consultation_id)


class SickNotesView(_SourcesView):
    kind, model = DocumentKind.SICK_NOTE, SickNote
    input_serializer, output_serializer = s.SickNoteInputSerializer, s.SickNoteSerializer

    def data(self, row: Any) -> dict[str, Any]:
        return sick_note_data(row)

    def fill(self, row: Any, data: dict[str, Any]) -> None:
        row.rest_from, row.rest_to = data["rest_from"], data["rest_to"]
        row.show_diagnosis = data["show_diagnosis"]

    @_sick_get
    def get(self, request: Request, consultation_id: Any) -> Response:
        return self.list_rows(request, consultation_id)

    @_sick_post
    def post(self, request: Request, consultation_id: Any) -> Response:
        return self.create_row(request, consultation_id)


# ---- D1-D3 ---------------------------------------------------------------------------------------


class DocumentListView(DocumentsView):
    permission_classes = [Needs(CLINICAL_VIEW, PRINT)]

    @extend_schema(
        operation_id="staff_documents",
        tags=TAGS,
        parameters=[
            OpenApiParameter("facility_patient_id", str),
            OpenApiParameter("visit_id", str),
            OpenApiParameter(
                "kind", str, description="prescription, referral, lab_request, sick_note"
            ),
            OpenApiParameter("page", int),
            OpenApiParameter("page_size", int),
        ],
        responses={200: s.DocumentRowSerializer(many=True)},
        summary="Documents of a patient or a visit, newest first (D1)",
    )
    def get(self, request: Request) -> Response:
        fp_id = request.query_params.get("facility_patient_id")
        visit_id = request.query_params.get("visit_id")
        if not fp_id and not visit_id:
            raise exceptions.ValidationError(
                {"facility_patient_id": ["Give facility_patient_id or visit_id."]}
            )
        rows = Document.objects.filter(facility_id=self.facility_id())
        if fp_id:
            fp = FacilityPatient.objects.filter(pk=fp_id, facility_id=self.facility_id()).first()
            if fp is None:
                raise exceptions.NotFound()
            rows = rows.filter(facility_patient=fp)
        else:
            rows = rows.filter(visit_id=str(visit_id))
            first = rows.select_related("facility_patient").first()
            fp = first.facility_patient if first is not None else None
        if fp is not None:
            self.check_read(fp)
        if not self.can(CLINICAL_VIEW):
            rows = rows.filter(released_at__isnull=False)
        kind = request.query_params.get("kind")
        if kind:
            rows = rows.filter(kind=kind)
        rows = (
            rows.select_related("verification")
            .prefetch_related("versions")
            .order_by("-document_date", "-created_at")
        )
        name = self.facility_name()
        return paginated(
            self,
            request,
            rows,
            lambda d: s.DocumentRowSerializer(document_row(d, verification_of(d), name)).data,
        )


class DocumentView(DocumentsView):
    permission_classes = [Needs(CLINICAL_VIEW, PRINT)]

    @extend_schema(
        operation_id="staff_document",
        tags=TAGS,
        responses={200: s.DocumentSerializer, 403: err("access_reason_required")},
        summary="Document metadata and versions (D1)",
    )
    def get(self, request: Request, document_id: Any) -> Response:
        d = self.document(document_id)
        self.check_read(d.facility_patient)
        return Response(s.DocumentSerializer(document_data(d, self.facility_name())).data)


class DownloadLinkView(DocumentsView):
    permission_classes = [Needs(CLINICAL_VIEW, PRINT)]

    @extend_schema(
        operation_id="staff_document_download_link",
        tags=TAGS,
        request=None,
        responses={
            200: s.LinkSerializer,
            403: err("access_reason_required"),
            422: err("Still rendering"),
        },
        summary="Signed link to the current version, 5 minutes; audited (D2)",
    )
    def post(self, request: Request, document_id: Any) -> Response:
        d = self.document(document_id)
        self.check_read(d.facility_patient)
        link = services.download_link(d)
        record_patient_event(
            "documents.downloaded",
            request=request,
            patient=d.patient,
            object_type="documents.document",
            object_id=d.pk,
            metadata={"document_id": str(d.pk), "kind": d.kind},
        )
        return Response(s.LinkSerializer({"url": link.url, "expires_at": link.expires_at}).data)


class PrintView(DocumentsView):
    permission_classes = [Needs(PRINT)]

    @extend_schema(
        operation_id="staff_document_print",
        tags=TAGS,
        request=None,
        responses={200: s.LinkSerializer, 404: err("Not found or not released")},
        summary="Print a document released to the patient; audited (D3)",
    )
    def post(self, request: Request, document_id: Any) -> Response:
        d = self.document(document_id)
        if d.released_at is None:
            raise exceptions.NotFound()
        link = services.download_link(d)
        record_patient_event(
            "documents.printed",
            request=request,
            patient=d.patient,
            object_type="documents.document",
            object_id=d.pk,
            metadata={"document_id": str(d.pk), "kind": d.kind},
        )
        return Response(s.LinkSerializer({"url": link.url, "expires_at": link.expires_at}).data)
