"""#203 insurance claims for staff: the monthly claim list per insurer, its CSV and PDF downloads,
and marking a claim paid or rejected. Viewing: `billing.approve` or `reports.view` (facility
admins hold both); marking: `billing.approve`. Lists and downloads are audited."""

from __future__ import annotations

import re
from typing import Any

from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import exceptions, serializers
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.accounts.serializers import StrictSerializer
from medilink.audit.services import record
from medilink.billing import claims
from medilink.billing.bill_views import BillingView
from medilink.billing.models import Bill, ClaimStatus, TariffKind
from medilink.facilities.views_base import Needs, err

TAGS = ["billing"]
APPROVE, REPORTS = "billing.approve", "reports.view"
MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
CODE_RE = re.compile(r"^[A-Za-z0-9_.-]{1,40}$")


# ---- schemas ------------------------------------------------------------------------------------


class ClaimInsurerSerializer(serializers.Serializer):
    code = serializers.CharField()
    name = serializers.CharField()


class ClaimLineSerializer(serializers.Serializer):
    code = serializers.CharField()
    name = serializers.CharField()
    kind = serializers.ChoiceField(choices=TariffKind.choices)
    quantity = serializers.IntegerField()
    total_rwf = serializers.IntegerField()
    insurer_share_rwf = serializers.IntegerField()
    patient_share_rwf = serializers.IntegerField()
    is_covered = serializers.BooleanField()


class ClaimRowSerializer(serializers.Serializer):
    bill_id = serializers.UUIDField()
    visit_id = serializers.UUIDField()
    service_date = serializers.DateField()
    patient_display_name = serializers.CharField()
    member_number = serializers.CharField(allow_blank=True)
    icd10_codes = serializers.ListField(
        child=serializers.CharField(), help_text="Signed notes only; the primary diagnosis first."
    )
    lines = ClaimLineSerializer(many=True)
    total_rwf = serializers.IntegerField()
    insurer_share_rwf = serializers.IntegerField()
    patient_share_rwf = serializers.IntegerField()
    status = serializers.ChoiceField(choices=ClaimStatus.choices)
    reason = serializers.CharField(allow_blank=True)
    reference = serializers.CharField(allow_blank=True)
    decided_by_name = serializers.CharField(allow_null=True)
    decided_at = serializers.DateTimeField(allow_null=True)
    version = serializers.IntegerField(help_text="0 until the claim is first marked.")


class ClaimSummarySerializer(serializers.Serializer):
    count = serializers.IntegerField()
    total_rwf = serializers.IntegerField()
    insurer_share_rwf = serializers.IntegerField()
    patient_share_rwf = serializers.IntegerField()
    pending_count = serializers.IntegerField()
    paid_count = serializers.IntegerField()
    paid_rwf = serializers.IntegerField()
    rejected_count = serializers.IntegerField()
    rejected_rwf = serializers.IntegerField()


class ClaimListSerializer(serializers.Serializer):
    insurer_code = serializers.CharField()
    month = serializers.CharField()
    summary = ClaimSummarySerializer()
    results = ClaimRowSerializer(many=True)


class ClaimMarkSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=0)
    status = serializers.ChoiceField(choices=[ClaimStatus.PAID, ClaimStatus.REJECTED])
    reason = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")
    reference = serializers.CharField(max_length=60, required=False, allow_blank=True, default="")


# ---- views --------------------------------------------------------------------------------------

LIST_PARAMS = [
    OpenApiParameter("insurer", str, required=True, description="Insurer code"),
    OpenApiParameter("month", str, required=True, description="YYYY-MM (visit dates)"),
]


class ClaimsBase(BillingView):
    def wanted(self, request: Request) -> tuple[str, str]:
        insurer = request.query_params.get("insurer", "").strip()
        month = request.query_params.get("month", "").strip()
        problems = {}
        if not CODE_RE.match(insurer):
            problems["insurer"] = ["Choose an insurer."]
        if not MONTH_RE.match(month):
            problems["month"] = ["Use YYYY-MM."]
        if problems:
            raise exceptions.ValidationError(problems)
        return insurer, month


