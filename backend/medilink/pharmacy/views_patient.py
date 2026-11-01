"""S7a patient endpoints (contract sprint-07 §3.2): My medicines.

The SECURITY DEFINER function `pharmacy_patient_prescriptions(account)` lists the issued
prescriptions the account may read (self and guardian profiles; delegates only when the
consultation is not restricted). Each one is then read in its facility's RLS context. Patient
shapes carry no alert overrides and nothing from the consultation.
"""

from __future__ import annotations

from typing import Any

from django.db import connection
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import exceptions
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.authz.permissions import IsPatientAuthenticated
from medilink.clinical.views import _paginated
from medilink.core.pagination import DefaultPagination
from medilink.patients.errors import PatientsAPIView
from medilink.pharmacy import serializers as s
from medilink.pharmacy import services
from medilink.pharmacy.models import (
    DispenseOutcome,
    ItemStatus,
    Prescription,
    PrescriptionStatus,
)
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import Facility

TAGS = ["patient-medicines"]
ACTIVE = (
    PrescriptionStatus.ISSUED,
    PrescriptionStatus.AWAITING_PAYMENT,
    PrescriptionStatus.READY,
    PrescriptionStatus.PARTLY,
    PrescriptionStatus.NOT_AVAILABLE,
)


def readable_prescriptions(account_id: Any) -> list[tuple[Any, Any, Any, str]]:
    """(prescription_id, facility_id, patient_id, status), newest issue first."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT prescription_id, facility_id, patient_id, status"
            " FROM pharmacy_patient_prescriptions(%s)",
            [account_id],
        )
        return list(cursor.fetchall())


def _row(p: Prescription, facility_name: str) -> dict[str, Any]:
    return {
        "id": p.pk,
        "patient_id": p.patient_id,
        "number": p.number,
        "facility_name": facility_name,
        "prescriber_name": p.prescriber_membership.user.full_name,
        "status": p.status,
        "issued_at": p.issued_at,
        "expires_at": p.expires_at,
        "item_count": sum(1 for i in p.items.all() if i.status != ItemStatus.CANCELLED),
    }


def _items(p: Prescription) -> list[dict[str, Any]]:
    substitutes: dict[Any, str] = {}
    for record in p.dispense_records.all():
        for line in record.lines.all():
            if line.outcome == DispenseOutcome.SUBSTITUTED:
                substitutes[line.prescription_item_id] = line.substitute_display
    return [
        {
            "id": i.pk,
            "drug_display": i.drug_display,
            "dose": i.dose,
            "frequency_code": i.frequency_code,
            "route": i.route,
            "duration_days": i.duration_days,
            "quantity": i.quantity,
            "dispensed_quantity": i.dispensed_quantity,
            "instructions": services.instructions(i),
            "status": i.status,
            "substitute_display": substitutes.get(i.pk, ""),
        }
        for i in p.items.all()
    ]


def _load(prescription_id: Any, facility_id: Any, user_id: Any, full: bool) -> dict[str, Any]:
    with rls_context(facility_id=facility_id, user_id=user_id):
        p = (
            Prescription.objects.select_related("prescriber_membership__user")
            .prefetch_related("items", "dispense_records__lines")
            .get(pk=prescription_id)
        )
        name = Facility.objects.get(pk=facility_id).name
        data = _row(p, name)
        if full:
            data["items"] = _items(p)
    serializer = s.PatientPrescriptionSerializer if full else s.PatientPrescriptionRowSerializer
    return dict(serializer(data).data)


class PatientPrescriptionsView(PatientsAPIView):
    permission_classes = [IsPatientAuthenticated]

    @extend_schema(
        operation_id="patient_prescriptions",
        tags=TAGS,
        parameters=[
            OpenApiParameter("patient_id", str),
            OpenApiParameter("status", str, enum=["active", "past"]),
            OpenApiParameter("page", int),
            OpenApiParameter("page_size", int),
        ],
        responses={
            200: _paginated(
                "PaginatedPatientPrescriptionRowList", s.PatientPrescriptionRowSerializer
            )
        },
        summary="Prescriptions of my profiles, newest first (M1)",
    )
    def get(self, request: Request) -> Response:
        rows = readable_prescriptions(request.user.pk)
        wanted = request.query_params.get("patient_id")
        if wanted:
            rows = [r for r in rows if str(r[2]) == wanted]
        state = request.query_params.get("status")
        if state == "active":
            rows = [r for r in rows if r[3] in ACTIVE]
        elif state == "past":
            rows = [r for r in rows if r[3] not in ACTIVE]
        paginator = DefaultPagination()
        page = paginator.paginate_queryset(rows, request, view=self)
        data = [_load(pid, fid, request.user.pk, full=False) for pid, fid, _p, _s in page or []]
        return paginator.get_paginated_response(data)


class PatientPrescriptionView(PatientsAPIView):
    permission_classes = [IsPatientAuthenticated]

    @extend_schema(
        operation_id="patient_prescription_detail",
        tags=TAGS,
        responses={200: s.PatientPrescriptionSerializer},
        summary="One prescription with items and what was dispensed (M2)",
    )
    def get(self, request: Request, prescription_id: Any) -> Response:
        match = [
            r for r in readable_prescriptions(request.user.pk) if str(r[0]) == str(prescription_id)
        ]
        if not match:
            raise exceptions.NotFound()
        pid, fid, _patient, _status = match[0]
        return Response(_load(pid, fid, request.user.pk, full=True))
