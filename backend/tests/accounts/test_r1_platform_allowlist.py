"""R1: every /platform/ endpoint enforces the network allowlist, and the refusal log keeps the
path and IP (security 04 §6)."""

from __future__ import annotations

import logging
from typing import Any

import pytest
from rest_framework.test import APIClient

from medilink.authz.platform import PlatformAdmin
from medilink.facilities.views_staff import PlatformMfaResetView
from medilink.patients import views_merge
from tests.conftest import login_staff
from tests.factories import make_staff

pytestmark = pytest.mark.django_db

MISSING = "00000000-0000-0000-0000-000000000000"


def test_platform_views_use_the_allowlisted_permission() -> None:
    platform_views = [PlatformMfaResetView] + [
        view
        for view in vars(views_merge).values()
        if isinstance(view, type)
        and view.__name__.startswith("Platform")
        and hasattr(view, "permission_classes")
    ]
    assert len(platform_views) >= 4
    for view in platform_views:
        assert PlatformAdmin in view.permission_classes, view.__name__


def test_non_allowlisted_ip_is_refused_and_logged(settings: Any, caplog: Any) -> None:
    client = APIClient()
    login_staff(client, make_staff(None, email="plat.r1@example.test", is_platform_admin=True))
    merges = "/api/v1/platform/merge-requests/"
    reset = f"/api/v1/platform/memberships/{MISSING}/mfa-reset/"
    assert client.get(merges).status_code == 200
    assert client.post(reset).status_code == 404
    settings.PLATFORM_ALLOWED_NETWORKS = "10.20.0.0/16"
    with caplog.at_level(logging.WARNING, logger="medilink.security"):
        assert client.get(merges).status_code == 403
        assert client.post(reset).status_code == 403
        assert client.get(f"{merges}{MISSING}/").status_code == 403
    refused = [r for r in caplog.records if "network allowlist" in r.getMessage()]
    assert refused and refused[0].extra_data == {"path": merges, "ip": "127.0.0.1"}
    assert client.get(merges, REMOTE_ADDR="10.20.3.4").status_code == 200
