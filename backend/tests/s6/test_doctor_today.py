"""Doctor Today and the consultation's reason for visit and vitals flags (upgrade 05 §3)."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from rest_framework.test import APIClient

from tests.s4.conftest import check_in, register
from tests.s6.conftest import S, open_consultation, signed_consultation

pytestmark = pytest.mark.django_db(transaction=False)


def test_my_day_counts_only_my_own_work(
    visit: dict[str, Any], doctor: tuple[APIClient, Any], doctor2: tuple[APIClient, Any]
) -> None:
    open_consultation(doctor[0], visit["visit_id"])
    mine = doctor[0].get(f"{S}clinical/my-day/")
    assert mine.status_code == 200, mine.content
    body = mine.json()
    assert body["unsigned"] == 1
    assert body["unsigned_overdue"] == 0
    assert body["open_questions"] == []
    assert len(body["trend"]) == 7
    other = doctor2[0].get(f"{S}clinical/my-day/").json()
    assert other["unsigned"] == 0


def test_my_day_is_for_clinicians(desk: tuple[APIClient, Any]) -> None:
    assert desk[0].get(f"{S}clinical/my-day/").status_code == 403


def test_reason_for_visit_shows_the_patients_words_and_signing_keeps_it(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
) -> None:
    record = register(clinic, desk[1], "Mugisha Jean", dt.date(1980, 5, 6))
    response = check_in(
        desk[0], record, catalogue["service"]["id"], reason_text="Headache for three days"
    )
    assert response.status_code == 201, response.content
    visit_id = response.json()["visit_id"]
    opened = open_consultation(doctor[0], visit_id).json()
    reason = opened["reason_for_visit"]
    assert reason["patient_words"] == "Headache for three days"
    assert reason["symptoms"] == []
    assert reason["triage"] is None
    signed = signed_consultation(doctor[0], visit_id)
    assert signed["reason_for_visit"]["patient_words"] == "Headache for three days"


def test_vitals_flag_dangerous_numbers(
    visit: dict[str, Any], doctor: tuple[APIClient, Any]
) -> None:
    url = f"{S}visits/{visit['visit_id']}/vitals/"
    saved = doctor[0].post(
        url,
        {"spo2_pct": 88, "systolic_mmhg": 190, "diastolic_mmhg": 100, "pulse_bpm": 80},
        format="json",
    )
    assert saved.status_code == 201, saved.content
    rows = doctor[0].get(url).json()["results"]
    assert set(rows[-1]["flags"]) == {"spo2_low", "bp_high"}
