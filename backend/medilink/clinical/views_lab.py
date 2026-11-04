"""Laboratory loop endpoints (upgrade 06 §3, FR-CLN-11, #201).

Doctor: order tests in the consultation, review and release results. Lab technician: the lab
queue, samples and results; it sees test names, the request reason, the patient's identity and
whether the bill is paid, never diagnoses, notes or other visits. Patient: released results only.
"""

from __future__ import annotations

from typing import Any

from django.db import connection
from django.db.models import Q
from django.utils import timezone, translation
from drf_spectacular.utils import extend_schema
from rest_framework import exceptions, status
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.authz.permissions import IsPatientAuthenticated
from medilink.clinical import access, lab
from medilink.clinical import serializers_lab as s
from medilink.clinical.lab_catalogue import TESTS, catalogue_row, result_rows
from medilink.clinical.models import LAB_OPEN_STATES, Consultation, LabOrder, LabOrderState
from medilink.clinical.views import REASON_REQUIRED, ClinicalView
from medilink.facilities.views_base import Needs, err
from medilink.patients.errors import PatientsAPIView
from medilink.patients.normalize import age_years
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import Facility

TAGS = ["laboratory"]
VIEW, WRITE, LAB, RESULT = ("clinical.view", "clinical.write", "lab.operate", "lab.result.enter")


def language(request: Request) -> str:
    lang = (getattr(request, "LANGUAGE_CODE", None) or translation.get_language() or "en")[:2]
    return lang if lang in ("en", "fr", "rw") else "en"


def _orders(**filters: Any) -> Any:
    return LabOrder.objects.filter(**filters).select_related(*lab.WHO, "patient")


def patient_identity(patient: Any) -> dict[str, Any]:
    return {
        "full_name": patient.full_name,
        "display_name": patient.preferred_name or patient.full_name,
        "date_of_birth": patient.date_of_birth,
        "age_years": age_years(patient.date_of_birth, timezone.localdate()),
        "sex": patient.sex,
        "medilink_number": patient.medilink_number,
    }


class LabView(ClinicalView):
    def order(self, order_id: Any) -> LabOrder:
        order = _orders(pk=order_id, facility_id=self.facility_id()).first()
        if order is None:
            raise exceptions.NotFound()
        return order

    def render(self, order: LabOrder, *, clinician: bool = True) -> Response:
        order = self.order(order.pk)
        return Response(lab.order_data(order, language(self.request), clinician=clinician))

    def require_patient_access(self, order: LabOrder) -> None:
        from medilink.patients.models import FacilityPatient

        record = FacilityPatient.objects.select_related("patient").get(pk=order.facility_patient_id)
        access.require_access(self.principal(), record)


class LabTestsView(LabView):
    permission_classes = [Needs(WRITE, LAB, RESULT)]

    @extend_schema(
        operation_id="staff_lab_tests",
        tags=TAGS,
        responses={200: s.LabCatalogueTestSerializer(many=True)},
        summary="The lab test catalogue, with result items and reference ranges",
    )
    def get(self, request: Request) -> Response:
        lang = language(request)
        return Response([catalogue_row(t, lang) for t in TESTS])


class ConsultationLabOrdersView(LabView):
    permission_classes = [Needs(VIEW, methods={"POST": (WRITE,)})]

    def _consultation(self, consultation_id: Any) -> Consultation:
        c = self.consultation(consultation_id)
        access.require_access(self.principal(), c.facility_patient)
        return c

    def _list(self, c: Consultation, code: int = status.HTTP_200_OK) -> Response:
        lang = language(self.request)
        rows = _orders(visit_id=c.visit_id).exclude(state=LabOrderState.CANCELLED)
        return Response([lab.order_data(o, lang, clinician=True) for o in rows], status=code)

    @extend_schema(
        operation_id="staff_consultation_lab_orders",
        tags=TAGS,
        responses={200: s.LabOrderSerializer(many=True), 403: REASON_REQUIRED},
        summary="The visit's lab tests and their results",
    )
    def get(self, request: Request, consultation_id: Any) -> Response:
        return self._list(self._consultation(consultation_id))

    @extend_schema(
        operation_id="staff_consultation_lab_orders_create",
        tags=TAGS,
        request=s.LabOrderInputSerializer,
        responses={
            201: s.LabOrderSerializer(many=True),
            422: err("Not the author, not a draft, unknown or already ordered test"),
        },
        summary="Order tests in my draft consultation (each priced test goes on the bill)",
    )
    def post(self, request: Request, consultation_id: Any) -> Response:
        c = self._consultation(consultation_id)
        body = s.LabOrderInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        lab.order_tests(
            c.pk,
            codes=body.validated_data["tests"],
            reason=body.validated_data.get("reason", ""),
            membership=self.membership(),
            request=request,
        )
        return self._list(c, status.HTTP_201_CREATED)


