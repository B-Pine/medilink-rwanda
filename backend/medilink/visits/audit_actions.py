"""S4 audit actions (contract §2.3), registered in the [S4] block of audit/actions.py."""

ACTIONS: frozenset[str] = frozenset(
    {
        "visits.check_in",
        "visits.ticket.reorder",
        "visits.ticket.priority",
        "visits.ticket.emergency",  # upgrade 05 §2
        "visits.ticket.transfer",
        "visits.ticket.triage",  # upgrade 06 §2 (#200)
        "visits.reorder.review",
        "visits.display_link.create",
        "visits.display_link.revoke",
        "visits.end_of_day",
    }
)
