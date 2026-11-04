"""/api/v1/staff/... billing routes (contract sprint-08 §3.1)."""

from django.urls import path

from medilink.billing import bill_views as v
from medilink.billing import claim_views as c

urlpatterns = [
    path("visits/<uuid:visit_id>/bill/", v.VisitBillView.as_view(), name="staff-visit-bill"),
    path(
        "visits/<uuid:visit_id>/insurance-verifications/",
        v.VerificationView.as_view(),
        name="staff-visit-insurance-verifications",
    ),
    path("bills/", v.BillsView.as_view(), name="staff-bills"),
    path("bills/<uuid:bill_id>/", v.BillView.as_view(), name="staff-bill"),
    path("bills/<uuid:bill_id>/lines/", v.BillLinesView.as_view(), name="staff-bill-lines"),
    path(
        "bill-lines/<uuid:line_id>/remove/",
        v.BillLineRemoveView.as_view(),
        name="staff-bill-line-remove",
    ),
    path("bills/<uuid:bill_id>/payments/", v.PaymentsView.as_view(), name="staff-bill-payments"),
    path(
        "bills/<uuid:bill_id>/exemptions/",
        v.ExemptionsView.as_view(),
        name="staff-bill-exemptions",
    ),
    path(
        "bills/<uuid:bill_id>/refund-requests/",
        v.RefundRequestView.as_view(),
        name="staff-bill-refund-requests",
    ),
    path(
        "payments/<uuid:payment_id>/void-requests/",
        v.VoidRequestView.as_view(),
        name="staff-payment-void-requests",
    ),
    path("approval-requests/", v.ApprovalsView.as_view(), name="staff-approval-requests"),
    path(
        "approval-requests/<uuid:approval_id>/approve/",
        v.ApproveView.as_view(),
        name="staff-approval-approve",
    ),
    path(
        "approval-requests/<uuid:approval_id>/reject/",
        v.RejectView.as_view(),
        name="staff-approval-reject",
    ),
    path(
        "approval-requests/<uuid:approval_id>/cancel/",
        v.CancelRequestView.as_view(),
        name="staff-approval-cancel",
    ),
    path(
        "credit-notes/<uuid:credit_note_id>/payouts/",
        v.PayoutView.as_view(),
        name="staff-credit-note-payouts",
    ),
    path("receipts/<uuid:receipt_id>/", v.ReceiptView.as_view(), name="staff-receipt"),
    path(
        "receipts/<uuid:receipt_id>/send/", v.ReceiptSendView.as_view(), name="staff-receipt-send"
    ),
    path("cash-shifts/", v.ShiftsView.as_view(), name="staff-cash-shifts"),
    path("cash-shifts/current/", v.CurrentShiftView.as_view(), name="staff-cash-shift-current"),
    path(
        "cash-shifts/<uuid:shift_id>/close/",
        v.CloseShiftView.as_view(),
        name="staff-cash-shift-close",
    ),
    path(
        "cash-shifts/<uuid:shift_id>/review/",
        v.ReviewShiftView.as_view(),
        name="staff-cash-shift-review",
    ),
    path(
        "billing/patients/<uuid:facility_patient_id>/balances/",
        v.BalancesView.as_view(),
        name="staff-patient-balances",
    ),
    # #203 monthly claim list per insurer
    path("insurance-claims/", c.ClaimsView.as_view(), name="staff-claims"),
    path("insurance-claims/insurers/", c.ClaimInsurersView.as_view(), name="staff-claim-insurers"),
    path("insurance-claims/export/", c.ClaimsExportView.as_view(), name="staff-claims-export"),
    path("bills/<uuid:bill_id>/claim/", c.ClaimMarkView.as_view(), name="staff-bill-claim"),
]
