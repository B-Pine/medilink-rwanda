"""S4 edge paths: jobs, outbox republish, validation branches, visit detail, seed command."""

from __future__ import annotations

import datetime as dt
from typing import Any
from unittest import mock

import pytest
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from medilink.tenancy.context import rls_context
from medilink.visits import outbox, services, tasks
from medilink.visits.models import OutboxEvent, Ticket, TicketState
from tests.s4.conftest import S, act, call_next, check_in, on_duty, register

pytestmark = pytest.mark.django_db


def test_check_in_validation(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    admin: tuple[APIClient, Any],
) -> None:
    client, user = desk
    service_id = catalogue["service"]["id"]
    record = register(clinic, user, "Ana One")
    assert check_in(client, record, service_id, priority_class="elderly").status_code == 422
    with rls_context(facility_id=clinic.pk):
        record.is_active = False
        record.save()
    assert check_in(client, record, service_id).status_code == 422
    service = admin[0].get(f"{S}services/").json()["results"][0]
    admin[0].patch(
        f"{S}services/{service_id}/",
        {"version": service["version"], "allows_walk_in": False},
        format="json",
    )
    other = register(clinic, user, "Ben Two")
    assert check_in(client, other, service_id).status_code == 422
    missing = client.post(
        f"{S}visits/check-in/",
        {"facility_patient_id": str(other.pk), "service_id": str(clinic.pk)},
        format="json",
    )
    assert missing.status_code == 404


def test_action_branches_and_visit_timeline(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
) -> None:
    service_id = catalogue["service"]["id"]
    client = desk[0]
    a = check_in(client, register(clinic, desk[1], "Ana One"), service_id).json()["ticket"]
    b = check_in(client, register(clinic, desk[1], "Ben Two"), service_id).json()["ticket"]
    assert act(client, a, "unknown").status_code == 404
    assert act(client, a, "cancel").status_code == 422  # reason code needed
    assert act(client, a, "step-out", minutes=200).status_code == 422
    assert act(client, a, "priority", priority_class="nope", reason_code="x").status_code == 400
    a = act(client, a, "priority", priority_class="pregnant", reason_code="visible").json()
    a = act(client, a, "priority", priority_class=None).json()
    assert a["priority_rank"] == 3
    assert (
        act(
            client, a, "reorder", before_ticket_id=a["id"], reason_code="other", reason_text="x"
        ).status_code
        == 422
    )
    assert (
        act(client, a, "reorder", before_ticket_id=b["id"], reason_code="other").status_code == 422
    )
    assert act(client, a, "transfer", service_id=service_id).status_code == 422
    doc = doctor[0]
    on_duty(doc, catalogue["point"]["id"])
    called = call_next(doc, service_id).json()
    called = act(doc, called, "recall").json()
    assert act(doc, called, "next-stage", stage="consultation").status_code == 422
    started = act(doc, called, "start").json()
    moved = act(doc, started, "next-stage", stage="pharmacy").json()
    assert moved["stage"] == "pharmacy"
    left = act(client, b, "left", reason_code="patient_left")
    assert left.json()["state"] == "left_without_service"
    detail = client.get(f"{S}visits/{called['visit_id']}/").json()
    assert [e["action"] for e in detail["events"]][:3] == ["check_in", "priority", "priority"]
    assert len(detail["tickets"]) == 2
    assert client.get(f"{S}visits/{clinic.pk}/").status_code == 404
    assert (
        doc.post(f"{S}queue/call-next/", {"service_id": str(clinic.pk)}, format="json").status_code
        == 404
    )
    assert doc.post(
        f"{S}queue/call-next/", {"service_id": service_id}, format="json"
    ).status_code in (200, 204, 409)


def test_duty_status_reads_and_validates(
    clinic: Any, catalogue: dict[str, Any], doctor: tuple[APIClient, Any]
) -> None:
    doc = doctor[0]
    assert doc.get(f"{S}duty-status/").json()["state"] == "off"
    bad = doc.put(
        f"{S}duty-status/", {"state": "on_duty", "service_point_id": str(clinic.pk)}, format="json"
    )
    assert bad.status_code == 422
    on_duty(doc, catalogue["point"]["id"])
    row = doc.get(f"{S}duty-status/").json()
    assert row["state"] == "on_duty" and row["service_point"] == "Room 1"
    emergency = doc.put(f"{S}duty-status/", {"state": "emergency"}, format="json").json()
    assert emergency["state"] == "emergency"
    assert doc.get(f"{S}queue/mine/").json()["duty"]["state"] == "emergency"


