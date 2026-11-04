"""S8 staff endpoints (contract sprint-08 §3.1): bills, payments, receipts, exemptions,
approvals and cash shifts. Doctors and pharmacists have no billing access; reads are audited
with the patient link."""

from __future__ import annotations

from typing import Any

from django.db.models import Q, QuerySet
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import exceptions, status
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.authz.stepup import RecentAuthRequired
from medilink.billing import bill_serializers as s
from medilink.billing import bills
from medilink.billing.models import (
    ApprovalRequest,
    ApprovalStatus,
    Bill,
    BillLine,
    BillStatus,
    CashShift,
    CreditNote,
    Payment,
    PaymentStatus,
    Receipt,
    ShiftStatus,
)
from medilink.clinical.views import _paginated, display_name
from medilink.core.pagination import DefaultPagination
from medilink.facilities.views_base import FacilityView, Needs, err, query_date
from medilink.patients.audit import record_patient_event
from medilink.uploads.views import idempotency_key

TAGS = ["billing"]
PAY, APPROVE, VERIFY = "billing.record_payment", "billing.approve", "patients.insurance_verify"
READ = (PAY, APPROVE)
STALE = err("Stale version: reload and try again")


def _name(membership: Any) -> str:
    return str(membership.user.full_name) if membership is not None else ""


def _ticket(visit: Any) -> str | None:
    from medilink.visits.services import active_ticket

    ticket = active_ticket(visit) or visit.tickets.order_by("-created_at").first()
    return ticket.number if ticket else None


def approval_data(a: ApprovalRequest) -> dict[str, Any]:
    return {
        "id": a.pk,
        "kind": a.kind,
        "bill_id": a.bill_id,
        "payment_id": a.payment_id,
        "amount_rwf": a.amount_rwf,
        "reason_code": a.reason_code,
        "reason_text": a.reason_text,
        "requested_by_name": _name(a.requested_by_membership),
        "requested_at": a.created_at,
        "status": a.status,
        "decided_by_name": _name(a.decided_by_membership) or None,
        "decided_at": a.decided_at,
        "decision_note": a.decision_note,
        "is_self_approved": a.is_self_approved,
        "patient_display_name": display_name(a.bill.patient),
        "version": a.version,
    }


