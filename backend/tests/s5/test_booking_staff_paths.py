"""S5 bookings beyond the happy path (contract sprint-05 §2.2, §3.2, §3.3): reception cancels and
moves bookings, insurer estimates, refusals with their error codes, released holds, and the
periodic jobs that expire holds, mark no-shows and purge old rows."""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

import pytest
from rest_framework.test import APIClient

from medilink.billing.models import InsurerRule
from medilink.facilities.models import PublicListing, Service
from medilink.patients.crypto.fields import decrypt
from medilink.patients.models import InsuranceProfile, Patient
from medilink.scheduling import booking as svc
from medilink.scheduling import tasks
from medilink.scheduling.models import Booking, NoShowStrike, Slot, SlotHold
from medilink.tenancy.context import rls_context
from medilink.visits.models import Visit
from tests.conftest import error_code, login_patient, login_staff
from tests.s4.conftest import register
from tests.s5.conftest import Clock, P, S, book, first_slot, patient_client, self_id, settings_for

pytestmark = pytest.mark.django_db


def staff_hold(client: APIClient, slot: Slot) -> str:
    response = client.post(f"{S}slots/{slot.pk}/hold/")
    assert response.status_code == 201, response.content
    return str(response.json()["hold_id"])


def staff_book(client: APIClient, record: Any, slot: Slot, **extra: Any) -> Any:
    return client.post(
        f"{S}bookings/",
        {
            "hold_id": staff_hold(client, slot),
            "facility_patient_id": str(record.pk),
            "symptoms": [{"code": "headache"}],
            **extra,
        },
        format="json",
    )


def insurance(patient_id: Any, code: str, by: Any) -> InsuranceProfile:
    return InsuranceProfile.objects.create(
        patient_id=patient_id,
        created_by=by,
        insurer_code=code,
        insurer_display=code.upper(),
        member_number=f"{code.upper()}-0001",
    )


def day_of(slot: Slot) -> dt.date:
    from medilink.facilities.calendar import KIGALI

    return slot.starts_at.astimezone(KIGALI).date()


@pytest.mark.acceptance("S5-B6", "S5-B8")
def test_reception_moves_and_cancels_a_phone_booking(
    clock: Clock, clinic: Any, bookable: dict[str, Any], desk: tuple[APIClient, Any]
) -> None:
    client = desk[0]
    service_id = bookable["service_id"]
    record = register(clinic, desk[1], "Phone Patient")
    cover = insurance(record.patient_id, "rama", desk[1])
    first = first_slot(clinic, service_id, after=clock.now + dt.timedelta(days=1))
    made = staff_book(
        client,
        record,
        first,
        insurance_profile_id=str(cover.pk),
        reason_text="Pain behind the eyes",
    )
    assert made.status_code == 201, made.content
    booking = made.json()
    with rls_context(facility_id=clinic.pk):
        stored = Booking.objects.get(pk=booking["id"])
        # RAMA rule of the fixture: the patient pays 10 % of 5 000 RWF
        assert (stored.insurer_code, stored.insurer_accepted) == ("rama", True)
        assert stored.estimated_patient_share_rwf == 500

    # the day list filters by service, ignores an unreadable filter and is empty on other days
    day = day_of(first)
    by_service = client.get(f"{S}bookings/?date={day}&service_id={service_id}").json()
    assert [r["id"] for r in by_service["results"]] == [booking["id"]]
    unreadable = client.get(f"{S}bookings/?date={day}&membership_id=not-a-uuid").json()
    assert unreadable["count"] == 1
    empty = client.get(f"{S}bookings/?date={day + dt.timedelta(days=1)}").json()
    assert empty == {"count": 0, "results": []}

    # reception moves it to another day: insurance and the reason for visit go along
    later = first_slot(clinic, service_id, after=clock.now + dt.timedelta(days=2))
    moved = client.post(
        f"{S}bookings/{booking['id']}/reschedule/",
        {"version": booking["version"], "hold_id": staff_hold(client, later)},
        format="json",
    )
    assert moved.status_code == 200, moved.content
    new = moved.json()
    assert new["id"] != booking["id"] and new["status"] == "confirmed"
    with rls_context(facility_id=clinic.pk):
        replacement = Booking.objects.get(pk=new["id"])
        assert replacement.insurer_code == "rama"
        assert replacement.facility_patient_id == record.pk
        text = decrypt(
            bytes(replacement.reason_encrypted),
            table="scheduling_booking",
            column="reason_encrypted",
            row_id=replacement.pk,
        )
        assert text == "Pain behind the eyes"
        assert Booking.objects.get(pk=booking["id"]).status == "superseded"
    # the superseded booking leaves the default list but can be asked for
    assert client.get(f"{S}bookings/?date={day}").json()["count"] == 0
    superseded = client.get(f"{S}bookings/?date={day}&status=superseded").json()
    assert superseded["count"] == 1

    # reception must say why it cancels
    no_reason = client.post(
        f"{S}bookings/{new['id']}/cancel/",
        {"version": new["version"], "reason_code": "because"},
        format="json",
    )
    assert no_reason.status_code == 422
    assert "reason_code" in no_reason.json()["error"]["fields"]
    cancelled = client.post(
        f"{S}bookings/{new['id']}/cancel/",
        {"version": new["version"], "reason_code": "facility_request"},
        format="json",
    )
    assert cancelled.status_code == 200, cancelled.content
    done = cancelled.json()
    assert done["status"] == "cancelled"
    # a cancelled booking can't be cancelled or moved again
    again = client.post(
        f"{S}bookings/{new['id']}/cancel/",
        {"version": done["version"], "reason_code": "duplicate"},
        format="json",
    )
    assert again.status_code == 422 and error_code(again) == "cancel_closed"
    third = first_slot(clinic, service_id, after=clock.now + dt.timedelta(days=3))
    closed = client.post(
        f"{S}bookings/{new['id']}/reschedule/",
        {"version": done["version"], "hold_id": staff_hold(client, third)},
        format="json",
    )
    assert closed.status_code == 422 and error_code(closed) == "cancel_closed"


