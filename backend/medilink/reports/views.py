"""S10 part 2b endpoints (contract sprint-10c §3): facility period report and CSV export
(R1, R2), the facility and platform audit log (A1, A2), platform figures (PR1) and the
patient's own data export (DX1)."""

from __future__ import annotations

import csv
import datetime as dt
import io
import json
from typing import Any

from django.core.serializers.json import DjangoJSONEncoder
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import exceptions, serializers
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from medilink.audit.models import AuditEntry
from medilink.audit.services import record
from medilink.authz.permissions import IsPatientAuthenticated, IsPlatformAdmin
from medilink.authz.stepup import has_recent_auth
from medilink.core.exceptions import StepUpRequired
from medilink.core.pagination import DefaultPagination
from medilink.facilities.views_base import FacilityView, Needs, err
from medilink.reports import figures

TAGS = ["reports"]
PERIOD = [
    OpenApiParameter("from", OpenApiTypes.DATE, description="First day (default: 29 days ago)"),
    OpenApiParameter("to", OpenApiTypes.DATE, description="Last day (default: today)"),
]
TOO_LONG = "Choose 92 days or fewer."


def _period(request: Request) -> tuple[dt.date, dt.date]:
    today = timezone.localdate()
    try:
        end = dt.date.fromisoformat(request.query_params.get("to") or today.isoformat())
        start = dt.date.fromisoformat(
            request.query_params.get("from") or (end - dt.timedelta(days=29)).isoformat()
        )
    except ValueError as error:
        raise exceptions.ValidationError({"from": ["Use YYYY-MM-DD dates."]}) from error
    if start > end:
        raise exceptions.ValidationError({"from": ["The first day is after the last."]})
    if (end - start).days + 1 > figures.MAX_DAYS:
        raise exceptions.ValidationError({"to": [TOO_LONG]})
    return start, end


Report = inline_serializer(
    "FacilityPeriodReport",
    {
        "from": serializers.DateField(),
        "to": serializers.DateField(),
        "totals": serializers.DictField(),
        "days": serializers.ListField(child=serializers.DictField()),
        "bookings": serializers.DictField(child=serializers.IntegerField()),
        "doctors": serializers.ListField(child=serializers.DictField()),
        "finance": serializers.DictField(child=serializers.IntegerField()),
        "disputes": serializers.DictField(),
    },
)


class FacilityReportView(FacilityView):
    permission_classes = [Needs("reports.view")]

    @extend_schema(
        operation_id="staff_report_period",
        tags=TAGS,
        parameters=PERIOD,
        responses={200: Report, 400: err("Bad dates")},
        summary="Facility report for a period: visits, waits, bookings, doctors, money (R1)",
    )
    def get(self, request: Request) -> Response:
        start, end = _period(request)
        facility_id = self.principal().active_facility_id
        return Response(
            json.loads(
                json.dumps(figures.facility_period(facility_id, start, end), cls=DjangoJSONEncoder)
            )
        )


