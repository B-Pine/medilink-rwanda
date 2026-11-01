"""R4 fixes to S5 (#86): late arrivals and no-shows at closing time, "I'm here" as a claim that
reception confirms, timed pass-over warnings, strike policy, one hold per account across
facilities, service schedules, the shared patient-share rule, calendar-aware slot generation,
the S5 permission matrix and ordering across several booked tickets."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from medilink.billing.models import InsurerRule
from medilink.facilities.calendar import KIGALI
from medilink.facilities.models import OpeningHours, Service
from medilink.masterdata.models import PublicHoliday
from medilink.masterdata.services import writer as masterdata_writer
from medilink.patients.models import PatientLink, Relationship
from medilink.scheduling import booking as svc
from medilink.scheduling import listing, slots
from medilink.scheduling.models import (
    Booking,
    NoShowStrike,
    ScheduleException,
    ScheduleTemplate,
    Slot,
    SlotHold,
)
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import FacilityStatus
from medilink.visits import remote
from medilink.visits.models import ReasonSymptom, Ticket, TicketEvent
from medilink.visits.services import Actor, calling_order, is_eligible, queue_settings
from tests.conftest import error_code, login_staff
from tests.factories import FacilityFactory
from tests.s2.conftest import client_for, make_catalogue
from tests.s4.conftest import act, call_next, check_in, on_duty, register
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


def _join(client: APIClient, user: Any, clinic: Any, service_id: str, **extra: Any) -> Any:
    return client.post(
        f"{P}visits/remote-join/",
        {
            "facility_slug": clinic.slug,
            "service_id": service_id,
            "patient_id": self_id(user),
            **extra,
        },
        format="json",
    )


# ---- late arrival and no-show (decision 2026-10-31) ------------------------------------------


@pytest.mark.acceptance("S5-B9", "S5-B11")
def test_late_booked_patient_checks_in_as_walk_in_and_no_show_waits_for_closing(
    clock: Clock, clinic: Any, bookable: dict[str, Any], desk: tuple[APIClient, Any]
) -> None:
    settings_for(clinic, "booking", lead_time_hours=0)
    service_id = bookable["service_id"]
    late_client, late_user = patient_client("late-r4@example.test", "Late Arrival")
    gone_client, gone_user = patient_client("gone-r4@example.test", "Never Came")
    slot = first_slot(clinic, service_id, after=clock.now + dt.timedelta(minutes=30))
    late = book(late_client, late_user, slot).json()
    gone = book(gone_client, gone_user, first_slot(clinic, service_id, after=slot.ends_at)).json()

    # 40 minutes after the slot: past the grace window, but the facility is still open
    clock.now = slot.starts_at + dt.timedelta(minutes=40)
    with rls_context(facility_id=clinic.pk):
        assert svc.mark_no_shows(clinic.pk) == 0
    login_staff(desk[0], desk[1])
    expected = desk[0].get(f"{S}bookings/?status=confirmed").json()["results"]
    assert {r["id"]: r["late"] for r in expected} == {late["id"]: True, gone["id"]: True}
    arrived = desk[0].post(f"{S}visits/check-in/", {"booking_id": late["id"]}, format="json")
    assert arrived.status_code == 201, arrived.content
    body = arrived.json()
    assert body["late"] is True
    assert body["ticket"]["late"] is True and "late" in body["ticket"]["flags"]
    assert body["ticket"]["slot_starts_at"] is None  # waits as a walk-in, by arrival
    with rls_context(facility_id=clinic.pk):
        assert Booking.objects.get(pk=late["id"]).status == "checked_in"

    # after closing (17:00) the booking nobody came for is a no-show with a strike
    clock.at(17, 1)
    with rls_context(facility_id=clinic.pk):
        assert svc.mark_no_shows(clinic.pk) == 1
        assert Booking.objects.get(pk=gone["id"]).status == "no_show"
        assert NoShowStrike.objects.filter(booking_id=gone["id"]).count() == 1
        assert not NoShowStrike.objects.filter(booking_id=late["id"]).exists()


@pytest.mark.acceptance("S5-B9")
def test_booking_for_a_patient_already_in_the_queue(
    clock: Clock, clinic: Any, bookable: dict[str, Any], desk: tuple[APIClient, Any]
) -> None:
    settings_for(clinic, "booking", lead_time_hours=0)
    service_id = bookable["service_id"]
    client, user = patient_client("twice@example.test", "Twice Booked")
    patient_id = user.patient_links.get().patient_id
    first_at = first_slot(clinic, service_id, after=clock.now)
    first = book(client, user, first_at).json()
    # the patient walked in first: the booking joins that visit (same service, no booking yet)
    with rls_context(facility_id=clinic.pk):
        record = remote.facility_record(clinic.pk, patient_id, desk[1])
    walked = check_in(desk[0], record, service_id).json()
    joined = desk[0].post(f"{S}visits/check-in/", {"booking_id": first["id"]}, format="json")
    assert joined.status_code == 200, joined.content
    assert joined.json()["visit_id"] == walked["visit_id"]
    assert joined.json()["ticket"]["slot_starts_at"] is not None  # booked order from now on
    with rls_context(facility_id=clinic.pk):
        assert str(Booking.objects.get(pk=first["id"]).visit_id) == walked["visit_id"]
        # a second booking the same day can't be silently left to become a no-show: 422
        second_slot = first_slot(clinic, service_id, after=first_at.ends_at)
        second = Booking.objects.create(
            facility=clinic,
            patient_id=patient_id,
            slot=second_slot,
            service_id=service_id,
            starts_at=second_slot.starts_at,
            service_date=second_slot.starts_at.astimezone(KIGALI).date(),
            status="confirmed",
            booking_code="R4TEST",
            source="phone",
        )
    refused = desk[0].post(f"{S}visits/check-in/", {"booking_id": str(second.pk)}, format="json")
    assert refused.status_code == 422, refused.content


# ---- remote join: "I'm here" is a claim -----------------------------------------------------


@pytest.mark.acceptance("S5-B10")
def test_im_here_is_a_claim_until_reception_confirms(
    clock: Clock,
    clinic: Any,
    bookable: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
    catalogue: dict[str, Any],
) -> None:
    service_id = bookable["service_id"]
    client, user = patient_client("claim@example.test", "Claims Arrival")
    joined = _join(
        client, user, clinic, service_id, symptoms=[{"code": "cough", "duration_days": 3}]
    )
    assert joined.status_code == 201, joined.content
    row = joined.json()
    assert row["is_remote"] is True and row["remote_arrival_claimed_at"] is None
    with rls_context(facility_id=clinic.pk):
        ticket = Ticket.objects.get(visit_id=row["visit_id"])
        [symptom] = ReasonSymptom.objects.filter(visit_id=row["visit_id"])
        assert symptom.captured_at_stage == "check_in" and symptom.symptom_code == "cough"
        remote.claim_arrival(ticket, actor=Actor(user=user, membership=None))
        ticket.refresh_from_db()
        assert ticket.remote_arrival_claimed_at is not None
        assert ticket.remote_arrival_confirmed_at is None
        assert ticket.visit.status == "remote_pending"  # not on site on the patient's word
        assert not is_eligible(ticket, queue_settings(clinic.pk), clock.now)
    on_duty(doctor[0], catalogue["point"]["id"])
    assert call_next(doctor[0], service_id).status_code == 204  # nobody confirmed on site

    board = desk[0].get(f"{S}queue/board/").json()
    [waiting] = board["queues"][0]["waiting"]
    assert "remote_claimed" in waiting["flags"] and waiting["remote_arrival_claimed_at"]
    # only reception confirms; a doctor can't
    assert act(doctor[0], waiting, "confirm-arrival").status_code == 403
    confirmed = act(desk[0], waiting, "confirm-arrival")
    assert confirmed.status_code == 200, confirmed.content
    assert confirmed.json()["remote_arrival_confirmed_at"] is not None
    assert act(desk[0], confirmed.json(), "confirm-arrival").status_code == 422  # once
    with rls_context(facility_id=clinic.pk):
        ticket.refresh_from_db()
        assert ticket.visit.status == "on_site" and ticket.visit.checked_in_at is not None
    called = call_next(doctor[0], service_id)
    assert called.status_code == 200 and called.json()["id"] == str(ticket.pk)


@pytest.mark.acceptance("S5-B10")
def test_pass_over_warns_first_then_moves_then_expires(
    clock: Clock, clinic: Any, bookable: dict[str, Any], desk: tuple[APIClient, Any]
) -> None:
    service_id = bookable["service_id"]
    settings_for(
        clinic, "queue", pass_over_places=1, pass_over_limit=1, pass_over_warning_minutes=5
    )
    client, user = patient_client("passover@example.test", "Far Away")
    visit_id = _join(client, user, clinic, service_id).json()["visit_id"]
    for i in range(2):
        clock.now += dt.timedelta(minutes=1)
        check_in(desk[0], register(clinic, desk[1], f"On Site{i}"), service_id)
    warnings: list[dict[str, Any]] = []

    def receiver(**kwargs: Any) -> None:
        warnings.append(kwargs)

    remote.ticket_pass_over_warning.connect(receiver, weak=False)
    try:
        with rls_context(facility_id=clinic.pk):
            ticket = Ticket.objects.get(visit_id=visit_id)
            arrival = ticket.arrival_at
            # at the front and not confirmed: a warning first, no move
            assert remote.pass_over(clinic.pk) == 1
            ticket.refresh_from_db()
            assert ticket.pass_over_warned_at is not None and ticket.pass_over_count == 0
            # a claim alone doesn't stop pass-over
            remote.claim_arrival(ticket, actor=Actor(user=user, membership=None))
            assert remote.pass_over(clinic.pk) == 0  # still inside the notice
            clock.now += dt.timedelta(minutes=6)
            assert remote.pass_over(clinic.pk) == 1
            ticket.refresh_from_db()
            assert ticket.pass_over_count == 1 and ticket.state == "waiting"
            assert ticket.arrival_at == arrival  # the real join time is kept
            order = calling_order(clinic.pk, service_id, "consultation")
            assert [t.pk for t in order].index(ticket.pk) == 1
            # its last chance: warned (final), then it loses the ticket
            Ticket.objects.exclude(pk=ticket.pk).update(state="completed")
            assert remote.pass_over(clinic.pk) == 1
            clock.now += dt.timedelta(minutes=6)
            assert remote.pass_over(clinic.pk) == 1
            ticket.refresh_from_db()
            assert ticket.state == "left_without_service"
    finally:
        remote.ticket_pass_over_warning.disconnect(receiver)
    with rls_context(facility_id=clinic.pk):
        events = TicketEvent.objects.filter(ticket=ticket, action="pass_over_warning")
        finals = [e.metadata["final"] for e in events.order_by("occurred_at")]
    assert finals == ["False", "True"]
    assert warnings == []  # S9 is told only after commit


# ---- strikes (platform policy) ----------------------------------------------------------------


def _past_booking(clinic: Any, patient_id: Any, service_id: str, i: int) -> Booking:
    with rls_context(facility_id=clinic.pk):
        slot = Slot.objects.filter(facility=clinic).order_by("-starts_at")[i]
        return Booking.objects.create(
            facility=clinic,
            patient_id=patient_id,
            slot=slot,
            service_id=service_id,
            starts_at=slot.starts_at,
            service_date=slot.starts_at.astimezone(KIGALI).date(),
            status="no_show",
            booking_code=f"PAST{i}X",
            source="phone",
        )


def _strike(clinic: Any, patient_id: Any, at: dt.datetime, booking: Booking) -> None:
    with rls_context(facility_id=clinic.pk):
        NoShowStrike.objects.create(
            facility=clinic, patient_id=patient_id, booking=booking, occurred_at=at
        )


@pytest.mark.acceptance("S5-B6", "S5-B11")
def test_strike_limit_is_a_platform_setting_for_30_days(
    clock: Clock, clinic: Any, bookable: dict[str, Any]
) -> None:
    client, user = patient_client("strikes@example.test", "Often Absent")
    patient_id = user.patient_links.get().patient_id
    service_id = bookable["service_id"]
    book(client, user, first_slot(clinic, service_id, after=clock.now + dt.timedelta(hours=3)))
    past = [_past_booking(clinic, patient_id, service_id, i) for i in range(4)]
    for booking, days in zip(past, (20, 15, 10), strict=False):
        _strike(clinic, patient_id, clock.now - dt.timedelta(days=days), booking)
    status = svc.limits(clinic.pk, patient_id)
    assert status["strikes"] == 3 and status["warning"] and not status["limited"]
    _strike(clinic, patient_id, clock.now - dt.timedelta(days=5), past[3])
    status = svc.limits(clinic.pk, patient_id)
    assert status["limited"] and status["max_active"] == 1
    assert status["limited_until"] == clock.now + dt.timedelta(days=25)
    later = first_slot(clinic, service_id, after=clock.now + dt.timedelta(days=2))
    refused = book(client, user, later)
    assert refused.status_code == 422 and error_code(refused) == "limit_strikes"
    # 30 days after the fourth strike the limit ends
    clock.now += dt.timedelta(days=26)
    assert not svc.limits(clinic.pk, patient_id)["limited"]
    # the threshold is a platform setting, not a facility one
    clock.now -= dt.timedelta(days=26)
    with override_settings(NO_SHOW_STRIKE_LIMIT=5):
        assert not svc.limits(clinic.pk, patient_id)["limited"]
    settings_for(clinic, "booking", no_show_strikes=10)
    assert svc.limits(clinic.pk, patient_id)["limited"]  # the facility value is not used


# ---- holds ------------------------------------------------------------------------------------


@pytest.mark.acceptance("S5-B6")
def test_one_open_hold_per_account_across_facilities(
    clock: Clock, clinic: Any, bookable: dict[str, Any]
) -> None:
    other = FacilityFactory(name="Remera Clinic", slug="remera", status=FacilityStatus.LIVE)
    other_admin, _ = client_for(other, ("facility_admin",), "remera-admin@example.test")
    other_service = make_catalogue(other_admin)["service"]["id"]
    with rls_context(facility_id=other.pk):
        Service.objects.filter(pk=other_service).update(is_bookable=True)
        other_slot = Slot.objects.create(
            facility=other,
            service_id=other_service,
            starts_at=clock.now + dt.timedelta(days=1),
            ends_at=clock.now + dt.timedelta(days=1, minutes=15),
            capacity=1,
            bookable_capacity=1,
        )
    service_id = bookable["service_id"]
    client, _ = patient_client("holds@example.test", "Two Places")
    first = client.post(f"{P}slots/{other_slot.pk}/hold/")
    assert first.status_code == 201, first.content
    slot = first_slot(clinic, service_id, after=clock.now + dt.timedelta(hours=3))
    second = client.post(f"{P}slots/{slot.pk}/hold/")
    assert second.status_code == 201, second.content
    with rls_context(facility_id=other.pk):
        assert SlotHold.objects.get(pk=first.json()["hold_id"]).released_at is not None
        assert Slot.objects.get(pk=other_slot.pk).held_count == 0
    with rls_context(facility_id=clinic.pk):
        assert SlotHold.objects.get(pk=second.json()["hold_id"]).released_at is None


# ---- slot generation ----------------------------------------------------------------------------


@pytest.mark.acceptance("S5-B4")
def test_slot_generation_skips_holidays_umuganda_and_leave(
    clock: Clock,
    clinic: Any,
    bookable: dict[str, Any],
    admin: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
) -> None:
    settings_for(clinic, "booking", horizon_days=60)
    service_id = bookable["service_id"]
    membership = bookable["membership"]
    monday = clock.now.date()
    wednesday, thursday = monday + dt.timedelta(days=2), monday + dt.timedelta(days=3)
    with masterdata_writer():
        PublicHoliday.objects.update_or_create(
            holiday_date=wednesday, defaults={"name_i18n": {"en": "Test Day"}, "is_active": True}
        )
    with rls_context(facility_id=clinic.pk):
        ScheduleException.objects.create(
            facility=clinic,
            membership=membership,
            kind="leave",
            starts_at=dt.datetime.combine(thursday, dt.time.min, KIGALI),
            ends_at=dt.datetime.combine(thursday + dt.timedelta(days=1), dt.time.min, KIGALI),
            status="approved",
            requested_by=doctor[1],
        )
        # Saturdays 08:00-12:00 too, so the last Saturday (Umuganda) can be checked
        OpeningHours.objects.create(
            facility=clinic, weekday=5, opens_at=dt.time(8, 0), closes_at=dt.time(12, 0)
        )
        ScheduleTemplate.objects.create(
            facility=clinic,
            membership=membership,
            service_id=service_id,
            weekday=5,
            starts_at=dt.time(8, 0),
            ends_at=dt.time(12, 0),
            slot_minutes=15,
            capacity=1,
            valid_from=monday - dt.timedelta(days=7),
        )
        slots.generate(clinic.pk)
        open_days = {
            s.starts_at.astimezone(KIGALI).date()
            for s in Slot.objects.filter(facility=clinic, status="open")
        }
    assert wednesday not in open_days  # public holiday
    assert thursday not in open_days  # the doctor's approved leave
    assert monday + dt.timedelta(days=1) in open_days
    saturdays = [d for d in open_days if d.weekday() == 5]
    assert saturdays  # ordinary Saturdays have slots
    assert not [d for d in saturdays if (d + dt.timedelta(days=7)).month != d.month]


@pytest.mark.acceptance("S5-B4")
def test_service_schedule_without_a_doctor_gives_open_slots(
    clock: Clock, clinic: Any, bookable: dict[str, Any], admin: tuple[APIClient, Any]
) -> None:
    service_id = bookable["service_id"]
    made = admin[0].post(
        f"{S}schedule-templates/",
        {
            "membership_id": None,
            "service_id": service_id,
            "weekday": 0,
            "starts_at": "13:00",
            "ends_at": "15:00",
            "slot_minutes": 30,
            "capacity": 2,
        },
        format="json",
    )
    assert made.status_code == 201, made.content
    assert made.json()["template"]["membership_id"] is None
    with rls_context(facility_id=clinic.pk):
        slots.generate(clinic.pk)
        afternoon = Slot.objects.filter(
            facility=clinic, membership__isnull=True, starts_at__date=clock.now.date()
        )
        assert afternoon.count() == 4
    profile = APIClient().get(f"{PUB}facilities/{clinic.slug}/").json()
    assert len(profile["doctors"]) == 1  # a service schedule names no doctor


# ---- patient share --------------------------------------------------------------------------------


@pytest.mark.acceptance("S5-B7")
def test_patient_share_is_one_rule_for_listing_profile_and_booking(
    clock: Clock, clinic: Any, bookable: dict[str, Any], admin: tuple[APIClient, Any]
) -> None:
    with rls_context(facility_id=clinic.pk):
        InsurerRule.objects.create(
            facility=clinic,
            insurer_code="mmi",
            patient_share_bp=2000,  # 20 % = 1 000 RWF ...
            ceiling_per_visit_rwf=3000,  # ... but the insurer pays at most 3 000
            valid_from=clock.now.date() - dt.timedelta(days=30),
            created_by=admin[1],
        )
        InsurerRule.objects.create(
            facility=clinic,
            insurer_code="sanlam",
            patient_share_bp=1000,
            excluded_tariff_codes=["CONSULT"],  # consultations not covered
            valid_from=clock.now.date() - dt.timedelta(days=30),
            created_by=admin[1],
        )
        listing.refresh(clinic.pk)
        on = clock.now.date()
        cost = svc.estimate(clinic.pk, bookable["service_id"], on, "mmi")
        assert (cost.patient_share_rwf, cost.insurer_accepted) == (2000, True)
        excluded = svc.estimate(clinic.pk, bookable["service_id"], on, "sanlam")
        assert (excluded.patient_share_rwf, excluded.insurer_accepted) == (5000, False)
    api = APIClient()
    for code, share, accepts in (
        ("mmi", 2000, "yes"),
        ("sanlam", 5000, "no"),
        ("rama", 500, "yes"),
    ):
        [row] = api.post(
            f"{PUB}facilities/search/",
            {"service_code": "general_consultation", "insurer_code": code},
            format="json",
        ).json()["results"]
        assert (row["patient_share_rwf"], row["accepts_insurance"]) == (share, accepts), code
    service = api.get(f"{PUB}facilities/{clinic.slug}/").json()["services"][0]
    assert service["insurer_share_rwf"] == {"mmi": 2000, "rama": 500}
    assert service["insurer_shares"] == {"mmi": 2000, "rama": 1000}


# ---- ordering -----------------------------------------------------------------------------------


@pytest.mark.acceptance("S5-B9")
def test_ratio_interleaves_several_booked_tickets(
    clock: Clock,
    clinic: Any,
    bookable: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
    catalogue: dict[str, Any],
) -> None:
    settings_for(clinic, "booking", lead_time_hours=0)
    settings_for(clinic, "queue", booked_ratio="1:2")
    service_id = bookable["service_id"]
    booked = []
    after = clock.now
    for i in range(3):
        client, user = patient_client(f"ratio{i}@example.test", f"Booked Person{i}")
        slot = first_slot(clinic, service_id, after=after)
        after = slot.ends_at
        made = book(client, user, slot).json()
        ticket = desk[0].post(f"{S}visits/check-in/", {"booking_id": made["id"]}, format="json")
        booked.append(ticket.json()["ticket"]["id"])
    walk_ins = [
        check_in(desk[0], register(clinic, desk[1], f"Walk Person{i}"), service_id).json()[
            "ticket"
        ]["id"]
        for i in range(4)
    ]
    on_duty(doctor[0], catalogue["point"]["id"])
    called = []
    for _ in range(7):
        clock.now += dt.timedelta(minutes=1)  # the interleave reads the order of calls
        ticket = call_next(doctor[0], service_id).json()
        called.append(ticket["id"])
        started = act(doctor[0], ticket, "start").json()
        act(doctor[0], started, "complete")
    b, w = booked, walk_ins
    assert called == [b[0], w[0], w[1], b[1], w[2], w[3], b[2]]


@pytest.mark.acceptance("S5-B9")
def test_board_mine_and_display_follow_the_calling_order(
    clock: Clock,
    clinic: Any,
    bookable: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
    admin: tuple[APIClient, Any],
    catalogue: dict[str, Any],
) -> None:
    settings_for(clinic, "booking", lead_time_hours=0)
    service_id = bookable["service_id"]
    walk = [
        check_in(desk[0], register(clinic, desk[1], f"Early Walker{i}"), service_id).json()[
            "ticket"
        ]
        for i in range(2)
    ]
    client, user = patient_client("order@example.test", "Booked Later")
    made = book(client, user, first_slot(clinic, service_id, after=clock.now)).json()
    booked = desk[0].post(f"{S}visits/check-in/", {"booking_id": made["id"]}, format="json").json()
    with rls_context(facility_id=clinic.pk):
        expected = [str(t.pk) for t in calling_order(clinic.pk, service_id, "consultation")]
    assert expected[0] == booked["ticket"]["id"]  # booked first, though it arrived last
    board = desk[0].get(f"{S}queue/board/").json()["queues"][0]["waiting"]
    assert [r["id"] for r in board] == expected
    assert [r["position"] for r in board] == [0, 1, 2]
    on_duty(doctor[0], catalogue["point"]["id"])
    mine = doctor[0].get(f"{S}queue/mine/").json()["waiting"]
    assert [r["id"] for r in mine] == expected
    token = (
        admin[0]
        .post(f"{S}display-links/", {"label": "Hall", "service_ids": [service_id]}, format="json")
        .json()["token"]
    )
    shown = APIClient().get(f"/api/v1/display/{token}/").json()["services"][0]["next"]
    numbers = {r["id"]: r["number"] for r in [*walk, booked["ticket"]]}
    assert shown == [numbers[i] for i in expected]


# ---- permission matrix (S5-B2) -----------------------------------------------------------------


@pytest.mark.acceptance("S5-B2")
def test_patient_rights_self_guardian_delegate_and_other_facility(
    clock: Clock, clinic: Any, bookable: dict[str, Any], desk: tuple[APIClient, Any]
) -> None:
    service_id = bookable["service_id"]
    owner, owner_user = patient_client("owner@example.test", "Profile Owner")
    patient_id = owner_user.patient_links.get().patient_id
    guardian, guardian_user = patient_client("guardian@example.test", "Guardian Person")
    delegate, delegate_user = patient_client("delegate@example.test", "Delegate Person")
    stranger, _ = patient_client("stranger@example.test", "Stranger Person")
    PatientLink.objects.create(
        account=guardian_user, patient_id=patient_id, relationship=Relationship.GUARDIAN
    )
    PatientLink.objects.create(
        account=delegate_user, patient_id=patient_id, relationship=Relationship.DELEGATE
    )
    later = clock.now + dt.timedelta(hours=3)
    with rls_context(facility_id=clinic.pk):
        free = iter(
            Slot.objects.filter(
                facility=clinic, service_id=service_id, status="open", starts_at__gte=later
            ).order_by("starts_at")[:5]
        )

    def book_for(client: APIClient) -> Any:
        # a fresh slot each time: a refused booking leaves its hold open
        hold = client.post(f"{P}slots/{next(free).pk}/hold/")
        assert hold.status_code == 201, hold.content
        return client.post(
            f"{P}bookings/",
            {
                "hold_id": hold.json()["hold_id"],
                "patient_id": str(patient_id),
                "symptoms": [{"code": "fever"}],
            },
            format="json",
        )

    assert book_for(delegate).status_code == 403  # a delegate may look, not book
    assert book_for(stranger).status_code == 404  # no link at all
    made = book_for(guardian)
    assert made.status_code == 201, made.content
    booking = made.json()
    for client, status in ((owner, 200), (guardian, 200), (delegate, 200), (stranger, 404)):
        assert client.get(f"{P}bookings/{booking['id']}/").status_code == status
    refused = delegate.post(
        f"{P}bookings/{booking['id']}/cancel/", {"version": booking["version"]}, format="json"
    )
    assert refused.status_code == 403
    assert (
        stranger.post(
            f"{P}bookings/{booking['id']}/cancel/", {"version": booking["version"]}, format="json"
        ).status_code
        == 404
    )
    as_delegate = delegate.post(
        f"{P}visits/remote-join/",
        {"facility_slug": clinic.slug, "service_id": service_id, "patient_id": str(patient_id)},
        format="json",
    )
    assert as_delegate.status_code == 403

    # another facility's staff can't see or act on this booking
    elsewhere = FacilityFactory(name="Other Place", slug="other-place", status=FacilityStatus.LIVE)
    other_desk, _ = client_for(elsewhere, ("receptionist",), "other-desk@example.test")
    assert (
        other_desk.post(
            f"{S}bookings/{booking['id']}/cancel/",
            {"version": booking["version"], "reason_code": "other"},
            format="json",
        ).status_code
        == 404
    )
    assert (
        other_desk.post(
            f"{S}visits/check-in/", {"booking_id": booking["id"]}, format="json"
        ).status_code
        == 404
    )
    listed = other_desk.get(f"{S}bookings/?date={later.astimezone(KIGALI).date()}").json()
    assert listed["results"] == []
    # anonymous callers get nothing from patient or staff endpoints
    anon = APIClient()
    assert anon.get(f"{P}bookings/").status_code in (401, 403)
    assert anon.get(f"{S}bookings/").status_code in (401, 403)


@pytest.mark.acceptance("S5-B6")
def test_sex_rule_refuses_a_booking_for_the_wrong_sex(
    clock: Clock, clinic: Any, bookable: dict[str, Any]
) -> None:
    service_id = bookable["service_id"]
    with rls_context(facility_id=clinic.pk):
        Service.objects.filter(pk=service_id).update(sex_restriction="female")
    client, user = patient_client("sexrule@example.test", "Mugisha Paul")
    patient = user.patient_links.get().patient
    patient.sex = "male"
    patient.save()
    later = clock.now + dt.timedelta(hours=3)
    refused = book(client, user, first_slot(clinic, service_id, after=later))
    assert refused.status_code == 422 and error_code(refused) == "sex_rule"
    patient.sex = "female"
    patient.save()
    with rls_context(facility_id=clinic.pk):
        slot = (
            Slot.objects.filter(facility=clinic, service_id=service_id, starts_at__gte=later)
            .order_by("starts_at")
            .filter(held_count=0)
            .first()
        )
    assert book(client, user, slot).status_code == 201
