"""S5a backend (contract sprint-05 §9): slots, discovery, holds, bookings, booked check-in and
ordering, remote join and pass-over, no-shows."""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

import pytest
from django.db import DatabaseError, transaction
from rest_framework.test import APIClient

from medilink.facilities.calendar import KIGALI
from medilink.facilities.models import CalendarEvent, PublicListing, Service
from medilink.scheduling import booking as svc
from medilink.scheduling import listing, slots
from medilink.scheduling.models import Booking, BookingEvent, NoShowStrike, Slot
from medilink.tenancy.context import rls_context
from medilink.visits import remote
from medilink.visits.models import ReasonSymptom, Ticket
from medilink.visits.services import Actor, calling_order
from tests.conftest import error_code, login_patient, login_staff
from tests.s4.conftest import call_next, check_in, on_duty, register
from tests.s5.conftest import (
    PUB,
    Clock,
    P,
    S,
    book,
    first_slot,
    patient_client,
    self_id,
    settings_for,
)

pytestmark = pytest.mark.django_db


@pytest.mark.acceptance("S5-B4")
def test_slot_generation_follows_templates_share_and_closures(
    clock: Clock, clinic: Any, bookable: dict[str, Any], admin: tuple[APIClient, Any]
) -> None:
    with rls_context(facility_id=clinic.pk):
        rows = list(Slot.objects.filter(facility=clinic).order_by("starts_at"))
        # 16 slots per weekday morning, capacity 2 with half bookable
        first_day = [r for r in rows if r.starts_at.astimezone(KIGALI).date() == clock.now.date()]
        assert len(first_day) == 16
        assert {(r.capacity, r.bookable_capacity) for r in rows} == {(2, 1)}
        assert all(r.starts_at.astimezone(KIGALI).weekday() < 5 for r in rows)
        # A closure on Tuesday closes its open slots; generating again creates nothing new
        tuesday = clock.now.date() + dt.timedelta(days=1)
        CalendarEvent.objects.create(
            facility=clinic,
            kind="closure",
            starts_at=dt.datetime.combine(tuesday, dt.time.min, KIGALI),
            ends_at=dt.datetime.combine(tuesday + dt.timedelta(days=1), dt.time.min, KIGALI),
            reason="Training",
        )
        again = slots.generate(clinic.pk)
        assert again == {"created": 0, "closed": 16}
        assert not Slot.objects.filter(
            facility=clinic, status="open", starts_at__date=tuesday
        ).exists()


@pytest.mark.acceptance("S5-B3")
def test_public_search_profile_and_slots_show_only_public_data(
    clock: Clock, clinic: Any, bookable: dict[str, Any]
) -> None:
    api = APIClient()
    found = api.post(
        f"{PUB}facilities/search/",
        {"service_code": "general_consultation", "insurer_code": "rama"},
        format="json",
    )
    assert found.status_code == 200, found.content
    [row] = found.json()["results"]
    assert row["slug"] == clinic.slug and row["accepts_insurance"] == "yes"
    assert row["fee_rwf"] == 5000 and row["patient_share_rwf"] == 500
    assert row["next_slot_at"] is not None and row["referral_hint"] is False
    other = api.post(f"{PUB}facilities/search/", {"insurer_code": "mutuelle"}, format="json")
    assert other.json()["results"][0]["accepts_insurance"] == "no"
    assert other.json()["results"][0]["patient_share_rwf"] == 5000
    # coordinates outside Rwanda are rejected; nothing is stored about the caller
    bad = api.post(f"{PUB}facilities/search/", {"near": {"lat": 48.8, "lng": 2.3}}, format="json")
    assert bad.status_code == 400

    profile = api.get(f"{PUB}facilities/{clinic.slug}/")
    assert profile.status_code == 200
    body = profile.json()
    assert body["services"][0]["fee_rwf"] == 5000
    assert [d["days"] for d in body["doctors"]] == [[0, 1, 2, 3, 4]]
    week = api.get(
        f"{PUB}facilities/{clinic.slug}/slots/?service_id={bookable['service_id']}"
    ).json()
    assert len(week["days"]) == 7 and week["days"][0]["slots"]
    assert set(week["days"][0]["slots"][0]) == {
        "id",
        "starts_at",
        "ends_at",
        "doctor",
        "membership_id",
        "open_places",
    }
    assert api.get(f"{PUB}facilities/no-such-place/").status_code == 404
    symptoms = api.get(f"{PUB}symptoms/").json()
    assert {s["code"] for s in symptoms if s["is_red_flag"]} == {
        "chest_pain",
        "shortness_of_breath",
        "bleeding",
    }


