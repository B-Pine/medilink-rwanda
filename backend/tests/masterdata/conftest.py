"""Master data fixtures: a platform admin with a fresh second factor (step-up valid) and one whose
recent authentication has expired."""

from __future__ import annotations

import time
from collections.abc import Iterator
from typing import Any

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from medilink.accounts.models import User
from medilink.accounts.sessions import MFA_AT_KEY
from tests.conftest import login_staff
from tests.factories import make_staff


@pytest.fixture(autouse=True)
def _uploads_in_tmp(tmp_path: Any) -> Iterator[None]:
    with override_settings(
        UPLOADS={
            "storage": "local",
            "scanner": "fake",
            "local_root": str(tmp_path / "objects"),
            "download_base_url": "http://testserver/api/v1/files",
        }
    ):
        yield


@pytest.fixture
def platform_admin(db: Any) -> User:
    return make_staff(None, email="super.admin@example.test", is_platform_admin=True)


@pytest.fixture
def platform_client(platform_admin: User) -> APIClient:
    client = APIClient()
    login_staff(client, platform_admin)
    return client


def age_recent_auth(client: APIClient, seconds: int = 600) -> None:
    """Move the session's second-factor time into the past (step-up window expired)."""
    from importlib import import_module

    from django.conf import settings

    cookie = settings.SESSION_AUDIENCES["staff"]["COOKIE_NAME"]
    store = import_module(settings.SESSION_ENGINE).SessionStore(
        client.cookies[cookie].value, audience="staff"
    )
    store[MFA_AT_KEY] = int(time.time()) - seconds
    store.save()


@pytest.fixture
def stale_platform_client(platform_client: APIClient) -> APIClient:
    age_recent_auth(platform_client)
    return platform_client