def bill_data(bill: Bill) -> dict[str, Any]:
    from medilink.masterdata.models import Insurer

    profile = bill.insurance_profile
    lines = list(bill.lines.all())
    payments = list(
        bill.payments.select_related("received_by_membership__user", "receipt").order_by(
            "received_at"
        )
    )
    insurer = Insurer.objects.filter(code=bill.insurer_code).first() if bill.insurer_code else None
    return {
        "id": bill.pk,
        "visit_id": bill.visit_id,
        "facility_patient_id": bill.facility_patient_id,
        "patient_display_name": display_name(bill.patient),
        "service_date": bill.visit.service_date,
        "ticket_number": _ticket(bill.visit),
        "status": bill.status,
        "insurance": {
            "status": bill.insurance_status,
            "insurance_profile_id": bill.insurance_profile_id,
            "insurer_code": bill.insurer_code,
            "insurer_display": (
                profile.insurer_display if profile else (insurer.code if insurer else "")
            ),
            "member_number": profile.member_number if profile else "",
            "is_accepted": bill.insurer_rule_id is not None,
            "patient_share_bp": bill.patient_share_bp,
            "requires_referral": bill.requires_referral,
        },
        "totals": {
            "total_rwf": bill.total_rwf,
            "insurer_share_rwf": bill.insurer_share_rwf,
            "patient_share_rwf": bill.patient_share_rwf,
            "exempted_rwf": bill.exempted_rwf,
            "credited_rwf": bill.credited_rwf,
            "due_rwf": bills.due(bill),
            "paid_rwf": bill.paid_rwf,
            "refunded_rwf": bill.refunded_rwf,
            "balance_rwf": bill.balance_rwf,
            "owed_to_patient_rwf": bills.owed_to_patient(bill),
            "refundable_rwf": bills.refundable(bill),
        },
        "lines": [
            {
                "id": line.pk,
                "kind": line.kind,
                "code": line.code,
                "name": line.name,
                "unit_price_rwf": line.unit_price_rwf,
                "quantity": line.quantity,
                "total_rwf": line.total_rwf,
                "insurer_share_rwf": line.insurer_share_rwf,
                "patient_share_rwf": line.patient_share_rwf,
                "is_covered": line.is_covered,
                "is_medicine": line.prescription_item_id is not None,
                "removed": line.removed_at is not None,
                "removed_reason": line.removed_reason,
            }
            for line in lines
        ],
        "missing_prices": bills.missing_prices(bill) if bill.status != BillStatus.VOIDED else [],
        "payments": [
            {
                "id": p.pk,
                "method": p.method,
                "amount_rwf": p.amount_rwf,
                "reference": p.reference,
                "ebm_receipt_number": p.ebm_receipt_number,
                "received_by_name": _name(p.received_by_membership),
                "received_at": p.received_at,
                "status": p.status,
                "receipt": (
                    {"id": p.receipt.pk, "number": p.receipt.number, "status": p.receipt.status}
                    if hasattr(p, "receipt")
                    else None
                ),
            }
            for p in payments
        ],
        "exemptions": [
            {
                "id": e.pk,
                "reason_code": e.reason_code,
                "reason_text": e.reason_text,
                "amount_rwf": e.amount_rwf,
                "applied_by_name": _name(e.applied_by_membership),
                "applied_at": e.applied_at,
                "is_pending": e.applied_at is None,
            }
            for e in bill.exemptions.select_related("applied_by_membership__user")
        ],
        "credit_notes": [
            {
                "id": c.pk,
                "number": c.number,
                "amount_rwf": c.amount_rwf,
                "paid_out_rwf": sum(p.amount_rwf for p in c.payouts.all()),
                "reason": c.reason,
                "issued_at": c.issued_at,
                "payouts": [
                    {
                        "id": p.pk,
                        "method": p.method,
                        "reference": p.reference,
                        "amount_rwf": p.amount_rwf,
                        "paid_at": p.paid_at,
                    }
                    for p in c.payouts.all()
                ],
            }
            for c in bill.credit_notes.prefetch_related("payouts")
        ],
        "approval_requests": [
            approval_data(a)
            for a in bill.approval_requests.select_related(
                "requested_by_membership__user", "decided_by_membership__user", "bill__patient"
            )
        ],
        "verifications": [
            {
                "id": v.pk,
                "insurance_profile_id": v.insurance_profile_id,
                "insurer_code": v.insurance_profile.insurer_code,
                "result": v.result,
                "reason_code": v.reason_code,
                "reason_text": v.reason_text,
                "referral_letter_seen": v.referral_letter_seen,
                "verified_by_name": _name(v.verified_by_membership),
                "verified_at": v.verified_at,
            }
            for v in bill.verifications.select_related(
                "insurance_profile", "verified_by_membership__user"
            )
        ],
        "version": bill.version,
    }


def row_data(bill: Bill) -> dict[str, Any]:
    return {
        "id": bill.pk,
        "visit_id": bill.visit_id,
        "patient_display_name": display_name(bill.patient),
        "service_date": bill.visit.service_date,
        "ticket_number": _ticket(bill.visit),
        "status": bill.status,
        "insurance_status": bill.insurance_status,
        "total_rwf": bill.total_rwf,
        "patient_share_rwf": bill.patient_share_rwf,
        "paid_rwf": bill.paid_rwf,
        "balance_rwf": bill.balance_rwf,
        "version": bill.version,
    }


