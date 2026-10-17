"""Opens the request transaction and sets the RLS tenant context from the verified session.

Order of operations for every request (except TENANT_CONTEXT_EXEMPT_PATHS):
  BEGIN
    resolve principal from the audience session (user, MFA state, active facility membership)
    SELECT set_config('app.user_id', ..., true), set_config('app.facility_id', ..., true)
    view
  COMMIT (or ROLLBACK on 5xx / handled API errors)

No session or no active membership -> empty context -> RLS returns no facility rows (fail closed).
"""

from __future__ import annotations

from collections.abc import Callable

from django.conf import settings
from django.db import transaction
from django.http import HttpRequest, HttpResponse

from medilink.accounts.principal import Principal, resolve_request_principal


class TenantContextMiddleware:
    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        audience = getattr(request, "session_audience", None)
        if request.path_info.startswith(tuple(settings.TENANT_CONTEXT_EXEMPT_PATHS)):
            request.principal = Principal.anonymous(audience.name if audience else None)  # type: ignore[attr-defined]
            return self.get_response(request)

        with transaction.atomic():
            request.principal = resolve_request_principal(request)  # type: ignore[attr-defined]
            response = self.get_response(request)
            if response.status_code >= 500:
                transaction.set_rollback(True)
        return response
