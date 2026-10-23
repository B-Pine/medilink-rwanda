"""Recent authentication (contract §2.5): `RecentAuthRequired(max_age=300)` for DRF views and
`@requires_recent_auth()` for services.

Either a step-up (`_ml_step_up_at`, set by POST /staff/auth/step-up/) or the login's second factor
(`_ml_mfa_at`) within `max_age` seconds counts; otherwise `403 step_up_required`.
"""

from __future__ import annotations

import functools
import time
from collections.abc import Callable
from typing import Any, TypeVar, cast

from rest_framework.permissions import BasePermission

from medilink.accounts.sessions import MFA_AT_KEY
from medilink.core.exceptions import StepUpRequired

STEP_UP_AT_KEY = "_ml_step_up_at"
DEFAULT_MAX_AGE = 300

F = TypeVar("F", bound=Callable[..., Any])


def recent_auth_until(session: Any, max_age: int = DEFAULT_MAX_AGE) -> int | None:
    """Unix time until which the session counts as recently authenticated, or None."""
    latest = max(int(session.get(STEP_UP_AT_KEY) or 0), int(session.get(MFA_AT_KEY) or 0))
    if not latest:
        return None
    until = latest + max_age
    return until if until > time.time() else None


def has_recent_auth(request: Any, max_age: int = DEFAULT_MAX_AGE) -> bool:
    django_request = getattr(request, "_request", request)
    session = getattr(django_request, "session", None)
    return session is not None and recent_auth_until(session, max_age) is not None


def RecentAuthRequired(max_age: int = DEFAULT_MAX_AGE, methods: tuple[str, ...] = ()) -> type:
    """DRF permission. `methods` limits the check to those HTTP methods (e.g. ("POST",)).

    Put it after the authentication permission so anonymous callers still get 401."""

    class _RecentAuthRequired(BasePermission):
        def has_permission(self, request: Any, view: Any) -> bool:
            if methods and request.method not in methods:
                return True
            if not has_recent_auth(request, max_age):
                raise StepUpRequired()
            return True

    _RecentAuthRequired.__name__ = f"RecentAuthRequired[{max_age}]"
    return _RecentAuthRequired


def requires_recent_auth(max_age: int = DEFAULT_MAX_AGE) -> Callable[[F], F]:
    """Service decorator: the wrapped function takes `request=` and refuses without recent auth."""

    def decorator(func: F) -> F:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            if not has_recent_auth(kwargs.get("request"), max_age):
                raise StepUpRequired()
            return func(*args, **kwargs)

        return cast(F, wrapper)

    return decorator
