"""S9 error and edge paths: recipients by permission, adapter failures, content policy, validation
(contract sprint-09 S9-B4, B8, B10, B12, S9-B19 coverage)."""

from __future__ import annotations

import smtplib
import uuid
from typing import Any
from unittest import mock

import pytest
import requests
from django.db import transaction
from django.test import override_settings
from pywebpush import WebPushException
from rest_framework.test import APIClient

from medilink.notifications import conf, content_policy, hooks
from medilink.notifications.channels import Message, Target
from medilink.notifications.channels.email import EmailAdapter
from medilink.notifications.channels.in_app import publish
from medilink.notifications.channels.web_push import WebPushAdapter
from medilink.notifications.models import PushSubscription
from medilink.notifications.recipients import Recipients
from tests.conftest import login_patient, login_staff
from tests.factories import UserFactory, make_patient_user, make_staff

pytestmark = pytest.mark.django_db
KEYS = {"WEB_PUSH_VAPID_PUBLIC_KEY": "pub", "WEB_PUSH_VAPID_PRIVATE_KEY": "priv"}


def _message() -> Message:
    return Message(
        notification_id=uuid.uuid4(),
        subject="Test",
        body="Body",
        priority="routine",
        language="en",
        url="http://x/notifications/1",
        ttl_seconds=60,
        topic="t",
    )


def test_facility_staff_by_permission_and_role(facility: Any) -> None:
    admin = make_staff(facility, roles=("facility_admin",))
    desk = make_staff(facility, roles=("receptionist",))
    doctor = make_staff(facility, roles=("doctor",))
    by_permission = {
        r.user_id
        for r in Recipients.facility_staff(facility.pk, permission="announcements.manage").resolve()
    }
    assert by_permission == {admin.pk}
    by_role = {
        r.user_id for r in Recipients.facility_staff(facility.pk, roles=["doctor"]).resolve()
    }
    assert by_role == {doctor.pk}
    everyone = {r.user_id for r in Recipients.facility_staff(facility.pk).resolve()}
    assert everyone == {admin.pk, desk.pk, doctor.pk}
    platform = make_staff(None, email="p.more@example.test", is_platform_admin=True)
    assert {r.user_id for r in Recipients.platform_admins().resolve()} == {platform.pk}


def test_content_policy() -> None:
    assert content_policy.clinical_terms("Résultat: Diagnostic posé") == ["diagnostic"]
    assert content_policy.clinical_terms("Your results are ready") == []
    content_policy.check("Clinic closed on Friday")
    with pytest.raises(content_policy.ContentPolicyError) as exc:
        content_policy.check("igituntu")
    assert exc.value.reason == "clinical_terms"
    with pytest.raises(content_policy.ContentPolicyError):
        content_policy.check("Visit www.example.com", allow_urls=False)


def test_endpoint_host_rules() -> None:
    assert conf.endpoint_host("https://fcm.googleapis.com/x") == "fcm.googleapis.com"
    assert conf.endpoint_host("https://a.push.apple.com/x") == "a.push.apple.com"
    assert conf.endpoint_host("https://push.apple.com/x") is None  # "*." needs a subdomain
    assert conf.endpoint_host("https://fcm.googleapis.com:99999/x") is None
    assert conf.endpoint_host("x" * 3000) is None
    assert conf.endpoint_host(123) is None  # type: ignore[arg-type]
    assert conf.endpoint_host("https:///nohost") is None


@override_settings(**KEYS)
def test_web_push_failures() -> None:
    user = UserFactory()
    sub = PushSubscription.objects.create(
        user=user,
        endpoint="https://fcm.googleapis.com/x",
        endpoint_host="fcm.googleapis.com",
        p256dh="p",
        auth_secret="a",
    )
    adapter = WebPushAdapter()
    target = Target(address=sub.endpoint, subscription_id=sub.pk)

    def raising(exc: Exception) -> Any:
        return mock.patch("pywebpush.webpush", side_effect=exc)

    gone = WebPushException("gone", response=mock.Mock(status_code=410))
    with raising(gone):
        assert adapter.send(_message(), target).revoke_target
    busy = WebPushException("busy", response=mock.Mock(status_code=503))
    with raising(busy):
        assert adapter.send(_message(), target).retryable
    bad = WebPushException("bad", response=mock.Mock(status_code=400))
    with raising(bad):
        assert not adapter.send(_message(), target).retryable
    with raising(requests.Timeout()):
        assert adapter.send(_message(), target).failure_reason == "timeout"
    with raising(requests.TooManyRedirects()):
        assert not adapter.send(_message(), target).retryable
    with raising(requests.ConnectionError()):
        assert adapter.send(_message(), target).retryable
    assert (
        adapter.send(_message(), Target(address="", subscription_id=uuid.uuid4())).failure_reason
        == "no_target"
    )


