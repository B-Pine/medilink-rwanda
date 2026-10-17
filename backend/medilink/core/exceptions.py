"""API error envelope and exception handler (architecture 02 §4).

Every error response looks like:
    {"error": {"code": "...", "message": "...", "fields": {...}, "request_id": "..."}}
`fields` is always present: field -> list of messages for validation errors, otherwise {}.
"""

from __future__ import annotations

import logging
from typing import Any

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.db import connections, transaction
from django.http import Http404, HttpRequest, JsonResponse
from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions, status
from rest_framework.response import Response

from medilink.core.logging import request_id_var

logger = logging.getLogger("medilink.api")

GENERIC_MESSAGES: dict[str, Any] = {
    "validation_error": _("Some fields need attention."),
    "bad_request": _("The request could not be understood."),
    "not_authenticated": _("Please sign in to continue."),
    "mfa_required": _("Two-step verification is required."),
    "permission_denied": _("You don't have permission to do this."),
    "step_up_required": _("Please confirm it's you to continue."),
    "csrf_failed": _("Your session security token is missing or invalid. Refresh and try again."),
    "not_found": _("Not found."),
    "method_not_allowed": _("This method is not allowed here."),
    "not_acceptable": _("The requested response format is not available."),
    "unsupported_media_type": _("Send the request body as JSON."),
    "conflict": _("This conflicts with the current state. Reload and try again."),
    "business_rule_violation": _("This action is not allowed."),
    "rate_limited": _("Too many attempts. Please wait and try again."),
    "server_error": _("Something went wrong on our side. Please try again later."),
}


class MfaRequired(exceptions.NotAuthenticated):
    default_code = "mfa_required"
    default_detail = GENERIC_MESSAGES["mfa_required"]


class CsrfFailed(exceptions.PermissionDenied):
    default_code = "csrf_failed"
    default_detail = GENERIC_MESSAGES["csrf_failed"]


class StepUpRequired(exceptions.PermissionDenied):
    default_code = "step_up_required"
    default_detail = GENERIC_MESSAGES["step_up_required"]


class Conflict(exceptions.APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "conflict"
    default_detail = GENERIC_MESSAGES["conflict"]


class BusinessRuleViolation(exceptions.APIException):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    default_code = "business_rule_violation"
    default_detail = GENERIC_MESSAGES["business_rule_violation"]


class RateLimited(exceptions.Throttled):
    """429 with Retry-After, for custom (non-DRF-throttle) limits such as login lockout."""

    default_code = "rate_limited"


def error_payload(
    code: str, message: Any = None, fields: dict[str, list[str]] | None = None
) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": str(message if message is not None else GENERIC_MESSAGES.get(code, code)),
            "fields": fields or {},
            "request_id": request_id_var.get(),
        }
    }


def error_response(
    status_code: int,
    code: str,
    message: Any = None,
    fields: dict[str, list[str]] | None = None,
    headers: dict[str, str] | None = None,
) -> Response:
    """Build an error Response without raising (the request transaction is kept, e.g. to persist
    an `auth.login.failure` audit entry)."""
    return Response(error_payload(code, message, fields), status=status_code, headers=headers)


def json_error(status_code: int, code: str, message: Any = None) -> JsonResponse:
    """Error envelope for plain Django views (404/500 handlers, CSRF failure)."""
    return JsonResponse(
        error_payload(code, message),
        status=status_code,
        json_dumps_params={"separators": (",", ":"), "ensure_ascii": False},
    )


def _flatten_fields(detail: Any) -> dict[str, list[str]]:
    if isinstance(detail, dict):
        fields: dict[str, list[str]] = {}
        for key, value in detail.items():
            if isinstance(value, dict):
                for sub_key, sub_value in _flatten_fields(value).items():
                    fields[f"{key}.{sub_key}"] = sub_value
            elif isinstance(value, list) and value and isinstance(value[0], dict):
                for index, item in enumerate(value):
                    for sub_key, sub_value in _flatten_fields(item).items():
                        fields[f"{key}.{index}.{sub_key}"] = sub_value
            else:
                items = value if isinstance(value, list) else [value]
                fields[str(key)] = [str(item) for item in items]
        return fields
    items = detail if isinstance(detail, list) else [detail]
    return {"non_field_errors": [str(item) for item in items]}


def _rollback() -> None:
    for conn in connections.all(initialized_only=True):
        if conn.in_atomic_block:
            transaction.set_rollback(True, using=conn.alias)


def api_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    headers: dict[str, str] = {}
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied()

    if isinstance(exc, exceptions.ValidationError):
        code, status_code = "validation_error", 400
        message = GENERIC_MESSAGES[code]
        fields = _flatten_fields(exc.detail)
    elif isinstance(exc, exceptions.APIException):
        status_code = exc.status_code
        fields = {}
        if isinstance(exc, MfaRequired):
            code = "mfa_required"
        elif isinstance(exc, exceptions.NotAuthenticated | exceptions.AuthenticationFailed):
            code, status_code = "not_authenticated", 401
        elif isinstance(exc, CsrfFailed):
            code = "csrf_failed"
        elif isinstance(exc, StepUpRequired):
            code = "step_up_required"
        elif isinstance(exc, exceptions.PermissionDenied):
            code = "permission_denied"
        elif isinstance(exc, exceptions.NotFound):
            code = "not_found"
        elif isinstance(exc, exceptions.MethodNotAllowed):
            code = "method_not_allowed"
        elif isinstance(exc, exceptions.NotAcceptable):
            code = "not_acceptable"
        elif isinstance(exc, exceptions.UnsupportedMediaType):
            code = "unsupported_media_type"
        elif isinstance(exc, exceptions.Throttled):
            code = "rate_limited"
            wait = getattr(exc, "wait", None)
            if wait is not None:
                headers["Retry-After"] = str(max(1, int(wait + 0.999)))
        elif isinstance(exc, exceptions.ParseError):
            code = "bad_request"
        elif isinstance(exc, Conflict | BusinessRuleViolation):
            code = exc.default_code
        else:
            code = str(getattr(exc, "default_code", "bad_request"))
        detail = exc.detail
        custom_detail = isinstance(detail, str) and str(detail) != str(type(exc).default_detail)
        if code == "rate_limited" or not custom_detail:
            message = GENERIC_MESSAGES.get(code, detail)
        else:
            message = detail
        auth_header = getattr(exc, "auth_header", None)
        if auth_header and status_code == 401:
            headers["WWW-Authenticate"] = auth_header
    else:
        # Unexpected error: generic message to the client, details to the (scrubbed) logs.
        request = context.get("request")
        logger.exception(
            "Unhandled API error on %s %s",
            getattr(request, "method", "?"),
            getattr(request, "path", "?"),
        )
        code, status_code, fields = "server_error", 500, {}
        message = GENERIC_MESSAGES[code]

    _rollback()
    return Response(error_payload(code, message, fields), status=status_code, headers=headers)


# --- plain Django handlers ------------------------------------------------------------------


def handler_not_found(request: HttpRequest, exception: Exception | None = None) -> JsonResponse:
    return json_error(404, "not_found")


def handler_server_error(request: HttpRequest) -> JsonResponse:
    return json_error(500, "server_error")


def handler_permission_denied(
    request: HttpRequest, exception: Exception | None = None
) -> JsonResponse:
    return json_error(403, "permission_denied")


def handler_bad_request(request: HttpRequest, exception: Exception | None = None) -> JsonResponse:
    return json_error(400, "bad_request")
