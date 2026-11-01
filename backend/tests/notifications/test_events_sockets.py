"""S9 security events, sockets, web push encryption, email, checks and jobs (contract sprint-09
S9-B11, B13, B14, B15, B16, B18)."""

from __future__ import annotations

import base64
import datetime as dt
import json
import uuid
from typing import Any
from unittest import mock

import pytest
from asgiref.sync import async_to_sync, sync_to_async
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.core import mail
from django.core.management import call_command
from django.db import transaction
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from medilink.notifications import checks, registry, tasks
from medilink.notifications.channels import Message, Target
from medilink.notifications.channels.web_push import WebPushAdapter, payload
from medilink.notifications.models import (
    AttemptStatus,
    DeliveryAttempt,
    KnownDevice,
    Notification,
    PushSubscription,
)
from medilink.notifications.recipients import Recipients
from medilink.notifications.registry import EventDefinition, Placeholder, Text
from medilink.notifications.service import notify
from tests.conftest import login_patient
from tests.factories import UserFactory, make_patient_user
from tests.test_b14_celery_channels import ALLOWED_ORIGIN, _connect, ws_db  # noqa: F401

pytestmark = pytest.mark.django_db
CHROME = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36"
FIREFOX = "Mozilla/5.0 (Windows NT 10.0; rv:131.0) Gecko/20100101 Firefox/131.0"


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _vapid() -> dict[str, str]:
    key = ec.generate_private_key(ec.SECP256R1())
    return {
        "WEB_PUSH_VAPID_PRIVATE_KEY": _b64(key.private_numbers().private_value.to_bytes(32, "big")),
        "WEB_PUSH_VAPID_PUBLIC_KEY": _b64(
            key.public_key().public_bytes(
                serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
            )
        ),
    }


def _browser_keys() -> dict[str, str]:
    key = ec.generate_private_key(ec.SECP256R1())
    public = key.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return {"p256dh": _b64(public), "auth": _b64(uuid.uuid4().bytes)}


def _login_patient(user: Any, ua: str) -> APIClient:
    client = APIClient(HTTP_USER_AGENT=ua)
    login_patient(client, user)
    return client


# ---- B15 security notifications -------------------------------------------------------------


def test_new_device_login_notifies_once(django_capture_on_commit_callbacks: Any) -> None:
    user = make_patient_user(preferred_language="en")
    with django_capture_on_commit_callbacks(execute=True):
        _login_patient(user, CHROME)  # first-ever device: nothing
        _login_patient(user, CHROME.replace("130.0", "131.0"))  # same device, newer version
    assert not Notification.objects.filter(recipient_user=user).exists()
    with django_capture_on_commit_callbacks(execute=True):
        _login_patient(user, FIREFOX)
    note = Notification.objects.get(recipient_user=user)
    assert note.event_type == "account.login.new_device" and "Firefox on Windows" in note.body
    assert {a.channel for a in note.attempts.all()} == {"in_app", "email"}
    assert mail.outbox[-1].to == [user.email]
    assert KnownDevice.objects.filter(user=user).count() == 2


def test_login_succeeds_when_notification_processing_fails(
    django_capture_on_commit_callbacks: Any,
) -> None:
    user = make_patient_user()
    with mock.patch(
        "medilink.notifications.observers.device_hash", side_effect=RuntimeError("boom")
    ):
        client = APIClient()
        login_patient(client, user)
    assert client.get("/api/v1/patient/auth/me/").status_code == 200


def test_mfa_enrolment_and_password_reset(django_capture_on_commit_callbacks: Any) -> None:
    from medilink.audit.services import record

    user = UserFactory(preferred_language="fr")
    sub = PushSubscription.objects.create(
        user=user,
        endpoint="https://fcm.googleapis.com/fcm/send/x",
        endpoint_host="fcm.googleapis.com",
        p256dh="p",
        auth_secret="a",
    )
    with django_capture_on_commit_callbacks(execute=True), transaction.atomic():
        record("auth.mfa.enrolled", actor=user, metadata={"method": "totp"})
        record("auth.password_reset.completed", actor=user, object_type="user", object_id=user.pk)
    events = set(
        Notification.objects.filter(recipient_user=user).values_list("event_type", flat=True)
    )
    assert events == {"account.mfa.enrolled", "account.password.changed"}
    sub.refresh_from_db()
    assert sub.revoked_reason == "password_reset"