class FacilityReportExportView(FacilityView):
    permission_classes = [Needs("reports.view")]

    @extend_schema(
        operation_id="staff_report_period_export",
        tags=TAGS,
        parameters=PERIOD,
        responses={(200, "text/csv"): OpenApiTypes.BINARY, 403: err("step_up_required")},
        summary="The period report as a CSV file (R2); step-up, audited, formula-safe",
    )
    def get(self, request: Request) -> HttpResponse:
        if not has_recent_auth(request):
            raise StepUpRequired()
        start, end = _period(request)
        facility_id = self.principal().active_facility_id
        report = figures.facility_period(facility_id, start, end)
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow([f"MediLink report {start.isoformat()} to {end.isoformat()}"])
        writer.writerow(
            [f"Exported by {self.principal().user.full_name} at {timezone.now():%Y-%m-%d %H:%M}"]
        )
        for row in figures.csv_rows(report):
            writer.writerow([figures.csv_cell(cell) for cell in row])
        record(
            "reports.exported",
            request=request,
            facility_id=facility_id,
            object_type="reports.period",
            metadata={"from": start.isoformat(), "to": end.isoformat(), "format": "csv"},
        )
        response = HttpResponse(buffer.getvalue(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = (
            f'attachment; filename="medilink-report-{start.isoformat()}-{end.isoformat()}.csv"'
        )
        response["Cache-Control"] = "private, no-store"
        return response


Entry = inline_serializer(
    "AuditEntryRow",
    {
        "id": serializers.UUIDField(),
        "occurred_at": serializers.DateTimeField(),
        "actor_name": serializers.CharField(allow_blank=True),
        "actor_role": serializers.CharField(allow_blank=True),
        "action": serializers.CharField(),
        "object_type": serializers.CharField(allow_blank=True),
        "object_id": serializers.CharField(allow_blank=True),
        "reason": serializers.CharField(allow_blank=True),
        "metadata": serializers.DictField(),
    },
)
Entries = inline_serializer(
    "PaginatedAuditEntryRowList",
    {
        "count": serializers.IntegerField(),
        "next": serializers.URLField(allow_null=True),
        "previous": serializers.URLField(allow_null=True),
        "results": serializers.ListField(child=Entry),
    },
)
AUDIT_FILTERS = [
    OpenApiParameter("action", str, description="Action, or a prefix ending in '.'"),
    OpenApiParameter("actor_id", str),
    OpenApiParameter("object_id", str),
    *PERIOD,
    OpenApiParameter("page", int),
]


def _entries(request: Request, rows: Any) -> Response:
    params = request.query_params
    action = params.get("action", "").strip()
    if action:
        rows = (
            rows.filter(action__startswith=action)
            if action.endswith(".")
            else rows.filter(action=action)
        )
    if params.get("actor_id"):
        rows = rows.filter(actor_id=params["actor_id"])
    if params.get("object_id"):
        rows = rows.filter(object_id=params["object_id"])
    if params.get("from") or params.get("to"):
        start, end = _period(request)
        rows = rows.filter(occurred_at__date__gte=start, occurred_at__date__lte=end)
    rows = rows.select_related("actor").order_by("-sequence")
    paginator = DefaultPagination()
    page: list[AuditEntry] = paginator.paginate_queryset(rows, request) or []
    return paginator.get_paginated_response(
        [
            {
                "id": e.pk,
                "occurred_at": e.occurred_at,
                "actor_name": str(e.actor.full_name) if e.actor is not None else "",
                "actor_role": e.actor_role,
                "action": e.action,
                "object_type": e.object_type,
                "object_id": e.object_id,
                "reason": e.reason,
                "metadata": e.metadata,
            }
            for e in page
        ]
    )


class FacilityAuditView(FacilityView):
    """The audit log has no RLS yet (database design §1, decision D2): the facility filter here
    is the only scope, so every read goes through it."""

    permission_classes = [Needs("audit.view")]

    @extend_schema(
        operation_id="staff_audit_entries",
        tags=TAGS,
        parameters=AUDIT_FILTERS,
        responses={200: Entries},
        summary="The facility's audit log, newest first (A1)",
    )
    def get(self, request: Request) -> Response:
        facility_id = self.principal().active_facility_id
        return _entries(request, AuditEntry.objects.filter(facility_id=facility_id))


class PlatformAuditView(APIView):
    permission_classes = [IsPlatformAdmin]

    @extend_schema(
        operation_id="platform_audit_entries",
        tags=TAGS,
        parameters=[*AUDIT_FILTERS, OpenApiParameter("facility_id", str)],
        responses={200: Entries},
        summary="The whole audit log, newest first (A2)",
    )
    def get(self, request: Request) -> Response:
        rows = AuditEntry.objects.all()
        if request.query_params.get("facility_id"):
            rows = rows.filter(facility_id=request.query_params["facility_id"])
        return _entries(request, rows)


class PlatformReportView(APIView):
    permission_classes = [IsPlatformAdmin]

    @extend_schema(
        operation_id="platform_report",
        tags=TAGS,
        parameters=PERIOD,
        responses={
            200: inline_serializer(
                "PlatformReport",
                {
                    "from": serializers.DateField(),
                    "to": serializers.DateField(),
                    "totals": serializers.DictField(),
                    "facilities": serializers.ListField(child=serializers.DictField()),
                },
            )
        },
        summary="Network, adoption and quality figures per facility (PR1); counts only",
    )
    def get(self, request: Request) -> Response:
        start, end = _period(request)
        return Response(
            json.loads(json.dumps(figures.platform_figures(start, end), cls=DjangoJSONEncoder))
        )


class PatientDataExportView(APIView):
    permission_classes = [IsPatientAuthenticated]

    @extend_schema(
        operation_id="patient_data_export",
        tags=["patient-privacy"],
        request=inline_serializer(
            "DataExportRequest", {"current_password": serializers.CharField()}
        ),
        responses={(200, "application/json"): OpenApiTypes.BINARY, 400: err("Wrong password")},
        summary="Download all my data as JSON (DX1, FR-SEC-12); password again, audited",
    )
    def post(self, request: Request) -> HttpResponse:
        from medilink.reports.my_data import collect

        # confirmed with the password, as delegations are (patients have no step-up session)
        body_in = request.data if isinstance(request.data, dict) else {}
        password = str(body_in.get("current_password") or "")
        if not password or not request.user.check_password(password):
            raise exceptions.ValidationError({"current_password": ["That password is not right."]})
        data = collect(request.user)
        record(
            "reports.patient_data_exported",
            request=request,
            object_type="accounts.user",
            object_id=request.user.pk,
            metadata={key: len(value) for key, value in data.items() if isinstance(value, list)},
        )
        body = json.dumps(data, cls=DjangoJSONEncoder, ensure_ascii=False, indent=2)
        response = HttpResponse(body, content_type="application/json; charset=utf-8")
        response["Content-Disposition"] = (
            f'attachment; filename="medilink-my-data-{timezone.localdate().isoformat()}.json"'
        )
        response["Cache-Control"] = "private, no-store"
        return response
