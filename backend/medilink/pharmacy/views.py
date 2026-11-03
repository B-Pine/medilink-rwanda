"""S7a staff endpoints (contract sprint-07 §3.1): prescribing, pharmacy queue, dispensing,
queries, availability and drug search.

Doctors read prescriptions under the S6 treatment-relationship rule; pharmacists read those of
their facility without it (D-5). Responses never carry consultation text. Every read of a
prescription writes an audit entry with the patient link (access history).
"""

from __future__ import annotations

from typing import Any

from django.contrib.postgres.search import TrigramSimilarity
from django.db.models import Exists, OuterRef, Prefetch, Q, QuerySet
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import exceptions, serializers, status
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.authz.stepup import has_recent_auth
from medilink.clinical import access
from medilink.clinical.models import Consultation, ConsultationStatus
from medilink.clinical.views import _paginated, display_name
from medilink.core.exceptions import StepUpRequired
from medilink.core.pagination import DefaultPagination
from medilink.facilities.views_base import FacilityView, Needs, err
from medilink.masterdata.models import Drug
from medilink.patients.audit import record_patient_event
from medilink.patients.normalize import age_years
from medilink.pharmacy import labels as labels_module
from medilink.pharmacy import serializers as s
from medilink.pharmacy import services
from medilink.pharmacy.models import (
    DispenseRecord,
    DrugAvailability,
    ItemStatus,
    Prescription,
    PrescriptionItem,
    PrescriptionQuery,
    PrescriptionStatus,
    QueryStatus,
)
from medilink.tenancy.models import Facility

TAGS = ["pharmacy"]
CLINICAL_VIEW, ISSUE, RX_VIEW, DISPENSE, AVAILABILITY = (
    "clinical.view",
    "prescription.issue",
    "prescription.view",
    "pharmacy.dispense",
    "pharmacy.availability",
)
REASON_REQUIRED = err("access_reason_required: give a reason for this patient first")
STALE = err("Stale version: reload and try again")
SEARCH_LIMIT = 25


def drug_display(drug: Drug) -> str:
    return f"{drug.generic_name} {drug.strength} {drug.form}".strip()


def _member_name(membership: Any) -> str:
    return str(membership.user.full_name) if membership is not None else ""


def item_data(item: PrescriptionItem, unavailable: set[str]) -> dict[str, Any]:
    return {
        "id": item.pk,
        "drug_code": item.drug_code,
        "drug_display": item.drug_display,
        # for the substitute search (S7a follow-up #134); blank for off-catalogue items
        "generic_name": item.drug.generic_name if item.drug else "",
        "strength": item.drug.strength if item.drug else "",
        "is_off_catalogue": item.is_off_catalogue,
        "is_controlled": item.is_controlled,
        "available_here": not item.drug_code or item.drug_code not in unavailable,
        "dose": item.dose,
        "frequency_code": item.frequency_code,
        "route": item.route,
        "duration_days": item.duration_days,
        "quantity": item.quantity,
        "dispensed_quantity": item.dispensed_quantity,
        "instructions": services.instructions(item),
        "substitution_allowed": item.substitution_allowed,
        "status": item.status,
        "alert_overrides": list(item.alert_overrides or []),
        "replaces_item_id": item.replaces_item_id,
        "cancelled_reason": item.cancelled_reason,
    }


def query_data(query: PrescriptionQuery) -> dict[str, Any]:
    return {
        "id": query.pk,
        "status": query.status,
        "message": services.query_message(query),
        "raised_by_name": _member_name(query.raised_by_membership),
        "raised_at": query.created_at,
        "answered_by_addendum_id": query.answered_by_addendum_id,
        "answered_at": query.answered_at,
        "closed_at": query.closed_at,
    }


def record_data(row: DispenseRecord) -> dict[str, Any]:
    return {
        "id": row.pk,
        "pharmacist_name": _member_name(row.pharmacist_membership),
        "identity_check_method": row.identity_check_method,
        "controlled_confirmed": row.controlled_confirmed,
        "signed_at": row.signed_at,
        "lines": [
            {
                "id": line.pk,
                "item_id": line.prescription_item_id,
                "outcome": line.outcome,
                "quantity": line.quantity,
                "substitute_display": line.substitute_display,
                "substitution_reason": line.substitution_reason,
            }
            for line in row.lines.all()
        ],
    }


