"""S1 authorisation helpers: recent authentication (S1-B16) and the platform allowlist."""

from __future__ import annotations

import time
from types import SimpleNamespace
from typing import Any

import pytest

from medilink.accounts.sessions import MFA_AT_KEY
from medilink.authz import platform
from medilink.authz.stepup import STEP_UP_AT_KEY, recent_auth_until, requires_recent_auth
from medilink.core.exceptions import StepUpRequired

pytestmark = pytest.mark.acceptance("S1-B16")


def _request(**session: Any) -> SimpleNamespace:
    return SimpleNamespace(session=dict(session))


def test_recent_auth_window() -> None:
    now = int(time.time())
    assert recent_auth_until({}) is None
    assert recent_auth_until({MFA_AT_KEY: now - 301}) is None
    assert recent_auth_until({MFA_AT_KEY: now - 10}) == now - 10 + 300
    assert recent_auth_until({MFA_AT_KEY: now - 900, STEP_UP_AT_KEY: now - 5}) == now - 5 + 300


def test_requires_recent_auth_decorator() -> None:
    @requires_recent_auth()
    def approve(*, request: Any) -> str:
        return "done"

    assert approve(request=_request(**{STEP_UP_AT_KEY: int(time.time())})) == "done"
    with pytest.raises(StepUpRequired):
        approve(request=_request(**{MFA_AT_KEY: int(time.time()) - 600}))
    with pytest.raises(StepUpRequired):
        approve(request=None)


def test_platform_allowlist(settings: Any) -> None:
    settings.PLATFORM_ALLOWED_NETWORKS = ""
    assert platform.ip_allowed("203.0.113.9")
    assert [m.id for m in platform.check_platform_networks()] == ["medilink.W100"]
    settings.PLATFORM_ALLOWED_NETWORKS = ["10.0.0.0/8", "2001:db8::/32"]
    assert platform.ip_allowed("10.1.2.3") and platform.ip_allowed("2001:db8::1")
    assert not platform.ip_allowed("192.0.2.1") and not platform.ip_allowed("not-an-ip")
    assert platform.check_platform_networks() == []
    settings.PLATFORM_ALLOWED_NETWORKS = "10.0.0.0/33"
    assert [m.id for m in platform.check_platform_networks()] == ["medilink.W101"]