@pytest.mark.acceptance("S5-B6", "S5-B7", "S5-B8")
def test_hold_book_idempotent_cancel_and_counters(
    clock: Clock, clinic: Any, bookable: dict[str, Any]
) -> None:
    client, user = patient_client("book1@example.test", "Mukamana Jeanne")
    rival, _ = patient_client("book2@example.test", "Keza Diane")
    slot = first_slot(clinic, bookable["service_id"], after=clock.now + dt.timedelta(hours=3))
    key = str(uuid.uuid4())
    hold = client.post(f"{P}slots/{slot.pk}/hold/").json()
    body = {
        "hold_id": hold["hold_id"],
        "patient_id": self_id(user),
        "symptoms": [{"code": "fever", "duration_days": 2}],
        "reason_text": "Fever since Sunday",
    }
    made = client.post(f"{P}bookings/", body, format="json", HTTP_IDEMPOTENCY_KEY=key)
    assert made.status_code == 201, made.content
    booking = made.json()
    assert booking["status"] == "confirmed" and len(booking["booking_code"]) == 6
    assert booking["cost"] == {
        "fee_rwf": 5000,
        "patient_share_rwf": 5000,
        "insurer_code": None,
        "insurer_accepted": None,
    }
    assert booking["symptoms"][0]["code"] == "fever"
    # the only bookable place is taken: the rival gets 409 with nearby times
    taken = rival.post(f"{P}slots/{slot.pk}/hold/")
    assert taken.status_code == 409 and error_code(taken) == "slot_taken"
    assert len(taken.json()["alternatives"]) == 3
    # a double submit (same body, same key) returns the same booking
    again = client.post(f"{P}bookings/", body, format="json", HTTP_IDEMPOTENCY_KEY=key)
    assert again.status_code == 200 and again.json()["id"] == booking["id"]
    listed = client.get(f"{P}bookings/").json()["results"]
    assert [b["id"] for b in listed] == [booking["id"]]
    calendar = client.get(f"{P}bookings/{booking['id']}/calendar.ics")
    assert calendar.status_code == 200 and b"BEGIN:VEVENT" in calendar.content
    assert b"Fever" not in calendar.content  # never the reason for visit
    with rls_context(facility_id=clinic.pk):
        stored = Booking.objects.get(pk=booking["id"])
        assert stored.reason_encrypted and b"Fever" not in bytes(stored.reason_encrypted)
        assert Slot.objects.get(pk=slot.pk).booked_count == 1

    cancelled = client.post(
        f"{P}bookings/{booking['id']}/cancel/", {"version": booking["version"]}, format="json"
    )
    assert cancelled.status_code == 200 and cancelled.json()["status"] == "cancelled"
    stale = client.post(
        f"{P}bookings/{booking['id']}/cancel/", {"version": booking["version"]}, format="json"
    )
    assert stale.status_code == 409
    with rls_context(facility_id=clinic.pk):
        assert Slot.objects.get(pk=slot.pk).booked_count == 0
        assert list(
            BookingEvent.objects.filter(booking_id=booking["id"])
            .order_by("occurred_at")
            .values_list("to_status", flat=True)
        ) == ["confirmed", "cancelled"]


@pytest.mark.acceptance("S5-B6")
def test_booking_rules_age_limits_same_day_and_expired_hold(
    clock: Clock, clinic: Any, bookable: dict[str, Any]
) -> None:
    client, user = patient_client("rules@example.test", "Habimana Eric")
    service_id = bookable["service_id"]
    later = clock.now + dt.timedelta(hours=3)
    with rls_context(facility_id=clinic.pk):
        Service.objects.filter(pk=service_id).update(max_age_months=60)  # children only
    patient = user.patient_links.get().patient
    patient.date_of_birth = dt.date(1990, 1, 1)
    patient.save()
    refused = book(client, user, first_slot(clinic, service_id, after=later))
    assert refused.status_code == 422 and error_code(refused) == "age_rule"
    with rls_context(facility_id=clinic.pk):
        Service.objects.filter(pk=service_id).update(max_age_months=None)

    settings_for(clinic, "booking", max_active=1)
    first = first_slot(clinic, service_id, after=later)
    assert book(client, user, first).status_code == 201
    second = first_slot(clinic, service_id, after=clock.now + dt.timedelta(days=2))
    over = book(client, user, second)
    assert over.status_code == 422 and error_code(over) == "limit_active"

    settings_for(clinic, "booking", max_active=3)
    same_day = first_slot(clinic, service_id, after=first.ends_at)
    dup = book(client, user, same_day)
    assert dup.status_code == 422 and error_code(dup) == "same_day_service"

    hold = client.post(f"{P}slots/{second.pk}/hold/").json()
    clock.now += dt.timedelta(minutes=6)
    late = client.post(
        f"{P}bookings/",
        {"hold_id": hold["hold_id"], "patient_id": self_id(user), "symptoms": [{"code": "cough"}]},
        format="json",
    )
    assert late.status_code == 422 and error_code(late) == "hold_expired"
    with rls_context(facility_id=clinic.pk):
        assert slots.expire_holds(clinic.pk) == 1
        assert Slot.objects.get(pk=second.pk).held_count == 0