def load(prescription_id: Any) -> Prescription:
    return (
        Prescription.objects.select_related(
            "patient", "prescriber_membership__user", "facility_patient"
        )
        .prefetch_related(
            Prefetch("items", queryset=PrescriptionItem.objects.select_related("drug")),
            Prefetch(
                "dispense_records",
                queryset=DispenseRecord.objects.select_related(
                    "pharmacist_membership__user"
                ).prefetch_related("lines"),
            ),
            Prefetch(
                "queries",
                queryset=PrescriptionQuery.objects.select_related("raised_by_membership__user"),
            ),
        )
        .get(pk=prescription_id)
    )


def prescription_data(p: Prescription) -> dict[str, Any]:
    items = list(p.items.all())
    unavailable = services.unavailable_codes(
        p.facility_id, [i.drug_code for i in items if i.drug_code]
    )
    return {
        "id": p.pk,
        "consultation_id": p.consultation_id,
        "visit_id": p.visit_id,
        "facility_patient_id": p.facility_patient_id,
        "patient_display_name": display_name(p.patient),
        "prescriber_name": _member_name(p.prescriber_membership),
        "status": p.status,
        "number": p.number,
        "issued_at": p.issued_at,
        "expires_at": p.expires_at,
        "cancelled_reason": p.cancelled_reason,
        "version": p.version,
        "items": [item_data(i, unavailable) for i in items],
        "alerts": services.alerts_for(p),
        "dispense_records": [record_data(r) for r in p.dispense_records.all()],
        "queries": [query_data(q) for q in p.queries.all()],
    }


class PharmacyView(FacilityView):
    def facility_id(self) -> Any:
        return self.principal().active_facility_id

    def membership(self) -> Any:
        return self.principal().membership

    def consultation(self, consultation_id: Any) -> Consultation:
        row = (
            Consultation.objects.filter(pk=consultation_id, facility_id=self.facility_id())
            .select_related("facility_patient")
            .first()
        )
        if row is None:
            raise exceptions.NotFound()
        return row

    def prescription(self, prescription_id: Any) -> Prescription:
        if not Prescription.objects.filter(
            pk=prescription_id, facility_id=self.facility_id()
        ).exists():
            raise exceptions.NotFound()
        return load(prescription_id)

    def item(self, item_id: Any) -> PrescriptionItem:
        row = PrescriptionItem.objects.filter(pk=item_id, facility_id=self.facility_id()).first()
        if row is None:
            raise exceptions.NotFound()
        return row

    def query(self, query_id: Any) -> PrescriptionQuery:
        row = PrescriptionQuery.objects.filter(pk=query_id, facility_id=self.facility_id()).first()
        if row is None:
            raise exceptions.NotFound()
        return row

    def check_read(self, p: Prescription) -> None:
        """Pharmacists dispense without the relationship rule (D-5); everyone else uses S6 Rel."""
        if not self.can(DISPENSE):
            access.require_access(self.principal(), p.facility_patient)

    def respond(
        self, prescription_id: Any, code: int = status.HTTP_200_OK, *, viewed: bool = False
    ) -> Response:
        p = load(prescription_id)
        if viewed:
            record_patient_event(
                "pharmacy.prescription.viewed",
                request=self.request,
                patient=p.patient,
                object_type="pharmacy.prescription",
                object_id=p.pk,
                metadata={"prescription_id": str(p.pk)},
            )
        return Response(s.PrescriptionSerializer(prescription_data(p)).data, status=code)


def _item_input(data: dict[str, Any]) -> services.ItemInput:
    return services.ItemInput(
        drug_code=data.get("drug_code") or "",
        free_text_drug=data.get("free_text_drug") or "",
        dose=data["dose"],
        frequency_code=data["frequency_code"],
        route=data["route"],
        duration_days=data.get("duration_days"),
        quantity=data.get("quantity"),
        instructions=data.get("instructions") or "",
        substitution_allowed=data.get("substitution_allowed", True),
        alert_overrides=[dict(o) for o in data.get("alert_overrides") or []],
    )