@pytest.mark.acceptance("S5-B6")
def test_reception_lookups_answer_404_for_unknown_or_foreign_rows(
    clock: Clock, clinic: Any, bookable: dict[str, Any], desk: tuple[APIClient, Any]
) -> None:
    client = desk[0]
    unknown = uuid.uuid4()
    assert client.get(f"{S}slots/").status_code == 404  # service_id is required
    assert client.get(f"{S}slots/?service_id={unknown}").status_code == 404
    assert client.post(f"{S}slots/{unknown}/hold/").status_code == 404
    assert (
        client.post(
            f"{S}bookings/{unknown}/cancel/",
            {"version": 1, "reason_code": "duplicate"},
            format="json",
        ).status_code
        == 404
    )
    slot = first_slot(clinic, bookable["service_id"], after=clock.now + dt.timedelta(days=1))
    no_record = client.post(
        f"{S}bookings/",
        {
            "hold_id": staff_hold(client, slot),
            "facility_patient_id": str(unknown),
            "symptoms": [{"code": "headache"}],
        },
        format="json",
    )
    assert no_record.status_code == 404


@pytest.mark.acceptance("S5-B6")
def test_reception_hold_on_a_full_slot_offers_nearby_times(
    clock: Clock, clinic: Any, bookable: dict[str, Any], desk: tuple[APIClient, Any]
) -> None:
    patient, _user = patient_client("first@example.test", "First Comer")
    slot = first_slot(clinic, bookable["service_id"], after=clock.now + dt.timedelta(days=1))
    assert patient.post(f"{P}slots/{slot.pk}/hold/").status_code == 201
    taken = desk[0].post(f"{S}slots/{slot.pk}/hold/")
    assert taken.status_code == 409 and error_code(taken) == "slot_taken"
    assert len(taken.json()["alternatives"]) == 3
    assert str(slot.pk) not in {a["id"] for a in taken.json()["alternatives"]}


@pytest.mark.acceptance("S5-B9")
def test_check_in_of_a_phone_booking_reuses_its_facility_record(
    clock: Clock, clinic: Any, bookable: dict[str, Any], desk: tuple[APIClient, Any]
) -> None:
    settings_for(clinic, "booking", lead_time_hours=0)
    record = register(clinic, desk[1], "Known Patient")
    slot = first_slot(clinic, bookable["service_id"], after=clock.now + dt.timedelta(minutes=10))
    booking = staff_book(desk[0], record, slot).json()
    arrived = desk[0].post(f"{S}visits/check-in/", {"booking_id": booking["id"]}, format="json")
    assert arrived.status_code == 201, arrived.content
    with rls_context(facility_id=clinic.pk):
        stored = Booking.objects.get(pk=booking["id"])
        assert stored.status == "checked_in"
        assert Visit.objects.get(pk=stored.visit_id).facility_patient_id == record.pk


