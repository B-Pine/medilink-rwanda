"""S8 patient endpoints (contract sprint-08 §3.2): My bills.

The SECURITY DEFINER function `billing_patient_bills(account)` lists the bills the account may
read (self and guardian profiles; delegates unless the visit has a restricted consultation).
Each bill is then read in its facility's RLS context.
"""

from __future__ import annotations

from typing import Any

from django.db import connection
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import exceptions
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.authz.permissions import IsPatientAuthenticated
from medilink.billing import bill_serializers as s
from medilink.billing.models import Bill
from medilink.clinical.views import _paginated
from medilink.core.pagination import DefaultPagination
from medilink.patients.errors import PatientsAPIView
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import Facility

TAGS = ["patient-bills"]


def readable_bills(account_id: Any) -> list[tuple[Any, Any, Any, int]]:
    """(bill_id, facility_id, patient_id, balance_rwf), newest first."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT bill_id, facility_id, patient_id, balance_rwf FROM billing_patient_bills(%s)",
            [account_id],
        )
        return list(cursor.fetchall())


def _load(bill_id: Any, facility_id: Any, user_id: Any, full: bool) -> dict[str, Any]:
    with rls_context(facility_id=facility_id, user_id=user_id):
        bill = Bill.objects.select_related("visit").get(pk=bill_id)
        data: dict[str, Any] = {
            "id": bill.pk,
            "patient_id": bill.patient_id,
            "facility_name": Facility.objects.get(pk=facility_id).name,
            "service_date": bill.visit.service_date,
            "status": bill.status,
            "total_rwf": bill.total_rwf,
            "patient_share_rwf": bill.patient_share_rwf,
            "paid_rwf": bill.paid_rwf,
            "balance_rwf": bill.balance_rwf,
        }
        if full:
            data.update(
                insurer_share_rwf=bill.insurer_share_rwf,
                exempted_rwf=bill.exempted_rwf,
                credited_rwf=bill.credited_rwf,
                refunded_rwf=bill.refunded_rwf,
                lines=[
                    {
                        "name": line.name,
                        "quantity": line.quantity,
                        "total_rwf": line.total_rwf,
                        "insurer_share_rwf": line.insurer_share_rwf,
                        "patient_share_rwf": line.patient_share_rwf,
                    }
                    for line in bill.lines.filter(removed_at__isnull=True)
                ],
                payments=[
                    {
                        "method": p.method,
                        "amount_rwf": p.amount_rwf,
                        "received_at": p.received_at,
                        "status": p.status,
                        "receipt_number": p.receipt.number if hasattr(p, "receipt") else None,
                    }
                    for p in bill.payments.select_related("receipt").order_by("received_at")
                ],
                credit_notes=[
                    {"number": c.number, "amount_rwf": c.amount_rwf, "issued_at": c.issued_at}
                    for c in bill.credit_notes.all()
                ],
            )
    serializer = s.PatientBillSerializer if full else s.PatientBillRowSerializer
    return dict(serializer(data).data)


class PatientBillsView(PatientsAPIView):
    permission_classes = [IsPatientAuthenticated]

    @extend_schema(
        operation_id="patient_bills",
        tags=TAGS,
        parameters=[
            OpenApiParameter("patient_id", str),
            OpenApiParameter("has_balance", bool),
            OpenApiParameter("page", int),
            OpenApiParameter("page_size", int),
        ],
        responses={200: _paginated("PaginatedPatientBillRowList", s.PatientBillRowSerializer)},
        summary="Bills of my profiles, newest first (PB1)",
    )
    def get(self, request: Request) -> Response:
        rows = readable_bills(request.user.pk)
        wanted = request.query_params.get("patient_id")
        if wanted:
            rows = [r for r in rows if str(r[2]) == wanted]
        has_balance = request.query_params.get("has_balance")
        if has_balance == "true":
            rows = [r for r in rows if r[3] > 0]
        elif has_balance == "false":
            rows = [r for r in rows if r[3] == 0]
        paginator = DefaultPagination()
        page = paginator.paginate_queryset(rows, request, view=self)
        data = [_load(bid, fid, request.user.pk, full=False) for bid, fid, _p, _b in page or []]
        return paginator.get_paginated_response(data)


class PatientBillView(PatientsAPIView):
    permission_classes = [IsPatientAuthenticated]

    @extend_schema(
        operation_id="patient_bill_detail",
        tags=TAGS,
        responses={200: s.PatientBillSerializer},
        summary="One bill with lines, payments and receipts (PB2)",
    )
    def get(self, request: Request, bill_id: Any) -> Response:
        match = [r for r in readable_bills(request.user.pk) if str(r[0]) == str(bill_id)]
        if not match:
            raise exceptions.NotFound()
        bid, fid, _patient, _balance = match[0]
        return Response(_load(bid, fid, request.user.pk, full=True))
