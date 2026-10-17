"""AudienceSessionMiddleware: Django's SessionMiddleware, one cookie per audience."""

from __future__ import annotations

import time

from django.conf import settings
from django.contrib.sessions.backends.base import UpdateError
from django.contrib.sessions.exceptions import SessionInterrupted
from django.contrib.sessions.middleware import SessionMiddleware
from django.http import HttpRequest, HttpResponse
from django.utils.cache import patch_vary_headers
from django.utils.http import http_date

from medilink.accounts.session_store import SessionStore
from medilink.accounts.sessions import NullSession, audience_for_path, enforce_session_timeouts


class AudienceSessionMiddleware(SessionMiddleware):
    def process_request(self, request: HttpRequest) -> None:
        audience = audience_for_path(request.path_info)
        request.session_audience = audience  # type: ignore[attr-defined]
        if audience is None:
            request.session = NullSession()
            return
        session_key = request.COOKIES.get(audience.cookie_name)
        request.session = SessionStore(session_key, audience=audience.name)
        enforce_session_timeouts(request.session, audience)

    def process_response(self, request: HttpRequest, response: HttpResponse) -> HttpResponse:
        audience = getattr(request, "session_audience", None)
        session = getattr(request, "session", None)
        if audience is None or session is None or isinstance(session, NullSession):
            return response
        try:
            accessed = session.accessed
            modified = session.modified
            empty = session.is_empty()
        except AttributeError:  # pragma: no cover
            return response

        cookie = audience.cookie_name
        if cookie in request.COOKIES and empty:
            response.delete_cookie(
                cookie,
                path=settings.SESSION_COOKIE_PATH,
                domain=settings.SESSION_COOKIE_DOMAIN,
                samesite=settings.SESSION_COOKIE_SAMESITE,
            )
            patch_vary_headers(response, ("Cookie",))
            return response

        if accessed:
            patch_vary_headers(response, ("Cookie",))
        if (
            (modified or settings.SESSION_SAVE_EVERY_REQUEST)
            and not empty
            and response.status_code < 500
        ):
            max_age = session.get_expiry_age()
            expires = http_date(time.time() + max_age)
            try:
                session.save()
            except UpdateError as exc:  # pragma: no cover - concurrent logout
                raise SessionInterrupted(
                    "The request's session was deleted before the request completed."
                ) from exc
            response.set_cookie(
                cookie,
                session.session_key,
                max_age=max_age,
                expires=expires,
                domain=settings.SESSION_COOKIE_DOMAIN,
                path=settings.SESSION_COOKIE_PATH,
                secure=settings.SESSION_COOKIE_SECURE or None,
                httponly=settings.SESSION_COOKIE_HTTPONLY or None,
                samesite=settings.SESSION_COOKIE_SAMESITE,
            )
        return response