@pytest.mark.acceptance("S5-B6", "S5-B7")
def test_patient_refusals_released_holds_and_insurer_estimates(
    clock: Clock, clinic: Any, bookable: dict[str, Any]
) -> None:
    client, user = patient_client("paths@example.test", "Uwimana Alice")
    service_id = bookable["service_id"]
    unknown = uuid.uuid4()
    assert client.post(f"{P}slots/{unknown}/hold/").status_code == 404
    assert client.delete(f"{P}holds/{unknown}/").status_code == 404
    assert client.get(f"{P}bookings/{unknown}/").status_code == 404
    assert client.post(f"{P}visits/{unknown}/arrived/").status_code == 404
    expired = client.post(
        f"{P}bookings/",
        {"hold_id": str(unknown), "patient_id": self_id(user), "symptoms": [{"code": "fever"}]},
        format="json",
    )
    assert expired.status_code == 422 and error_code(expired) == "hold_expired"
    no_service = client.post(
        f"{P}visits/remote-join/",
        {"facility_slug": clinic.slug, "service_id": str(unknown), "patient_id": self_id(user)},
        format="json",
    )
    assert no_service.status_code == 404

    # releasing a hold gives the place back; releasing it twice changes nothing
    slot = first_slot(clinic, service_id, after=clock.now + dt.timedelta(days=1))
    hold_id = client.post(f"{P}slots/{slot.pk}/hold/").json()["hold_id"]
    with rls_context(facility_id=clinic.pk):
        assert Slot.objects.get(pk=slot.pk).held_count == 1
    assert client.delete(f"{P}holds/{hold_id}/").status_code == 204
    assert client.delete(f"{P}holds/{hold_id}/").status_code == 204
    with rls_context(facility_id=clinic.pk):
        assert Slot.objects.get(pk=slot.pk).held_count == 0
        assert SlotHold.objects.get(pk=hold_id).released_at is not None

    # an unknown symptom or someone else's insurance card is refused
    hold_id = client.post(f"{P}slots/{slot.pk}/hold/").json()["hold_id"]
    body = {"hold_id": hold_id, "patient_id": self_id(user), "symptoms": [{"code": "fever"}]}
    odd = client.post(f"{P}bookings/", {**body, "symptoms": [{"code": "no_such"}]}, format="json")
    assert odd.status_code == 422 and "symptoms" in odd.json()["error"]["fields"]
    stranger = Patient.objects.create(full_name="Someone Else")
    foreign = insurance(stranger.pk, "rama", user)
    refused = client.post(
        f"{P}bookings/", {**body, "insurance_profile_id": str(foreign.pk)}, format="json"
    )
    assert refused.status_code == 400 and "insurance_profile_id" in str(refused.content)

    # an insurer the clinic has no rule for: full fee, marked as not accepted
    own = insurance(user.patient_links.get().patient_id, "mmi", user)
    made = client.post(
        f"{P}bookings/", {**body, "insurance_profile_id": str(own.pk)}, format="json"
    )
    assert made.status_code == 201, made.content
    assert made.json()["cost"] == {
        "fee_rwf": 5000,
        "patient_share_rwf": 5000,
        "insurer_code": "mmi",
        "insurer_accepted": False,
    }
    assert client.get(f"{P}bookings/?when=past").json() == {"results": []}

    # a hold of another facility (here: none) can't be used to move a booking
    booking = made.json()
    wrong = client.post(
        f"{P}bookings/{booking['id']}/reschedule/",
        {"version": booking["version"], "hold_id": str(unknown)},
        format="json",
    )
    assert wrong.status_code == 422 and error_code(wrong) == "hold_expired"
    # inside the cancellation window the patient can no longer move it
    later = first_slot(clinic, service_id, after=slot.ends_at + dt.timedelta(days=1))
    clock.now = slot.starts_at - dt.timedelta(minutes=30)
    login_patient(client, user)  # the session expired while the clock moved on
    hold_id = client.post(f"{P}slots/{later.pk}/hold/").json()["hold_id"]
    late = client.post(
        f"{P}bookings/{booking['id']}/reschedule/",
        {"version": booking["version"], "hold_id": hold_id},
        format="json",
    )
    assert late.status_code == 422 and error_code(late) == "cancel_closed"


@pytest.mark.acceptance("S5-B6")
def test_sex_restricted_service_refuses_other_patients(
    clock: Clock, clinic: Any, bookable: dict[str, Any]
) -> None:
    client, user = patient_client("sexrule@example.test", "Mugisha Paul")
    patient = user.patient_links.get().patient
    patient.sex = "male"
    patient.save()
    with rls_context(facility_id=clinic.pk):
        Service.objects.filter(pk=bookable["service_id"]).update(sex_restriction="female")
    slot = first_slot(clinic, bookable["service_id"], after=clock.now + dt.timedelta(days=1))
    refused = book(client, user, slot)
    assert refused.status_code == 422 and error_code(refused) == "sex_rule"


