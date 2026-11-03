"""Audit actions of the super admin console, registered in audit/actions.py ([S11] block)."""

ACTIONS = frozenset(
    {
        "platform.user.viewed",
        "platform.user.locked",
        "platform.user.unlocked",
        "platform.user.mfa_reset",
        "platform.user.sessions_revoked",
    }
)
