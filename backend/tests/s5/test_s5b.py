"""S5b backend (contract sprint-05 §9 S5-B13..B15): disruptions with bulk actions, patient answers
and auto-accept; follow-ups from a visit; the private calendar feed; the reception calendar."""

from __future__ import annotations

import datetime as dt
import hashlib
from typing import Any

import pytest
from django.db import connection
from rest_framework.test import APIClient

from medilink.audit.models import AuditEntry
from medilink.patients.models import Patient, PatientLink
from medilink.scheduling import booking as svc
from medilink.scheduling import disruptions, slots, tasks
from medilink.scheduling.models import (
    Booking,
    CalendarFeed,
    Disruption,
    DisruptionItem,
    FollowUp,
    NoShowStrike,
    ScheduleTemplate,
    Slot,
)
from medilink.tenancy.context import rls_context
from medilink.visits.models import Ticket
from tests.conftest import error_code, login_patient, login_staff
from tests.factories import FacilityFactory
from tests.s2.conftest import client_for
from tests.s4.conftest import check_in, register
from tests.s5.conftest import (
    Clock,
    P,
    S,
    at,
    book,
    patient_client,
    self_id,
    settings_for,
    slot_at,
)

pytestmark = pytest.mark.django_db


def create_disruption(client: APIClient, **body: Any) -> Any:
    return client.post(f"{S}disruptions/", body, format="json")


