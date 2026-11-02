"""S6 audit actions (contract sprint-06 §2.4), registered in the [S6] block of audit/actions.py."""

ACTIONS: frozenset[str] = frozenset(
    {
        "clinical.consultation.opened",
        "clinical.consultation.viewed",
        "clinical.consultation.signed",
        "clinical.consultation.entered_in_error",
        "clinical.addendum.added",
        "clinical.vitals.recorded",
        "clinical.vitals.entered_in_error",
        "clinical.history.viewed",
        "clinical.access_reason.given",
        # S6b
        "clinical.scan.added",
        "clinical.scan.downloaded",
        "clinical.result.reviewed",
        "clinical.history_entry.added",
        "clinical.health_attribute.recorded",
        "authz.break_glass.opened",
        "authz.break_glass.viewed",
        "authz.break_glass.ended",
        "authz.break_glass.reviewed",
    }
)
