"""R1: the account owner is emailed (and the lock audited) when sign-in gets locked."""

from __future__ import annotations

from typing import Any
from unittest import mock

import pytest
from rest_framework.test import APIClient

from medilink.accounts.lockout import LockoutPolicy
from medilink.accounts.tasks import TEXTS
from medilink.audit import actions
from medilink.audit.models import AuditEntry

pytestmark = pytest.mark.django_db

STAFF_LOGIN = "/api/v1/staff/auth/login/"
PATIENT_LOGIN = "/api/v1/patient/auth/login/"


def _fail(api: APIClient, url: str, email: str, times: int, clock: list[float]) -> None:
    for _ in range(times):
        clock[0] += 120  # wait out the progressive delay each time
        api.post(url, {"email": email, "password": "wrong passphrase!!"})


def test_login_lock_emails_the_owner_once(
    api: APIClient, staff_user: Any, mailoutbox: Any, django_capture_on_commit_callbacks: Any
) -> None:
    clock = [1_000_000.0]
    with (
        mock.patch("medilink.accounts.lockout.time") as fake_time,
        django_capture_on_commit_callbacks(execute=True),
    ):
        fake_time.time.side_effect = lambda: clock[0]
        _fail(api, STAFF_LOGIN, staff_user.email, 9, clock)
        assert mailoutbox == []
        _fail(api, STAFF_LOGIN, staff_user.email, 1, clock)  # 10th: lock starts
        _fail(api, STAFF_LOGIN, staff_user.email, 2, clock)  # refused while locked: no new email
    assert len(mailoutbox) == 1
    assert mailoutbox[0].to == [staff_user.email]
    # in the account's language (upgrade 17); the lock length is in every version
    assert mailoutbox[0].subject == TEXTS["locked"][staff_user.preferred_language][0]
    assert " 15 " in mailoutbox[0].body
    entry = AuditEntry.objects.get(action=actions.ACCOUNT_LOCKED)
    assert entry.actor_id == staff_user.pk and entry.metadata == {"kind": "login"}


def test_lock_on_unknown_email_sends_nothing(
    api: APIClient, mailoutbox: Any, django_capture_on_commit_callbacks: Any
) -> None:
    clock = [2_000_000.0]
    with (
        mock.patch("medilink.accounts.lockout.time") as fake_time,
        django_capture_on_commit_callbacks(execute=True),
    ):
        fake_time.time.side_effect = lambda: clock[0]
        _fail(api, PATIENT_LOGIN, "ghost@example.test", 10, clock)
    assert mailoutbox == []
    assert not AuditEntry.objects.filter(action=actions.ACCOUNT_LOCKED).exists()


def test_on_lock_runs_once_per_lock() -> None:
    policy = LockoutPolicy(
        "test", delay_after=5, lock_after=3, lock_seconds=60, max_delay_seconds=0, window_seconds=60
    )
    calls: list[float] = []
    for second in range(5):
        policy.register_failure("a", 100.0 + second, on_lock=lambda: calls.append(1))
    assert len(calls) == 1  # 3rd failure locked; 4th and 5th fell inside the lock
    policy.register_failure("a", 200.0, on_lock=lambda: calls.append(1))  # lock over: locks again
    assert len(calls) == 2
