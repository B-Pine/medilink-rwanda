"""Audit actions of the super admin console, registered in audit/actions.py ([S11] block)."""

ACTIONS = frozenset(
    {
        "platform.user.viewed",
        "platform.user.locked",
        "platform.user.unlocked",
        "platform.user.mfa_reset",
        "platform.user.sessions_revoked",
        "platform.user.updated",
        "platform.user.password_reset_sent",
        "platform.user.verification_resent",
        "platform.user.sign_in_unblocked",
        "platform.user.list_exported",
        "platform.report.exported",  # W9 (#208): a national report table as CSV
    }
)