def _lab_visits(facility_id: Any, lang: str) -> dict[str, list[dict[str, Any]]]:
    from medilink.billing.models import Bill
    from medilink.visits.models import ACTIVE_STATES, Stage, Ticket
    from medilink.visits.views import ticket_rows

    today = timezone.localdate()
    orders = list(
        _orders(facility_id=facility_id)
        .filter(Q(state__in=LAB_OPEN_STATES) | Q(resulted_at__date=today))
        .exclude(state=LabOrderState.CANCELLED)
        .order_by("ordered_at", "test_name")
    )
    visit_ids = list(dict.fromkeys(o.visit_id for o in orders))
    tickets = {
        t.visit_id: t
        for t in Ticket.objects.filter(
            visit_id__in=visit_ids, stage=Stage.LAB, state__in=ACTIVE_STATES
        ).select_related("visit__patient", "service")
    }
    rows = {r["visit_id"]: r for r in ticket_rows(list(tickets.values()))}
    unpaid = set(
        Bill.objects.filter(visit_id__in=visit_ids, balance_rwf__gt=0).values_list(
            "visit_id", flat=True
        )
    )
    out: dict[str, list[dict[str, Any]]] = {"waiting": [], "in_progress": [], "done_today": []}
    for visit_id in visit_ids:
        mine = [o for o in orders if o.visit_id == visit_id]
        states = {o.state for o in mine}
        if LabOrderState.ORDERED in states:
            group = "waiting"
        elif LabOrderState.SAMPLE_TAKEN in states:
            group = "in_progress"
        else:
            group = "done_today"
        out[group].append(
            {
                "visit_id": visit_id,
                "ticket": rows.get(visit_id),
                "patient": patient_identity(mine[0].patient),
                "unpaid": visit_id in unpaid,
                "orders": [lab.order_data(o, lang, clinician=False) for o in mine],
            }
        )
    # The lab calls in ticket order: patients sent to the lab first, by rank and arrival
    out["waiting"].sort(
        key=lambda v: (
            v["ticket"] is None,
            v["ticket"]["priority_rank"] if v["ticket"] else 9,
            v["ticket"]["arrival_at"] if v["ticket"] else v["orders"][0]["ordered_at"],
        )
    )
    return out


class LabQueueView(LabView):
    permission_classes = [Needs(LAB, RESULT)]

    @extend_schema(
        operation_id="staff_lab_queue",
        tags=TAGS,
        responses={200: s.LabQueueSerializer},
        summary="Lab requests: waiting for a sample, in progress, done today",
    )
    def get(self, request: Request) -> Response:
        return Response(_lab_visits(self.facility_id(), language(request)))


class LabSampleView(LabView):
    permission_classes = [Needs(LAB)]

    @extend_schema(
        operation_id="staff_lab_order_sample",
        tags=TAGS,
        request=s.LabVersionSerializer,
        responses={200: s.LabOrderSerializer, 409: err("Stale version"), 422: err("Not now")},
        summary="Record that the sample was taken",
    )
    def post(self, request: Request, order_id: Any) -> Response:
        order = self.order(order_id)
        body = s.LabVersionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        done = lab.take_sample(
            order.pk,
            version=body.validated_data["version"],
            membership=self.membership(),
            request=request,
        )
        return self.render(done, clinician=False)


class LabResultView(LabView):
    permission_classes = [Needs(RESULT)]

    @extend_schema(
        operation_id="staff_lab_order_result",
        tags=TAGS,
        request=s.LabResultInputSerializer,
        responses={
            200: s.LabOrderSerializer,
            400: err("A value is missing, not a number or not one of the answers"),
            409: err("Stale version"),
            422: err("No sample yet, or already resulted"),
        },
        summary="Enter the result; the last one of the visit sends the patient back to the doctor",
    )
    def post(self, request: Request, order_id: Any) -> Response:
        order = self.order(order_id)
        body = s.LabResultInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        done = lab.enter_result(
            order.pk,
            version=body.validated_data["version"],
            values=body.validated_data["values"],
            comment=body.validated_data.get("comment", ""),
            membership=self.membership(),
            request=request,
        )
        return self.render(done, clinician=False)


class LabReviewView(LabView):
    permission_classes = [Needs(WRITE)]

    @extend_schema(
        operation_id="staff_lab_order_review",
        tags=TAGS,
        request=s.LabReviewInputSerializer,
        responses={
            200: s.LabOrderSerializer,
            403: REASON_REQUIRED,
            409: err("Stale version"),
            422: err("Not resulted"),
        },
        summary="Review a result, with a note for the patient",
    )
    def post(self, request: Request, order_id: Any) -> Response:
        order = self.order(order_id)
        self.require_patient_access(order)
        body = s.LabReviewInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        done = lab.review(
            order.pk,
            version=body.validated_data["version"],
            note=body.validated_data.get("note", ""),
            membership=self.membership(),
            request=request,
        )
        return self.render(done)


