"""S7a audit actions (contract sprint-07 §2.3), registered in the [S7] block of audit/actions.py."""

ACTIONS: frozenset[str] = frozenset(
    {
        "pharmacy.prescription.issued",
        "pharmacy.prescription.item_added_after_issue",
        "pharmacy.prescription.item_cancelled",
        "pharmacy.prescription.cancelled",
        "pharmacy.prescription.covered",
        "pharmacy.prescription.expired",
        "pharmacy.prescription.viewed",
        "pharmacy.dispensed",
        "pharmacy.query.raised",
        "pharmacy.query.answered",
        "pharmacy.query.closed",
        "pharmacy.availability.changed",
        # W5 stock (upgrade 13 §3)
        "pharmacy.stock.received",
        "pharmacy.stock.adjusted",
        "pharmacy.stock.threshold_changed",
    }
)