@override_settings(**_vapid())
def test_patient_logout_revokes_that_sessions_subscriptions() -> None:
    user = make_patient_user()
    client = _login_patient(user, CHROME)
    response = client.post(
        "/api/v1/patient/push-subscriptions/",
        {"endpoint": "https://fcm.googleapis.com/fcm/send/shared", "keys": _browser_keys()},
        format="json",
    )
    assert response.status_code == 201, response.content
    other = PushSubscription.objects.create(
        user=user,
        endpoint="https://fcm.googleapis.com/fcm/send/home",
        endpoint_host="fcm.googleapis.com",
        p256dh="p",
        auth_secret="a",
    )
    assert client.post("/api/v1/patient/auth/logout/").status_code == 204
    shared = PushSubscription.objects.get(endpoint__endswith="/shared")
    other.refresh_from_db()
    assert shared.revoked_reason == "logout" and other.revoked_at is None


def test_role_changed_and_mfa_reset_via_notify(facility: Any) -> None:
    user = UserFactory()
    with transaction.atomic():
        notify(
            "account.role.changed",
            Recipients.users(user.pk),
            {
                "facility_name": facility.name,
                "date": timezone.now(),
                "membership_id": uuid.uuid4(),
                "change_id": uuid.uuid4(),
            },
            facility_id=facility.pk,
        )
        notify(
            "account.mfa.reset",
            Recipients.users(user.pk),
            {
                "facility_name": facility.name,
                "membership_id": uuid.uuid4(),
                "reset_id": uuid.uuid4(),
            },
        )
    assert Notification.objects.filter(recipient_user=user).count() == 2


# ---- B16 sockets ------------------------------------------------------------------------------


def test_notification_socket_auth_relay_and_rate_limit(ws_db: Any) -> None:  # noqa: F811
    user = make_patient_user()
    client = APIClient()
    login_patient(client, user)
    key = client.cookies["ml_patient"].value
    staff = UserFactory()

    def create() -> str:
        from django.test import TestCase

        with TestCase.captureOnCommitCallbacks(execute=True), transaction.atomic():
            created = notify(
                "system.test",
                Recipients.users(user.pk, audience="patient"),
                {"test_id": uuid.uuid4()},
            ).created[0]
        return str(created)

    def mark_read(created: str) -> None:
        from django.test import TestCase

        with TestCase.captureOnCommitCallbacks(execute=True):
            client.post(f"/api/v1/patient/notifications/{created}/read/")

    async def scenario() -> None:
        bad_origin, _ = _connect(
            "/ws/v1/patient/notifications/", b"https://evil.example", f"ml_patient={key}"
        )
        assert not (await bad_origin.connect())[0]
        anonymous, _ = _connect("/ws/v1/patient/notifications/", ALLOWED_ORIGIN)
        connected, code = await anonymous.connect()
        assert not connected and code == 4401
        wrong_audience, _ = _connect(
            "/ws/v1/staff/notifications/", ALLOWED_ORIGIN, f"ml_patient={key}"
        )
        assert not (await wrong_audience.connect())[0]
        tab1, _ = _connect("/ws/v1/patient/notifications/", ALLOWED_ORIGIN, f"ml_patient={key}")
        tab2, _ = _connect("/ws/v1/patient/notifications/", ALLOWED_ORIGIN, f"ml_patient={key}")
        assert (await tab1.connect())[0] and (await tab2.connect())[0]
        created = await sync_to_async(create)()
        message = await tab1.receive_json_from()
        assert message["type"] == "notification.created" and message["data"]["id"] == created
        assert set(message["data"]) <= {"id", "priority", "patient_id"}
        await tab2.receive_json_from()
        await sync_to_async(mark_read)(created)
        read_message = await tab2.receive_json_from()
        assert read_message["type"] == "notification.read"
        assert read_message["data"] == {"ids": [created]}
        for _ in range(31):
            await tab1.send_json_to({"type": "ping"})
        received = 0
        while True:
            output = await tab1.receive_output(timeout=1)
            if output["type"] == "websocket.close":
                assert output["code"] == 4429
                break
            received += json.loads(output["text"])["type"] == "pong"
        assert received == 30  # the 31st message closes the socket
        await tab2.disconnect()

    assert staff.pk != user.pk
    async_to_sync(scenario)()


# ---- B11 web push -----------------------------------------------------------------------------


