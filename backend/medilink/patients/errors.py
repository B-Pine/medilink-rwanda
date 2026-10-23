"""Errors that carry a field (`409 conflict` with `fields.value`, contract §3), and the base view
that renders them in the standard envelope."""

from __future__ import annotations

from typing import Any

from django.db import connections, transaction
from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions
from rest_framework.response import Response
from rest_framework.views import APIView

from medilink.core.exceptions import (
    BusinessRuleViolation,
    Conflict,
    error_payload,
)


class FieldError(exceptions.APIException):
    """An error with a status other than 400 that still names the field."""

    code = ""

    def __init__(self, field: str, message: Any) -> None:
        super().__init__(message)
        self.field = field
        self.message = message


class FieldConflict(FieldError):
    status_code = 409
    code = "conflict"


class FieldRule(FieldError):
    status_code = 422
    code = "business_rule_violation"


def rule(message: Any) -> BusinessRuleViolation:
    return BusinessRuleViolation(message)


def stale() -> Conflict:
    return Conflict(_("Someone else changed this. Reload and try again."))


NOT_ALLOWED = _("You can't do this for this profile.")


class PatientsAPIView(APIView):
    def handle_exception(self, exc: Exception) -> Response:
        if isinstance(exc, FieldError):
            for conn in connections.all(initialized_only=True):
                if conn.in_atomic_block:
                    transaction.set_rollback(True, using=conn.alias)
            return Response(
                error_payload(exc.code, exc.message, {exc.field: [str(exc.message)]}),
                status=exc.status_code,
            )
        return super().handle_exception(exc)
