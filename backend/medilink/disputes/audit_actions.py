"""S10 part 2a audit actions (contract sprint-10b §2), registered in the [S10] block of
audit/actions.py. IDs, statuses and outcomes only; never dispute text."""

ACTIONS: frozenset[str] = frozenset(
    {
        "disputes.raised",
        "disputes.acknowledged",
        "disputes.message",
        "disputes.info_requested",
        "disputes.comment_requested",
        "disputes.resolved",
        "disputes.final_decision",
        "disputes.closed",
        "disputes.escalated",
        "disputes.reopened",
        "disputes.statement_added",
        "disputes.deadlines",
        "disputes.viewed",
    }
)