@pytest.mark.acceptance("S5-B8")
def test_reschedule_supersedes_and_late_cancel(
    clock: Clock, clinic: Any, bookable: dict[str, Any]
) -> None:
    client, user = patient_client("move@example.test", "Uwera Grace")
    service_id = bookable["service_id"]
    old_slot = first_slot(clinic, service_id, after=clock.now + dt.timedelta(days=1))
    old = book(client, user, old_slot).json()
    new_slot = first_slot(clinic, service_id, after=old_slot.ends_at)
    hold = client.post(f"{P}slots/{new_slot.pk}/hold/").json()
    moved = client.post(
        f"{P}bookings/{old['id']}/reschedule/",
        {"version": old["version"], "hold_id": hold["hold_id"]},
        format="json",
    )
    assert moved.status_code == 200, moved.content
    new = moved.json()
    assert new["starts_at"] != old["starts_at"] and new["symptoms"][0]["code"] == "fever"
    previous = client.get(f"{P}bookings/{old['id']}/").json()
    assert previous["status"] == "superseded" and previous["rescheduled_to_id"] == new["id"]
    # within the cancellation window a cancel is recorded as late
    clock.now = dt.datetime.fromisoformat(new["starts_at"]) - dt.timedelta(minutes=30)
    login_patient(client, user)  # the session expired while the clock moved on
    late = client.post(
        f"{P}bookings/{new['id']}/cancel/", {"version": new["version"]}, format="json"
    )
    assert late.json()["status"] == "late_cancelled"


@pytest.mark.acceptance("S5-B9")
def test_booked_check_in_grace_window_and_ratio(
    clock: Clock,
    clinic: Any,
    bookable: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
    catalogue: dict[str, Any],
) -> None:
    settings_for(clinic, "booking", lead_time_hours=0)
    service_id = bookable["service_id"]
    client, user = patient_client("booked@example.test", "Ingabire Claire")
    slot = first_slot(clinic, service_id, after=clock.now + dt.timedelta(minutes=10))
    booking = book(client, user, slot).json()
    # two walk-ins arrived before the booked patient
    walk_ins = [register(clinic, desk[1], f"Walk In{i}") for i in range(3)]
    for record in walk_ins:
        assert check_in(desk[0], record, service_id).status_code == 201
    arrived = desk[0].post(f"{S}visits/check-in/", {"booking_id": booking["id"]}, format="json")
    assert arrived.status_code == 201, arrived.content
    ticket = arrived.json()["ticket"]
    with rls_context(facility_id=clinic.pk):
        stored = Booking.objects.get(pk=booking["id"])
        assert stored.status == "checked_in" and stored.visit_id
        assert ReasonSymptom.objects.filter(visit_id=stored.visit_id).count() == 1
        row = Ticket.objects.get(pk=ticket["id"])
        assert row.slot_starts_at == slot.starts_at
        # 1 booked : 2 walk-ins, booked first while no one has been called
        order = [t.pk for t in calling_order(clinic.pk, service_id, "consultation")]
        assert order[0] == row.pk
    again = desk[0].post(f"{S}visits/check-in/", {"booking_id": booking["id"]}, format="json")
    assert again.status_code == 200 and again.json()["ticket"]["id"] == ticket["id"]

    on_duty(doctor[0], catalogue["point"]["id"])
    numbers = []
    for _ in range(4):
        called = call_next(doctor[0], service_id).json()
        numbers.append(called["id"])
        assert (
            doctor[0]
            .post(
                f"{S}tickets/{called['id']}/start/", {"version": called["version"]}, format="json"
            )
            .status_code
            == 200
        )
        current = doctor[0].get(f"{S}queue/mine/").json()["current"]
        doctor[0].post(
            f"{S}tickets/{current['id']}/complete/",
            {"version": current["version"]},
            format="json",
        )
    assert numbers[0] == ticket["id"]  # booked, then the walk-ins in arrival order


