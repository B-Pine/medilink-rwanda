"""CSRF enforcement for every unsafe API request.

DRF marks its views `csrf_exempt` and only checks CSRF for session-authenticated users, which would
leave anonymous endpoints (login, register, password reset) unprotected against login CSRF.
This middleware re-runs Django's CSRF check for all /api/ requests regardless of `csrf_exempt`.
Django's own CsrfViewMiddleware stays installed and handles the cookie (ADR 0006, B9).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from django.http import HttpRequest, HttpResponse, HttpResponseBase, HttpResponseForbidden
from django.middleware.csrf import CsrfViewMiddleware


def _not_exempt(request: HttpRequest) -> HttpResponse:  # pragma: no cover - never called
    raise AssertionError("placeholder view")


class ApiCsrfEnforcementMiddleware(CsrfViewMiddleware):
    prefix = "/api/"

    def process_request(self, request: HttpRequest) -> None:
        return None  # Django's CsrfViewMiddleware (earlier in MIDDLEWARE) already read the cookie

    def process_view(
        self,
        request: HttpRequest,
        callback: Callable[..., Any],
        callback_args: tuple[Any, ...],
        callback_kwargs: dict[str, Any],
    ) -> HttpResponseForbidden | None:
        if not request.path_info.startswith(self.prefix):
            return None
        if getattr(request, "csrf_processing_done", False):
            return None  # Django's middleware already checked (non-exempt view)
        return super().process_view(request, _not_exempt, callback_args, callback_kwargs)

    def process_response(
        self, request: HttpRequest, response: HttpResponseBase
    ) -> HttpResponseBase:
        return response  # the cookie is managed by django.middleware.csrf.CsrfViewMiddleware