# ---- prescribing ------------------------------------------------------------------------------


class ConsultationPrescriptionView(PharmacyView):
    permission_classes = [Needs(CLINICAL_VIEW)]

    @extend_schema(
        operation_id="staff_consultation_prescription",
        tags=TAGS,
        responses={200: s.PrescriptionSerializer, 403: REASON_REQUIRED, 404: err("None yet")},
        summary="The consultation's prescription with items and alerts (P1)",
    )
    def get(self, request: Request, consultation_id: Any) -> Response:
        c = self.consultation(consultation_id)
        access.require_access(self.principal(), c.facility_patient)
        p = Prescription.objects.filter(consultation=c).first()
        if p is None:
            raise exceptions.NotFound()
        return self.respond(p.pk, viewed=True)


class PrescriptionItemsView(PharmacyView):
    permission_classes = [Needs(ISSUE)]

    @extend_schema(
        operation_id="staff_prescription_item_add",
        tags=TAGS,
        request=s.ItemCreateSerializer,
        responses={
            201: s.PrescriptionSerializer,
            403: err("step_up_required after issue, or access_reason_required"),
            422: err("Not the author, unknown drug, or the prescription can't take items"),
        },
        summary="Add an item; creates the prescription on the first item (P2)",
    )
    def post(self, request: Request, consultation_id: Any) -> Response:
        c = self.consultation(consultation_id)
        body = s.ItemCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        if c.status != ConsultationStatus.DRAFT:
            # a new item after issue is a prescribing act like signing (contract §2.2)
            if not has_recent_auth(request):
                raise StepUpRequired()
            access.require_access(self.principal(), c.facility_patient)
        p = services.add_item(
            c.pk,
            _item_input(body.validated_data),
            membership=self.membership(),
            request=request,
            replaces_item_id=body.validated_data.get("replaces_item_id"),
        )
        return self.respond(p.pk, status.HTTP_201_CREATED)


class PrescriptionItemView(PharmacyView):
    permission_classes = [Needs(ISSUE)]

    @extend_schema(
        operation_id="staff_prescription_item_update",
        tags=TAGS,
        request=s.ItemUpdateSerializer,
        responses={
            200: s.PrescriptionSerializer,
            409: STALE,
            422: err("Locked after issue or not the author"),
        },
        summary="Edit a draft item (P3)",
    )
    def patch(self, request: Request, item_id: Any) -> Response:
        item = self.item(item_id)
        body = s.ItemUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        p = services.update_item(
            item.pk,
            _item_input(body.validated_data),
            version=body.validated_data["version"],
            membership=self.membership(),
            request=request,
        )
        return self.respond(p.pk)

    @extend_schema(
        operation_id="staff_prescription_item_delete",
        tags=TAGS,
        parameters=[OpenApiParameter("version", int, required=True)],
        responses={
            200: s.PrescriptionSerializer,
            409: STALE,
            422: err("Locked after issue or not the author"),
        },
        summary="Remove a draft item (P4)",
    )
    def delete(self, request: Request, item_id: Any) -> Response:
        item = self.item(item_id)
        try:
            version = int(request.query_params.get("version", ""))
        except ValueError:
            raise exceptions.ValidationError({"version": ["A whole number is required."]}) from None
        p = services.delete_item(item.pk, version=version, membership=self.membership())
        return self.respond(p.pk)


class ItemCancelView(PharmacyView):
    permission_classes = [Needs(ISSUE)]

    @extend_schema(
        operation_id="staff_prescription_item_cancel",
        tags=TAGS,
        request=s.VersionReasonSerializer,
        responses={
            200: s.PrescriptionSerializer,
            409: STALE,
            422: err("A draft item, or already dispensed"),
        },
        summary="Cancel an issued item with a reason (P5)",
    )
    def post(self, request: Request, item_id: Any) -> Response:
        item = self.item(item_id)
        body = s.VersionReasonSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        p = services.cancel_item(
            item.pk,
            version=body.validated_data["version"],
            reason=body.validated_data["reason"],
            request=request,
        )
        return self.respond(p.pk)