def shift_data(shift: CashShift) -> dict[str, Any]:
    expected = (
        shift.expected_totals if shift.status != ShiftStatus.OPEN else bills.expected_totals(shift)
    )
    return {
        "id": shift.pk,
        "membership_id": shift.membership_id,
        "cashier_name": _name(shift.membership),
        "status": shift.status,
        "opened_at": shift.opened_at,
        "opening_float_rwf": shift.opening_float_rwf,
        "closed_at": shift.closed_at,
        "expected_totals": {m: int(expected.get(m, 0)) for m in bills.METHODS},
        "counted_totals": (
            {m: int(shift.counted_totals.get(m, 0)) for m in bills.METHODS}
            if shift.counted_totals
            else None
        ),
        "difference_rwf": shift.difference_rwf,
        "note": shift.note,
        "payment_count": shift.payments.filter(status=PaymentStatus.RECORDED).count(),
        "by_method": bills.by_method(shift),
        "reviewed_by_name": _name(shift.reviewed_by_membership) or None,
        "reviewed_at": shift.reviewed_at,
        "review_note": shift.review_note,
        "is_self_reviewed": shift.is_self_reviewed,
        "version": shift.version,
    }


class BillingView(FacilityView):
    def facility_id(self) -> Any:
        return self.principal().active_facility_id

    def membership(self) -> Any:
        return self.principal().membership

    def visit(self, visit_id: Any) -> Any:
        from medilink.visits.models import Visit

        visit = Visit.objects.filter(pk=visit_id, facility_id=self.facility_id()).first()
        if visit is None:
            raise exceptions.NotFound()
        return visit

    def bill(self, bill_id: Any) -> Bill:
        bill = Bill.objects.filter(pk=bill_id, facility_id=self.facility_id()).first()
        if bill is None:
            raise exceptions.NotFound()
        return bill

    def respond(
        self, bill_id: Any, code: int = status.HTTP_200_OK, *, viewed: bool = False
    ) -> Response:
        bill = Bill.objects.select_related("patient", "visit", "insurance_profile").get(pk=bill_id)
        if viewed:
            record_patient_event(
                "billing.bill.viewed",
                request=self.request,
                patient=bill.patient,
                object_type="billing.bill",
                object_id=bill.pk,
                metadata={"bill_id": str(bill.pk)},
            )
        return Response(s.BillSerializer(bill_data(bill)).data, status=code)

    def own(self, queryset: QuerySet[Any], pk: Any) -> Any:
        row = queryset.filter(pk=pk, facility_id=self.facility_id()).first()
        if row is None:
            raise exceptions.NotFound()
        return row


# ---- bills ------------------------------------------------------------------------------------


class VisitBillView(BillingView):
    permission_classes = [Needs(*READ)]

    @extend_schema(
        operation_id="staff_visit_bill",
        tags=TAGS,
        responses={200: s.BillSerializer},
        summary="The visit's bill, opened on first use (B1)",
    )
    def get(self, request: Request, visit_id: Any) -> Response:
        visit = self.visit(visit_id)
        bill = bills.open_bill(visit, request=request)
        bills.refresh(bill.pk, request=request)
        return self.respond(bill.pk, viewed=True)


