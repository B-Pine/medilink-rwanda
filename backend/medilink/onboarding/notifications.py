"""S1 notification stub (contract §8): plain emails through a Celery task until S9 merges, then
`dispatch()` calls S9 (S1-I6). Resume links stay direct transactional emails.

    dispatch("facility_application.submitted", application_id=...)
    dispatch("security.pin_changed", user_id=...)

Tasks get IDs only; emails carry no clinical data.
"""

from __future__ import annotations

from typing import Any

from django.db import transaction

EVENTS = frozenset(
    {
        "facility_application.started",
        "facility_application.submitted",
        "facility_application.changes_requested",
        "facility_application.approved",
        "facility_application.rejected",
        "facility_application.draft_expiring",
        "facility.licence_expiring",
        "facility.licence_expired",
        "facility.suspended",
        "facility.reactivated",
        "facility.deactivated",
        "security.pin_changed",
        "security.unlock_exhausted",
    }
)


def dispatch(event: str, **ids: Any) -> None:
    """Send the event's notification after the current transaction commits."""
    if event not in EVENTS:
        raise ValueError(f"Unknown notification event {event!r}")
    payload = {key: str(value) if value is not None else None for key, value in ids.items()}

    def _send() -> None:
        from medilink.onboarding.tasks import send_notification

        send_notification.delay(event, payload)

    transaction.on_commit(_send)