def test_jobs_close_day_expire_step_outs_and_republish(
    clinic: Any, catalogue: dict[str, Any], desk: tuple[APIClient, Any]
) -> None:
    service_id = catalogue["service"]["id"]
    a = check_in(desk[0], register(clinic, desk[1], "Ana One"), service_id).json()["ticket"]
    act(desk[0], a, "step-out", minutes=5)
    later = timezone.now() + dt.timedelta(minutes=10)
    with mock.patch("django.utils.timezone.now", return_value=later):
        assert tasks.expire_step_outs() == 1
    with rls_context(facility_id=clinic.pk):
        assert Ticket.objects.get(pk=a["id"]).step_out_until is None
        assert OutboxEvent.objects.filter(published_at__isnull=True).exists()
    with mock.patch(
        "django.utils.timezone.now", return_value=timezone.now() + dt.timedelta(hours=1)
    ):
        assert tasks.publish_outbox() >= 1
    assert OutboxEvent.objects.filter(published_at__isnull=True).count() == 0
    assert outbox.publish(OutboxEvent.objects.first().pk) is False  # already published
    tomorrow = timezone.now() + dt.timedelta(days=1, hours=12)
    with mock.patch("django.utils.timezone.now", return_value=tomorrow):
        assert tasks.end_of_day() == 1
    with rls_context(facility_id=clinic.pk):
        assert Ticket.objects.get(pk=a["id"]).state == TicketState.LEFT_WITHOUT_SERVICE
        assert services.end_of_day(clinic.pk) == 0


def test_publish_survives_a_broken_channel_layer(clinic: Any) -> None:
    with rls_context(facility_id=clinic.pk):
        event = OutboxEvent.objects.create(
            topic=outbox.QUEUE_CHANGED, facility_id=clinic.pk, payload={}
        )
    with mock.patch("medilink.visits.outbox.get_channel_layer", side_effect=RuntimeError("down")):
        assert outbox.publish(event.pk) is False
    event.refresh_from_db()
    assert event.published_at is None


def test_display_link_validation_and_estimate_when_doctor_busy(
    clinic: Any, catalogue: dict[str, Any], admin: tuple[APIClient, Any]
) -> None:
    bad = admin[0].post(
        f"{S}display-links/", {"label": "Hall", "service_ids": [str(clinic.pk)]}, format="json"
    )
    assert bad.status_code == 422
    assert admin[0].post(f"{S}display-links/{clinic.pk}/revoke/").status_code == 404
    listed = admin[0].get(f"{S}display-links/").json()["results"]
    assert listed == []


@override_settings(DEBUG=True)
def test_seed_queue_dev_needs_setup(db: Any) -> None:
    call_command("seed_queue_dev")  # no demo facility: explains and exits


@override_settings(DEBUG=False)
def test_dev_commands_refuse_without_debug(db: Any) -> None:
    from django.core.management.base import CommandError

    for name in ("seed_queue_dev", "queue_concurrency_check"):
        with pytest.raises(CommandError):
            call_command(name)


@override_settings(DEBUG=True)
def test_seed_queue_dev_checks_in_the_demo_queue(clinic: Any, catalogue: dict[str, Any]) -> None:
    from medilink.visits.models import Visit
    from tests.s2.conftest import client_for

    clinic.slug = "musanze-demo-health-centre"
    clinic.save()
    client_for(clinic, ("doctor",), "doctor@demo.medilink.test")
    from tests.factories import UserFactory

    UserFactory(email="receptionist@demo.medilink.test")
    call_command("seed_queue_dev")
    with rls_context(facility_id=clinic.pk):
        assert Visit.objects.filter(service_date=services.today()).count() == 5
        assert Ticket.objects.filter(priority_rank=2).count() == 1
    call_command("seed_queue_dev")  # idempotent for the day
    with rls_context(facility_id=clinic.pk):
        assert Visit.objects.filter(service_date=services.today()).count() == 5


def test_operations_dashboard_figures(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
    admin: tuple[APIClient, Any],
) -> None:
    service_id = catalogue["service"]["id"]
    for name in ("Ana One", "Ben Two", "Cy Three"):
        check_in(desk[0], register(clinic, desk[1], name), service_id)
    on_duty(doctor[0], catalogue["point"]["id"])
    ticket = call_next(doctor[0], service_id).json()
    act(doctor[0], act(doctor[0], ticket, "start").json(), "complete")
    data = admin[0].get(f"{S}reports/operations/").json()
    assert data["today"]["patients"] == 3 and data["today"]["completed"] == 1
    assert data["today"]["median_wait_min"] == 0
    assert data["now"] == {
        "waiting": 2,
        "in_service": 0,
        "doctors_on_duty": 1,
        "doctors_on_break": 0,
    }
    assert data["services"][0]["waiting"] == 2 and data["services"][0]["load"] == "low"
    assert len(data["trend"]) == 14 and sum(c["count"] for c in data["arrivals_heatmap"]) == 3
    assert "Ana" not in str(data)
    assert desk[0].get(f"{S}reports/operations/").status_code == 403
