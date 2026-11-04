"""#207 (upgrade 13 W8): label pictograms (times of day, meal timing) and the next-visit date on
the staff visit, for patients without a phone."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.db import DatabaseError, transaction
from rest_framework.test import APIClient

from medilink.pharmacy.models import PrescriptionItem
from medilink.scheduling.models import FollowUp, FollowUpMode, FollowUpStatus
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import FacilityMembership
from medilink.visits.models import Visit
from tests.s7.conftest import AMOX, S, add_item, dispense, draft, sign

pytestmark = pytest.mark.django_db(transaction=False)

PARA = {
    "drug_code": "PARA500",
    "dose": "2 tablets",
    "frequency_code": "qds",
    "route": "oral",
    "duration_days": 3,
}


def test_labels_carry_times_of_day_and_meal_timing(
    clinic: Any,
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    pharmacist: tuple[APIClient, Any],
    drugs: dict[str, Any],
) -> None:
    c = draft(doctor[0], visit["visit_id"])
    assert add_item(doctor[0], c["id"], **{**AMOX, "meal_timing": "midnight"}).status_code == 400
    added = add_item(doctor[0], c["id"], **{**AMOX, "meal_timing": "after_food"})
    assert added.status_code == 201, added.content
    assert added.json()["items"][0]["meal_timing"] == "after_food"
    assert add_item(doctor[0], c["id"], **PARA).status_code == 201
    assert sign(doctor[0], c["id"]).status_code == 200
    p = doctor[0].get(f"{S}consultations/{c['id']}/prescription/").json()
    items = {i["drug_code"]: i for i in p["items"]}
    assert items["PARA500"]["meal_timing"] == ""

    lines = [{"item_id": i["id"], "outcome": "full"} for i in p["items"]]
    assert dispense(pharmacist[0], p, *lines).status_code == 201
    english = pharmacist[0].get(f"{S}prescriptions/{p['id']}/labels/?language=en").json()
    by_code = {lb["frequency_code"]: lb for lb in english["labels"]}
    assert by_code["tds"]["times"] == ["morning", "noon", "evening"]
    assert by_code["tds"]["meal_timing"] == "after_food" and by_code["tds"]["meal"] == "After food"
    assert by_code["qds"]["times"] == ["morning", "noon", "evening", "night"]
    assert by_code["qds"]["meal"] == ""
    kinyarwanda = pharmacist[0].get(f"{S}prescriptions/{p['id']}/labels/").json()["labels"]
    assert {lb["meal"] for lb in kinyarwanda} == {"Nyuma yo kurya", ""}

    # issued items are locked, the meal timing too
    with rls_context(facility_id=clinic.pk), pytest.raises(DatabaseError), transaction.atomic():
        PrescriptionItem.objects.filter(pk=items["AMOX500"]["id"]).update(meal_timing="with_food")


def test_staff_visit_shows_the_follow_up_for_the_card(
    clinic: Any,
    visit: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
) -> None:
    detail = desk[0].get(f"{S}visits/{visit['visit_id']}/")
    assert detail.status_code == 200 and detail.json()["follow_up"] is None

    due = dt.date.today() + dt.timedelta(days=14)
    with rls_context(facility_id=clinic.pk):
        v = Visit.objects.get(pk=visit["visit_id"])
        FollowUp.objects.create(
            facility_id=clinic.pk,
            visit=v,
            patient_id=v.patient_id,
            service_id=v.first_service_id,
            membership=FacilityMembership.objects.get(user=doctor[1], facility=clinic),
            due_on=due,
            mode=FollowUpMode.REMINDER,
            status=FollowUpStatus.DUE,
            created_by=doctor[1],
        )
    body = desk[0].get(f"{S}visits/{visit['visit_id']}/").json()["follow_up"]
    assert body["due_on"] == due.isoformat()
    assert body["starts_at"] is None and body["booking_code"] == ""
    assert body["doctor_name"] == doctor[1].full_name