@pytest.mark.acceptance("S5-B13")
def test_disruption_lists_affected_bookings_and_applies_each_action(
    clock: Clock,
    clinic: Any,
    two_doctors: dict[str, Any],
    admin: tuple[APIClient, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
) -> None:
    first, second = two_doctors["membership"], two_doctors["second"]
    patients = [patient_client(f"dis{i}@example.test", f"Patient Number{i}") for i in range(3)]
    made = [
        book(c, u, slot_at(clinic, first, at(clock, 2, 8, 15 * i))).json()
        for i, (c, u) in enumerate(patients)
    ]
    # someone booked with the other doctor is not affected
    other_client, other_user = patient_client("other@example.test", "Not Affected")
    book(other_client, other_user, slot_at(clinic, second, at(clock, 2, 9)))

    body = {
        "kind": "doctor_absent",
        "membership_id": str(first.pk),
        "starts_at": at(clock, 2, 0).isoformat(),
        "ends_at": at(clock, 3, 0).isoformat(),
        "reason": "Training in Huye",
    }
    assert create_disruption(desk[0], **body).status_code == 403
    assert create_disruption(doctor[0], **body).status_code == 403
    no_doctor = create_disruption(admin[0], **{**body, "membership_id": None})
    assert no_doctor.status_code == 422
    created = create_disruption(admin[0], **body)
    assert created.status_code == 201, created.content
    out = created.json()
    items = {i["booking_id"]: i for i in out["items"]}
    assert set(items) == {b["id"] for b in made}
    assert out["disruption"]["counts"]["not_applied"] == 3
    assert all(i["patient_response"] == "pending" and i["action"] is None for i in items.values())
    with rls_context(facility_id=clinic.pk):
        wednesday = Slot.objects.filter(
            facility=clinic, membership=first, starts_at__gte=at(clock, 2, 0)
        ).filter(starts_at__lt=at(clock, 3, 0))
        assert set(wednesday.values_list("status", flat=True)) == {"closed"}
        slots.generate(clinic.pk)  # regenerating keeps the absent doctor's slots closed
        assert set(wednesday.values_list("status", flat=True)) == {"closed"}

    d_id = out["disruption"]["id"]
    a, b, c = (items[m["id"]]["id"] for m in made)
    applied = admin[0].post(
        f"{S}disruptions/{d_id}/apply/",
        {
            "items": [
                {"id": a, "action": "move_doctor"},
                {"id": b, "action": "next_slot"},
                {"id": c, "action": "cancel"},
            ]
        },
        format="json",
    )
    assert applied.status_code == 200, applied.content
    result = applied.json()
    assert result["problems"] == {}
    by_id = {i["id"]: i for i in result["items"]}
    assert by_id[a]["doctor"] == two_doctors["second"].user.full_name
    assert by_id[a]["previous_doctor"] == first.user.full_name
    assert by_id[a]["auto_accept"] is True
    assert by_id[c]["patient_response"] == "cancelled"
    with rls_context(facility_id=clinic.pk):
        moved = Booking.objects.get(pk=made[0]["id"])
        assert moved.membership_id == second.pk and moved.starts_at == at(clock, 2, 8)
        assert moved.pending_change["previous_doctor"] == first.user.full_name
        assert "Huye" not in str(moved.pending_change)  # the staff note stays with staff
        assert slot_at(clinic, second, at(clock, 2, 8)).booked_count == 1
        assert slot_at(clinic, first, at(clock, 2, 8)).booked_count == 0
        next_one = Booking.objects.get(pk=made[1]["id"])
        assert next_one.starts_at == at(clock, 3, 8)  # first open time after the absence
        assert Booking.objects.get(pk=made[2]["id"]).status == "cancelled"
        assert not NoShowStrike.objects.exists()
    again = admin[0].post(
        f"{S}disruptions/{d_id}/apply/", {"items": [{"id": a, "action": "cancel"}]}, format="json"
    )
    assert again.json()["problems"] == {a: "already_applied"}

    # Patient answers: A keeps the new doctor, B picks another time
    client_a, _ = patients[0]
    detail = client_a.get(f"{P}bookings/{made[0]['id']}/").json()
    assert detail["pending_change"]["action"] == "move_doctor"
    accepted = client_a.post(f"{P}bookings/{made[0]['id']}/respond/", {"response": "accept"})
    assert accepted.status_code == 200, accepted.content
    assert accepted.json()["pending_change"] is None
    twice = client_a.post(f"{P}bookings/{made[0]['id']}/respond/", {"response": "accept"})
    assert twice.status_code == 422 and error_code(twice) == "no_offer"

    client_b, _ = patients[1]
    hold = client_b.post(f"{P}slots/{slot_at(clinic, second, at(clock, 4, 10)).pk}/hold/").json()
    rebooked = client_b.post(
        f"{P}bookings/{made[1]['id']}/respond/", {"hold_id": hold["hold_id"]}, format="json"
    )
    assert rebooked.status_code == 200, rebooked.content
    assert rebooked.json()["id"] != made[1]["id"]
    final = admin[0].get(f"{S}disruptions/{d_id}/").json()
    responses = {i["id"]: i["patient_response"] for i in final["items"]}
    assert responses == {a: "accepted", b: "rebooked_other", c: "cancelled"}
    assert final["disruption"]["status"] == "resolved"
    resolved = admin[0].post(f"{S}disruptions/{d_id}/apply/", {"all": "cancel"}, format="json")
    assert resolved.status_code == 422
    assert AuditEntry.objects.filter(action="scheduling.disruption.resolve").count() == 1
    listed = admin[0].get(f"{S}disruptions/?status=resolved").json()
    assert [r["id"] for r in listed["results"]] == [d_id]

    # another facility never sees it
    elsewhere = FacilityFactory(name="Other Place", slug="other-place", status="live")
    stranger, _ = client_for(elsewhere, ("facility_admin",), "stranger@example.test")
    assert stranger.get(f"{S}disruptions/{d_id}/").status_code == 404


@pytest.mark.acceptance("S5-B13")
def test_bulk_move_auto_accept_and_unanswered_offer_never_strikes(
    clock: Clock,
    clinic: Any,
    two_doctors: dict[str, Any],
    admin: tuple[APIClient, Any],
    desk: tuple[APIClient, Any],
) -> None:
    settings_for(clinic, "booking", lead_time_hours=0)
    first, second = two_doctors["membership"], two_doctors["second"]
    far_client, far_user = patient_client("far@example.test", "Far Away")
    near_client, near_user = patient_client("near@example.test", "Near By")
    far = book(far_client, far_user, slot_at(clinic, first, at(clock, 2, 9))).json()
    near = book(near_client, near_user, slot_at(clinic, first, at(clock, 0, 11))).json()
    d = create_disruption(
        admin[0],
        kind="doctor_absent",
        membership_id=str(first.pk),
        starts_at=at(clock, 0, 10).isoformat(),
        ends_at=at(clock, 2, 23).isoformat(),
        reason="Sick leave",
    ).json()
    applied = (
        admin[0]
        .post(
            f"{S}disruptions/{d['disruption']['id']}/apply/", {"all": "move_doctor"}, format="json"
        )
        .json()
    )
    assert applied["problems"] == {}
    flags = {i["booking_id"]: i["auto_accept"] for i in applied["items"]}
    assert flags == {far["id"]: True, near["id"]: False}  # too close: reception calls
    expected = desk[0].get(f"{S}bookings/?date={at(clock, 0, 0).date()}").json()["results"]
    assert [r["has_pending_change"] for r in expected] == [True]
    assert expected[0]["membership_id"] == str(second.pk)

    # the reply window passes; the far booking is accepted for the patient
    clock.now = at(clock, 1, 10)
    assert tasks.disruption_auto_accept() == 1
    with rls_context(facility_id=clinic.pk):
        assert Booking.objects.get(pk=far["id"]).pending_change is None
        # the near patient never answered and never came: a no-show without a strike
        assert svc.mark_no_shows(clinic.pk) == 1
        assert Booking.objects.get(pk=near["id"]).status == "no_show"
        assert not NoShowStrike.objects.filter(booking_id=near["id"]).exists()
        responses = dict(DisruptionItem.objects.values_list("booking_id", "patient_response"))
        assert {str(k): v for k, v in responses.items()} == {
            far["id"]: "accepted",
            near["id"]: "declined",
        }
        assert Disruption.objects.get(pk=d["disruption"]["id"]).status == "resolved"


@pytest.mark.acceptance("S5-B13")
def test_disruption_offer_cancel_is_never_late_and_remote_tickets_are_items(
    clock: Clock,
    clinic: Any,
    two_doctors: dict[str, Any],
    admin: tuple[APIClient, Any],
    desk: tuple[APIClient, Any],
) -> None:
    settings_for(clinic, "booking", lead_time_hours=0)
    service_id, second = two_doctors["service_id"], two_doctors["second"]
    client, user = patient_client("soon@example.test", "Soon Visit")
    soon = book(client, user, slot_at(clinic, two_doctors["membership"], at(clock, 0, 10))).json()
    joiners = [patient_client(f"rj{i}@example.test", f"Remote Joiner{i}") for i in range(3)]
    for c, u in joiners:
        joined = c.post(
            f"{P}visits/remote-join/",
            {"facility_slug": clinic.slug, "service_id": service_id, "patient_id": self_id(u)},
            format="json",
        )
        assert joined.status_code == 201, joined.content
    out = create_disruption(
        admin[0],
        kind="closure",
        service_id=service_id,
        starts_at=at(clock, 0, 9, 30).isoformat(),
        ends_at=at(clock, 0, 12).isoformat(),
        reason="Water cut",
    ).json()
    tickets = [i for i in out["items"] if i["target"] == "ticket"]
    booking_item = next(i for i in out["items"] if i["target"] == "booking")
    assert len(tickets) == 3 and all(t["ticket_number"] for t in tickets)
    applied = (
        admin[0]
        .post(
            f"{S}disruptions/{out['disruption']['id']}/apply/",
            {
                "items": [
                    {
                        "id": tickets[0]["id"],
                        "action": "move_doctor",
                        "membership_id": str(second.pk),
                    },
                    {"id": tickets[1]["id"], "action": "next_slot"},
                    {"id": tickets[2]["id"], "action": "cancel"},
                    # every slot of the service is closed during the closure: nowhere to move
                    {"id": booking_item["id"], "action": "move_doctor"},
                ]
            },
            format="json",
        )
        .json()
    )
    assert applied["problems"] == {
        tickets[1]["id"]: "not_for_ticket",
        booking_item["id"]: "no_slot",
    }
    with rls_context(facility_id=clinic.pk):
        assert Ticket.objects.get(pk=tickets[0]["ticket_id"]).assigned_membership_id == second.pk
        assert Ticket.objects.get(pk=tickets[2]["ticket_id"]).state == "cancelled"
    # reception cancels the booking directly; the item closes with it
    row = desk[0].get(f"{S}bookings/").json()["results"][0]
    desk[0].post(
        f"{S}bookings/{soon['id']}/cancel/",
        {"version": row["version"], "reason_code": "facility_request"},
        format="json",
    )
    with rls_context(facility_id=clinic.pk):
        item = DisruptionItem.objects.get(booking_id=soon["id"])
        assert item.patient_response == "cancelled" and item.resolved_at is not None

    # an offer close to the visit time: cancelling it is a plain cancel, never a late one
    late_client, late_user = patient_client("late-offer@example.test", "Late Offer")
    late = book(late_client, late_user, slot_at(clinic, second, at(clock, 1, 8))).json()
    d2 = create_disruption(
        admin[0],
        kind="doctor_absent",
        membership_id=str(second.pk),
        starts_at=at(clock, 1, 0).isoformat(),
        ends_at=at(clock, 1, 12).isoformat(),
        reason="Away",
    ).json()
    with rls_context(facility_id=clinic.pk):
        disruptions.apply(
            d2["disruption"]["id"],
            who=svc.Who(user=admin[1], membership=None),
            all_action="next_slot",
        )
    clock.now = at(clock, 1, 7, 30)
    login_patient(late_client, late_user)
    cancelled = late_client.post(f"{P}bookings/{late['id']}/respond/", {"response": "cancel"})
    assert cancelled.status_code == 200, cancelled.content
    assert cancelled.json()["status"] == "cancelled"


@pytest.mark.acceptance("S5-B13")
def test_slot_generation_opens_a_disruption_for_booked_slots_that_no_longer_fit(
    clock: Clock, clinic: Any, bookable: dict[str, Any]
) -> None:
    client, user = patient_client("moved@example.test", "Template Changed")
    thursday = at(clock, 3, 8)
    booking = book(client, user, slot_at(clinic, bookable["membership"], thursday)).json()
    with rls_context(facility_id=clinic.pk):
        ScheduleTemplate.objects.filter(facility=clinic, weekday=3).update(ended_at=clock.now)
        slots.generate(clinic.pk)
        d = Disruption.objects.get(facility=clinic)
        assert d.kind == "schedule_change" and d.created_by_id is None
        assert [str(i.booking_id) for i in d.items.all()] == [booking["id"]]
        slots.generate(clinic.pk)  # idempotent: no second disruption
        assert Disruption.objects.filter(facility=clinic).count() == 1


@pytest.mark.acceptance("S5-B14")
def test_follow_up_books_the_same_doctor_or_stores_a_reminder(
    clock: Clock,
    clinic: Any,
    bookable: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
) -> None:
    service_id = bookable["service_id"]
    visits = []
    for name in ("Follow Booking", "Follow Reminder", "Follow Nothing"):
        record = register(clinic, desk[1], name)
        response = check_in(desk[0], record, service_id)
        assert response.status_code == 201, response.content
        visits.append(response.json()["visit_id"])
    url = f"{S}visits/{visits[0]}/follow-up/"
    assert desk[0].post(url, {"in_days": 7, "mode": "booking"}, format="json").status_code == 403
    assert doctor[0].get(url).status_code == 404
    made = doctor[0].post(url, {"in_days": 7, "mode": "booking"}, format="json")
    assert made.status_code == 201, made.content
    body = made.json()
    assert body["status"] == "booked" and body["due_on"] == str(at(clock, 7, 0).date())
    assert body["booking"]["source"] == "follow_up"
    assert body["booking"]["starts_at"].startswith(str(at(clock, 7, 0).date()))
    assert body["booking"]["membership_id"] == str(bookable["membership"].pk)
    assert doctor[0].get(url).json()["id"] == body["id"]
    twice = doctor[0].post(url, {"in_days": 7, "mode": "booking"}, format="json")
    assert twice.status_code == 409 and error_code(twice) == "follow_up_exists"

    reminder = (
        doctor[0]
        .post(
            f"{S}visits/{visits[1]}/follow-up/", {"in_days": 14, "mode": "reminder"}, format="json"
        )
        .json()
    )
    assert reminder["status"] == "due" and reminder["booking"] is None
    beyond = (
        doctor[0]
        .post(
            f"{S}visits/{visits[2]}/follow-up/", {"in_days": 200, "mode": "booking"}, format="json"
        )
        .json()
    )
    assert beyond["status"] == "no_slot"
    bad = doctor[0].post(
        f"{S}visits/{visits[2]}/follow-up/",
        {"in_days": 0, "mode": "booking", "x": 1},
        format="json",
    )
    assert bad.status_code == 400
    with rls_context(facility_id=clinic.pk):
        assert FollowUp.objects.filter(facility=clinic).count() == 3
    assert AuditEntry.objects.filter(action="scheduling.follow_up.create").count() == 3


@pytest.mark.acceptance("S5-B15")
def test_calendar_feed_is_hashed_revocable_includes_dependants_and_is_not_cached(
    clock: Clock, clinic: Any, bookable: dict[str, Any]
) -> None:
    client, user = patient_client("feed@example.test", "Uwase Feed")
    me = self_id(user)
    child = Patient.objects.create(full_name="Child Feed", date_of_birth=dt.date(2020, 5, 1))
    PatientLink.objects.create(account=user, patient=child, relationship="guardian")
    friend_client, friend = patient_client("friend@example.test", "Friend Delegate")
    PatientLink.objects.create(
        account=user, patient=friend.patient_links.get().patient, relationship="delegate"
    )
    membership = bookable["membership"]
    own = book(
        client,
        user,
        slot_at(clinic, membership, at(clock, 1, 8)),
        reason_text="Private reason",
        patient_id=me,
    ).json()
    dependant = book(
        client, user, slot_at(clinic, membership, at(clock, 2, 8)), patient_id=str(child.pk)
    ).json()
    delegated = book(friend_client, friend, slot_at(clinic, membership, at(clock, 3, 8))).json()

    assert client.get(f"{P}calendar-feed/").json()["is_active"] is False
    created = client.post(f"{P}calendar-feed/")
    assert created.status_code == 201 and created["Cache-Control"] == "no-store"
    url = created.json()["url"]
    token = url.rsplit("/", 1)[1].removesuffix(".ics")
    assert len(token) >= 43 and "/api/v1/calendar/" in url
    with rls_context(user_id=user.pk):
        feed = CalendarFeed.objects.get(account=user)
        assert bytes(feed.token_hash) == hashlib.sha256(token.encode()).digest()
    for other in (friend.pk, None):  # no other account, and no context, sees the row
        with rls_context(user_id=other), connection.cursor() as cursor:
            cursor.execute("SELECT count(*) FROM scheduling_calendar_feed")
            assert cursor.fetchone()[0] == 0

    path = url.split("testserver", 1)[1]
    public = APIClient()
    got = public.get(path)
    assert got.status_code == 200 and got["Content-Type"].startswith("text/calendar")
    assert got["Cache-Control"] == "private, no-store"
    text = got.content.decode()
    assert own["booking_code"] in text and dependant["booking_code"] in text
    assert delegated["booking_code"] not in text  # a delegate link is not a dependant
    assert "Private reason" not in text and "fever" not in text.lower()
    status_ = client.get(f"{P}calendar-feed/").json()
    assert status_["is_active"] and status_["last_accessed_at"] is not None

    renewed = client.post(f"{P}calendar-feed/").json()["url"]
    assert public.get(path).status_code == 404
    new_path = renewed.split("testserver", 1)[1]
    assert public.get(new_path).status_code == 200
    assert client.delete(f"{P}calendar-feed/").status_code == 204
    assert public.get(new_path).status_code == 404
    assert public.get("/api/v1/calendar/not-a-token.ics").status_code == 404
    assert client.get(f"{P}calendar-feed/").json()["is_active"] is False
    actions = list(
        AuditEntry.objects.filter(action__startswith="scheduling.calendar_feed").values_list(
            "action", flat=True
        )
    )
    assert actions.count("scheduling.calendar_feed.create") == 2
    assert actions.count("scheduling.calendar_feed.revoke") == 2


@pytest.mark.acceptance("S5-B13")
def test_reception_calendar_day_and_week_and_doctor_sees_own(
    clock: Clock,
    clinic: Any,
    two_doctors: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
) -> None:
    first, second = two_doctors["membership"], two_doctors["second"]
    client, user = patient_client("cal@example.test", "Calendar Patient")
    booked = book(client, user, slot_at(clinic, first, at(clock, 2, 8, 30))).json()
    wednesday = at(clock, 2, 0).date()
    day = desk[0].get(f"{S}calendar/?view=day&from={wednesday}")
    assert day.status_code == 200, day.content
    body = day.json()
    assert body["only_own"] is False and len(body["days"]) == 1
    blocks = body["days"][0]["blocks"]
    assert {b["membership_id"] for b in blocks} == {str(first.pk), str(second.pk)}
    mine = next(b for b in blocks if b["membership_id"] == str(first.pk))
    assert mine["capacity"] == 16 and mine["booked"] == 1
    assert [r["id"] for r in mine["bookings"]] == [booked["id"]]
    week = desk[0].get(f"{S}calendar/?view=week&from={at(clock, 0, 0).date()}").json()
    assert len(week["days"]) == 7 and week["days"][5]["blocks"] == []
    only = desk[0].get(f"{S}calendar/?from={wednesday}&membership_id={second.pk}&view=day")
    assert [b["membership_id"] for b in only.json()["days"][0]["blocks"]] == [str(second.pk)]
    # a doctor sees their own calendar only, whatever they ask for
    login_staff(doctor[0], doctor[1])
    own = doctor[0].get(f"{S}calendar/?view=day&from={wednesday}&membership_id={second.pk}")
    assert own.json()["only_own"] is True
    assert [b["membership_id"] for b in own.json()["days"][0]["blocks"]] == [str(first.pk)]
    assert desk[0].get(f"{S}calendar/?view=month").status_code == 400
    too_long = desk[0].get(f"{S}calendar/?from={wednesday}&to={wednesday + dt.timedelta(days=40)}")
    assert too_long.status_code == 400
    assert client.get(f"{S}calendar/").status_code in (401, 403)


@pytest.mark.acceptance("S5-B13")
def test_s5b_tables_have_forced_row_security() -> None:
    with connection.cursor() as cursor:
        for table in (
            "scheduling_disruption",
            "scheduling_disruption_item",
            "scheduling_follow_up",
            "scheduling_calendar_feed",
        ):
            cursor.execute(
                "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = %s",
                [table],
            )
            assert cursor.fetchone() == (True, True), table
