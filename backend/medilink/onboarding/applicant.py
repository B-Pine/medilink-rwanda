"""Applicant access (S1-D8, API README §6 item 4): no accounts.

- Resume link: a single-use token (7 days) emailed to the applicant; only its SHA-256 is stored.
- Applicant session: exchanging the token sets an HttpOnly cookie bound to one application
  (8 h sliding); a new session replaces the earlier one. Cookie `__Secure-ml_applicant` in
  production (`ml_applicant` on plain-http dev), `SameSite=Lax`, path limited to the public
  application endpoints.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.db import transaction
from django.http import Http404
from django.utils import timezone

from medilink.onboarding.models import OPEN_STATUSES, Application

RESUME_TOKEN_DAYS = 7
SESSION_HOURS = 8
COOKIE_PATH = "/api/v1/public/facility-applications/"


def cookie_name() -> str:
    return "__Secure-ml_applicant" if settings.SESSION_COOKIE_SECURE else "ml_applicant"


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_token() -> str:
    return secrets.token_urlsafe(32)


def start_session(application: Application) -> str:
    """A new applicant session for the application (replaces any earlier one)."""
    token = new_token()
    application.session_token_hash = token_hash(token)
    application.session_expires_at = timezone.now() + timedelta(hours=SESSION_HOURS)
    application.last_activity_at = timezone.now()
    application.save(update_fields=["session_token_hash", "session_expires_at", "last_activity_at"])
    return token


def end_session(application: Application) -> None:
    application.session_token_hash = None
    application.session_expires_at = None
    application.save(update_fields=["session_token_hash", "session_expires_at"])


def set_cookie(response: Any, token: str) -> None:
    response.set_cookie(
        cookie_name(),
        token,
        max_age=SESSION_HOURS * 3600,
        path=COOKIE_PATH,
        secure=bool(settings.SESSION_COOKIE_SECURE),
        httponly=True,
        samesite="Lax",
    )


def clear_cookie(response: Any) -> None:
    response.delete_cookie(cookie_name(), path=COOKIE_PATH, samesite="Lax")


def application_for_request(
    request: Any, application_id: Any, *, lock: bool = False
) -> Application:
    """The application bound to the request's applicant cookie, or 404. Slides the session."""
    token = request.COOKIES.get(cookie_name(), "")
    if not token:
        raise Http404
    qs = Application.objects.filter(
        pk=application_id,
        session_token_hash=token_hash(token),
        session_expires_at__gt=timezone.now(),
    )
    if lock:
        qs = qs.select_for_update()
    application = qs.first()
    if application is None:
        raise Http404
    now = timezone.now()
    Application.objects.filter(pk=application.pk).update(
        session_expires_at=now + timedelta(hours=SESSION_HOURS), last_activity_at=now
    )
    request._applicant_token = token  # the view re-sets the cookie (sliding expiry)
    return application


def issue_resume_token(application_id: Any) -> tuple[Application, str] | None:
    """Fresh single-use resume token for an open application, or None."""
    with transaction.atomic():
        application = (
            Application.objects.select_for_update()
            .filter(pk=application_id, status__in=OPEN_STATUSES)
            .first()
        )
        if application is None:
            return None
        token = new_token()
        application.resume_token_hash = token_hash(token)
        application.resume_token_expires_at = timezone.now() + timedelta(days=RESUME_TOKEN_DAYS)
        application.save(update_fields=["resume_token_hash", "resume_token_expires_at"])
    return application, token


def redeem_resume_token(token: str) -> Application | None:
    """Consume a resume token (single use). Returns the application, or None if invalid."""
    if not token or len(token) > 200:
        return None
    application = (
        Application.objects.select_for_update()
        .filter(
            resume_token_hash=token_hash(token),
            resume_token_expires_at__gt=timezone.now(),
            status__in=OPEN_STATUSES,
        )
        .first()
    )
    if application is None:
        return None
    application.resume_token_hash = None
    application.resume_token_expires_at = None
    application.save(update_fields=["resume_token_hash", "resume_token_expires_at"])
    return application
