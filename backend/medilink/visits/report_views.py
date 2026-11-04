"""Facility report for `reports.view` (#205, upgrade 13 W6): the period report and each of its
tables as CSV. Aggregates only, never a patient name. Downloads are audited."""

from __future__ import annotations

import datetime as dt

from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import exceptions, serializers
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.audit.services import record
from medilink.facilities.views_base import Needs, err
from medilink.visits import report
from medilink.visits.views import QueueView

TAGS = ["queue"]
REPORTS = "reports.view"


# ---- schemas ------------------------------------------------------------------------------------


class PeriodRowSerializer(serializers.Serializer):
    start = serializers.DateField(help_text="First day of the day, week (Monday) or month")
    patients = serializers.IntegerField()
    completed = serializers.IntegerField()
    left_without_service = serializers.IntegerField()
    emergencies = serializers.IntegerField()
    no_shows = serializers.IntegerField()


class VisitTotalsSerializer(serializers.Serializer):
    patients = serializers.IntegerField()
    completed = serializers.IntegerField()
    left_without_service = serializers.IntegerField()
    emergencies = serializers.IntegerField()
    bookings_expected = serializers.IntegerField()
    no_shows = serializers.IntegerField()
    no_show_rate_pct = serializers.IntegerField(allow_null=True)


class SourceCountSerializer(serializers.Serializer):
    # a declared field named `source` replaces Field.source on the class (DRF pops it)
    source = serializers.CharField(  # type: ignore[assignment]
        help_text="Visit source, e.g. walk_in, online_booking"
    )
    count = serializers.IntegerField()


class ServiceCountSerializer(serializers.Serializer):
    service_id = serializers.UUIDField()
    name_i18n = serializers.DictField()
    count = serializers.IntegerField()


class ReportVisitsSerializer(serializers.Serializer):
    periods = PeriodRowSerializer(many=True)
    totals = VisitTotalsSerializer()
    by_source = SourceCountSerializer(many=True)
    by_service = ServiceCountSerializer(many=True)


class StageWaitSerializer(serializers.Serializer):
    stage = serializers.CharField()
    tickets = serializers.IntegerField()
    called = serializers.IntegerField()
    median_wait_min = serializers.IntegerField(allow_null=True)
    p90_wait_min = serializers.IntegerField(allow_null=True)
    left_without_service = serializers.IntegerField()


class DiagnosisCountSerializer(serializers.Serializer):
    code = serializers.CharField()
    display = serializers.CharField()
    count = serializers.IntegerField()


class SpecialtyCountSerializer(serializers.Serializer):
    specialty = serializers.CharField()
    count = serializers.IntegerField()


class ReportDiagnosesSerializer(serializers.Serializer):
    signed_with_diagnosis = serializers.IntegerField()
    sensitive_count = serializers.IntegerField(help_text="Counted, never named")
    top = DiagnosisCountSerializer(many=True)
    referrals_out = serializers.IntegerField()
    referrals_by_specialty = SpecialtyCountSerializer(many=True)


class MethodTotalSerializer(serializers.Serializer):
    method = serializers.CharField()
    count = serializers.IntegerField()
    amount_rwf = serializers.IntegerField()


class InsurerTotalSerializer(serializers.Serializer):
    insurer_code = serializers.CharField()
    insurer_name = serializers.CharField()
    bills = serializers.IntegerField()
    insurer_share_rwf = serializers.IntegerField()
    patient_share_rwf = serializers.IntegerField()


class ExemptionTotalSerializer(serializers.Serializer):
    reason = serializers.CharField()
    count = serializers.IntegerField()
    amount_rwf = serializers.IntegerField()


class CountAmountSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    amount_rwf = serializers.IntegerField()


class ReportMoneySerializer(serializers.Serializer):
    collected_rwf = serializers.IntegerField()
    billed_rwf = serializers.IntegerField()
    by_method = MethodTotalSerializer(many=True)
    by_insurer = InsurerTotalSerializer(many=True)
    exemptions = ExemptionTotalSerializer(many=True)
    voided_payments = CountAmountSerializer()
    voided_bills = serializers.IntegerField()
    credit_notes = CountAmountSerializer()
    refunds_paid_rwf = serializers.IntegerField()


class LabTestTotalSerializer(serializers.Serializer):
    code = serializers.CharField()
    name = serializers.CharField()
    count = serializers.IntegerField()
    abnormal = serializers.IntegerField()
    median_turnaround_min = serializers.IntegerField(allow_null=True)