def test_web_push_is_encrypted_signed_and_has_only_the_payload_fields() -> None:
    keys = _vapid()
    user = UserFactory()
    browser = _browser_keys()
    sub = PushSubscription.objects.create(
        user=user,
        endpoint="https://fcm.googleapis.com/fcm/send/abc",
        endpoint_host="fcm.googleapis.com",
        p256dh=browser["p256dh"],
        auth_secret=browser["auth"],
    )
    message = Message(
        notification_id=uuid.uuid4(),
        subject="Test notification",
        body="This is a MediLink test notification.",
        priority="critical",
        language="en",
        url="http://localhost:5174/notifications/x",
        ttl_seconds=600,
        topic="t" * 32,
    )
    data = json.loads(payload(message))
    assert set(data) == {"v", "id", "title", "body", "url", "tag", "priority"}
    assert len(payload(message)) <= 3 * 1024
    sent: dict[str, Any] = {}

    def fake_post(self: Any, url: str, data: bytes, headers: dict[str, str], timeout: Any) -> Any:
        sent.update(url=url, data=data, headers=headers)
        return mock.Mock(status_code=201, text="")

    with override_settings(**keys), mock.patch("requests.Session.post", fake_post):
        result = WebPushAdapter().send(
            message, Target(address=sub.endpoint, subscription_id=sub.pk)
        )
    assert result.status == "sent"
    assert sent["headers"]["Content-Encoding"] == "aes128gcm"
    assert sent["headers"]["Urgency"] == "high" and sent["headers"]["TTL"] == "600"
    assert sent["headers"]["Authorization"].startswith("vapid t=")
    assert b"MediLink test" not in sent["data"]  # encrypted

    sub.endpoint = "https://attacker.example/x"
    sub.save()
    with override_settings(**keys):
        refused = WebPushAdapter().send(
            message, Target(address=sub.endpoint, subscription_id=sub.pk)
        )
    assert refused.failure_reason == "no_target" and refused.revoke_target


def test_deploy_check_needs_keys_and_a_sane_allowlist() -> None:
    assert [e.id for e in checks.check_deploy()] == ["notifications.E010"]
    with override_settings(
        **_vapid(), WEB_PUSH_ALLOWED_HOSTS=["*", "10.0.0.1", "fcm.googleapis.com"]
    ):
        assert len(checks.check_deploy()) == 2
    with override_settings(**_vapid()):
        assert checks.check_deploy() == [] and checks.check_push() == []
    assert checks.check_push()[0].id == "notifications.W001"


# ---- B13 checks, B14 email ------------------------------------------------------------------


def test_registry_checks_catch_broken_events() -> None:
    assert checks.check_registry() == []
    broken = EventDefinition(
        type="test.broken.event",
        audience="patient",
        priority="routine",
        channels=("in_app", "web_push"),
        placeholders={"person_name": Placeholder.PERSON_NAME},
        templates={
            ("in_app", "en", "self"): Text("Hi $person_name", "Your HIV result"),
            ("web_push", "en", "self"): Text("Hi $person_name", "Ready"),
        },
    )
    registry.register(broken)
    registry.register(broken)
    try:
        ids = {e.id for e in checks.check_registry()}
    finally:
        registry._EVENTS.pop(broken.type, None)
        registry._DUPLICATES.clear()
    assert ids == {
        "notifications.E001",
        "notifications.E002",
        "notifications.E003",
        "notifications.E004",
    }


def test_email_is_localised_text_and_escaped_html(django_capture_on_commit_callbacks: Any) -> None:
    user = UserFactory(preferred_language="rw")
    with django_capture_on_commit_callbacks(execute=True), transaction.atomic():
        notify(
            "system.test", Recipients.users(user.pk, audience="patient"), {"test_id": uuid.uuid4()}
        )
    email = mail.outbox[-1]
    assert email.subject == "Ubutumwa bwo kugerageza" and not email.attachments
    html = email.alternatives[0][0]
    assert 'lang="rw"' in html and "<img" not in html
    assert "http://localhost:5174/notifications/" in email.body


# ---- B18 jobs ---------------------------------------------------------------------------------


def test_cleanup_and_double_send_guard() -> None:
    user = UserFactory()
    with transaction.atomic():
        created = notify(
            "system.test", Recipients.users(user.pk, audience="patient"), {"test_id": uuid.uuid4()}
        ).created[0]
    email = DeliveryAttempt.objects.get(notification_id=created, channel="email")
    tasks.send_attempt(str(email.pk))
    tasks.send_attempt(str(email.pk))  # a second worker finds it no longer queued
    assert len(mail.outbox) == 1
    email.refresh_from_db()
    assert email.status == AttemptStatus.SENT
    Notification.objects.filter(pk=created).update(
        created_at=timezone.now() - dt.timedelta(days=800)
    )
    counts = tasks.cleanup()
    assert counts["notifications"] >= 1
    call_command("notifications_tick")


def test_management_commands(capsys: Any) -> None:
    call_command("generate_vapid_keys")
    out = capsys.readouterr().out
    assert "WEB_PUSH_VAPID_PUBLIC_KEY=" in out and "WEB_PUSH_VAPID_PRIVATE_KEY=" in out
    user = UserFactory()
    with override_settings(DEBUG=True):
        call_command("send_test_notification", user.email)
    assert Notification.objects.filter(recipient_user=user, event_type="system.test").exists()
    from django.core.management.base import CommandError

    with override_settings(DEBUG=False), pytest.raises(CommandError):
        call_command("send_test_notification", user.email)
