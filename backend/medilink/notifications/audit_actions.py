"""S9 audit actions (contract sprint-09 §2.4), registered in the [S9] block of audit/actions.py."""

ACTIONS: frozenset[str] = frozenset(
    {
        "notifications.preferences.updated",
        "notifications.push.subscribed",
        "notifications.push.unsubscribed",
        "announcement.created",
        "announcement.updated",
        "announcement.published",
        "announcement.withdrawn",
        "notifications.template.revised",
        "notifications.template.activated",
        "notifications.deliveries.viewed",
    }
)
