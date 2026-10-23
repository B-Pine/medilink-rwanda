"""S1 system check: the staff lock delay stays within 5 to 30 minutes (contract §2.5)."""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core.checks import CheckMessage, Error, Tags, register

LOCK_AFTER_RANGE = (300, 1800)


@register(Tags.security)
def check_staff_lock_after(app_configs: Any = None, **kwargs: Any) -> list[CheckMessage]:
    staff = settings.SESSION_AUDIENCES["staff"]
    lock_after = int(staff.get("LOCK_AFTER", 0))
    low, high = LOCK_AFTER_RANGE
    if lock_after >= int(staff["IDLE_TIMEOUT"]):
        return [
            Error(
                "STAFF_SESSION_IDLE_TIMEOUT must be longer than STAFF_SESSION_LOCK_AFTER, "
                "or sessions end before they can be unlocked.",
                id="medilink.E102",
            )
        ]
    if not low <= lock_after <= high:
        return [
            Error(
                f"STAFF_SESSION_LOCK_AFTER must be between {low} and {high} seconds "
                f"(got {lock_after}).",
                id="medilink.E101",
            )
        ]
    return []