def test_email_failures() -> None:
    adapter = EmailAdapter()
    target = Target(address="someone@example.test")
    for exc, retryable in (
        (smtplib.SMTPServerDisconnected(), True),
        (smtplib.SMTPResponseException(450, b"later"), True),
        (smtplib.SMTPResponseException(550, b"no"), False),
        (smtplib.SMTPException(), True),
    ):
        with mock.patch("django.core.mail.EmailMultiAlternatives.send", side_effect=exc):
            assert adapter.send(_message(), target).retryable is retryable


def test_socket_publish_survives_a_broken_layer() -> None:
    with mock.patch("medilink.notifications.channels.in_app.get_channel_layer", return_value=None):
        publish("patient", uuid.uuid4(), "notification.created", {})
    broken = mock.Mock()
    broken.group_send.side_effect = RuntimeError("down")
    with mock.patch(
        "medilink.notifications.channels.in_app.get_channel_layer", return_value=broken
    ):
        publish("patient", uuid.uuid4(), "notification.created", {})


def test_hooks_resolvers_dedupe() -> None:
    def a(*_: Any) -> list[str]:
        return ["p1", "p2"]

    def b(*_: Any) -> list[str]:
        return ["p2", "p3"]

    hooks.register_audience_resolver("x", a)
    hooks.register_audience_resolver("x", b)
    try:
        assert hooks.resolve_patients("x", None, None, None) == ["p1", "p2", "p3"]
    finally:
        hooks.unregister_audience_resolver("x", a)
        hooks.unregister_audience_resolver("x", b)


def test_view_validation_paths(facility: Any) -> None:
    patient = make_patient_user()
    client = APIClient()
    login_patient(client, patient)
    assert client.get("/api/v1/patient/notifications/", {"patient_id": "nope"}).status_code == 400
    assert (
        client.get("/api/v1/patient/notifications/", {"patient_id": str(uuid.uuid4())}).status_code
        == 404
    )
    assert client.get("/api/v1/patient/notifications/", {"is_read": "true"}).json()["count"] == 0
    with override_settings(**KEYS):
        weak = client.post(
            "/api/v1/patient/push-subscriptions/",
            {
                "endpoint": "https://fcm.googleapis.com/x",
                "keys": {"p256dh": "short", "auth": "short"},
            },
            format="json",
        )
        assert weak.status_code == 400
    off = client.post(
        "/api/v1/patient/push-subscriptions/",
        {"endpoint": "https://fcm.googleapis.com/x", "keys": {"p256dh": "a", "auth": "b"}},
        format="json",
    )
    assert off.status_code == 422  # push disabled
    admin = make_staff(facility, roles=("facility_admin",))
    staff = APIClient()
    login_staff(staff, admin)
    base = "/api/v1/staff/announcements/"
    cases = [
        {"audience": "all_facilities"},
        {"audience": "patients_in_range"},
        {
            "audience": "patients_in_range",
            "range_starts_on": "2026-11-05",
            "range_ends_on": "2026-11-01",
        },
        {
            "audience": "display",
            "starts_at": "2026-11-05T10:00:00Z",
            "ends_at": "2026-11-05T09:00:00Z",
        },
        {"audience": "display", "title_i18n": {"en": "x" * 121}},
        {"audience": "display", "body_i18n": {"en": "y" * 1001}},
        {"audience": "display", "title_i18n": {}, "body_i18n": {}},
    ]
    for case in cases:
        body = {"title_i18n": {"en": "Closed"}, "body_i18n": {"en": "Come Monday."}, **case}
        assert staff.post(base, body, format="json").status_code == 400, case
    row = staff.post(
        base,
        {"audience": "display", "title_i18n": {"en": "Closed"}, "body_i18n": {"en": "Monday."}},
        format="json",
    ).json()
    stale = staff.patch(
        f"{base}{row['id']}/", {"version": 99, "title_i18n": {"en": "New"}}, format="json"
    )
    assert stale.status_code == 409
    edited = staff.patch(
        f"{base}{row['id']}/",
        {"version": row["version"], "title_i18n": {"en": "New"}},
        format="json",
    )
    assert edited.status_code == 200 and edited.json()["title_i18n"] == {"en": "New"}
    assert staff.get(base, {"status": "draft"}).json()["count"] == 1
    assert staff.post(f"{base}{row['id']}/publish/").status_code == 200
    published = staff.patch(
        f"{base}{row['id']}/",
        {"version": edited.json()["version"] + 1, "title_i18n": {"en": "x"}},
        format="json",
    )
    assert published.status_code == 422
    assert staff.get(f"{base}{uuid.uuid4()}/").status_code == 404
    assert staff.get("/api/v1/staff/notification-deliveries/", {"since": "bad"}).status_code == 400
    naive = staff.get("/api/v1/staff/notification-deliveries/", {"since": "2026-01-01T00:00:00"})
    assert naive.status_code == 400
    assert (
        staff.get(
            "/api/v1/staff/notification-deliveries/",
            {
                "since": "2026-01-01T00:00:00Z",
                "status": "sent",
                "event_type": "system.test",
                "announcement_id": str(uuid.uuid4()),
            },
        ).status_code
        == 200
    )