class BillsView(BillingView):
    permission_classes = [Needs(*READ)]

    @extend_schema(
        operation_id="staff_bills",
        tags=TAGS,
        parameters=[
            OpenApiParameter("status", str, enum=list(BillStatus.values)),
            OpenApiParameter("has_balance", bool),
            OpenApiParameter("date", str, description="YYYY-MM-DD; today by default"),
            OpenApiParameter("q", str),
            OpenApiParameter("page", int),
            OpenApiParameter("page_size", int),
        ],
        responses={200: _paginated("PaginatedBillRowList", s.BillRowSerializer)},
        summary="Bills of a day, unpaid first (B2)",
    )
    def get(self, request: Request) -> Response:
        rows = Bill.objects.filter(facility_id=self.facility_id()).select_related(
            "patient", "visit"
        )
        q = request.query_params.get("q", "").strip()
        if q:
            rows = rows.filter(
                Q(patient__full_name__icontains=q)
                | Q(patient__preferred_name__icontains=q)
                | Q(visit__tickets__number__iexact=q)
                | Q(payments__receipt__number__iexact=q)
            ).distinct()
        else:
            on = query_date(request, "date", timezone.localdate())
            rows = rows.filter(visit__service_date=on)
        state = request.query_params.get("status")
        if state in BillStatus.values:
            rows = rows.filter(status=state)
        has_balance = request.query_params.get("has_balance")
        if has_balance == "true":
            rows = rows.filter(balance_rwf__gt=0)
        elif has_balance == "false":
            rows = rows.filter(balance_rwf=0)
        rows = rows.order_by("-balance_rwf", "created_at")
        paginator = DefaultPagination()
        page = list(paginator.paginate_queryset(rows, request, view=self) or [])
        return paginator.get_paginated_response(
            [s.BillRowSerializer(row_data(b)).data for b in page]
        )


class BillView(BillingView):
    permission_classes = [Needs(*READ)]

    @extend_schema(
        operation_id="staff_bill_detail",
        tags=TAGS,
        responses={200: s.BillSerializer},
        summary="A bill with lines, split, payments and corrections (B3)",
    )
    def get(self, request: Request, bill_id: Any) -> Response:
        bill = self.bill(bill_id)
        bills.refresh(bill.pk, request=request)
        return self.respond(bill.pk, viewed=True)


class BillLinesView(BillingView):
    permission_classes = [Needs(PAY)]

    @extend_schema(
        operation_id="staff_bill_line_add",
        tags=TAGS,
        request=s.AddLineSerializer,
        responses={201: s.BillSerializer, 409: STALE, 422: err("Unknown item or a void bill")},
        summary="Add a procedure or other charge from the price list (B4)",
    )
    def post(self, request: Request, bill_id: Any) -> Response:
        bill = self.bill(bill_id)
        body = s.AddLineSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        bills.add_line(
            bill.pk,
            version=body.validated_data["version"],
            tariff_code=body.validated_data["tariff_code"],
            quantity=body.validated_data["quantity"],
            membership=self.membership(),
            request=request,
        )
        return self.respond(bill.pk, status.HTTP_201_CREATED)


class BillLineRemoveView(BillingView):
    permission_classes = [Needs(PAY)]

    @extend_schema(
        operation_id="staff_bill_line_remove",
        tags=TAGS,
        request=s.RemoveLineSerializer,
        responses={200: s.BillSerializer, 409: STALE, 422: err("Something was paid already")},
        summary="Remove a line with a reason, before any payment (B5)",
    )
    def post(self, request: Request, line_id: Any) -> Response:
        line = self.own(BillLine.objects.all(), line_id)
        body = s.RemoveLineSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        bill = bills.remove_line(
            line.pk,
            version=body.validated_data["version"],
            reason=body.validated_data["reason"],
            membership=self.membership(),
            request=request,
        )
        return self.respond(bill.pk)


class VerificationView(BillingView):
    permission_classes = [Needs(VERIFY)]

    @extend_schema(
        operation_id="staff_visit_insurance_verification",
        tags=TAGS,
        request=s.VerificationInputSerializer,
        responses={201: s.BillSerializer, 422: err("Unknown card, referral letter, or paid")},
        summary="Verify the patient's insurance for this visit, or reject it (B6)",
    )
    def post(self, request: Request, visit_id: Any) -> Response:
        visit = self.visit(visit_id)
        body = s.VerificationInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        bill = bills.verify_insurance(
            visit, membership=self.membership(), request=request, **body.validated_data
        )
        return self.respond(bill.pk, status.HTTP_201_CREATED)


