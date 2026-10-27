"""S5 audit actions (contract sprint-05 §2.4), registered in the [S5] block of audit/actions.py."""

ACTIONS: frozenset[str] = frozenset(
    {
        "scheduling.booking.create",
        "scheduling.booking.cancel",
        "scheduling.booking.reschedule",
        "scheduling.booking.no_show_reverse",
    }
)