class ReportLabSerializer(serializers.Serializer):
    ordered = serializers.IntegerField()
    cancelled = serializers.IntegerField()
    resulted = serializers.IntegerField()
    waiting = serializers.IntegerField()
    median_turnaround_min = serializers.IntegerField(allow_null=True)
    p90_turnaround_min = serializers.IntegerField(allow_null=True)
    by_test = LabTestTotalSerializer(many=True)


class ExpiringBatchSerializer(serializers.Serializer):
    drug_code = serializers.CharField()
    display = serializers.CharField()
    batch_number = serializers.CharField()
    expiry_date = serializers.DateField()
    quantity_on_hand = serializers.IntegerField()
    is_expired = serializers.BooleanField()


class ReportStockSerializer(serializers.Serializer):
    tracked = serializers.IntegerField()
    out_now = serializers.IntegerField()
    low_now = serializers.IntegerField()
    out_medicines = serializers.ListField(child=serializers.CharField())
    received_units = serializers.IntegerField()
    dispensed_units = serializers.IntegerField()
    adjusted_units = serializers.IntegerField(help_text="Net: corrections up, removals down")
    expiring = ExpiringBatchSerializer(many=True)
    expiring_window_days = serializers.IntegerField()


class FacilityReportSerializer(serializers.Serializer):
    def get_fields(self) -> dict[str, serializers.Field]:
        fields = super().get_fields()
        fields["from"] = serializers.DateField()  # `from` is a Python keyword
        return fields

    to = serializers.DateField()
    group = serializers.ChoiceField(choices=list(report.GROUPS))
    visits = ReportVisitsSerializer()
    waits = StageWaitSerializer(many=True)
    diagnoses = ReportDiagnosesSerializer()
    money = ReportMoneySerializer()
    lab = ReportLabSerializer()
    stock = ReportStockSerializer()


# ---- views --------------------------------------------------------------------------------------

PARAMS = [
    OpenApiParameter("from", OpenApiTypes.DATE, description="First day; 29 days ago by default"),
    OpenApiParameter("to", OpenApiTypes.DATE, description="Last day; today by default"),
    OpenApiParameter("group", str, enum=list(report.GROUPS), description="day by default"),
]


class ReportBase(QueueView):
    permission_classes = [Needs(REPORTS)]

    def period(self, request: Request) -> tuple[dt.date, dt.date, str]:
        return report.parse_period(request.query_params, timezone.localdate())


class FacilityReportView(ReportBase):
    @extend_schema(
        operation_id="staff_reports_facility",
        tags=TAGS,
        parameters=PARAMS,
        responses={200: FacilityReportSerializer, 400: err("Bad dates or grouping")},
        summary="Facility report for a period: visits, waits, diagnoses, money, lab, stock (#205)",
    )
    def get(self, request: Request) -> Response:
        start, end, group = self.period(request)
        data = report.facility_report(self.facility_id(), start, end, group)
        return Response(FacilityReportSerializer(data).data)


class FacilityReportExportView(ReportBase):
    @extend_schema(
        operation_id="staff_reports_facility_export",
        tags=TAGS,
        parameters=[
            *PARAMS,
            OpenApiParameter("table", str, enum=list(report.TABLES), required=True),
        ],
        responses={
            (200, "text/csv"): OpenApiResponse(
                response=OpenApiTypes.STR, description="One report table, UTF-8 with BOM"
            ),
            400: err("Bad dates, grouping or table"),
        },
        summary="Download one table of the facility report as CSV; audit-logged (#205)",
    )
    def get(self, request: Request) -> Response:
        start, end, group = self.period(request)
        table = request.query_params.get("table", "")
        if table not in report.TABLES:
            raise exceptions.ValidationError({"table": ["Choose a report table."]})
        data = report.facility_report(self.facility_id(), start, end, group)
        record(
            "visits.report.exported",
            request=request,
            facility_id=self.facility_id(),
            object_type="visits.facility_report",
            metadata={"table": table, "from": str(start), "to": str(end), "group": group},
        )
        response = HttpResponse(
            report.export_csv(data, table), content_type="text/csv; charset=utf-8"
        )
        name = f"report-{table}-{start.isoformat()}-{end.isoformat()}.csv"
        response["Content-Disposition"] = f'attachment; filename="{name}"'
        response["Cache-Control"] = "no-store"
        return response  # type: ignore[return-value]
