"""Public utility endpoints: health and CSRF token."""

from __future__ import annotations

from django.conf import settings
from django.http import HttpRequest, JsonResponse
from django.middleware.csrf import get_token
from drf_spectacular.utils import extend_schema
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from medilink.authz.permissions import PublicEndpoint
from medilink.core.exceptions import json_error
from medilink.core.serializers import CsrfTokenSerializer, HealthSerializer


class HealthView(APIView):
    """Liveness probe. Public; never touches the database."""

    authentication_classes: list[type] = []
    permission_classes = [PublicEndpoint]
    throttle_classes: list[type] = []

    @extend_schema(
        operation_id="health",
        tags=["system"],
        auth=[],
        responses={200: HealthSerializer},
        summary="Service health and API version",
    )
    def get(self, request: Request) -> Response:
        return Response({"status": "ok", "version": settings.API_VERSION})


class CsrfTokenView(APIView):
    """Returns a CSRF token and sets the CSRF cookie on the API host (ADR 0006).

    Frontends on other hosts can't read the API host's cookies, so they fetch the token here and
    send it as `X-CSRFToken` on every POST/PUT/PATCH/DELETE (with `credentials: "include"`).
    Fetch it again after any login step: signing in rotates the CSRF secret.
    """

    authentication_classes: list[type] = []
    permission_classes = [PublicEndpoint]

    @extend_schema(
        operation_id="csrf_token",
        tags=["system"],
        auth=[],
        responses={200: CsrfTokenSerializer},
        summary="Get a CSRF token (and the CSRF cookie)",
    )
    def get(self, request: Request) -> Response:
        return Response({"csrf_token": get_token(request._request)})


def csrf_failure(request: HttpRequest, reason: str = "") -> JsonResponse:
    """CSRF_FAILURE_VIEW: the error envelope with code csrf_failed (403)."""
    return json_error(403, "csrf_failed")
