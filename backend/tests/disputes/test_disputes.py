"""S10 part 2a (contract sprint-10b §6): disputes from raise to final decision."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from medilink.disputes import services
from medilink.disputes.models import Dispute, Evidence
from medilink.tenancy.context import rls_context
from tests.conftest import error_code, login_patient, login_staff
from tests.factories import make_staff
from tests.masterdata.conftest import age_recent_auth
from tests.s2.conftest import client_for
from tests.s4.conftest import patient_account  # noqa: F401
from tests.s5.conftest import bookable, clock  # noqa: F401
from tests.s7.conftest import (  # noqa: F401
    AMOX,
    S,
    admin,
    catalogue,
    check_in,
    clinic,
    desk,
    doctor,
    drugs,
    patient_keys,
    pharmacist,
    prescribe,
)

pytestmark = pytest.mark.django_db
P = "/api/v1/patient/disputes/"
D = f"{S}disputes/"
PL = "/api/v1/platform/disputes/"


@pytest.fixture
def handler2(clinic: Any) -> tuple[APIClient, Any]:  # noqa: F811
    """A second facility admin, so disputes stay at the facility (FR-DSP-08)."""
    return client_for(clinic, ("facility_admin",), "disputes-admin2@example.test")


@pytest.fixture
def world(
    clinic: Any,  # noqa: F811
    catalogue: dict[str, Any],  # noqa: F811
    desk: Any,  # noqa: F811
    doctor: Any,  # noqa: F811
    drugs: Any,  # noqa: F811
    patient_account: tuple[Any, Any],  # noqa: F811
) -> dict[str, Any]:
    user, record = patient_account
    visit = check_in(desk[0], record, catalogue["service"]["id"]).json()
    _c, p = prescribe(doctor[0], visit["visit_id"])
    patient = APIClient()
    login_patient(patient, user)
    return {
        "user": user,
        "record": record,
        "visit": visit,
        "prescription": p,
        "patient": patient,
        "patient_id": str(record.patient_id),
    }


def raise_(world: dict[str, Any], subject_type: str, subject_id: str) -> Any:
    return world["patient"].post(
        P,
        {
            "patient_id": world["patient_id"],
            "subject_type": subject_type,
            "subject_id": subject_id,
            "description": "I was given fewer tablets than written.",
        },
        format="json",
    )


def test_raise_attaches_the_facts_and_refuses_duplicates_and_strangers(
    clinic: Any,  # noqa: F811
    handler2: Any,
    world: dict[str, Any],
) -> None:
    made = raise_(world, "prescription", world["prescription"]["id"])
    assert made.status_code == 201, made.content
    body = made.json()
    assert body["status"] == "open" and body["type"] == "medication"
    assert body["handler_level"] == "facility"
    assert body["subject_snapshot"]["number"] == world["prescription"]["number"]
    assert "consultation_id" not in body["subject_snapshot"]
    with rls_context(facility_id=clinic.pk):
        d = Dispute.objects.get(pk=body["id"])
        assert b"tablets" not in bytes(d.description_enc)  # encrypted at rest
        [evidence] = Evidence.objects.filter(dispute=d)
        actions = {e["action"] for e in evidence.snapshot["entries"]}
    assert "pharmacy.prescription.issued" in actions

    again = raise_(world, "prescription", world["prescription"]["id"])
    assert again.status_code == 409
    stranger = APIClient()
    from tests.factories import make_patient_user

    login_patient(stranger, make_patient_user(email="d-stranger@example.test", full_name="A B"))
    stolen = stranger.post(
        P,
        {
            "patient_id": world["patient_id"],
            "subject_type": "prescription",
            "subject_id": world["prescription"]["id"],
            "description": "Not mine at all, testing.",
        },
        format="json",
    )
    assert stolen.status_code == 404
    assert stranger.get(f"{P}{body['id']}/").status_code == 404


def test_lifecycle_thread_notes_escalation_and_final_decision(
    clinic: Any,  # noqa: F811
    admin: Any,  # noqa: F811
    handler2: Any,
    world: dict[str, Any],
) -> None:
    d = raise_(world, "prescription", world["prescription"]["id"]).json()
    staff = handler2[0]
    listed = staff.get(D).json()["results"]
    assert [r["id"] for r in listed] == [d["id"]]

    ack = staff.post(f"{D}{d['id']}/acknowledge/", {"version": d["version"]}, format="json")
    assert ack.status_code == 200, ack.content
    current = ack.json()
    assert current["status"] == "under_review" and current["decide_by"]
    stale = staff.post(f"{D}{d['id']}/acknowledge/", {"version": d["version"]}, format="json")
    assert stale.status_code == 409

    staff.post(
        f"{D}{d['id']}/messages/",
        {"body": "Checked the shelf count.", "visibility": "internal"},
        format="json",
    )
    asked = staff.post(
        f"{D}{d['id']}/request-info/",
        {"version": current["version"] + 1, "body": "How many tablets did you get?"},
        format="json",
    )
    assert asked.status_code == 200, asked.content
    assert asked.json()["status"] == "info_requested"
    seen = world["patient"].get(f"{P}{d['id']}/").json()
    assert [m["body"] for m in seen["messages"]] == ["How many tablets did you get?"]
    reply = world["patient"].post(f"{P}{d['id']}/messages/", {"body": "Only ten."}, format="json")
    assert reply.status_code == 201 and reply.json()["status"] == "under_review"

    version = staff.get(f"{D}{d['id']}/").json()["version"]
    resolved = staff.post(
        f"{D}{d['id']}/resolve/",
        {"version": version, "outcome": "rejected", "reason": "The record shows 21 given."},
        format="json",
    )
    assert resolved.status_code == 200, resolved.content
    mine = world["patient"].get(f"{P}{d['id']}/").json()
    assert mine["status"] == "resolved" and mine["can_escalate"] and mine["can_accept"]
    escalated = world["patient"].post(
        f"{P}{d['id']}/escalate/", {"version": mine["version"]}, format="json"
    )
    assert escalated.status_code == 200 and escalated.json()["status"] == "escalated"

    platform_user = make_staff(None, email="plat.disputes@example.test", is_platform_admin=True)
    platform = APIClient()
    login_staff(platform, platform_user)
    rows = platform.get(PL).json()["results"]
    assert d["id"] in [r["id"] for r in rows]
    version = platform.get(f"{PL}{d['id']}/").json()["version"]
    age_recent_auth(platform)
    refused = platform.post(
        f"{PL}{d['id']}/final-decision/",
        {"version": version, "outcome": "rejected", "reason": "Facility record confirmed."},
        format="json",
    )
    assert refused.status_code == 403 and error_code(refused) == "step_up_required"
    fresh = APIClient()
    login_staff(fresh, platform_user)
    final = fresh.post(
        f"{PL}{d['id']}/final-decision/",
        {"version": version, "outcome": "rejected", "reason": "Facility record confirmed."},
        format="json",
    )
    assert final.status_code == 200, final.content
    assert final.json()["status"] == "final_decision"
    mine = world["patient"].get(f"{P}{d['id']}/").json()
    closed = world["patient"].post(
        f"{P}{d['id']}/accept/", {"version": mine["version"]}, format="json"
    )
    assert closed.json()["status"] == "closed" and closed.json()["can_reopen"]
    reopened = world["patient"].post(
        f"{P}{d['id']}/reopen/", {"version": closed.json()["version"]}, format="json"
    )
    assert reopened.json()["status"] == "reopened" and not reopened.json()["can_reopen"]


def test_conflict_of_interest_and_one_person_facility(
    clinic: Any,  # noqa: F811
    admin: Any,  # noqa: F811
    handler2: Any,
    world: dict[str, Any],
) -> None:
    from tests.s2.conftest import membership_of

    d = raise_(world, "visit", world["visit"]["visit_id"]).json()
    staff = handler2[0]
    staff.post(
        f"{D}{d['id']}/comment-requests/",
        {"membership_id": str(membership_of(admin[1], clinic).pk)},
        format="json",
    )
    # the admin was asked to comment: they comment, but can't decide
    detail = admin[0].get(f"{D}{d['id']}/").json()
    assert detail["can_decide"] is False
    refused = admin[0].post(
        f"{D}{d['id']}/acknowledge/", {"version": detail["version"]}, format="json"
    )
    assert refused.status_code == 422
    commented = admin[0].post(
        f"{D}{d['id']}/comments/", {"body": "I was at the desk."}, format="json"
    )
    assert commented.status_code == 201
    assert world["patient"].get(f"{P}{d['id']}/").json()["messages"] == []


def test_one_handler_routes_to_the_platform(
    clinic: Any,  # noqa: F811
    admin: Any,  # noqa: F811
    world: dict[str, Any],
) -> None:
    d = raise_(world, "visit", world["visit"]["visit_id"]).json()
    assert d["handler_level"] == "platform"


def test_deadlines_escalate_and_close(
    clinic: Any,  # noqa: F811
    handler2: Any,
    world: dict[str, Any],
) -> None:
    d = raise_(world, "prescription", world["prescription"]["id"]).json()
    with rls_context(facility_id=clinic.pk):
        counts = services.apply_deadlines(clinic.pk, now=timezone.now() + dt.timedelta(hours=73))
        assert counts == {"escalated": 1, "closed": 0}
        assert Dispute.objects.get(pk=d["id"]).status == "escalated"


def test_limits_and_counter_raise(
    clinic: Any,  # noqa: F811
    desk: Any,  # noqa: F811
    handler2: Any,
    world: dict[str, Any],
    monkeypatch: Any,
) -> None:
    monkeypatch.setattr(services, "MAX_OPEN", 1)
    assert raise_(world, "visit", world["visit"]["visit_id"]).status_code == 201
    over = raise_(world, "prescription", world["prescription"]["id"])
    assert over.status_code == 422
    monkeypatch.setattr(services, "MAX_OPEN", 5)
    counter = desk[0].post(
        D,
        {
            "facility_patient_id": str(world["record"].pk),
            "subject_type": "prescription",
            "subject_id": world["prescription"]["id"],
            "description": "Patient says the count was short.",
        },
        format="json",
    )
    assert counter.status_code == 201, counter.content
    assert counter.json()["channel"] == "counter"
    assert desk[0].get(D).status_code == 403  # reception raises, never handles


def test_no_show_reversed_outcome_removes_the_strike(
    clock: Any,  # noqa: F811
    clinic: Any,  # noqa: F811
    bookable: dict[str, Any],  # noqa: F811
    admin: Any,  # noqa: F811
    handler2: Any,
) -> None:
    from medilink.scheduling import booking as svc
    from medilink.scheduling.models import NoShowStrike
    from tests.s5.conftest import book, first_slot, patient_client

    client, user = patient_client("d-noshow@example.test", "Missed Visit")
    slot = first_slot(clinic, bookable["service_id"], after=clock.now + dt.timedelta(hours=3))
    booking = book(client, user, slot).json()
    clock.now = slot.starts_at + dt.timedelta(minutes=20)
    clock.at(17, 0)  # closing time on the booking day
    with rls_context(facility_id=clinic.pk):
        assert svc.mark_no_shows(clinic.pk) == 1
        strike = NoShowStrike.objects.get(booking_id=booking["id"])
    login_patient(client, user)
    made = client.post(
        P,
        {
            "patient_id": str(user.patient_links.get().patient_id),
            "subject_type": "no_show_strike",
            "subject_id": str(strike.pk),
            "description": "I was there and checked in at reception.",
        },
        format="json",
    )
    assert made.status_code == 201, made.content
    staff = handler2[0]
    login_staff(staff, handler2[1])
    d = made.json()
    ack = staff.post(f"{D}{d['id']}/acknowledge/", {"version": d["version"]}, format="json").json()
    resolved = staff.post(
        f"{D}{d['id']}/resolve/",
        {
            "version": ack["version"],
            "outcome": "no_show_reversed",
            "reason": "Ticket shows arrival.",
        },
        format="json",
    )
    assert resolved.status_code == 200, resolved.content
    [action] = resolved.json()["actions"]
    assert action["status"] == "done"
    with rls_context(facility_id=clinic.pk):
        strike.refresh_from_db()
        assert strike.reversed_at is not None
