"""S5b error paths and the S5 periodic jobs (contract sprint-05 §5, §9 S5-B13..B16)."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings
from rest_framework.test import APIClient

from medilink.scheduling import tasks
from tests.conftest import error_code
from tests.factories import FacilityFactory
from tests.s2.conftest import client_for
from tests.s5.conftest import Clock, P, S, at, book, patient_client, slot_at

pytestmark = pytest.mark.django_db


@pytest.mark.acceptance("S5-B16")
def test_periodic_jobs_run_per_facility(
    clock: Clock, clinic: Any, bookable: dict[str, Any]
) -> None:
    client, _user = patient_client("jobs@example.test", "Job Runner")
    slot = slot_at(clinic, bookable["membership"], at(clock, 1, 8))
    client.post(f"{P}slots/{slot.pk}/hold/")
    assert tasks.refresh_facility(str(clinic.pk)) >= 1
    assert tasks.generate_slots() == 0  # already generated: idempotent
    assert tasks.refresh_public_listing() >= 1
    clock.now += dt.timedelta(minutes=6)
    assert tasks.expire_holds() == 1
    assert tasks.mark_no_shows() == 0
    assert tasks.pass_over() == 0
    assert tasks.purge() >= 0
    assert tasks.disruption_auto_accept() == 0


@override_settings(DEBUG=False)
def test_booking_concurrency_check_refuses_without_debug(db: Any) -> None:
    with pytest.raises(CommandError):
        call_command("booking_concurrency_check")


@pytest.mark.acceptance("S5-B13")
def test_disruption_input_rules_and_empty_disruption_resolves_at_once(
    clock: Clock,
    clinic: Any,
    two_doctors: dict[str, Any],
    admin: tuple[APIClient, Any],
) -> None:
    window = {"starts_at": at(clock, 5, 8).isoformat(), "ends_at": at(clock, 5, 12).isoformat()}
    past = admin[0].post(
        f"{S}disruptions/",
        {
            "kind": "closure",
            "starts_at": at(clock, -2, 8).isoformat(),
            "ends_at": at(clock, -2, 9).isoformat(),
            "reason": "Too late",
        },
        format="json",
    )
    assert past.status_code == 422
    elsewhere = FacilityFactory(name="Elsewhere", slug="elsewhere", status="live")
    _, stranger = client_for(elsewhere, ("doctor",), "far-doc@example.test")
    foreign = admin[0].post(
        f"{S}disruptions/",
        {"kind": "doctor_absent", "membership_id": str(stranger.pk), "reason": "x", **window},
        format="json",
    )
    assert foreign.status_code == 422
    unknown = admin[0].post(
        f"{S}disruptions/",
        {"kind": "closure", "service_id": str(elsewhere.pk), "reason": "x", **window},
        format="json",
    )
    assert unknown.status_code == 422
    extra = admin[0].post(
        f"{S}disruptions/", {"kind": "closure", "reason": "x", "x": 1, **window}, format="json"
    )
    assert extra.status_code == 400
    # Saturday: nothing booked, so the disruption is resolved straight away
    quiet = (
        admin[0]
        .post(
            f"{S}disruptions/",
            {
                "kind": "schedule_change",
                "service_id": two_doctors["service_id"],
                "reason": "Weekend",
                **window,
            },
            format="json",
        )
        .json()
    )
    assert quiet["items"] == [] and quiet["disruption"]["status"] == "resolved"
    both = admin[0].post(
        f"{S}disruptions/{quiet['disruption']['id']}/apply/",
        {"all": "cancel", "items": []},
        format="json",
    )
    assert both.status_code == 400
    assert admin[0].get(f"{S}disruptions/{quiet['disruption']['id']}/").status_code == 200
    assert admin[0].get(f"{S}disruptions/").json()["count"] == 1


@pytest.mark.acceptance("S5-B13")
def test_offer_answers_need_a_valid_hold_and_unknown_items_are_reported(
    clock: Clock,
    clinic: Any,
    two_doctors: dict[str, Any],
    admin: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
) -> None:
    first = two_doctors["membership"]
    client, user = patient_client("answers@example.test", "Answer Paths")
    made = book(client, user, slot_at(clinic, first, at(clock, 2, 10))).json()
    no_offer = client.post(f"{P}bookings/{made['id']}/respond/", {"response": "accept"})
    assert no_offer.status_code == 422 and error_code(no_offer) == "no_offer"
    out = (
        admin[0]
        .post(
            f"{S}disruptions/",
            {
                "kind": "doctor_absent",
                "membership_id": str(first.pk),
                "starts_at": at(clock, 2, 9).isoformat(),
                "ends_at": at(clock, 2, 11).isoformat(),
                "reason": "Meeting",
            },
            format="json",
        )
        .json()
    )
    item_id = out["items"][0]["id"]
    applied = (
        admin[0]
        .post(
            f"{S}disruptions/{out['disruption']['id']}/apply/",
            {
                "items": [
                    {"id": "00000000-0000-4000-8000-000000000000", "action": "cancel"},
                    {"id": item_id, "action": "next_slot"},
                ]
            },
            format="json",
        )
        .json()
    )
    assert applied["problems"] == {"00000000-0000-4000-8000-000000000000": "not_found"}
    both = client.post(
        f"{P}bookings/{made['id']}/respond/",
        {"response": "accept", "hold_id": item_id},
        format="json",
    )
    assert both.status_code == 400
    bad_hold = client.post(
        f"{P}bookings/{made['id']}/respond/",
        {"hold_id": "00000000-0000-4000-8000-000000000000"},
        format="json",
    )
    assert bad_hold.status_code == 422 and error_code(bad_hold) == "hold_expired"
    stale = client.post(
        f"{P}bookings/{made['id']}/respond/", {"response": "accept", "version": 1}, format="json"
    )
    assert stale.status_code == 409
    # the doctor's own calendar shows the absence; the staff note stays out of the patient view
    calendar = doctor[0].get(f"{S}calendar/?view=day&from={at(clock, 2, 0).date()}").json()
    assert [d["kind"] for d in calendar["disruptions"]] == ["doctor_absent"]
    assert "Meeting" not in str(client.get(f"{P}bookings/{made['id']}/").json())
    assert (
        doctor[0].get(f"{S}visits/00000000-0000-4000-8000-000000000000/follow-up/").status_code
        == 404
    )
