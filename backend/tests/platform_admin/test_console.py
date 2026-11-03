"""Super admin console (upgrade 2026-11-02): command centre, users and account actions, logs."""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient

from medilink.accounts.models import UserSession
from medilink.audit.models import AuditEntry
from tests.conftest import error_code, login_staff
from tests.factories import make_staff
from tests.masterdata.conftest import age_recent_auth
from tests.s7.conftest import S, clinic, desk  # noqa: F401

pytestmark = pytest.mark.django_db
PL = "/api/v1/platform/"


@pytest.fixture
def platform() -> tuple[APIClient, Any]:
    user = make_staff(None, email="plat.console@example.test", is_platform_admin=True)
    client = APIClient()
    login_staff(client, user)
    return client, user


def test_staff_cannot_open_the_console(desk: Any) -> None:  # noqa: F811
    client, _user = desk
    for path in ("command-center/", "users/", "security-events/", "access-events/"):
        assert client.get(f"{PL}{path}").status_code == 403, path


def test_command_center(platform: tuple[APIClient, Any], desk: Any) -> None:  # noqa: F811
    client, _ = platform
    body = client.get(f"{PL}command-center/").json()
    assert body["live_facilities"] >= 1
    assert set(body["attention"]) >= {
        "applications_waiting",
        "break_glass_to_review",
        "locked_accounts",
    }
    assert body["security"]["staff_total"] >= 1
    assert body["security"]["successful_logins_24h"] >= 1
    assert isinstance(body["map"], list) and isinstance(body["activity"], list)


def test_user_directory_and_profile(platform: tuple[APIClient, Any], desk: Any) -> None:  # noqa: F811
    client, me = platform
    _desk_client, receptionist = desk
    rows = client.get(f"{PL}users/", {"kind": "staff"}).json()["results"]
    row = next(r for r in rows if r["id"] == str(receptionist.pk))
    assert row["kind"] == "staff" and row["facilities"][0]["roles"] == ["receptionist"]
    assert all(r["kind"] == "staff" for r in rows)
    platform_rows = client.get(f"{PL}users/", {"kind": "platform"}).json()["results"]
    assert str(me.pk) in [r["id"] for r in platform_rows]

    detail = client.get(f"{PL}users/{receptionist.pk}/").json()
    assert detail["sessions"] and detail["events"]
    assert all(len(x["ref"]) == 10 for x in detail["sessions"])  # never the session key
    assert AuditEntry.objects.filter(
        action="platform.user.viewed", object_id=str(receptionist.pk)
    ).exists()


def test_lock_unlock_and_revoke(platform: tuple[APIClient, Any], desk: Any) -> None:  # noqa: F811
    client, me = platform
    _desk_client, receptionist = desk
    url = f"{PL}users/{receptionist.pk}/"

    short = client.post(f"{url}lock/", {"reason": "no"}, format="json")
    assert short.status_code == 400

    locked = client.post(f"{url}lock/", {"reason": "Shared password reported."}, format="json")
    assert locked.status_code == 200 and locked.json()["is_active"] is False
    assert not UserSession.objects.filter(user=receptionist).exists()
    assert AuditEntry.objects.filter(
        action="platform.user.locked", reason="Shared password reported."
    ).exists()

    unlocked = client.post(f"{url}unlock/", {"reason": "Password changed."}, format="json")
    assert unlocked.json()["is_active"] is True

    mfa = client.post(f"{url}reset-mfa/", {"reason": "Lost phone at the desk."}, format="json")
    assert mfa.status_code == 200 and mfa.json()["mfa_enabled"] is False

    yourself = client.post(f"{PL}users/{me.pk}/lock/", {"reason": "Testing myself."}, format="json")
    assert yourself.status_code == 422

    age_recent_auth(client)
    stale = client.post(f"{url}revoke-sessions/", {"reason": "Suspicious login."}, format="json")
    assert stale.status_code == 403 and error_code(stale) == "step_up_required"


def test_security_and_access_logs(platform: tuple[APIClient, Any], desk: Any) -> None:  # noqa: F811
    client, _ = platform
    security = client.get(f"{PL}security-events/").json()["results"]
    assert security and all(
        r["action"].startswith(("auth.", "platform.user.", "staff.mfa.")) for r in security
    )
    login = next(r for r in security if r["action"] == "auth.login.success")
    assert login["outcome"] == "success" and login["actor_name"]
    failures = client.get(f"{PL}security-events/", {"outcome": "failure"}).json()["results"]
    assert all(r["outcome"] == "failure" for r in failures)
    access = client.get(f"{PL}access-events/")
    assert access.status_code == 200 and "results" in access.json()
