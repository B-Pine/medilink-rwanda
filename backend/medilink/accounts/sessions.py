"""Audience-scoped sessions (ADR 0006, security 03 §5).

Staff and patients get separate session cookies, selected by URL prefix:
  /api/v1/staff/*, /api/v1/platform/*, /ws/v1/staff/*  -> staff cookie   (__Host-ml_staff)
  /api/v1/patient/*, /ws/v1/patient/*                  -> patient cookie (__Host-ml_patient)
  /<ADMIN_URL>                                          -> admin cookie   (__Host-ml_admin)
Any other path (health, csrf, password reset, schema) gets a throwaway in-memory session.
Each audience has its own idle and absolute timeouts.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.contrib.sessions.backends.base import SessionBase

from medilink.accounts.session_store import PENDING_KEY

AUTH_AT_KEY = "_ml_auth_at"  # when the session became authenticated (absolute timeout)
LAST_SEEN_KEY = "_ml_last_seen"  # last activity (idle timeout)
MFA_AT_KEY = "_ml_mfa_at"  # when the second factor was verified (staff)
MFA_METHOD_KEY = "_ml_mfa_method"
ACTIVE_FACILITY_KEY = "_ml_facility"  # staff: active facility id
# PENDING_KEY (re-exported): staff password verified, second factor pending {user_id, stage, at}

LAST_SEEN_GRANULARITY = 60  # seconds; limits session writes to one per minute per session


@dataclass(frozen=True)
class Audience:
    name: str
    cookie_name: str
    idle_timeout: int
    absolute_timeout: int
    path_prefixes: tuple[str, ...]


def get_audiences() -> list[Audience]:
    return [
        Audience(
            name=name,
            cookie_name=cfg["COOKIE_NAME"],
            idle_timeout=int(cfg["IDLE_TIMEOUT"]),
            absolute_timeout=int(cfg["ABSOLUTE_TIMEOUT"]),
            path_prefixes=tuple(cfg["PATH_PREFIXES"]),
        )
        for name, cfg in settings.SESSION_AUDIENCES.items()
    ]


def get_audience(name: str) -> Audience:
    for audience in get_audiences():
        if audience.name == name:
            return audience
    raise KeyError(name)


def audience_for_path(path: str) -> Audience | None:
    for audience in get_audiences():
        if path.startswith(audience.path_prefixes):
            return audience
    return None


class NullSession(SessionBase):
    """Session for audience-less paths: never read from or written to storage, no cookie."""

    def exists(self, session_key: str) -> bool:
        return False

    def create(self) -> None:
        self._session_key = None
        self.modified = True

    def save(self, must_create: bool = False) -> None:
        return None

    def delete(self, session_key: str | None = None) -> None:
        return None

    def load(self) -> dict[str, Any]:
        return {}

    @classmethod
    def clear_expired(cls) -> None:
        return None


def enforce_session_timeouts(
    session: SessionBase, audience: Audience, now: float | None = None
) -> bool:
    """Apply the audience's idle/absolute timeouts. Flushes and returns False when expired."""
    current = int(now if now is not None else time.time())
    pending = session.get(PENDING_KEY)
    if pending is not None and current - int(pending.get("at", 0)) > settings.MFA_PENDING_TIMEOUT:
        session.flush()
        return False
    auth_at = session.get(AUTH_AT_KEY)
    if auth_at is None:
        return True
    last_seen = int(session.get(LAST_SEEN_KEY, auth_at))
    if (
        current - int(auth_at) > audience.absolute_timeout
        or current - last_seen > audience.idle_timeout
    ):
        session.flush()
        return False
    if current - last_seen >= LAST_SEEN_GRANULARITY:
        session[LAST_SEEN_KEY] = current
    return True