@pytest.mark.acceptance("S5-B9")
def test_early_booked_patient_waits_for_the_window_and_late_one_is_a_walk_in(
    clock: Clock, clinic: Any, bookable: dict[str, Any], desk: tuple[APIClient, Any]
) -> None:
    settings_for(clinic, "booking", lead_time_hours=0)
    service_id = bookable["service_id"]
    early_client, early_user = patient_client("early@example.test", "Early Bird")
    slot = first_slot(clinic, service_id, after=clock.now + dt.timedelta(hours=2))
    booking = book(early_client, early_user, slot).json()
    walk_in = register(clinic, desk[1], "Normal Walkin")
    check_in(desk[0], walk_in, service_id)
    ticket = (
        desk[0]
        .post(f"{S}visits/check-in/", {"booking_id": booking["id"]}, format="json")
        .json()["ticket"]
    )
    with rls_context(facility_id=clinic.pk):
        order = calling_order(clinic.pk, service_id, "consultation")
        assert order[-1].pk == uuid.UUID(ticket["id"])  # waits after the others

    late_client, late_user = patient_client("late@example.test", "Late Comer")
    past = first_slot(clinic, service_id, after=clock.now + dt.timedelta(minutes=5))
    late_booking = book(late_client, late_user, past).json()
    clock.now = past.starts_at + dt.timedelta(minutes=40)
    late = desk[0].post(f"{S}visits/check-in/", {"booking_id": late_booking["id"]}, format="json")
    assert late.status_code == 201
    with rls_context(facility_id=clinic.pk):
        assert Ticket.objects.get(pk=late.json()["ticket"]["id"]).slot_starts_at is None


@pytest.mark.acceptance("S5-B10")
def test_remote_join_im_here_and_pass_over(
    clock: Clock, clinic: Any, bookable: dict[str, Any], desk: tuple[APIClient, Any]
) -> None:
    service_id = bookable["service_id"]
    settings_for(clinic, "queue", pass_over_places=1, pass_over_limit=1)
    client, user = patient_client("remote@example.test", "Remote Joiner")
    joined = client.post(
        f"{P}visits/remote-join/",
        {"facility_slug": clinic.slug, "service_id": service_id, "patient_id": self_id(user)},
        format="json",
    )
    assert joined.status_code == 201, joined.content
    visit_id = joined.json()["visit_id"]
    for i in range(2):
        check_in(desk[0], register(clinic, desk[1], f"Here Now{i}"), service_id)
    with rls_context(facility_id=clinic.pk):
        remote_ticket = Ticket.objects.get(visit_id=visit_id)
        assert remote_ticket.is_remote and remote_ticket.remote_checked_in_at is None
        # at the front without having arrived: moved back once, then loses the ticket
        assert remote.pass_over(clinic.pk) == 1
        remote_ticket.refresh_from_db()
        assert remote_ticket.pass_over_count == 1 and remote_ticket.state == "waiting"
        Ticket.objects.exclude(pk=remote_ticket.pk).update(state="completed")
        assert remote.pass_over(clinic.pk) == 1
        remote_ticket.refresh_from_db()
        assert remote_ticket.state == "left_without_service"

    # a new join, then "I'm here"
    clock.now += dt.timedelta(minutes=1)
    other, other_user = patient_client("remote2@example.test", "Second Joiner")
    second = other.post(
        f"{P}visits/remote-join/",
        {"facility_slug": clinic.slug, "service_id": service_id, "patient_id": self_id(other_user)},
        format="json",
    ).json()
    # "I'm here" (B9; the endpoint finds today's visits by the database date, so the fixed test
    # clock calls the service directly)
    with rls_context(facility_id=clinic.pk):
        joined_ticket = Ticket.objects.get(visit_id=second["visit_id"])
        remote.arrived(joined_ticket, actor=Actor(user=other_user, membership=None))
        joined_ticket.refresh_from_db()
        assert joined_ticket.remote_checked_in_at is not None
        assert joined_ticket.visit.status == "on_site"

    clock.at(15, 0)  # after the default 11:00 cutoff
    third, third_user = patient_client("remote3@example.test", "Too Late")
    closed = third.post(
        f"{P}visits/remote-join/",
        {"facility_slug": clinic.slug, "service_id": service_id, "patient_id": self_id(third_user)},
        format="json",
    )
    assert closed.status_code == 422 and error_code(closed) == "remote_closed"