class PrescriptionCancelView(PharmacyView):
    permission_classes = [Needs(ISSUE)]

    @extend_schema(
        operation_id="staff_prescription_cancel",
        tags=TAGS,
        request=s.VersionReasonSerializer,
        responses={200: s.PrescriptionSerializer, 409: STALE, 422: err("Something was dispensed")},
        summary="Cancel the whole prescription with a reason (P6)",
    )
    def post(self, request: Request, prescription_id: Any) -> Response:
        p = self.prescription(prescription_id)
        body = s.VersionReasonSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        services.cancel_prescription(
            p.pk,
            version=body.validated_data["version"],
            reason=body.validated_data["reason"],
            request=request,
        )
        return self.respond(p.pk)


class PrescriptionView(PharmacyView):
    permission_classes = [Needs(RX_VIEW, CLINICAL_VIEW)]

    @extend_schema(
        operation_id="staff_prescription_detail",
        tags=TAGS,
        responses={200: s.PrescriptionSerializer, 403: REASON_REQUIRED},
        summary="A prescription with dispense records and queries (P7)",
    )
    def get(self, request: Request, prescription_id: Any) -> Response:
        p = self.prescription(prescription_id)
        self.check_read(p)
        return self.respond(p.pk, viewed=True)


# ---- pharmacy queue and dispensing ------------------------------------------------------------


def _open_query() -> Exists:
    return Exists(
        PrescriptionQuery.objects.filter(prescription=OuterRef("pk"), status=QueryStatus.OPEN)
    )


def queue_rows(facility_id: Any, status_filter: str, q: str) -> QuerySet[Prescription]:
    rows = Prescription.objects.filter(facility_id=facility_id).annotate(has_query=_open_query())
    ready, partly = PrescriptionStatus.READY, PrescriptionStatus.PARTLY
    if status_filter == "ready":
        rows = rows.filter(status=ready)
    elif status_filter == "partly":
        rows = rows.filter(status=partly)
    elif status_filter == "queried":
        rows = rows.filter(has_query=True)
    else:
        rows = rows.filter(Q(status__in=[ready, partly]) | Q(has_query=True))
    if q:
        from medilink.visits.models import Ticket
        from medilink.visits.services import ACTIVE_STATES

        # contract §6.1: name, number or ticket (the visit's active ticket, exact)
        ticket = Ticket.objects.filter(
            visit_id=OuterRef("visit_id"), state__in=ACTIVE_STATES, number__iexact=q
        )
        rows = rows.filter(
            Q(number__icontains=q)
            | Q(patient__full_name__icontains=q)
            | Q(patient__preferred_name__icontains=q)
            | Exists(ticket)
        )
    return (
        rows.select_related("patient", "visit")
        .prefetch_related("items")
        .order_by("issued_at", "created_at")
    )


def queue_row_data(p: Any, unavailable: set[str]) -> dict[str, Any]:
    from medilink.visits.services import active_ticket

    items = [i for i in p.items.all() if i.status != ItemStatus.CANCELLED]
    ticket = active_ticket(p.visit)
    return {
        "id": p.pk,
        "number": p.number,
        "status": p.status,
        "patient_display_name": display_name(p.patient),
        "patient_age": age_years(p.patient.date_of_birth, timezone.localdate()),
        "ticket_number": ticket.number if ticket else None,
        "issued_at": p.issued_at,
        "expires_at": p.expires_at,
        "item_count": len(items),
        "has_controlled": any(i.is_controlled for i in items),
        "has_open_query": bool(p.has_query),
        "has_unavailable": any(
            i.status == ItemStatus.NOT_AVAILABLE or (i.drug_code and i.drug_code in unavailable)
            for i in items
        ),
        "version": p.version,
    }


