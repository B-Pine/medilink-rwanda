"""S6a patient endpoints (contract sprint-06 §3.2, D-4): own and dependants' signed records.

The SECURITY DEFINER function `clinical_patient_records(account)` lists which records the account
may read (self and guardian profiles; delegates only unrestricted records). Each record is then
read in its facility's RLS context and serialized with the patient serializers, which have no
private notes and no examination (S6-B14).
"""

from __future__ import annotations

from typing import Any

from django.db import connection
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import exceptions
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.authz.permissions import IsPatientAuthenticated
from medilink.clinical import serializers as s
from medilink.clinical import services
from medilink.clinical.models import Consultation, Vitals
from medilink.clinical.views import _paginated
from medilink.core.pagination import DefaultPagination
from medilink.patients.errors import PatientsAPIView
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import Facility

TAGS = ["patient-records"]


def readable_records(account_id: Any) -> list[tuple[Any, Any, Any]]:
    """(consultation_id, facility_id, patient_id), newest signed first."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT consultation_id, facility_id, patient_id FROM clinical_patient_records(%s)",
            [account_id],
        )
        return list(cursor.fetchall())


def _diagnoses(c: Consultation) -> list[dict[str, Any]]:
    rows = sorted(c.diagnoses.all(), key=lambda d: (d.rank != "primary", d.code))
    return [
        {
            "code": d.code,
            "plain_language": d.plain_language or d.display,
            "display": d.display,
            "certainty": d.certainty,
            "rank": d.rank,
        }
        for d in rows
    ]


def row_data(c: Consultation, facility_name: str) -> dict[str, Any]:
    return {
        "id": c.pk,
        "patient_id": c.patient_id,
        "facility_name": facility_name,
        "service_date": c.visit.service_date,
        "doctor_name": c.author_membership.user.full_name,
        "signed_at": c.signed_at,
        "diagnoses": _diagnoses(c),
    }


def record_data(c: Consultation, facility_name: str) -> dict[str, Any]:
    vitals = Vitals.objects.filter(visit_id=c.visit_id, entered_in_error_at__isnull=True).order_by(
        "recorded_at"
    )
    addenda = c.addenda.select_related("author_membership__user").order_by("signed_at")
    return {
        **row_data(c, facility_name),
        "is_late_entry": c.is_late_entry,
        "history_text": services.read_section(c, "history"),
        "plan_text": services.read_section(c, "plan"),
        "patient_instructions_text": services.read_section(c, "patient_instructions"),
        "vitals": [
            {
                "recorded_at": v.recorded_at,
                "temperature_c": v.temperature_c,
                "systolic_mmhg": v.systolic_mmhg,
                "diastolic_mmhg": v.diastolic_mmhg,
                "pulse_bpm": v.pulse_bpm,
                "respiratory_rate": v.respiratory_rate,
                "spo2_pct": v.spo2_pct,
                "weight_kg": v.weight_kg,
                "height_cm": v.height_cm,
                "muac_mm": v.muac_mm,
            }
            for v in vitals
        ],
        "addenda": [
            {
                "author_name": a.author_membership.user.full_name,
                "reason": a.reason,
                "body": services.addendum_body(a),
                "signed_at": a.signed_at,
            }
            for a in addenda
        ],
    }


def _load(consultation_id: Any, facility_id: Any, user_id: Any, full: bool) -> dict[str, Any]:
    with rls_context(facility_id=facility_id, user_id=user_id):
        c = (
            Consultation.objects.select_related("visit", "author_membership__user")
            .prefetch_related("diagnoses")
            .get(pk=consultation_id)
        )
        name = Facility.objects.get(pk=facility_id).name
        data = record_data(c, name) if full else row_data(c, name)
    serializer = s.PatientRecordSerializer if full else s.PatientRecordRowSerializer
    return dict(serializer(data).data)


class PatientRecordsView(PatientsAPIView):
    permission_classes = [IsPatientAuthenticated]

    @extend_schema(
        operation_id="patient_records",
        tags=TAGS,
        parameters=[
            OpenApiParameter("patient_id", str),
            OpenApiParameter("page", int),
            OpenApiParameter("page_size", int),
        ],
        responses={200: _paginated("PaginatedPatientRecordRowList", s.PatientRecordRowSerializer)},
        summary="Signed records of my profiles, newest first (PR1)",
    )
    def get(self, request: Request) -> Response:
        rows = readable_records(request.user.pk)
        wanted = request.query_params.get("patient_id")
        if wanted:
            rows = [r for r in rows if str(r[2]) == wanted]
        paginator = DefaultPagination()
        page = paginator.paginate_queryset(rows, request, view=self)
        data = [_load(cid, fid, request.user.pk, full=False) for cid, fid, _ in page or []]
        return paginator.get_paginated_response(data)


class PatientRecordView(PatientsAPIView):
    permission_classes = [IsPatientAuthenticated]

    @extend_schema(
        operation_id="patient_record_detail",
        tags=TAGS,
        responses={200: s.PatientRecordSerializer},
        summary="One signed record in plain language, without private notes (PR2)",
    )
    def get(self, request: Request, consultation_id: Any) -> Response:
        match = [r for r in readable_records(request.user.pk) if str(r[0]) == str(consultation_id)]
        if not match:
            raise exceptions.NotFound()
        cid, fid, _ = match[0]
        return Response(_load(cid, fid, request.user.pk, full=True))