def test_platform_selected_facilities_and_templates(facility: Any) -> None:
    platform = make_staff(None, email="p.sel@example.test", is_platform_admin=True)
    client = APIClient()
    login_staff(client, platform)
    base = "/api/v1/platform/announcements/"
    body = {
        "audience": "selected_facilities",
        "title_i18n": {"en": "Training"},
        "body_i18n": {"en": "On Friday."},
    }
    assert client.post(base, {**body, "target_facility_ids": []}, format="json").status_code == 400
    assert (
        client.post(
            base, {**body, "target_facility_ids": [str(uuid.uuid4())]}, format="json"
        ).status_code
        == 404
    )
    ok = client.post(base, {**body, "target_facility_ids": [str(facility.pk)]}, format="json")
    assert ok.status_code == 201, ok.content
    templates = client.get(
        "/api/v1/platform/notification-templates/", {"is_active": "false"}
    ).json()
    assert templates["count"] == 0
    first = client.get("/api/v1/platform/notification-templates/").json()["results"][0]
    assert client.get(f"/api/v1/platform/notification-templates/{first['id']}/").status_code == 200
    assert client.get(f"/api/v1/platform/notification-templates/{uuid.uuid4()}/").status_code == 404
    assert (
        client.post(f"/api/v1/platform/notification-templates/{uuid.uuid4()}/activate/").status_code
        == 404
    )
    long = client.post(
        f"/api/v1/platform/notification-templates/{first['id']}/revise/",
        {"subject": "s", "body": "$nope", "based_on_version": first["template_version"]},
        format="json",
    )
    assert long.status_code == 400


def test_dependent_notification_uses_dependent_variant(
    django_capture_on_commit_callbacks: Any,
) -> None:
    from medilink.notifications.registry import EventDefinition, Placeholder, Text, register
    from medilink.notifications.service import notify
    from medilink.notifications.templates import sync_defaults
    from medilink.patients.models import Patient, PatientLink, Relationship

    definition = EventDefinition(
        type="test.dependent.item",
        audience="patient",
        priority="routine",
        channels=("in_app",),
        placeholders={"person_name": Placeholder.PERSON_NAME},
        data_keys=frozenset({"item_id"}),
        templates={
            **{
                ("in_app", lang, "self"): Text("Your item", "Ready.") for lang in ("rw", "en", "fr")
            },
            **{
                ("in_app", lang, "dependent"): Text("Item for $person_name", "Ready.")
                for lang in ("rw", "en", "fr")
            },
        },
    )
    register(definition)
    sync_defaults()
    owner = make_patient_user()
    child = Patient.objects.create(full_name="Keza Umutoni")
    PatientLink.objects.create(account=owner, patient=child, relationship=Relationship.GUARDIAN)
    with transaction.atomic():
        result = notify(
            definition.type,
            Recipients.patient(child.pk),
            {"person_name": "Keza", "item_id": uuid.uuid4()},
        )
    from medilink.notifications.models import Notification

    note = Notification.objects.get(pk=result.created[0])
    assert (
        note.title == "Item for Keza"
        and note.variant == "dependent"
        and note.patient_id == child.pk
    )