class QueueView(PharmacyView):
    permission_classes = [Needs(DISPENSE)]

    @extend_schema(
        operation_id="staff_pharmacy_queue",
        tags=TAGS,
        parameters=[
            OpenApiParameter("status", str, enum=["ready", "partly", "queried"]),
            OpenApiParameter("q", str),
            OpenApiParameter("page", int),
            OpenApiParameter("page_size", int),
        ],
        responses={200: _paginated("PaginatedPharmacyQueueRowList", s.QueueRowSerializer)},
        summary="Prescriptions to dispense at my facility, oldest first (PQ1)",
    )
    def get(self, request: Request) -> Response:
        rows = queue_rows(
            self.facility_id(),
            request.query_params.get("status", ""),
            request.query_params.get("q", "").strip(),
        )
        paginator = DefaultPagination()
        page = list(paginator.paginate_queryset(rows, request, view=self) or [])
        unavailable = services.unavailable_codes(self.facility_id())
        data = [s.QueueRowSerializer(queue_row_data(p, unavailable)).data for p in page]
        return paginator.get_paginated_response(data)


class PharmacyDaySerializer(serializers.Serializer):
    date = serializers.DateField()
    ready = serializers.IntegerField()
    partly = serializers.IntegerField()
    questions_open = serializers.IntegerField()
    questions_answered = serializers.IntegerField()
    dispensed_today = serializers.IntegerField()
    dispensed_by_me = serializers.IntegerField()
    not_available_today = serializers.IntegerField()
    substituted_today = serializers.IntegerField()
    out_of_stock = serializers.IntegerField()
    updated_at = serializers.DateTimeField()


class HistoryLineSerializer(serializers.Serializer):
    drug = serializers.CharField()
    outcome = serializers.CharField()
    quantity = serializers.IntegerField()


class HistoryRowSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    prescription_id = serializers.UUIDField()
    prescription_number = serializers.CharField(allow_blank=True)
    patient_display_name = serializers.CharField()
    pharmacist_name = serializers.CharField()
    signed_at = serializers.DateTimeField()
    identity_check_method = serializers.CharField()
    controlled_confirmed = serializers.BooleanField()
    lines = HistoryLineSerializer(many=True)
    status = serializers.CharField()


class PharmacyDayView(PharmacyView):
    permission_classes = [Needs(DISPENSE)]

    @extend_schema(
        operation_id="staff_pharmacy_my_day",
        tags=TAGS,
        responses={200: PharmacyDaySerializer},
        summary="Pharmacist Today: ready, partly given, questions, dispensed, out of stock",
    )
    def get(self, request: Request) -> Response:
        from medilink.pharmacy.desk import my_day

        return Response(
            PharmacyDaySerializer(my_day(self.facility_id(), self.membership().pk)).data
        )


class DispenseHistoryView(PharmacyView):
    permission_classes = [Needs(DISPENSE)]

    @extend_schema(
        operation_id="staff_pharmacy_history",
        tags=TAGS,
        parameters=[
            OpenApiParameter("days", int, enum=[1, 7, 30]),
            OpenApiParameter("mine", bool),
            OpenApiParameter("q", str, description="Prescription number or patient name"),
        ],
        responses={200: HistoryRowSerializer(many=True)},
        summary="Dispensing history at my facility, newest first (upgrade 05 §4)",
    )
    def get(self, request: Request) -> Response:
        from medilink.pharmacy.desk import history

        days = {"1": 1, "30": 30}.get(request.query_params.get("days", ""), 7)
        mine = request.query_params.get("mine") == "true"
        rows = history(
            self.facility_id(),
            days=days,
            mine_of=self.membership().pk if mine else None,
            q=request.query_params.get("q", "").strip()[:60],
        )
        return Response(HistoryRowSerializer(rows, many=True).data)


