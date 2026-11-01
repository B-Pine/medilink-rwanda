"""S5 discovery filters and slot rules (contract sprint-05 §2.2, §2.3, P1-P3): where a facility
is, how far it is, whether it is open, and when a slot can or can't be held."""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from typing import Any

import pytest
from rest_framework.test import APIClient

from medilink.facilities.calendar import KIGALI
from medilink.facilities.models import Profile, PublicListing, Service
from medilink.masterdata.models import Location
from medilink.masterdata.services import writer
from medilink.scheduling import listing, slots
from medilink.scheduling.models import ScheduleTemplate, Slot
from medilink.tenancy.context import rls_context
from tests.conftest import error_code
from tests.s5.conftest import PUB, Clock, P, book, first_slot, patient_client, settings_for

pytestmark = pytest.mark.django_db


def test_queue_load_and_public_share_rules() -> None:
    assert listing.queue_load(0, 0) == "low"
    assert listing.queue_load(3, 0) == "high"  # people waiting, no doctor on duty
    assert listing.queue_load(3, 1) == "low"
    assert listing.queue_load(4, 1) == "medium"
    assert listing.queue_load(16, 2) == "high"
    row = PublicListing(fee_rwf=None, insurers={"rama": 1000})
    assert listing._share(row, "rama") is None  # no tariff: no price is shown
    assert listing._accepts(row, None) == "unknown"
    assert listing._accepts(row, "rama") == "yes"


def test_slot_fits_only_inside_one_day() -> None:
    evening = [(dt.time(20, 0), dt.time.max)]
    start = dt.datetime(2026, 11, 2, 23, 45, tzinfo=KIGALI)
    # ending exactly at midnight still fits the day; running past it doesn't
    assert slots._inside(evening, start, start + dt.timedelta(minutes=15))
    assert not slots._inside(evening, start, start + dt.timedelta(minutes=30))


def _place_clinic(clinic: Any) -> Location:
    district = Location.objects.filter(level="district").order_by("code").first()
    with writer():  # master data is written only through its service layer
        sector = Location.objects.create(
            level="sector", code="T901", parent=district, name="Testsec"
        )
        cell = Location.objects.create(level="cell", code="T90101", parent=sector, name="Testcell")
        village = Location.objects.create(
            level="village", code="T9010101", parent=cell, name="Testvillage"
        )
    with rls_context(facility_id=clinic.pk):
        Profile.objects.update_or_create(
            facility=clinic,
            defaults={
                "village_code": village.code,
                "latitude": Decimal("-1.944100"),
                "longitude": Decimal("30.061900"),
                "level_of_care": "secondary",
            },
        )
        listing.refresh(clinic.pk)
    return district


@pytest.mark.acceptance("S5-B3")
def test_search_filters_by_place_level_distance_and_opening(
    clock: Clock, clinic: Any, bookable: dict[str, Any]
) -> None:
    district = _place_clinic(clinic)
    api = APIClient()

    def search(**body: Any) -> list[dict[str, Any]]:
        response = api.post(f"{PUB}facilities/search/", body, format="json")
        assert response.status_code == 200, response.content
        return list(response.json()["results"])

    [row] = search(district_code=district.code)
    assert (row["district"], row["sector"]) == (district.name, "Testsec")
    assert len(search(sector_code="T901")) == 1
    assert search(sector_code="T999") == []
    assert search(district_code="no-such-district") == []
    # a secondary facility: Mutuelle patients are told they may need a referral
    [secondary] = search(level_of_care="secondary", insurer_code="mutuelle")
    assert secondary["referral_hint"] is True
    assert search(level_of_care="tertiary") == []
    [near] = search(near={"lat": -1.95, "lng": 30.06})
    assert 0 < near["distance_km"] < 2
    assert near["lat"] == pytest.approx(-1.9441)
    assert len(search(available_today=True)) == 1
    assert len(search(open_now=True)) == 1  # Monday 09:00, open 08:00-17:00
    clock.at(18, 0)
    assert search(open_now=True) == []
    assert search()[0]["open_now"] is False


@pytest.mark.acceptance("S5-B3")
def test_public_slots_filter_by_doctor_and_hide_unbookable_services(
    clock: Clock, clinic: Any, bookable: dict[str, Any]
) -> None:
    api = APIClient()
    base = f"{PUB}facilities/{clinic.slug}/slots/"
    service_id = bookable["service_id"]
    mine = api.get(f"{base}?service_id={service_id}&membership_id={bookable['membership'].pk}")
    assert mine.status_code == 200
    assert any(day["slots"] for day in mine.json()["days"])
    nobody = api.get(f"{base}?service_id={service_id}&membership_id={uuid.uuid4()}").json()
    assert all(day["slots"] == [] for day in nobody["days"])
    assert api.get(base).status_code == 404  # service_id is required
    with rls_context(facility_id=clinic.pk):
        Service.objects.filter(pk=service_id).update(is_bookable=False)
    assert api.get(f"{base}?service_id={service_id}").status_code == 404


@pytest.mark.acceptance("S5-B6")
def test_holds_refused_inside_lead_time_or_when_booking_is_off(
    clock: Clock, clinic: Any, bookable: dict[str, Any]
) -> None:
    client, _user = patient_client("leadtime@example.test", "Mutoni Sandra")
    soon = first_slot(clinic, bookable["service_id"], after=clock.now)
    # the default lead time is 2 hours: 09:00 is too close
    too_soon = client.post(f"{P}slots/{soon.pk}/hold/")
    assert too_soon.status_code == 409 and error_code(too_soon) == "not_bookable"
    later = first_slot(clinic, bookable["service_id"], after=clock.now + dt.timedelta(days=1))
    settings_for(clinic, "booking", enabled=False)
    off = client.post(f"{P}slots/{later.pk}/hold/")
    assert off.status_code == 409 and error_code(off) == "not_bookable"


@pytest.mark.acceptance("S5-B4")
def test_share_change_never_takes_back_booked_places(
    clock: Clock, clinic: Any, bookable: dict[str, Any]
) -> None:
    client, user = patient_client("share@example.test", "Iradukunda Ange")
    taken = first_slot(clinic, bookable["service_id"], after=clock.now + dt.timedelta(days=1))
    assert book(client, user, taken).status_code == 201
    with rls_context(facility_id=clinic.pk):
        # the clinic stops online booking for this doctor: walk-ins only from now on
        ScheduleTemplate.objects.filter(facility=clinic).update(bookable_share_pct=0)
        slots.generate(clinic.pk)
        assert Slot.objects.get(pk=taken.pk).bookable_capacity == 1  # the booked place stays
        others = Slot.objects.filter(facility=clinic, status="open").exclude(pk=taken.pk)
        assert set(others.values_list("bookable_capacity", flat=True)) == {0}
        # back to half: every slot gets its bookable place again
        ScheduleTemplate.objects.filter(facility=clinic).update(bookable_share_pct=50)
        slots.generate(clinic.pk)
        assert set(
            Slot.objects.filter(facility=clinic, status="open").values_list(
                "bookable_capacity", flat=True
            )
        ) == {1}