class PaymentsView(BillingView):
    permission_classes = [Needs(PAY)]

    @extend_schema(
        operation_id="staff_bill_payment",
        tags=TAGS,
        request=s.PaymentInputSerializer,
        parameters=[OpenApiParameter("Idempotency-Key", str, location="header")],
        responses={
            201: s.BillSerializer,
            409: STALE,
            422: err("shift_required, more than the balance, or a missing reference"),
        },
        summary="Record a payment and issue its receipt (B7)",
    )
    def post(self, request: Request, bill_id: Any) -> Response:
        bill = self.bill(bill_id)
        body = s.PaymentInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        updated = bills.record_payment(
            bill.pk,
            version=data["version"],
            data=bills.PaymentInput(
                method=data["method"],
                amount_rwf=data["amount_rwf"],
                reference=data["reference"],
                ebm_receipt_number=data["ebm_receipt_number"],
            ),
            membership=self.membership(),
            request=request,
            idempotency_key=idempotency_key(request),
        )
        return self.respond(updated.pk, status.HTTP_201_CREATED)


class ExemptionsView(BillingView):
    permission_classes = [Needs(PAY)]

    @extend_schema(
        operation_id="staff_bill_exemption",
        tags=TAGS,
        request=s.ExemptionInputSerializer,
        responses={201: s.BillSerializer, 409: STALE, 422: err("Not allowed or above the balance")},
        summary="Apply an exemption; a waiver above the threshold waits for approval (B8)",
    )
    def post(self, request: Request, bill_id: Any) -> Response:
        bill = self.bill(bill_id)
        body = s.ExemptionInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        bills.apply_exemption(
            bill.pk, membership=self.membership(), request=request, **body.validated_data
        )
        return self.respond(bill.pk, status.HTTP_201_CREATED)


class ApprovalResponseMixin:
    def respond_approval(self, approval_id: Any, code: int = status.HTTP_200_OK) -> Response:
        approval = ApprovalRequest.objects.select_related(
            "requested_by_membership__user", "decided_by_membership__user", "bill__patient"
        ).get(pk=approval_id)
        return Response(s.ApprovalRequestSerializer(approval_data(approval)).data, status=code)


class VoidRequestView(ApprovalResponseMixin, BillingView):
    permission_classes = [Needs(PAY)]

    @extend_schema(
        operation_id="staff_payment_void_request",
        tags=TAGS,
        request=s.VoidRequestSerializer,
        responses={201: s.ApprovalRequestSerializer, 409: err("A void is already pending")},
        summary="Ask for a payment to be voided (B9)",
    )
    def post(self, request: Request, payment_id: Any) -> Response:
        payment = self.own(Payment.objects.all(), payment_id)
        body = s.VoidRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        approval = bills.request_void(
            payment.pk, membership=self.membership(), request=request, **body.validated_data
        )
        return self.respond_approval(approval.pk, status.HTTP_201_CREATED)


class RefundRequestView(ApprovalResponseMixin, BillingView):
    permission_classes = [Needs(PAY)]

    @extend_schema(
        operation_id="staff_bill_refund_request",
        tags=TAGS,
        request=s.RefundRequestSerializer,
        responses={201: s.ApprovalRequestSerializer, 422: err("More than can be refunded")},
        summary="Ask for a refund (B10)",
    )
    def post(self, request: Request, bill_id: Any) -> Response:
        bill = self.bill(bill_id)
        body = s.RefundRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        approval = bills.request_refund(
            bill.pk, membership=self.membership(), request=request, **body.validated_data
        )
        return self.respond_approval(approval.pk, status.HTTP_201_CREATED)


