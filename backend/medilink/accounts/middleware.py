"""AudienceSessionMiddleware: Django's SessionMiddleware, one cookie per audience.

The patient mobile app (upgrade 15) carries the same server-side session in a header instead:
requests marked `X-MediLink-Client: app` send the session key as `Authorization: Bearer <key>`,
and a response that creates, rotates or ends the session returns the new key in
`X-Session-Token` (empty when it ended). Such requests never read or set a cookie, so no ambient
credential exists and the CSRF check is skipped for them. Browsers cannot send the custom header
cross-site without a CORS preflight, which the allowlist refuses. Only audiences with an app idle
timeout (patients) accept the header; staff and admin requests from the app stay anonymous.
"""

from __future__ import annotations

import time

from django.conf import settings
from django.contrib.sessions.backends.base import UpdateError
from django.contrib.sessions.exceptions import SessionInterrupted
from django.contrib.sessions.middleware import SessionMiddleware
from django.http import HttpRequest, HttpResponse
from django.utils.cache import patch_cache_control, patch_vary_headers
from django.utils.http import http_date

from medilink.accounts.session_store import SessionStore
from medilink.accounts.sessions import (
    APP_SESSION_KEY,
    Audience,
    NullSession,
    audience_for_path,
    enforce_session_timeouts,
)

APP_CLIENT_HEADER = "HTTP_X_MEDILINK_CLIENT"
APP_CLIENT = "app"
SESSION_TOKEN_HEADER = "X-Session-Token"  # noqa: S105 - a header name, not a secret


def is_app_request(request: HttpRequest) -> bool:
    return request.META.get(APP_CLIENT_HEADER) == APP_CLIENT


def _bearer_key(request: HttpRequest) -> str | None:
    scheme, _, key = request.META.get("HTTP_AUTHORIZATION", "").partition(" ")
    key = key.strip()
    return key if scheme.lower() == "bearer" and key else None


class AudienceSessionMiddleware(SessionMiddleware):
    def process_request(self, request: HttpRequest) -> None:
        audience = audience_for_path(request.path_info)
        request.session_audience = audience  # type: ignore[attr-defined]
        if is_app_request(request):
            self._process_app_request(request)
            return
        if audience is None:
            request.session = NullSession()
            return
        session_key = request.COOKIES.get(audience.cookie_name)
        request.session = SessionStore(session_key, audience=audience.name)
        enforce_session_timeouts(request.session, audience)

    def _process_app_request(self, request: HttpRequest) -> None:
        # No cookie is read or written for the app: nothing ambient for a forged request to use.
        request._dont_enforce_csrf_checks = True  # type: ignore[attr-defined]
        audience = request.session_audience  # type: ignore[attr-defined]
        if audience is None or not audience.app_idle_timeout:
            request.session = NullSession()
            return
        request.app_session_key = _bearer_key(request)  # type: ignore[attr-defined]
        request.session = SessionStore(request.app_session_key, audience=audience.name)  # type: ignore[attr-defined]
        enforce_session_timeouts(request.session, audience)

    def process_response(self, request: HttpRequest, response: HttpResponse) -> HttpResponse:
        audience = getattr(request, "session_audience", None)
        session = getattr(request, "session", None)
        if audience is None or session is None or isinstance(session, NullSession):
            return response
        if hasattr(request, "app_session_key"):
            return self._process_app_response(request, response, session, audience)
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
                samesite=settings.SESSION_COOKIE_SAMESITE,  # type: ignore[arg-type]
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
            self._save(session)
            response.set_cookie(
                cookie,
                session.session_key,
                max_age=max_age,
                expires=expires,
                domain=settings.SESSION_COOKIE_DOMAIN,
                path=settings.SESSION_COOKIE_PATH,
                secure=bool(settings.SESSION_COOKIE_SECURE),
                httponly=bool(settings.SESSION_COOKIE_HTTPONLY),
                samesite=settings.SESSION_COOKIE_SAMESITE,  # type: ignore[arg-type]
            )
        return response

    def _process_app_response(
        self,
        request: HttpRequest,
        response: HttpResponse,
        session: SessionStore,
        audience: Audience,
    ) -> HttpResponse:
        sent_key = request.app_session_key  # type: ignore[attr-defined]
        patch_vary_headers(response, ("Authorization",))
        if session.is_empty():
            if sent_key:  # logged out or expired: tell the app to forget its key
                response[SESSION_TOKEN_HEADER] = ""
                patch_cache_control(response, no_store=True)
            return response
        if not session.get(APP_SESSION_KEY):
            session[APP_SESSION_KEY] = True
            session.set_expiry(audience.app_idle_timeout)
        if (session.modified or settings.SESSION_SAVE_EVERY_REQUEST) and response.status_code < 500:
            self._save(session)
        if session.session_key and session.session_key != sent_key:
            response[SESSION_TOKEN_HEADER] = session.session_key
            patch_cache_control(response, no_store=True)
        return response

    @staticmethod
    def _save(session: SessionStore) -> None:
        try:
            session.save()
        except UpdateError as exc:  # pragma: no cover - concurrent logout
            raise SessionInterrupted(
                "The request's session was deleted before the request completed."
            ) from exc
