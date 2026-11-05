"""S3 audit actions (contract §2.6), registered in the [S3] block of audit/actions.py.

`ACCESS_HISTORY` lists the actions a patient sees in their access history (performed by others);
`ACCESS_HISTORY_ACTORS` says which actor kinds may appear for each of them.
"""

ACTIONS: frozenset[str] = frozenset(
    {
        "patients.walk_in.registered",
        "patients.existing.added",
        "patients.search.performed",
        "patients.duplicate_check.performed",
        "patients.duplicates.dismissed",
        "patients.record.viewed",
        "patients.record.updated",
        "patients.access_reason.given",
        "patients.identifier.added",
        "patients.identifier.superseded",
        "patients.identifier.verified",
        "patients.identifier.revealed",
        "patients.phone.revealed",
        "patients.profile.updated",
        "patients.photo.updated",
        "patients.photo.removed",
        "patients.photo.viewed",
        "patients.dependent.added",
        "patients.delegation.created",
        "patients.delegation.accepted",
        "patients.delegation.revoked",
        "patients.insurance.added",
        "patients.insurance.updated",
        "patients.insurance.verified",
        "patients.insurance.rejected",
        "patients.insurance.deactivated",
        "patients.insurance.card_uploaded",
        "patients.health_profile.viewed",
        "patients.health_item.added",
        "patients.health_item.reviewed",
        "patients.consent.recorded",
        "patients.claim.requested",
        "patients.claim.code_failed",
        "patients.claim.completed",
        "patients.claim.expired",
        "patients.merge.requested",
        "patients.merge.cancelled",
        "patients.merge.escalated",
        "patients.merge.rejected",
        "patients.merge.executed",
        "patients.merge.undone",
        "patients.keys.rotated",
    }
)

# Who may appear for each action group (R2): facility-side events only from staff, the platform
# or the system; self-service events only from linked accounts; shared events from either.
_FACILITY = frozenset({"staff", "platform", "system"})
_ACCOUNTS = frozenset({"self", "linked_account"})
_EITHER = _FACILITY | _ACCOUNTS

ACCESS_HISTORY_ACTORS: dict[str, frozenset[str]] = {
    **dict.fromkeys(
        (
            "patients.walk_in.registered",
            "patients.existing.added",
            "patients.record.viewed",
            "patients.record.updated",
            "patients.access_reason.given",
            "patients.identifier.verified",
            "patients.phone.revealed",
            "patients.insurance.verified",
            "patients.insurance.rejected",
            "patients.health_profile.viewed",
            "patients.health_item.reviewed",
            "patients.merge.executed",
            "patients.merge.undone",
        ),
        _FACILITY,
    ),
    **dict.fromkeys(
        (
            "patients.identifier.added",
            "patients.identifier.superseded",
            "patients.identifier.revealed",
            "patients.insurance.added",
            "patients.insurance.updated",
            "patients.insurance.deactivated",
            "patients.health_item.added",
            "patients.consent.recorded",
            "patients.claim.completed",
        ),
        _EITHER,
    ),
    **dict.fromkeys(
        (
            "patients.delegation.created",
            "patients.delegation.accepted",
            "patients.delegation.revoked",
        ),
        _ACCOUNTS,
    ),
}

ACCESS_HISTORY: frozenset[str] = frozenset(ACCESS_HISTORY_ACTORS)