class ApprovalsView(BillingView):
    permission_classes = [Needs(APPROVE)]

    @extend_schema(
        operation_id="staff_approval_requests",
        tags=TAGS,
        parameters=[
            OpenApiParameter("status", str, enum=list(ApprovalStatus.values)),
            OpenApiParameter("kind", str),
            OpenApiParameter("page", int),
            OpenApiParameter("page_size", int),
        ],
        responses={200: _paginated("PaginatedApprovalRequestList", s.ApprovalRequestSerializer)},
        summary="Approvals inbox: voids, refunds and waivers (B11)",
    )
    def get(self, request: Request) -> Response:
        rows = ApprovalRequest.objects.filter(facility_id=self.facility_id()).select_related(
            "requested_by_membership__user", "decided_by_membership__user", "bill__patient"
        )
        state = request.query_params.get("status", ApprovalStatus.PENDING)
        if state in ApprovalStatus.values:
            rows = rows.filter(status=state)
        kind = request.query_params.get("kind")
        if kind:
            rows = rows.filter(kind=kind)
        paginator = DefaultPagination()
        page = list(
            paginator.paginate_queryset(rows.order_by("created_at"), request, view=self) or []
        )
        return paginator.get_paginated_response(
            [s.ApprovalRequestSerializer(approval_data(a)).data for a in page]
        )


class ApproveView(ApprovalResponseMixin, BillingView):
    permission_classes = [Needs(APPROVE), RecentAuthRequired()]

    @extend_schema(
        operation_id="staff_approval_approve",
        tags=TAGS,
        request=s.BillingDecisionSerializer,
        responses={
            200: s.ApprovalRequestSerializer,
            403: err("step_up_required"),
            409: STALE,
            422: err("Already decided, or your own request"),
        },
        summary="Approve a void, refund or waiver (B12)",
    )
    def post(self, request: Request, approval_id: Any) -> Response:
        approval = self.own(ApprovalRequest.objects.all(), approval_id)
        body = s.BillingDecisionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        bills.approve(
            approval.pk,
            version=body.validated_data["version"],
            note=body.validated_data["note"],
            membership=self.membership(),
            request=request,
        )
        return self.respond_approval(approval.pk)


class RejectView(ApprovalResponseMixin, BillingView):
    permission_classes = [Needs(APPROVE), RecentAuthRequired()]

    @extend_schema(
        operation_id="staff_approval_reject",
        tags=TAGS,
        request=s.BillingDecisionSerializer,
        responses={200: s.ApprovalRequestSerializer, 409: STALE, 422: err("A note is needed")},
        summary="Reject a request with a note (B13)",
    )
    def post(self, request: Request, approval_id: Any) -> Response:
        approval = self.own(ApprovalRequest.objects.all(), approval_id)
        body = s.BillingDecisionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        bills.reject(
            approval.pk,
            version=body.validated_data["version"],
            note=body.validated_data["note"],
            membership=self.membership(),
            request=request,
        )
        return self.respond_approval(approval.pk)


class CancelRequestView(ApprovalResponseMixin, BillingView):
    permission_classes = [Needs(PAY)]

    @extend_schema(
        operation_id="staff_approval_cancel",
        tags=TAGS,
        request=s.BillingVersionSerializer,
        responses={200: s.ApprovalRequestSerializer, 409: STALE, 422: err("Not yours or decided")},
        summary="Cancel your pending request (B14)",
    )
    def post(self, request: Request, approval_id: Any) -> Response:
        approval = self.own(ApprovalRequest.objects.all(), approval_id)
        body = s.BillingVersionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        bills.cancel_request(
            approval.pk,
            version=body.validated_data["version"],
            membership=self.membership(),
            request=request,
        )
        return self.respond_approval(approval.pk)


class PayoutView(BillingView):
    permission_classes = [Needs(PAY)]

    @extend_schema(
        operation_id="staff_credit_note_payout",
        tags=TAGS,
        request=s.PayoutInputSerializer,
        parameters=[OpenApiParameter("Idempotency-Key", str, location="header")],
        responses={201: s.BillSerializer, 422: err("More than the credit note, or no shift")},
        summary="Record the refund paid back to the patient (B15)",
    )
    def post(self, request: Request, credit_note_id: Any) -> Response:
        credit = self.own(CreditNote.objects.all(), credit_note_id)
        body = s.PayoutInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        bill = bills.record_payout(
            credit.pk,
            data=bills.PaymentInput(
                method=data["method"], amount_rwf=data["amount_rwf"], reference=data["reference"]
            ),
            membership=self.membership(),
            request=request,
            idempotency_key=idempotency_key(request),
        )
        return self.respond(bill.pk, status.HTTP_201_CREATED)