@pytest.mark.acceptance("S5-B7")
def test_estimate_applies_the_insurer_ceiling(
    clock: Clock, clinic: Any, bookable: dict[str, Any], admin: tuple[APIClient, Any]
) -> None:
    on = clock.now.date()
    with rls_context(facility_id=clinic.pk):
        InsurerRule.objects.create(
            facility=clinic,
            insurer_code="mmi",
            patient_share_bp=2000,
            ceiling_per_visit_rwf=1000,
            valid_from=on - dt.timedelta(days=1),
            created_by=admin[1],
        )
        # 20 % would be 1 000 RWF, but the insurer pays at most 1 000 of the 5 000
        assert svc.estimate(clinic.pk, bookable["service_id"], on, "mmi") == svc.Cost(
            5000, 4000, "mmi", True
        )
        assert svc.estimate(clinic.pk, bookable["service_id"], on, "rama") == svc.Cost(
            5000, 500, "rama", True
        )
        assert svc.estimate(clinic.pk, bookable["service_id"], on) == svc.Cost(
            5000, 5000, None, None
        )


@pytest.mark.acceptance("S5-B11")
def test_only_a_no_show_can_be_reversed_and_other_needs_a_text(
    clock: Clock, clinic: Any, bookable: dict[str, Any], desk: tuple[APIClient, Any]
) -> None:
    client, user = patient_client("reverse@example.test", "Kamanzi Joel")
    slot = first_slot(clinic, bookable["service_id"], after=clock.now + dt.timedelta(hours=3))
    booking = book(client, user, slot).json()
    url = f"{S}bookings/{booking['id']}/reverse-no-show/"
    confirmed = desk[0].post(
        url, {"version": booking["version"], "reason_code": "facility_delay"}, format="json"
    )
    assert confirmed.status_code == 422 and error_code(confirmed) == "not_allowed"
    clock.now = slot.starts_at + dt.timedelta(minutes=20)
    with rls_context(facility_id=clinic.pk):
        assert svc.mark_no_shows(clinic.pk) == 1
        version = Booking.objects.get(pk=booking["id"]).version
    login_staff(desk[0], desk[1])  # the session expired while the clock moved on
    reversed_ = desk[0].post(
        url,
        {"version": version, "reason_code": "other", "reason_text": "Seen at the lab desk"},
        format="json",
    )
    assert reversed_.status_code == 200, reversed_.content
    with rls_context(facility_id=clinic.pk):
        strike = NoShowStrike.objects.get(booking_id=booking["id"])
        assert strike.reversed_at is not None
        assert strike.reversal_reason == "other: Seen at the lab desk"


@pytest.mark.acceptance("S5-B4", "S5-B11")
def test_periodic_jobs_expire_holds_mark_no_shows_and_purge(
    clock: Clock, clinic: Any, bookable: dict[str, Any]
) -> None:
    # the configuration job rebuilds slots (nothing new) and the clinic's one listing row
    assert tasks.refresh_facility(str(clinic.pk)) == 1
    assert tasks.generate_slots() == 0
    assert tasks.refresh_public_listing() == 1

    client, user = patient_client("jobs@example.test", "Nshuti Eric")
    slot = first_slot(clinic, bookable["service_id"], after=clock.now + dt.timedelta(hours=3))
    booking = book(client, user, slot).json()
    other, _ = patient_client("holder@example.test", "Holder Only")
    held = first_slot(clinic, bookable["service_id"], after=clock.now + dt.timedelta(days=1))
    hold_id = other.post(f"{P}slots/{held.pk}/hold/").json()["hold_id"]

    clock.now = slot.starts_at + dt.timedelta(minutes=20)
    assert tasks.mark_no_shows() == 1
    assert tasks.expire_holds() == 1
    assert tasks.pass_over() == 0  # no one joined remotely
    with rls_context(facility_id=clinic.pk):
        assert Booking.objects.get(pk=booking["id"]).status == "no_show"
        assert SlotHold.objects.get(pk=hold_id).released_at is not None

    # released holds are deleted after a day
    clock.now += dt.timedelta(days=2)
    assert tasks.purge() >= 2  # the booking's hold and the expired one
    with rls_context(facility_id=clinic.pk):
        assert not SlotHold.objects.filter(pk=hold_id).exists()

    # a facility that is no longer live leaves the public listing
    clinic.status = "suspended"
    clinic.save()
    assert tasks.refresh_public_listing() == 0
    assert not PublicListing.objects.filter(facility_id=clinic.pk).exists()
