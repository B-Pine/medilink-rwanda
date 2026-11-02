"""S8 audit actions (contract sprint-08 §2.3), registered in the [S8] block of audit/actions.py."""

ACTIONS: frozenset[str] = frozenset(
    {
        "billing.bill.opened",
        "billing.bill.line_added",
        "billing.bill.line_removed",
        "billing.bill.voided",
        "billing.bill.viewed",
        "billing.insurance.verified",
        "billing.insurance.rejected",
        "billing.payment.recorded",
        "billing.payment.voided",
        "billing.receipt.issued",
        "billing.receipt.sent",
        "billing.exemption.applied",
        "billing.approval.requested",
        "billing.approval.approved",
        "billing.approval.rejected",
        "billing.approval.cancelled",
        "billing.credit_note.issued",
        "billing.refund.paid_out",
        "billing.shift.opened",
        "billing.shift.closed",
        "billing.shift.reviewed",
    }
)
