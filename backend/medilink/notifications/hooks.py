"""Hooks for later sprints (contract sprint-09 §3.1).

- `register_audience_resolver("patients_in_range", fn)`: S5 (bookings) and S4 (tickets) return the
  patient IDs with visits at a facility in a date range. Until then the resolver returns no one.
- `register_active_ticket_check(fn)`: S4 says whether an account has an active ticket, which locks
  the critical level of its preferences. Until then it returns False.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable, Iterable
from typing import Any

AudienceResolver = Callable[[Any, dt.date | None, dt.date | None], Iterable[Any]]

_resolvers: dict[str, list[AudienceResolver]] = {}
_ticket_checks: list[Callable[[Any], bool]] = []


def register_audience_resolver(audience: str, fn: AudienceResolver) -> None:
    _resolvers.setdefault(audience, []).append(fn)


def unregister_audience_resolver(audience: str, fn: AudienceResolver) -> None:
    if fn in _resolvers.get(audience, []):
        _resolvers[audience].remove(fn)


def resolve_patients(
    audience: str, facility_id: Any, starts_on: dt.date | None, ends_on: dt.date | None
) -> list[Any]:
    """Patient IDs for a facility audience, de-duplicated, in a stable order."""
    seen: dict[str, Any] = {}
    for fn in _resolvers.get(audience, []):
        for patient_id in fn(facility_id, starts_on, ends_on):
            seen.setdefault(str(patient_id), patient_id)
    return list(seen.values())


def register_active_ticket_check(fn: Callable[[Any], bool]) -> None:
    _ticket_checks.append(fn)


def unregister_active_ticket_check(fn: Callable[[Any], bool]) -> None:
    if fn in _ticket_checks:
        _ticket_checks.remove(fn)


def has_active_ticket(user: Any) -> bool:
    return any(check(user) for check in _ticket_checks)
