"""S4 audit actions (contract §2.3), registered in the [S4] block of audit/actions.py."""

ACTIONS: frozenset[str] = frozenset(
    {
        "visits.check_in",
        "visits.ticket.reorder",
        "visits.ticket.priority",
        "visits.ticket.transfer",
        "visits.reorder.review",
        "visits.display_link.create",
        "visits.display_link.revoke",
        "visits.end_of_day",
    }
)
