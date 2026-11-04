"""S5 audit actions (contract sprint-05 §2.4), registered in the [S5] block of audit/actions.py."""

ACTIONS: frozenset[str] = frozenset(
    {
        "scheduling.booking.create",
        "scheduling.booking.cancel",
        "scheduling.booking.reschedule",
        "scheduling.booking.no_show_reverse",
        # S5b
        "scheduling.disruption.create",
        "scheduling.disruption.apply",
        "scheduling.disruption.resolve",
        "scheduling.follow_up.create",
        "scheduling.calendar_feed.create",
        "scheduling.calendar_feed.revoke",
        # W7 (upgrade 13): planned vaccinations and antenatal visits
        "scheduling.care_schedule.create",
        "scheduling.care_schedule.cancel",
    }
)
