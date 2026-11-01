"""`Idempotency-Key` header (architecture 02 §6): a UUID; a repeat within 24 h returns the
original result. Each endpoint stores the key with what it created."""

from __future__ import annotations

import uuid

from django.utils.translation import gettext_lazy as _
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter
from rest_framework import exceptions
from rest_framework.request import Request

IDEMPOTENCY = OpenApiParameter(
    "Idempotency-Key",
    OpenApiTypes.UUID,
    OpenApiParameter.HEADER,
    description="A UUID (architecture 02 §6); a repeat returns the original result.",
)
NOT_A_UUID = _("Send a UUID.")


def idempotency_key(request: Request) -> str | None:
    """The header as a canonical UUID string, or None when absent; anything else is a 400."""
    value = request.headers.get("Idempotency-Key", "").strip()
    if not value:
        return None
    try:
        return str(uuid.UUID(value))
    except ValueError:
        raise exceptions.ValidationError({"Idempotency-Key": [str(NOT_A_UUID)]}) from None