class LabReleaseView(LabView):
    permission_classes = [Needs(WRITE)]

    @extend_schema(
        operation_id="staff_lab_order_release",
        tags=TAGS,
        request=s.LabVersionSerializer,
        responses={
            200: s.LabOrderSerializer,
            403: REASON_REQUIRED,
            409: err("Stale version"),
            422: err("Not reviewed"),
        },
        summary="Release a reviewed result to the patient",
    )
    def post(self, request: Request, order_id: Any) -> Response:
        order = self.order(order_id)
        self.require_patient_access(order)
        body = s.LabVersionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        done = lab.release(
            order.pk,
            version=body.validated_data["version"],
            membership=self.membership(),
            request=request,
        )
        return self.render(done)


class LabCancelView(LabView):
    permission_classes = [Needs(WRITE)]

    @extend_schema(
        operation_id="staff_lab_order_cancel",
        tags=TAGS,
        request=s.LabVersionSerializer,
        responses={
            200: s.LabOrderSerializer,
            409: err("Stale version"),
            422: err("Sampled already, or not the ordering doctor"),
        },
        summary="Take back a test the lab has not sampled",
    )
    def post(self, request: Request, order_id: Any) -> Response:
        order = self.order(order_id)
        body = s.LabVersionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        done = lab.cancel(
            order.pk,
            version=body.validated_data["version"],
            membership=self.membership(),
            request=request,
        )
        return self.render(done)


class LabInboxView(LabView):
    permission_classes = [Needs(WRITE)]

    @extend_schema(
        operation_id="staff_lab_results_inbox",
        tags=TAGS,
        responses={200: s.LabInboxRowSerializer(many=True)},
        summary="Results of the tests I ordered, waiting for my review or release",
    )
    def get(self, request: Request) -> Response:
        lang = language(request)
        rows = _orders(
            facility_id=self.facility_id(),
            ordered_by_membership=self.membership(),
            state__in=(LabOrderState.RESULTED, LabOrderState.REVIEWED),
        ).order_by("-is_abnormal", "resulted_at")[:100]
        return Response(
            [
                {
                    "order": lab.order_data(o, lang, clinician=True),
                    "patient": patient_identity(o.patient),
                    "facility_patient_id": o.facility_patient_id,
                }
                for o in rows
            ]
        )


# ---- patient ----------------------------------------------------------------------------------


def released_results(account_id: Any) -> list[tuple[Any, Any, Any]]:
    """(lab_order_id, facility_id, patient_id), newest release first (SECURITY DEFINER)."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT lab_order_id, facility_id, patient_id FROM clinical_patient_lab_results(%s)",
            [account_id],
        )
        return list(cursor.fetchall())


class PatientLabResultsView(PatientsAPIView):
    permission_classes = [IsPatientAuthenticated]

    @extend_schema(
        operation_id="patient_lab_results",
        tags=["patient-records"],
        responses={200: s.PatientLabResultSerializer(many=True)},
        summary="Lab results the doctor released, newest first (FR-CLN-11)",
    )
    def get(self, request: Request) -> Response:
        lang = language(request)
        wanted = request.query_params.get("patient_id")
        out = []
        for order_id, facility_id, patient_id in released_results(request.user.pk)[:200]:
            if wanted and str(patient_id) != wanted:
                continue
            with rls_context(facility_id=facility_id, user_id=request.user.pk):
                o = (
                    LabOrder.objects.select_related(
                        "ordered_by_membership__user", "reviewed_by_membership__user"
                    )
                    .filter(pk=order_id, state=LabOrderState.RELEASED)
                    .first()
                )
                if o is None:
                    continue
                by = o.reviewed_by_membership or o.ordered_by_membership
                out.append(
                    {
                        "id": o.pk,
                        "patient_id": o.patient_id,
                        "facility_name": Facility.objects.get(pk=facility_id).name,
                        "test_code": o.test_code,
                        "test_name": lab.test_name(o, lang),
                        "ordered_at": o.ordered_at,
                        "released_at": o.released_at,
                        "doctor_name": by.user.full_name if by is not None else "",
                        "items": result_rows(
                            o.test_code, (lab.result(o) or {}).get("values", {}), lang
                        ),
                        "is_abnormal": o.is_abnormal,
                        "note": lab.review_note(o),
                    }
                )
        return Response(s.PatientLabResultSerializer(out, many=True).data)