class ClaimInsurersView(ClaimsBase):
    permission_classes = [Needs(APPROVE, REPORTS)]

    @extend_schema(
        operation_id="staff_claim_insurers",
        tags=TAGS,
        responses={200: ClaimInsurerSerializer(many=True)},
        summary="Insurers to list claims for: accepted here or verified on a bill (#203)",
    )
    def get(self, request: Request) -> Response:
        return Response(ClaimInsurerSerializer(claims.insurers(self.facility_id()), many=True).data)


class ClaimsView(ClaimsBase):
    permission_classes = [Needs(APPROVE, REPORTS)]

    @extend_schema(
        operation_id="staff_claims",
        tags=TAGS,
        parameters=LIST_PARAMS,
        responses={200: ClaimListSerializer},
        summary="The monthly claim list for one insurer, with totals; audit-logged (#203)",
    )
    def get(self, request: Request) -> Response:
        insurer, month = self.wanted(request)
        rows = claims.claim_rows(self.facility_id(), insurer, month)
        record(
            "billing.claims.listed",
            request=request,
            facility_id=self.facility_id(),
            object_type="billing.insurance_claim",
            metadata={"insurer_code": insurer, "month": month, "rows": len(rows)},
        )
        body = {
            "insurer_code": insurer,
            "month": month,
            "summary": claims.summary(rows),
            "results": rows,
        }
        return Response(ClaimListSerializer(body).data)


class ClaimsExportView(ClaimsBase):
    permission_classes = [Needs(APPROVE, REPORTS)]

    @extend_schema(
        operation_id="staff_claims_export",
        tags=TAGS,
        parameters=[
            *LIST_PARAMS,
            OpenApiParameter("kind", str, enum=["csv", "pdf"], description="csv by default"),
        ],
        responses={
            (200, "text/csv"): OpenApiResponse(
                response=OpenApiTypes.STR, description="One row per visit, then the total"
            ),
            (200, "application/pdf"): OpenApiResponse(
                response=OpenApiTypes.BINARY, description="The same list, A4 landscape"
            ),
        },
        summary="Download the monthly claim list (CSV UTF-8, or PDF); audit-logged (#203)",
    )
    def get(self, request: Request) -> Response:
        from medilink.masterdata.models import Insurer
        from medilink.tenancy.models import Facility

        insurer, month = self.wanted(request)
        kind = "pdf" if request.query_params.get("kind") == "pdf" else "csv"
        rows = claims.claim_rows(self.facility_id(), insurer, month)
        record(
            "billing.claims.exported",
            request=request,
            facility_id=self.facility_id(),
            object_type="billing.insurance_claim",
            metadata={"insurer_code": insurer, "month": month, "rows": len(rows), "format": kind},
        )
        name = f"claims-{insurer.lower()}-{month}"
        if kind == "pdf":
            facility = Facility.objects.get(pk=self.facility_id())
            label = Insurer.objects.filter(code=insurer).values_list("name", flat=True).first()
            response = HttpResponse(
                claims.export_pdf(
                    rows, facility_name=facility.name, insurer=label or insurer, month=month
                ),
                content_type="application/pdf",
            )
        else:
            response = HttpResponse(claims.export_csv(rows), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{name}.{kind}"'
        response["Cache-Control"] = "no-store"
        return response  # type: ignore[return-value]


class ClaimMarkView(ClaimsBase):
    permission_classes = [Needs(APPROVE)]

    @extend_schema(
        operation_id="staff_claim_mark",
        tags=TAGS,
        request=ClaimMarkSerializer,
        responses={
            200: ClaimRowSerializer,
            409: err("Stale version: reload and try again"),
            422: err("Not a verified insured bill, or a rejection without a reason"),
        },
        summary="Mark a bill's claim paid, or rejected with the insurer's reason (#203)",
    )
    def post(self, request: Request, bill_id: Any) -> Response:
        bill = self.bill(bill_id)
        body = ClaimMarkSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        claims.mark(bill.pk, membership=self.membership(), request=request, **body.validated_data)
        fresh = Bill.objects.select_related("patient", "visit", "insurance_profile").get(pk=bill.pk)
        return Response(ClaimRowSerializer(claims.rows_for([fresh])[0]).data)
