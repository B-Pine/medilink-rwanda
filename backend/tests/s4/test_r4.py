"""R4 fixes to S4 (#86): forward-only stages, the ticket-event signal, one serving ticket per
person in the database, re-insertion that keeps the real arrival time, wait metrics from check-in
to first call, optional symptoms at check-in and display sockets closed on revoke."""

from __future__ import annotations

import datetime as dt
from typing import Any
from unittest import mock

import pytest
from asgiref.sync import async_to_sync, sync_to_async
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from medilink.tenancy.context import rls_context
from medilink.visits import services, stats
from medilink.visits.models import ReasonSymptom, Ticket
from tests.conftest import login_staff
from tests.s2.conftest import membership_of
from tests.s4.conftest import S, act, call_next, check_in, on_duty, register
from tests.test_b14_celery_channels import ALLOWED_ORIGIN, _connect, ws_db  # noqa: F401

pytestmark = pytest.mark.django_db


@pytest.mark.acceptance("S4-B8")
def test_next_stage_only_forward_from_in_service(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
) -> None:
    service_id = catalogue["service"]["id"]
    ticket = check_in(desk[0], register(clinic, desk[1], "Ana Stage"), service_id).json()["ticket"]
    doc = doctor[0]
    on_duty(doc, catalogue["point"]["id"])
    called = call_next(doc, service_id).json()
    assert called["id"] == ticket["id"]
    # not before the patient is in the room
    assert act(doc, called, "next-stage", stage="payment").status_code == 422
    started = act(doc, called, "start").json()
    for backwards in ("reception", "consultation"):
        assert act(doc, started, "next-stage", stage=backwards).status_code == 422
    moved = act(doc, started, "next-stage", stage="payment")
    assert moved.status_code == 200, moved.content
    assert moved.json()["stage"] == "payment"
    # after a consultation, payment goes on to pharmacy only
    with rls_context(facility_id=clinic.pk):
        payment = Ticket.objects.get(pk=moved.json()["id"])
        assert services.next_stages(payment) == ("pharmacy",)


@pytest.mark.acceptance("S4-B8")
def test_ticket_events_are_signalled_after_commit(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    django_capture_on_commit_callbacks: Any,
) -> None:
    seen: list[dict[str, Any]] = []

    def receiver(**kwargs: Any) -> None:
        seen.append(kwargs)

    services.on_ticket_event.connect(receiver, weak=False)
    try:
        with django_capture_on_commit_callbacks(execute=False) as callbacks:
            ticket = check_in(
                desk[0], register(clinic, desk[1], "Signal Person"), catalogue["service"]["id"]
            ).json()["ticket"]
        assert seen == []  # nothing before commit
        for callback in callbacks:
            callback()
    finally:
        services.on_ticket_event.disconnect(receiver)
    [event] = [e for e in seen if e["action"] == "check_in"]
    assert str(event["ticket_id"]) == ticket["id"] and event["to_state"] == "waiting"
    assert set(event) >= {"event_id", "visit_id", "facility_id", "from_state"}


@pytest.mark.acceptance("S4-B6")
def test_one_serving_ticket_per_person_is_enforced_by_the_database(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
) -> None:
    service_id = catalogue["service"]["id"]
    for name in ("Ana One", "Ben Two"):
        check_in(desk[0], register(clinic, desk[1], name), service_id)
    on_duty(doctor[0], catalogue["point"]["id"])
    first = call_next(doctor[0], service_id).json()
    assert call_next(doctor[0], service_id).status_code == 409
    membership = membership_of(doctor[1], clinic)
    with rls_context(facility_id=clinic.pk):
        other = Ticket.objects.exclude(pk=first["id"]).get(state="waiting")
        with pytest.raises(IntegrityError), transaction.atomic():
            Ticket.objects.filter(pk=other.pk).update(
                state="called", called_at=timezone.now(), assigned_membership=membership
            )


@pytest.mark.acceptance("S4-B9")
def test_no_response_keeps_the_real_arrival_time(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
) -> None:
    service_id = catalogue["service"]["id"]
    tickets = [
        check_in(desk[0], register(clinic, desk[1], f"Person {n} X"), service_id).json()["ticket"]
        for n in range(4)
    ]
    on_duty(doctor[0], catalogue["point"]["id"])
    called = call_next(doctor[0], service_id).json()
    back = act(doctor[0], called, "no-response").json()
    assert back["position"] == 3 and back["arrival_at"] == tickets[0]["arrival_at"]
    board = desk[0].get(f"{S}queue/board/").json()["queues"][0]["waiting"]
    assert [r["id"] for r in board] == [t["id"] for t in tickets[1:]] + [tickets[0]["id"]]


