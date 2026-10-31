"""Booking errors with a specific `error.code` (contract sprint-05 §3.2 B3), so the patient app can
show the right message and next step."""

from __future__ import annotations

from typing import Any

from medilink.core.exceptions import BusinessRuleViolation, Conflict


class BookingRule(BusinessRuleViolation):
    """422 with a rule code: `age_rule`, `sex_rule`, `limit_active`, `limit_strikes`,
    `same_day_service`, `hold_expired`, `cancel_closed`, `remote_closed`, `not_allowed`."""

    def __init__(self, message: Any, code: str) -> None:
        super().__init__(message)
        self.default_code = code


class BookingConflict(Conflict):
    """409 with a code: `slot_taken`, `not_bookable`, `stale`."""

    def __init__(self, message: Any, code: str) -> None:
        super().__init__(message)
        self.default_code = code
