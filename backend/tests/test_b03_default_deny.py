"""B3: the global DRF default permission denies; every routed view declares its own policy."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from django.conf import settings
from django.urls import URLPattern, URLResolver, get_resolver
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory
from rest_framework.views import APIView

from medilink.authz.permissions import DenyAll

pytestmark = pytest.mark.acceptance("B3")


def _walk(patterns: list[Any], prefix: str = "") -> Iterator[tuple[str, Any]]:
    for pattern in patterns:
        if isinstance(pattern, URLResolver):
            yield from _walk(pattern.url_patterns, prefix + str(pattern.pattern))
        elif isinstance(pattern, URLPattern):
            yield prefix + str(pattern.pattern), pattern.callback


def _declares_permissions(view_class: type[APIView]) -> bool:
    for klass in view_class.__mro__:
        if "permission_classes" in klass.__dict__:
            return klass is not APIView
    return False


def routed_api_views() -> list[tuple[str, type[APIView]]]:
    views = []
    for route, callback in _walk(get_resolver().url_patterns):
        view_class = getattr(callback, "cls", None) or getattr(callback, "view_class", None)
        if isinstance(view_class, type) and issubclass(view_class, APIView):
            views.append((route, view_class))
    return views


def test_b3_global_default_permission_is_deny_all() -> None:
    assert settings.REST_FRAMEWORK["DEFAULT_PERMISSION_CLASSES"] == [
        "medilink.authz.permissions.DenyAll"
    ]
    assert APIView.permission_classes == [DenyAll]


def test_b3_every_routed_drf_view_declares_permission_classes() -> None:
    views = routed_api_views()
    assert len(views) >= 15, "expected the Sprint 0 endpoints to be routed"
    missing = [
        f"{route} ({cls.__name__})" for route, cls in views if not _declares_permissions(cls)
    ]
    assert not missing, f"views relying on the default permission: {missing}"


def test_b3_no_routed_view_uses_deny_all_by_accident() -> None:
    for route, view_class in routed_api_views():
        assert DenyAll not in view_class.permission_classes, route


def test_b3_view_without_explicit_permission_is_denied() -> None:
    class Forgotten(APIView):
        authentication_classes: list[type] = []

        def get(self, request: Any) -> Response:
            return Response({"leak": True})

    assert not _declares_permissions(Forgotten)
    response = Forgotten.as_view()(APIRequestFactory().get("/api/v1/forgotten/"))
    assert response.status_code == 403
    assert response.data["error"]["code"] == "permission_denied"