@pytest.mark.acceptance("S4-B11")
def test_wait_is_measured_from_check_in_to_the_first_call(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
) -> None:
    service_id = catalogue["service"]["id"]
    start = timezone.now().replace(microsecond=0)
    with mock.patch("django.utils.timezone.now", return_value=start):
        check_in(desk[0], register(clinic, desk[1], "Wait Measured"), service_id)
        on_duty(doctor[0], catalogue["point"]["id"])
    with mock.patch("django.utils.timezone.now", return_value=start + dt.timedelta(minutes=20)):
        login_staff(doctor[0], doctor[1])  # the session went idle while the clock moved on
        called = call_next(doctor[0], service_id).json()
    with mock.patch("django.utils.timezone.now", return_value=start + dt.timedelta(minutes=50)):
        login_staff(doctor[0], doctor[1])
        act(doctor[0], called, "recall")  # moves `called_at`, not the wait
    with rls_context(facility_id=clinic.pk):
        figures = stats._day_figures(clinic.pk, timezone.localdate(start))
    assert figures["median_wait_min"] == 20


@pytest.mark.acceptance("S4-B4")
def test_optional_symptoms_at_walk_in_check_in(
    clinic: Any, catalogue: dict[str, Any], desk: tuple[APIClient, Any]
) -> None:
    service_id = catalogue["service"]["id"]
    made = check_in(
        desk[0],
        register(clinic, desk[1], "Has Symptoms"),
        service_id,
        symptoms=[{"code": "fever", "duration_days": 2, "severity": "moderate"}],
    )
    assert made.status_code == 201, made.content
    with rls_context(facility_id=clinic.pk):
        [row] = ReasonSymptom.objects.filter(visit_id=made.json()["visit_id"])
        assert (row.symptom_code, row.captured_at_stage) == ("fever", "check_in")
    unknown = check_in(
        desk[0], register(clinic, desk[1], "Bad Symptom"), service_id, symptoms=[{"code": "nope"}]
    )
    assert unknown.status_code == 422
    plain = check_in(desk[0], register(clinic, desk[1], "No Symptoms"), service_id)
    assert plain.status_code == 201 and plain.json()["late"] is False


@pytest.mark.acceptance("S4-B15")
def test_revoking_a_display_link_closes_its_socket(
    ws_db: Any,  # noqa: F811
    clinic: Any,
    catalogue: dict[str, Any],
    admin: tuple[APIClient, Any],
    django_capture_on_commit_callbacks: Any,
) -> None:
    capture = django_capture_on_commit_callbacks
    made = (
        admin[0]
        .post(
            f"{S}display-links/",
            {"label": "Hall", "service_ids": [catalogue["service"]["id"]]},
            format="json",
        )
        .json()
    )

    def revoke() -> None:
        # the tests run inside a transaction: run the on-commit close by hand
        with capture(execute=True):
            response = admin[0].post(f"{S}display-links/{made['link']['id']}/revoke/")
        assert response.status_code == 200

    async def scenario() -> None:
        socket, _ = _connect(f"/ws/v1/display/{made['token']}/", ALLOWED_ORIGIN)
        assert (await socket.connect())[0]
        await sync_to_async(revoke)()
        output = await socket.receive_output(timeout=2)
        assert output["type"] == "websocket.close"
        await socket.disconnect()

    async_to_sync(scenario)()


@pytest.mark.acceptance("S4-B15")
def test_every_socket_answers_ping_with_the_same_flat_pong(
    ws_db: Any,  # noqa: F811
    clinic: Any,
    catalogue: dict[str, Any],
    admin: tuple[APIClient, Any],
    desk: tuple[APIClient, Any],
) -> None:
    token = (
        admin[0]
        .post(
            f"{S}display-links/",
            {"label": "Hall", "service_ids": [catalogue["service"]["id"]]},
            format="json",
        )
        .json()["token"]
    )
    key = desk[0].cookies["ml_staff"].value

    async def ping(path: str, cookie: str | None = None) -> dict[str, Any]:
        socket, _ = _connect(path, ALLOWED_ORIGIN, *([cookie] if cookie else []))
        assert (await socket.connect())[0]
        await socket.send_json_to({"type": "ping"})
        reply = await socket.receive_json_from()
        await socket.disconnect()
        return reply

    async def scenario() -> None:
        replies = [
            await ping("/ws/v1/staff/ping/", f"ml_staff={key}"),
            await ping("/ws/v1/staff/queue/", f"ml_staff={key}"),
            await ping(f"/ws/v1/display/{token}/"),
        ]
        for reply in replies:
            assert set(reply) == {"type", "sent_at"}  # flat, no `data` wrapper
            assert reply["type"] == "pong" and reply["sent_at"].endswith("Z")

    async_to_sync(scenario)()