# ---- receipts ---------------------------------------------------------------------------------


def receipt_data(receipt: Receipt) -> dict[str, Any]:
    from medilink.tenancy.models import Facility

    payment = receipt.payment
    bill = payment.bill
    return {
        "id": receipt.pk,
        "number": receipt.number,
        "status": receipt.status,
        "issued_at": receipt.issued_at,
        "facility_name": Facility.objects.get(pk=receipt.facility_id).name,
        "patient_display_name": display_name(bill.patient),
        "method": payment.method,
        "amount_rwf": payment.amount_rwf,
        "reference": payment.reference,
        "ebm_receipt_number": payment.ebm_receipt_number,
        "received_by_name": _name(payment.received_by_membership),
        "bill_id": bill.pk,
        "bill_total_rwf": bill.total_rwf,
        "bill_patient_share_rwf": bill.patient_share_rwf,
        "balance_after_rwf": bill.balance_rwf,
    }


class ReceiptView(BillingView):
    permission_classes = [Needs(*READ)]

    @extend_schema(
        operation_id="staff_receipt",
        tags=TAGS,
        responses={200: s.ReceiptSerializer},
        summary="A receipt for printing (B16)",
    )
    def get(self, request: Request, receipt_id: Any) -> Response:
        receipt = self.own(
            Receipt.objects.select_related(
                "payment__bill__patient", "payment__received_by_membership__user"
            ),
            receipt_id,
        )
        return Response(s.ReceiptSerializer(receipt_data(receipt)).data)


class ReceiptSendView(BillingView):
    permission_classes = [Needs(PAY)]

    @extend_schema(
        operation_id="staff_receipt_send",
        tags=TAGS,
        request=None,
        responses={202: None},
        summary="Send the receipt to the patient again (B17)",
    )
    def post(self, request: Request, receipt_id: Any) -> Response:
        receipt = self.own(Receipt.objects.select_related("payment__bill__patient"), receipt_id)
        bills.send_receipt(receipt, resend=True, request=request)
        return Response(status=status.HTTP_202_ACCEPTED)


# ---- cash shifts ------------------------------------------------------------------------------


class ShiftsView(BillingView):
    permission_classes = [Needs(PAY, methods={"GET": (PAY, APPROVE)})]

    @extend_schema(
        operation_id="staff_cash_shifts",
        tags=TAGS,
        parameters=[
            OpenApiParameter("status", str, enum=list(ShiftStatus.values)),
            OpenApiParameter("mine", bool, description="Only my own shifts (approvers too)"),
            OpenApiParameter("page", int),
            OpenApiParameter("page_size", int),
        ],
        responses={200: _paginated("PaginatedCashShiftList", s.CashShiftSerializer)},
        summary="Shifts: my own, or every shift for approvers (B18)",
    )
    def get(self, request: Request) -> Response:
        rows = CashShift.objects.filter(facility_id=self.facility_id()).select_related(
            "membership__user", "reviewed_by_membership__user"
        )
        if not self.can(APPROVE) or request.query_params.get("mine") == "true":
            rows = rows.filter(membership=self.membership())
        state = request.query_params.get("status")
        if state in ShiftStatus.values:
            rows = rows.filter(status=state)
        paginator = DefaultPagination()
        page = list(
            paginator.paginate_queryset(rows.order_by("-opened_at"), request, view=self) or []
        )
        return paginator.get_paginated_response(
            [s.CashShiftSerializer(shift_data(x)).data for x in page]
        )

    @extend_schema(
        operation_id="staff_cash_shift_open",
        tags=TAGS,
        request=s.OpenShiftSerializer,
        responses={201: s.CashShiftSerializer, 409: err("A shift is already open")},
        summary="Open my shift with the opening float (B20)",
    )
    def post(self, request: Request) -> Response:
        body = s.OpenShiftSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        shift = bills.open_shift(
            membership=self.membership(),
            opening_float_rwf=body.validated_data["opening_float_rwf"],
            request=request,
        )
        return Response(
            s.CashShiftSerializer(shift_data(shift)).data, status=status.HTTP_201_CREATED
        )


