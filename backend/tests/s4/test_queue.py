"""S4-B1..B18 (contract sprint-04 §9) against the real database."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.db import DatabaseError, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from medilink.tenancy.context import rls_context
from medilink.visits import services
from medilink.visits.models import (
    OutboxEvent,
    Ticket,
    TicketEvent,
    TicketState,
    Visit,
    VisitStatus,
)
from tests.conftest import login_patient
from tests.s4.conftest import S, act, call_next, check_in, on_duty, register

pytestmark = pytest.mark.django_db(transaction=False)


def test_check_in_issues_numbered_ticket_and_is_idempotent(
    clinic: Any, catalogue: dict[str, Any], desk: tuple[APIClient, Any]
) -> None:
    client, user = desk
    service_id = catalogue["service"]["id"]
    first = register(clinic, user, "Mukamana Jeanne")
    second = register(clinic, user, "Habimana Eric")
    a = check_in(client, first, service_id)
    assert a.status_code == 201, a.content
    assert a.json()["ticket"]["number"] == "G-001"
    assert a.json()["ticket"]["display_name"] == "Mukamana J."
    again = check_in(client, first, service_id)
    assert again.status_code == 200 and again.json()["ticket"]["id"] == a.json()["ticket"]["id"]
    b = check_in(client, second, service_id)
    assert b.json()["ticket"]["number"] == "G-002"
    assert b.json()["ticket"]["position"] == 1
    with rls_context(facility_id=clinic.pk):
        assert Visit.objects.count() == 2
        assert TicketEvent.objects.filter(action="check_in").count() == 2
        assert OutboxEvent.objects.filter(topic="queue.changed").count() >= 2


def test_emergency_needs_reason_and_goes_first(
    clinic: Any, catalogue: dict[str, Any], desk: tuple[APIClient, Any]
) -> None:
    client, user = desk
    service_id = catalogue["service"]["id"]
    check_in(client, register(clinic, user, "Normal One"), service_id)
    record = register(clinic, user, "Urgent Two")
    refused = check_in(client, record, service_id, source="emergency")
    assert refused.status_code == 422
    ok = check_in(
        client,
        record,
        service_id,
        source="emergency",
        priority_reason_code="bleeding",
        reason_text="Deep cut on the arm",
    )
    assert ok.status_code == 201
    assert ok.json()["ticket"]["position"] == 0
    assert "emergency" in ok.json()["ticket"]["flags"]
    with rls_context(facility_id=clinic.pk):
        visit = Visit.objects.get(pk=ok.json()["visit_id"])
        assert visit.reason_encrypted and b"Deep cut" not in bytes(visit.reason_encrypted)


def test_call_next_start_complete_and_doctor_rules(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
) -> None:
    service_id = catalogue["service"]["id"]
    for name in ("Ana One", "Ben Two"):
        check_in(desk[0], register(clinic, desk[1], name), service_id)
    doc = doctor[0]
    assert call_next(doc, service_id).status_code == 422  # not on duty
    on_duty(doc, catalogue["point"]["id"])
    called = call_next(doc, service_id)
    assert called.status_code == 200, called.content
    ticket = called.json()
    assert ticket["number"] == "G-001" and ticket["state"] == "called"
    assert ticket["service_point"] == "Room 1"
    assert call_next(doc, service_id).status_code == 409  # already serving
    stale = act(doc, {**ticket, "version": ticket["version"] - 1}, "start")
    assert stale.status_code == 409
    started = act(doc, ticket, "start")
    assert started.json()["state"] == "in_service"
    assert act(doc, started.json(), "transfer", service_id=service_id).status_code == 403
    done = act(doc, started.json(), "complete")
    assert done.json()["state"] == "completed"
    with rls_context(facility_id=clinic.pk):
        visit = Visit.objects.get(pk=ticket["visit_id"])
        assert visit.status == VisitStatus.COMPLETED
        actions = list(
            TicketEvent.objects.filter(ticket_id=ticket["id"])
            .order_by("occurred_at")
            .values_list("action", flat=True)
        )
    assert actions == ["check_in", "call", "start", "complete"]
    mine = doc.get(f"{S}queue/mine/").json()
    assert mine["current"] is None and [t["number"] for t in mine["waiting"]] == ["G-002"]


def test_illegal_transition_and_cross_tenant(
    clinic: Any,
    other_facility: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
) -> None:
    from tests.s2.conftest import client_for

    service_id = catalogue["service"]["id"]
    ticket = check_in(desk[0], register(clinic, desk[1], "Ana One"), service_id).json()["ticket"]
    assert act(desk[0], ticket, "complete").status_code in (403, 422)
    outsider = client_for(other_facility, ("receptionist",), "out-desk@example.test")[0]
    assert act(outsider, ticket, "cancel", reason_code="other").status_code == 404
    assert outsider.get(f"{S}visits/{ticket['visit_id']}/").status_code == 404
    with transaction.atomic():
        assert Ticket.objects.count() == 0  # no facility context: RLS hides everything


def test_ordering_priority_return_and_step_out(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
) -> None:
    service_id = catalogue["service"]["id"]
    client, user = desk
    a = check_in(client, register(clinic, user, "First Arrival"), service_id).json()["ticket"]
    b = check_in(client, register(clinic, user, "Second Arrival"), service_id).json()["ticket"]
    c = check_in(client, register(clinic, user, "Third Arrival"), service_id).json()["ticket"]
    no_reason = act(client, c, "priority", priority_class="elderly")
    assert no_reason.status_code == 422
    c = act(client, c, "priority", priority_class="elderly", reason_code="age").json()
    a = act(client, a, "step-out", minutes=10).json()
    doc = doctor[0]
    on_duty(doc, catalogue["point"]["id"])
    first = call_next(doc, service_id).json()
    assert first["number"] == c["number"]  # priority first
    first = act(doc, act(doc, first, "start").json(), "hold").json()
    second = call_next(doc, service_id).json()
    assert second["number"] == b["number"]  # a stepped out
    act(doc, act(doc, second, "start").json(), "complete")
    returned = act(doc, first, "return").json()
    assert "return" in returned["flags"]
    third = call_next(doc, service_id).json()
    assert third["number"] == c["number"]  # return priority beats a (normal)


def test_no_response_reinsert_then_left(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
) -> None:
    service_id = catalogue["service"]["id"]
    names = ["P1 One", "P2 Two", "P3 Three", "P4 Four", "P5 Five"]
    tickets = [
        check_in(desk[0], register(clinic, desk[1], n), service_id).json()["ticket"] for n in names
    ]
    doc = doctor[0]
    on_duty(doc, catalogue["point"]["id"])
    called = call_next(doc, service_id).json()
    assert called["number"] == tickets[0]["number"]
    back = act(doc, called, "no-response").json()
    assert back["state"] == "waiting" and back["position"] == 3
    for _ in range(2):
        nxt = call_next(doc, service_id).json()
        while nxt["number"] != tickets[0]["number"]:
            act(doc, act(doc, nxt, "start").json(), "complete")
            nxt = call_next(doc, service_id).json()
        result = act(doc, nxt, "no-response").json()
    assert result["state"] == "left_without_service"


def test_reorder_needs_reason_and_is_reviewed(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    admin: tuple[APIClient, Any],
) -> None:
    service_id = catalogue["service"]["id"]
    a = check_in(desk[0], register(clinic, desk[1], "Ana One"), service_id).json()["ticket"]
    b = check_in(desk[0], register(clinic, desk[1], "Ben Two"), service_id).json()["ticket"]
    assert act(desk[0], b, "reorder", before_ticket_id=a["id"]).status_code == 422
    moved = act(desk[0], b, "reorder", before_ticket_id=a["id"], reason_code="clinical_urgency")
    assert moved.status_code == 200 and moved.json()["position"] == 0
    rows = admin[0].get(f"{S}queue/reorders/?reviewed=false").json()["results"]
    assert len(rows) == 1 and rows[0]["old_position"] == "1" and rows[0]["new_position"] == "0"
    review = admin[0].post(
        f"{S}queue/reorders/{rows[0]['event_id']}/review/", {"comment": "ok"}, format="json"
    )
    assert review.status_code == 201
    assert admin[0].get(f"{S}queue/reorders/?reviewed=false").json()["results"] == []
    assert desk[0].get(f"{S}queue/reorders/").status_code == 403


def test_transfer_keeps_arrival_and_next_stage(
    clinic: Any,
    catalogue: dict[str, Any],
    admin: tuple[APIClient, Any],
    desk: tuple[APIClient, Any],
) -> None:
    other = (
        admin[0]
        .post(
            f"{S}services/",
            {
                "department_id": catalogue["department"]["id"],
                "name_i18n": {"rw": "Abana", "en": "Pediatrics", "fr": "Pédiatrie"},
                "ticket_prefix": "P",
            },
            format="json",
        )
        .json()["service"]
    )
    ticket = check_in(
        desk[0], register(clinic, desk[1], "Ana One"), catalogue["service"]["id"]
    ).json()["ticket"]
    moved = act(desk[0], ticket, "transfer", service_id=other["id"])
    assert moved.status_code == 200, moved.content
    assert moved.json()["number"] == "P-001"
    assert moved.json()["arrival_at"] == ticket["arrival_at"]
    # moving a consultation ticket on is the doctor's action (queue.call)
    assert act(desk[0], moved.json(), "next-stage", stage="payment").status_code == 403


def test_estimate_range_and_status_messages(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
) -> None:
    service_id = catalogue["service"]["id"]
    for i in range(4):
        check_in(desk[0], register(clinic, desk[1], f"Person {i} X"), service_id)
    board = desk[0].get(f"{S}queue/board/").json()
    assert board["queues"][0]["estimate_next"]["status"] == "none_on_duty"
    doc = doctor[0]
    until = (timezone.now() + dt.timedelta(minutes=30)).isoformat()
    assert (
        doc.put(
            f"{S}duty-status/", {"state": "break", "until_at": until}, format="json"
        ).status_code
        == 200
    )
    board = desk[0].get(f"{S}queue/board/").json()
    assert board["queues"][0]["estimate_next"]["status"] == "break"
    on_duty(doc, catalogue["point"]["id"])
    estimate = desk[0].get(f"{S}queue/board/").json()["queues"][0]["estimate_next"]
    # 3 ahead of the last one x 15 min / 1 doctor = 45, so 35-60
    assert (estimate["min"], estimate["max"], estimate["status"]) == (35, 60, None)


def test_end_of_day_closes_waiting_not_in_service(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
) -> None:
    service_id = catalogue["service"]["id"]
    for name in ("Ana One", "Ben Two"):
        check_in(desk[0], register(clinic, desk[1], name), service_id)
    on_duty(doctor[0], catalogue["point"]["id"])
    serving = call_next(doctor[0], service_id).json()
    act(doctor[0], serving, "start")
    with rls_context(facility_id=clinic.pk):
        closed = services.end_of_day(clinic.pk, now=timezone.now() + dt.timedelta(days=0, hours=23))
        assert closed == 1
        assert Ticket.objects.get(pk=serving["id"]).state == TicketState.IN_SERVICE
        assert Ticket.objects.filter(state=TicketState.LEFT_WITHOUT_SERVICE).count() == 1


def test_ticket_events_are_append_only(
    clinic: Any, catalogue: dict[str, Any], desk: tuple[APIClient, Any]
) -> None:
    check_in(desk[0], register(clinic, desk[1], "Ana One"), catalogue["service"]["id"])
    with rls_context(facility_id=clinic.pk), pytest.raises(DatabaseError), transaction.atomic():
        TicketEvent.objects.update(reason_text="changed")


def test_display_link_shows_numbers_never_names(
    clinic: Any,
    catalogue: dict[str, Any],
    admin: tuple[APIClient, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
    api: APIClient,
) -> None:
    service_id = catalogue["service"]["id"]
    for name in ("Mukamana Jeanne", "Habimana Eric"):
        check_in(desk[0], register(clinic, desk[1], name), service_id)
    on_duty(doctor[0], catalogue["point"]["id"])
    call_next(doctor[0], service_id)
    created = admin[0].post(
        f"{S}display-links/", {"label": "Waiting room", "service_ids": [service_id]}, format="json"
    )
    assert created.status_code == 201, created.content
    token = created.json()["token"]
    board = api.get(f"/api/v1/display/{token}/")
    assert board.status_code == 200 and board["Cache-Control"] == "no-store"
    body = board.content.decode()
    assert "G-001" in body and "Room 1" in body and "G-002" in body
    assert "Mukamana" not in body and "Habimana" not in body
    link_id = created.json()["link"]["id"]
    assert admin[0].post(f"{S}display-links/{link_id}/revoke/").status_code == 200
    assert api.get(f"/api/v1/display/{token}/").status_code == 404
    assert api.get("/api/v1/display/not-a-token/").status_code == 404


def test_patient_tracker_cancel_and_travel_time(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    patient_account: tuple[Any, Any],
    api: APIClient,
) -> None:
    user, record = patient_account
    service_id = catalogue["service"]["id"]
    check_in(desk[0], register(clinic, desk[1], "Someone Before"), service_id)
    ticket = check_in(desk[0], record, service_id).json()["ticket"]
    login_patient(api, user)
    assert (
        api.put(
            f"/api/v1/patient/travel-times/{clinic.pk}/", {"minutes": 20}, format="json"
        ).status_code
        == 200
    )
    visits = api.get("/api/v1/patient/visits/active/").json()["results"]
    assert len(visits) == 1
    mine = visits[0]
    assert mine["ticket_number"] == ticket["number"] and mine["ahead"] == 1
    assert mine["travel_minutes"] == 20
    assert "Someone" not in str(visits)
    cancelled = api.post(f"/api/v1/patient/visits/{mine['visit_id']}/cancel/")
    assert cancelled.status_code == 200
    assert api.get("/api/v1/patient/visits/active/").json()["results"] == []


def test_permissions_matrix(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
    admin: tuple[APIClient, Any],
) -> None:
    from tests.s2.conftest import client_for

    pharmacist = client_for(clinic, ("pharmacist",), "q-pharm@example.test")[0]
    service_id = catalogue["service"]["id"]
    record = register(clinic, desk[1], "Ana One")
    assert check_in(doctor[0], record, service_id).status_code == 403
    assert check_in(pharmacist, record, service_id).status_code == 403
    assert desk[0].get(f"{S}queue/mine/").status_code == 403
    assert desk[0].get(f"{S}display-links/").status_code == 403
    assert doctor[0].get(f"{S}queue/board/").status_code == 200
    assert (
        pharmacist.post(
            f"{S}queue/call-next/", {"service_id": service_id}, format="json"
        ).status_code
        == 403
    )
    assert admin[0].get(f"{S}display-links/").status_code == 200