class DispenseView(PharmacyView):
    permission_classes = [Needs(DISPENSE)]

    @extend_schema(
        operation_id="staff_prescription_dispense",
        tags=TAGS,
        request=s.DispenseSerializer,
        responses={
            201: s.PrescriptionSerializer,
            409: STALE,
            422: err("Identity, substitution, quantity or controlled-medicine rule"),
        },
        summary="Record and sign a dispensing (PD1)",
    )
    def post(self, request: Request, prescription_id: Any) -> Response:
        p = self.prescription(prescription_id)
        body = s.DispenseSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        services.dispense(
            p.pk,
            version=data["version"],
            identity_check_method=data["identity_check_method"],
            verification_code=data.get("verification_code") or "",
            controlled_confirmed=data.get("controlled_confirmed", False),
            lines=[
                services.LineInput(
                    item_id=line["item_id"],
                    outcome=line["outcome"],
                    quantity=line.get("quantity"),
                    substitute_drug_code=line.get("substitute_drug_code") or "",
                    substitution_reason=line.get("substitution_reason") or "",
                )
                for line in data["lines"]
            ],
            membership=self.membership(),
            request=request,
        )
        return self.respond(p.pk, status.HTTP_201_CREATED)


class LabelsView(PharmacyView):
    permission_classes = [Needs(DISPENSE)]

    @extend_schema(
        operation_id="staff_prescription_labels",
        tags=TAGS,
        parameters=[OpenApiParameter("language", str, enum=["rw", "en", "fr"])],
        responses={200: s.LabelsSerializer},
        summary="Dosing labels for the dispensed lines (PD2)",
    )
    def get(self, request: Request, prescription_id: Any) -> Response:
        p = self.prescription(prescription_id)
        language = request.query_params.get("language") or services._setting(
            p.facility_id, "documents", "label_language"
        )
        facility = Facility.objects.get(pk=p.facility_id)
        rows = labels_module.labels(p, language=language, facility_name=facility.name)
        return Response(s.LabelsSerializer({"labels": rows}).data)


# ---- queries ----------------------------------------------------------------------------------


class QueriesView(PharmacyView):
    permission_classes = [Needs(DISPENSE)]

    @extend_schema(
        operation_id="staff_prescription_query_raise",
        tags=TAGS,
        request=s.QueryCreateSerializer,
        responses={201: s.PrescriptionQuerySerializer, 409: err("A question is already open")},
        summary="Send the prescription back to the doctor with a question (PQ2)",
    )
    def post(self, request: Request, prescription_id: Any) -> Response:
        p = self.prescription(prescription_id)
        body = s.QueryCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        query = services.raise_query(
            p.pk,
            message=body.validated_data["message"],
            membership=self.membership(),
            request=request,
        )
        return self.respond_query(query.pk, status.HTTP_201_CREATED)

    def respond_query(self, query_id: Any, code: int = status.HTTP_200_OK) -> Response:
        query = PrescriptionQuery.objects.select_related("raised_by_membership__user").get(
            pk=query_id
        )
        return Response(s.PrescriptionQuerySerializer(query_data(query)).data, status=code)


class QueryAnswerView(QueriesView):
    permission_classes = [Needs(ISSUE)]

    @extend_schema(
        operation_id="staff_prescription_query_answer",
        tags=TAGS,
        request=s.QueryAnswerSerializer,
        responses={
            200: s.PrescriptionQuerySerializer,
            422: err("Not open, or not this consultation"),
        },
        summary="Link the addendum that answers the question (PQ3)",
    )
    def post(self, request: Request, query_id: Any) -> Response:
        query = self.query(query_id)
        body = s.QueryAnswerSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        services.answer_query(
            query.pk, addendum_id=body.validated_data["addendum_id"], request=request
        )
        return self.respond_query(query.pk)


class QueryCloseView(QueriesView):
    permission_classes = [Needs(DISPENSE)]

    @extend_schema(
        operation_id="staff_prescription_query_close",
        tags=TAGS,
        request=None,
        responses={200: s.PrescriptionQuerySerializer, 422: err("Not answered yet")},
        summary="Close an answered question (PQ4)",
    )
    def post(self, request: Request, query_id: Any) -> Response:
        query = self.query(query_id)
        services.close_query(query.pk, request=request)
        return self.respond_query(query.pk)


# ---- availability and drug search -------------------------------------------------------------


