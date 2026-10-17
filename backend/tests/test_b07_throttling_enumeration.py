"""B7: login throttling, generic errors (no account enumeration), password reset always 202."""

from __future__ import annotations

from typing import Any
from unittest import mock

import pytest
from rest_framework.test import APIClient

from medilink.accounts.lockout import LockoutPolicy, login_policy, mfa_policy, reset_email_allowed
from medilink.core.throttling import IPScopedRateThrottle
from tests.conftest import error_code

pytestmark = [pytest.mark.acceptance("B7"), pytest.mark.django_db]

STAFF_LOGIN = "/api/v1/staff/auth/login/"
PATIENT_LOGIN = "/api/v1/patient/auth/login/"
RESET = "/api/v1/auth/password-reset/"


def _strip_request_id(body: dict[str, Any]) -> dict[str, Any]:
    body["error"].pop("request_id")
    return body


@pytest.mark.parametrize("url", [STAFF_LOGIN, PATIENT_LOGIN])
def test_b7_unknown_email_and_wrong_password_look_identical(
    api: APIClient, staff_user: Any, patient_user: Any, url: str
) -> None:
    existing = staff_user.email if url == STAFF_LOGIN else patient_user.email
    wrong_password = api.post(url, {"email": existing, "password": "not the right passphrase"})
    unknown = api.post(
        url, {"email": "nobody@example.test", "password": "not the right passphrase"}
    )
    assert wrong_password.status_code == unknown.status_code == 401
    assert _strip_request_id(wrong_password.json()) == _strip_request_id(unknown.json())
    assert wrong_password.json()["error"]["code"] == "not_authenticated"


def test_b7_valid_patient_password_on_staff_login_is_generic(
    api: APIClient, patient_user: Any
) -> None:
    response = api.post(
        STAFF_LOGIN, {"email": patient_user.email, "password": "a long synthetic test passphrase"}
    )
    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Email or password is incorrect."


def test_b7_account_lockout_after_ten_failures(api: APIClient, staff_user: Any) -> None:
    clock = [1_000_000.0]
    with mock.patch("medilink.accounts.lockout.time") as fake_time:
        fake_time.time.side_effect = lambda: clock[0]
        for _ in range(10):
            clock[0] += 120  # wait out the progressive delay each time
            response = api.post(
                STAFF_LOGIN, {"email": staff_user.email, "password": "wrong passphrase!!"}
            )
            assert response.status_code == 401
        clock[0] += 120
        locked = api.post(
            STAFF_LOGIN, {"email": staff_user.email, "password": "a long synthetic test passphrase"}
        )
    assert locked.status_code == 429
    assert error_code(locked) == "rate_limited"
    assert 0 < int(locked["Retry-After"]) <= 15 * 60


def test_b7_lockout_applies_equally_to_unknown_accounts(api: APIClient) -> None:
    clock = [2_000_000.0]
    with mock.patch("medilink.accounts.lockout.time") as fake_time:
        fake_time.time.side_effect = lambda: clock[0]
        for _ in range(10):
            clock[0] += 120
            api.post(
                PATIENT_LOGIN, {"email": "ghost@example.test", "password": "wrong passphrase!!"}
            )
        clock[0] += 120
        response = api.post(
            PATIENT_LOGIN, {"email": "ghost@example.test", "password": "wrong passphrase!!"}
        )
    assert response.status_code == 429


def test_b7_progressive_delay_after_five_failures() -> None:
    policy = LockoutPolicy(
        "test",
        delay_after=5,
        lock_after=10,
        lock_seconds=900,
        max_delay_seconds=60,
        window_seconds=900,
    )
    now = 5_000.0
    for _ in range(4):
        policy.register_failure("a@example.test", now)
    assert policy.retry_after("a@example.test", now) == 0
    policy.register_failure("a@example.test", now)  # 5th
    assert policy.retry_after("a@example.test", now) == 1
    policy.register_failure("a@example.test", now)  # 6th
    assert policy.retry_after("a@example.test", now) == 2
    assert policy.retry_after("a@example.test", now + 3) == 0
    policy.reset("a@example.test")
    assert policy.retry_after("a@example.test", now) == 0


def test_b7_successful_login_resets_the_counter(api: APIClient, staff_user: Any) -> None:
    for _ in range(3):
        api.post(STAFF_LOGIN, {"email": staff_user.email, "password": "wrong passphrase!!"})
    assert (
        api.post(
            STAFF_LOGIN, {"email": staff_user.email, "password": "a long synthetic test passphrase"}
        ).status_code
        == 200
    )
    state_key = login_policy()._key(staff_user.email)
    from django.core.cache import cache

    assert cache.get(state_key) is None
    assert mfa_policy().lock_after == 5


def test_b7_ip_throttle_on_login(api: APIClient) -> None:
    with mock.patch.dict(IPScopedRateThrottle.THROTTLE_RATES, {"auth": "3/min"}):
        codes = [
            api.post(
                PATIENT_LOGIN, {"email": f"x{i}@example.test", "password": "whatever passphrase"}
            ).status_code
            for i in range(4)
        ]
    assert codes == [401, 401, 401, 429]


def test_b7_password_reset_is_always_202(
    api: APIClient, patient_user: Any, mailoutbox: Any, django_capture_on_commit_callbacks: Any
) -> None:
    with django_capture_on_commit_callbacks(execute=True):
        known = api.post(RESET, {"email": patient_user.email})
        unknown = api.post(RESET, {"email": "nobody@example.test"})
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()
    assert len(mailoutbox) == 1
    assert mailoutbox[0].to == [patient_user.email]


def test_b7_password_reset_per_email_limit_is_silent(
    api: APIClient, patient_user: Any, mailoutbox: Any, django_capture_on_commit_callbacks: Any
) -> None:
    with django_capture_on_commit_callbacks(execute=True):
        responses = [api.post(RESET, {"email": patient_user.email}) for _ in range(5)]
    assert {r.status_code for r in responses} == {202}
    assert len(mailoutbox) == 3
    assert reset_email_allowed("someone.else@example.test")


def test_b7_password_reset_ip_throttle_is_429(api: APIClient) -> None:
    with mock.patch.dict(IPScopedRateThrottle.THROTTLE_RATES, {"password_reset": "2/hour"}):
        codes = [api.post(RESET, {"email": f"a{i}@example.test"}).status_code for i in range(3)]
    assert codes == [202, 202, 429]
