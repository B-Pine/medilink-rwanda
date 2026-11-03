"""Doctor tools (upgrade 05 §3): pharmacy questions, follow-ups, activity, templates, profile."""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient

from tests.conftest import error_code
from tests.masterdata.conftest import age_recent_auth
from tests.s7.conftest import S, prescribe

pytestmark = pytest.mark.django_db(transaction=False)

C = f"{S}clinical/"


def test_questions_inbox_and_one_step_reply(
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    doctor2: tuple[APIClient, Any],
    pharmacist: tuple[APIClient, Any],
    drugs: dict[str, Any],
) -> None:
    _c, p = prescribe(doctor[0], visit["visit_id"])
    raised = pharmacist[0].post(
        f"{S}prescriptions/{p['id']}/queries/", {"message": "Only 250 mg left. OK?"}, format="json"
    )
    assert raised.status_code == 201, raised.content

    inbox = doctor[0].get(f"{C}questions/")
    assert inbox.status_code == 200, inbox.content
    [row] = inbox.json()
    assert row["message"] == "Only 250 mg left. OK?"
    assert row["patient_display_name"] and row["items"]
    # another doctor sees none of it, and cannot answer it
    assert doctor2[0].get(f"{C}questions/").json() == []
    stranger = doctor2[0].post(f"{C}questions/{row['id']}/reply/", {"body": "Yes"}, format="json")
    assert stranger.status_code == 422, stranger.content

    age_recent_auth(doctor[0])
    stale = doctor[0].post(f"{C}questions/{row['id']}/reply/", {"body": "Yes"}, format="json")
    assert stale.status_code == 403 and error_code(stale) == "step_up_required"


def test_reply_answers_with_a_signed_addendum(
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    pharmacist: tuple[APIClient, Any],
    drugs: dict[str, Any],
) -> None:
    consultation, p = prescribe(doctor[0], visit["visit_id"])
    query = (
        pharmacist[0]
        .post(f"{S}prescriptions/{p['id']}/queries/", {"message": "Two of 250 mg?"}, format="json")
        .json()
    )
    answered = doctor[0].post(
        f"{C}questions/{query['id']}/reply/", {"body": "Yes, two tablets."}, format="json"
    )
    assert answered.status_code == 200, answered.content
    assert answered.json()["status"] == "answered"
    assert doctor[0].get(f"{C}questions/").json() == []
    assert len(doctor[0].get(f"{C}questions/?status=answered").json()) == 1
    record = doctor[0].get(f"{S}consultations/{consultation['id']}/").json()
    assert record["addenda"][-1]["body"] == "Yes, two tablets."


def test_follow_ups_and_activity_are_mine(
    visit: dict[str, Any], doctor: tuple[APIClient, Any], drugs: dict[str, Any]
) -> None:
    prescribe(doctor[0], visit["visit_id"])
    follow_ups = doctor[0].get(f"{C}my-follow-ups/")
    assert follow_ups.status_code == 200 and follow_ups.json() == []
    week = doctor[0].get(f"{C}my-activity/")
    assert week.status_code == 200, week.content
    body = week.json()
    assert body["days"] == 7 and len(body["trend"]) == 7
    assert body["signed"] == 1
    assert body["top_diagnoses"][0]["code"] == "B54"
    assert doctor[0].get(f"{C}my-activity/?days=30").json()["days"] == 30


def test_templates_are_private_to_their_owner(
    doctor: tuple[APIClient, Any], doctor2: tuple[APIClient, Any]
) -> None:
    body = {
        "name": "Fever",
        "sections": {"history_text": "Fever for __ days.", "plan_text": "Malaria test."},
        "diagnosis_codes": ["b54"],
        "items": [
            {"drug_code": "PARA500", "dose": "2 tablets", "frequency_code": "qds", "route": "oral"}
        ],
    }
    created = doctor[0].post(f"{C}templates/", body, format="json")
    assert created.status_code == 201, created.content
    t = created.json()
    assert t["diagnosis_codes"] == ["B54"] and t["items"][0]["dose"] == "2 tablets"
    assert doctor[0].post(f"{C}templates/", body, format="json").status_code == 409
    assert doctor2[0].get(f"{C}templates/").json() == []
    assert doctor2[0].delete(f"{C}templates/{t['id']}/").status_code == 404
    used = doctor[0].post(f"{C}templates/{t['id']}/used/")
    assert used.json()["use_count"] == 1
    renamed = doctor[0].put(
        f"{C}templates/{t['id']}/", {**body, "name": "Fever, adult"}, format="json"
    )
    assert renamed.status_code == 200 and renamed.json()["name"] == "Fever, adult"
    assert doctor[0].delete(f"{C}templates/{t['id']}/").status_code == 204
    assert doctor[0].get(f"{C}templates/").json() == []


def test_public_profile_keeps_the_licence_private(doctor: tuple[APIClient, Any]) -> None:
    client = doctor[0]
    licence = client.patch(
        f"{S}clinician-profile/",
        {"council": "rmdc", "licence_number": "RMDC/9001", "specialty": "General practice"},
        format="json",
    )
    assert licence.status_code == 200, licence.content
    saved = client.patch(
        f"{S}clinician-profile/public/",
        {
            "bio_i18n": {"en": "Family doctor.", "fr": " "},
            "languages": ["rw", "en"],
            "is_public": True,
        },
        format="json",
    )
    assert saved.status_code == 200, saved.content
    data = saved.json()
    assert data["bio_i18n"] == {"en": "Family doctor."}
    assert data["languages"] == ["en", "rw"] and data["specialty"] == "General practice"
    assert "licence_number" not in data
    bad = client.patch(f"{S}clinician-profile/public/", {"bio_i18n": {"de": "x"}}, format="json")
    assert bad.status_code == 400
