"""Doctor's quick note (W3, #202): order sets on templates and the doctor's favourites."""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient

from medilink.clinical import doctor_tools
from tests.s7.conftest import AMOX, S, add_item, draft, patch, prescribe

pytestmark = pytest.mark.django_db(transaction=False)

C = f"{S}clinical/"

ORDER_SET = {
    "name": "Uncomplicated malaria",
    "sections": {
        "plan_text": "Coartem for 3 days. Review if not better in 48 hours.",
        "patient_instructions_text": "Take with food. Come back if vomiting or confusion.",
    },
    "diagnosis_codes": ["b54", "B20", "ZZ99"],
    "items": [
        {"drug_code": "AMOX500", "dose": "1 capsule", "frequency_code": "tds", "route": "oral"}
    ],
    "tests": [{"code": "MAL-RDT", "name": "Malaria (RDT)"}],
}


def test_order_set_resolves_diagnoses_and_keeps_tests(doctor: tuple[APIClient, Any]) -> None:
    created = doctor[0].post(f"{C}templates/", ORDER_SET, format="json")
    assert created.status_code == 201, created.content
    t = created.json()
    assert t["diagnosis_codes"] == ["B54", "B20", "ZZ99"]
    by_code = {d["code"]: d for d in t["diagnoses"]}
    assert by_code["B54"]["is_known"] and by_code["B54"]["display"] != "B54"
    assert by_code["B20"]["is_sensitive"] is True
    # an unknown code is returned as unknown, so applying it skips it with a message
    assert by_code["ZZ99"] == {
        "code": "ZZ99",
        "display": "ZZ99",
        "plain_language": "",
        "is_sensitive": False,
        "is_known": False,
    }
    # the lab extension point is stored and returned, not ordered
    assert t["tests"] == [{"code": "MAL-RDT", "name": "Malaria (RDT)"}]
    listed = doctor[0].get(f"{C}templates/").json()
    assert listed[0]["tests"] == t["tests"] and len(listed[0]["diagnoses"]) == 3

    # a client that does not send tests keeps none (PUT replaces)
    body = {k: v for k, v in ORDER_SET.items() if k != "tests"}
    replaced = doctor[0].put(f"{C}templates/{t['id']}/", body, format="json")
    assert replaced.status_code == 200 and replaced.json()["tests"] == []

    too_many = {**ORDER_SET, "name": "Many", "tests": [{"code": f"T{i}"} for i in range(11)]}
    assert doctor[0].post(f"{C}templates/", too_many, format="json").status_code == 400


def test_favourites_come_from_my_signed_work(
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    doctor2: tuple[APIClient, Any],
    drugs: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    empty = doctor[0].get(f"{C}favourites/")
    assert empty.status_code == 200, empty.content
    assert empty.json() == {"window_days": 180, "diagnoses": [], "medicines": []}

    prescribe(doctor[0], visit["visit_id"], AMOX)
    # one use is not yet a favourite
    assert doctor[0].get(f"{C}favourites/").json()["diagnoses"] == []

    monkeypatch.setattr(doctor_tools, "FAVOURITE_MIN_USES", 1)
    data = doctor[0].get(f"{C}favourites/").json()
    [diagnosis] = data["diagnoses"]
    assert diagnosis["code"] == "B54" and diagnosis["count"] == 1
    [medicine] = data["medicines"]
    assert medicine["drug_code"] == "AMOX500"
    assert medicine["dose"] == "1 capsule" and medicine["frequency_code"] == "tds"
    assert medicine["duration_days"] == 7 and medicine["available_here"] is True
    # another doctor's favourites are their own
    assert doctor2[0].get(f"{C}favourites/").json()["diagnoses"] == []


def test_favourites_leave_out_drafts_and_sensitive_codes(
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    drugs: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(doctor_tools, "FAVOURITE_MIN_USES", 1)
    consultation = draft(doctor[0], visit["visit_id"])
    assert add_item(doctor[0], consultation["id"]).status_code == 201
    hiv = [{"code": "B20", "rank": "primary", "certainty": "confirmed"}]
    current = doctor[0].get(f"{S}consultations/{consultation['id']}/").json()
    assert patch(doctor[0], current, diagnoses=hiv).status_code == 200
    # a draft counts for nothing
    data = doctor[0].get(f"{C}favourites/").json()
    assert data["diagnoses"] == [] and data["medicines"] == []
    signed = doctor[0].post(
        f"{S}consultations/{consultation['id']}/sign/",
        {"version": doctor[0].get(f"{S}consultations/{consultation['id']}/").json()["version"]},
        format="json",
    )
    assert signed.status_code == 200, signed.content
    data = doctor[0].get(f"{C}favourites/").json()
    # signed, but a sensitive diagnosis never becomes a shortcut
    assert data["diagnoses"] == []
    assert [m["drug_code"] for m in data["medicines"]] == ["AMOX500"]