class CurrentShiftView(BillingView):
    permission_classes = [Needs(PAY)]

    @extend_schema(
        operation_id="staff_cash_shift_current",
        tags=TAGS,
        responses={200: s.CashShiftSerializer, 404: err("No open shift")},
        summary="My open shift with running totals (B19)",
    )
    def get(self, request: Request) -> Response:
        shift = bills.open_shift_for(self.membership())
        if shift is None:
            raise exceptions.NotFound()
        return Response(s.CashShiftSerializer(shift_data(shift)).data)


class CloseShiftView(BillingView):
    permission_classes = [Needs(PAY)]

    @extend_schema(
        operation_id="staff_cash_shift_close",
        tags=TAGS,
        request=s.CloseShiftSerializer,
        responses={200: s.CashShiftSerializer, 409: STALE, 422: err("Not yours, or a note")},
        summary="Close my shift with the counted totals (B21)",
    )
    def post(self, request: Request, shift_id: Any) -> Response:
        shift = self.own(CashShift.objects.all(), shift_id)
        body = s.CloseShiftSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        closed = bills.close_shift(
            shift.pk,
            version=body.validated_data["version"],
            counted=dict(body.validated_data["counted_totals"]),
            note=body.validated_data["note"],
            membership=self.membership(),
            request=request,
        )
        return Response(s.CashShiftSerializer(shift_data(closed)).data)


class ReviewShiftView(BillingView):
    permission_classes = [Needs(APPROVE)]

    @extend_schema(
        operation_id="staff_cash_shift_review",
        tags=TAGS,
        request=s.BillingDecisionSerializer,
        responses={200: s.CashShiftSerializer, 409: STALE, 422: err("Not closed, or your own")},
        summary="Accept a closed shift (B22)",
    )
    def post(self, request: Request, shift_id: Any) -> Response:
        shift = self.own(CashShift.objects.all(), shift_id)
        body = s.BillingDecisionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        reviewed = bills.review_shift(
            shift.pk,
            version=body.validated_data["version"],
            note=body.validated_data["note"],
            membership=self.membership(),
            request=request,
        )
        return Response(s.CashShiftSerializer(shift_data(reviewed)).data)


# ---- balances ---------------------------------------------------------------------------------


class BalancesView(BillingView):
    permission_classes = [Needs(PAY)]

    @extend_schema(
        operation_id="staff_patient_balances",
        tags=TAGS,
        responses={200: s.BalancesSerializer},
        summary="A patient's unpaid balances at this facility (B23)",
    )
    def get(self, request: Request, facility_patient_id: Any) -> Response:
        from medilink.patients.models import FacilityPatient

        record = FacilityPatient.objects.filter(
            pk=facility_patient_id, facility_id=self.facility_id()
        ).first()
        if record is None:
            raise exceptions.NotFound()
        rows = (
            Bill.objects.filter(
                facility_id=self.facility_id(), facility_patient=record, balance_rwf__gt=0
            )
            .exclude(status=BillStatus.VOIDED)
            .select_related("patient", "visit")
            .order_by("created_at")
        )
        data = [row_data(b) for b in rows]
        return Response(
            s.BalancesSerializer(
                {"total_balance_rwf": sum(b["balance_rwf"] for b in data), "bills": data}
            ).data
        )