def _drug_search(q: str) -> QuerySet[Drug]:
    return (
        Drug.objects.filter(is_active=True)
        .filter(Q(generic_name__icontains=q) | Q(code__icontains=q))
        .annotate(similarity=TrigramSimilarity("generic_name", q))
        .order_by("-similarity", "generic_name", "strength")
    )


class AvailabilityListView(PharmacyView):
    permission_classes = [Needs(DISPENSE, AVAILABILITY)]

    @extend_schema(
        operation_id="staff_pharmacy_availability",
        tags=TAGS,
        parameters=[
            OpenApiParameter("q", str),
            OpenApiParameter("available", bool),
            OpenApiParameter("page", int),
            OpenApiParameter("page_size", int),
        ],
        responses={200: _paginated("PaginatedAvailabilityRowList", s.AvailabilityRowSerializer)},
        summary="Catalogue drugs with their availability here (PA1)",
    )
    def get(self, request: Request) -> Response:
        q = request.query_params.get("q", "").strip()
        drugs = (
            _drug_search(q) if q else Drug.objects.filter(is_active=True).order_by("generic_name")
        )
        rows = {
            r.drug_id: r for r in DrugAvailability.objects.filter(facility_id=self.facility_id())
        }
        available = request.query_params.get("available")
        if available in ("true", "false"):
            off = [pk for pk, r in rows.items() if not r.is_available]
            drugs = drugs.exclude(pk__in=off) if available == "true" else drugs.filter(pk__in=off)
        paginator = DefaultPagination()
        page = list(paginator.paginate_queryset(drugs, request, view=self) or [])
        data = []
        for drug in page:
            row = rows.get(drug.pk)
            data.append(
                s.AvailabilityRowSerializer(
                    {
                        "drug_code": drug.code,
                        "display": drug_display(drug),
                        "is_available": row.is_available if row else True,
                        "updated_at": row.updated_at if row else None,
                    }
                ).data
            )
        return paginator.get_paginated_response(data)


class AvailabilityView(PharmacyView):
    permission_classes = [Needs(AVAILABILITY)]

    @extend_schema(
        operation_id="staff_pharmacy_availability_set",
        tags=TAGS,
        request=s.AvailabilityWriteSerializer,
        responses={200: s.AvailabilityRowSerializer},
        summary="Mark a catalogue drug available or not here (PA2)",
    )
    def put(self, request: Request, drug_code: str) -> Response:
        drug = Drug.objects.filter(code=drug_code, is_active=True).first()
        if drug is None:
            raise exceptions.NotFound()
        body = s.AvailabilityWriteSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        row = services.set_availability(
            self.facility_id(),
            drug,
            is_available=body.validated_data["is_available"],
            membership=self.membership(),
            request=request,
        )
        return Response(
            s.AvailabilityRowSerializer(
                {
                    "drug_code": drug.code,
                    "display": drug_display(drug),
                    "is_available": row.is_available,
                    "updated_at": row.updated_at,
                }
            ).data
        )


class DrugSearchView(PharmacyView):
    permission_classes = [Needs(ISSUE, DISPENSE)]

    @extend_schema(
        operation_id="staff_drug_search",
        tags=TAGS,
        parameters=[OpenApiParameter("q", str, required=True)],
        responses={200: s.DrugRowSerializer(many=True)},
        summary="Catalogue drugs by generic name, with availability here (PS1)",
    )
    def get(self, request: Request) -> Response:
        q = request.query_params.get("q", "").strip()
        if len(q) < 2:
            raise exceptions.ValidationError({"q": ["Type at least 2 characters."]})
        drugs = list(_drug_search(q)[:SEARCH_LIMIT])
        unavailable = services.unavailable_codes(self.facility_id(), [d.code for d in drugs])
        data = [
            {
                "code": d.code,
                "display": drug_display(d),
                "generic_name": d.generic_name,
                "strength": d.strength,
                "form": d.form,
                "is_controlled": d.is_controlled,
                "available_here": d.code not in unavailable,
            }
            for d in drugs
        ]
        return Response(s.DrugRowSerializer(data, many=True).data)