@pytest.mark.acceptance("S5-B11")
def test_no_show_strike_and_reversal(
    clock: Clock, clinic: Any, bookable: dict[str, Any], desk: tuple[APIClient, Any]
) -> None:
    client, user = patient_client("noshow@example.test", "Missed Visit")
    slot = first_slot(clinic, bookable["service_id"], after=clock.now + dt.timedelta(hours=3))
    booking = book(client, user, slot).json()
    clock.now = slot.starts_at + dt.timedelta(minutes=20)
    with rls_context(facility_id=clinic.pk):
        assert svc.mark_no_shows(clinic.pk) == 1
        assert NoShowStrike.objects.filter(booking_id=booking["id"]).count() == 1
    assert svc.strike_count(user.patient_links.get().patient_id) == 1
    day = slot.starts_at.astimezone(KIGALI).date()
    login_staff(desk[0], desk[1])  # the session expired while the clock moved on
    listed = desk[0].get(f"{S}bookings/?date={day}&status=no_show")
    [row] = listed.json()["results"]
    assert row["display_name"] == "Missed V."
    needs_reason = desk[0].post(
        f"{S}bookings/{booking['id']}/reverse-no-show/",
        {"version": row["version"], "reason_code": "other"},
        format="json",
    )
    assert needs_reason.status_code == 422
    reversed_ = desk[0].post(
        f"{S}bookings/{booking['id']}/reverse-no-show/",
        {"version": row["version"], "reason_code": "patient_was_present"},
        format="json",
    )
    assert reversed_.status_code == 200, reversed_.content
    assert svc.strike_count(user.patient_links.get().patient_id) == 0


@pytest.mark.acceptance("S5-B6")
def test_phone_booking_by_reception_and_staff_list(
    clock: Clock, clinic: Any, bookable: dict[str, Any], desk: tuple[APIClient, Any]
) -> None:
    record = register(clinic, desk[1], "Phone Caller")
    week = desk[0].get(f"{S}slots/?service_id={bookable['service_id']}").json()
    slot_id = next(s["id"] for d in week["days"] for s in d["slots"])
    hold = desk[0].post(f"{S}slots/{slot_id}/hold/")
    assert hold.status_code == 201
    made = desk[0].post(
        f"{S}bookings/",
        {
            "hold_id": hold.json()["hold_id"],
            "facility_patient_id": str(record.pk),
            "contact_phone": "+250788123456",
            "symptoms": [{"code": "headache"}],
        },
        format="json",
    )
    assert made.status_code == 201, made.content
    assert made.json()["source"] == "phone"
    # a patient account can't read the clinic's booking list
    client, _ = patient_client("nosy@example.test", "Nosy Person")
    assert client.get(f"{S}bookings/").status_code in (401, 403)


@pytest.mark.acceptance("S5-B12")
def test_booking_history_and_symptoms_are_append_only(
    clock: Clock, clinic: Any, bookable: dict[str, Any]
) -> None:
    client, user = patient_client("append@example.test", "Append Only")
    booking = book(
        client,
        user,
        first_slot(clinic, bookable["service_id"], after=clock.now + dt.timedelta(hours=3)),
    ).json()
    with rls_context(facility_id=clinic.pk):
        event = BookingEvent.objects.filter(booking_id=booking["id"]).first()
        with pytest.raises(DatabaseError), transaction.atomic():
            BookingEvent.objects.filter(pk=event.pk).update(reason_text="changed")
        symptom = ReasonSymptom.objects.filter(booking_id=booking["id"]).first()
        with pytest.raises(DatabaseError), transaction.atomic():
            ReasonSymptom.objects.filter(pk=symptom.pk).delete()


@pytest.mark.acceptance("S5-B3")
def test_listing_drops_facilities_that_are_not_live(
    clock: Clock, clinic: Any, bookable: dict[str, Any]
) -> None:
    assert PublicListing.objects.filter(facility_id=clinic.pk).exists()
    clinic.status = "suspended"
    clinic.save()
    with rls_context(facility_id=clinic.pk):
        listing.refresh(clinic.pk)
    assert not PublicListing.objects.filter(facility_id=clinic.pk).exists()
    assert APIClient().get(f"{PUB}facilities/{clinic.slug}/").status_code == 404
