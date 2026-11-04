"""Upgrade 06 §2 (#200): the triage nurse and the optional triage stage."""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient

from medilink.facilities.models import Settings
from medilink.patients.models import Allergy
from medilink.tenancy.context import rls_context
from tests.s2.conftest import client_for
from tests.s4.conftest import (  # noqa: F401
    S,
    admin,
    catalogue,
    check_in,
    clinic,
    desk,
    doctor,
    patient_keys,
    register,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def nurse(clinic: Any) -> tuple[APIClient, Any]:  # noqa: F811
    return client_for(clinic, ("triage_nurse",), "q-nurse@example.test")


def triage_on(clinic: Any, on: bool = True) -> None:  # noqa: F811
    with rls_context(facility_id=clinic.pk):
        Settings.objects.update_or_create(
            facility=clinic, defaults={"queue": {"triage_enabled": on}}
        )


def act(client: APIClient, ticket: dict[str, Any], action: str, **data: Any) -> Any:
    return client.post(
        f"{S}tickets/{ticket['id']}/{action}/",
        {"version": ticket["version"], **data},
        format="json",
    )


def test_a_triaged_visit_reaches_the_doctor_with_the_nurses_decision(
    clinic: Any,  # noqa: F811
    catalogue: dict[str, Any],  # noqa: F811
    desk: tuple[APIClient, Any],  # noqa: F811
    doctor: tuple[APIClient, Any],  # noqa: F811
    nurse: tuple[APIClient, Any],
) -> None:
    triage_on(clinic)
    service_id = catalogue["service"]["id"]
    record = register(clinic, desk[1], "Habimana Eric")
    Allergy.objects.create(
        patient=record.patient,
        source="clinician",
        verification_status="verified",
        recorded_by=desk[1],
        category="drug",
        substance_text="Penicillin",
    )
    checked = check_in(desk[0], record, service_id, reason_text="Ububabare mu gatuza")
    assert checked.status_code == 201, checked.content
    assert checked.json()["ticket"]["stage"] == "triage"

    board = nurse[0].get(f"{S}queue/board/").json()
    assert {q["stage"] for q in board["queues"]} == {"triage"}  # the nurse sees triage only
    row = board["queues"][0]["waiting"][0]
    assert row["allergies"] == ["Penicillin"] and row["reason_text"] == "Ububabare mu gatuza"

    called = nurse[0].post(
        f"{S}queue/call-next/", {"service_id": service_id, "stage": "triage"}, format="json"
    )
    assert called.status_code == 200, called.content
    started = act(nurse[0], called.json(), "start")
    assert started.status_code == 200, started.content
    ticket = started.json()
    mine = nurse[0].get(f"{S}queue/mine/", {"stage": "triage"}).json()
    assert mine["current"]["id"] == ticket["id"] and mine["waiting"] == []
    assert nurse[0].get(f"{S}queue/mine/").status_code == 403  # not the doctor's queue

    no_vitals = act(nurse[0], ticket, "triage", urgency="normal")
    assert no_vitals.status_code == 422  # vitals first, or say why none
    vitals = nurse[0].post(
        f"{S}visits/{ticket['visit_id']}/vitals/",
        {"temperature_c": "38.4", "systolic_mmhg": 150, "diastolic_mmhg": 95, "pulse_bpm": 104},
        format="json",
    )
    assert vitals.status_code == 201, vitals.content
    no_reason = act(nurse[0], ticket, "triage", urgency="emergency")
    assert no_reason.status_code == 422
    done = act(
        nurse[0],
        ticket,
        "triage",
        urgency="emergency",
        reason_text="Chest pain with sweating",
        note="Pain started 1 hour ago.",
    )
    assert done.status_code == 200, done.content
    assert done.json()["stage"] == "consultation"
    assert "emergency" in done.json()["flags"]

    consultation = doctor[0].post(f"{S}visits/{ticket['visit_id']}/consultation/", format="json")
    assert consultation.status_code in (200, 201), consultation.content
    seen = consultation.json()["reason_for_visit"]["nurse_triage"]
    assert seen["urgency"] == "emergency" and seen["note"] == "Pain started 1 hour ago."
    assert seen["by_name"] == nurse[1].full_name


def test_the_nurse_sees_no_diagnoses_and_runs_no_desk(
    clinic: Any,  # noqa: F811
    catalogue: dict[str, Any],  # noqa: F811
    desk: tuple[APIClient, Any],  # noqa: F811
    doctor: tuple[APIClient, Any],  # noqa: F811
    nurse: tuple[APIClient, Any],
) -> None:
    service_id = catalogue["service"]["id"]
    record = register(clinic, desk[1], "Uwase Aline")
    checked = check_in(desk[0], record, service_id)
    visit_id = checked.json()["visit_id"]
    assert nurse[0].post(f"{S}visits/{visit_id}/consultation/", format="json").status_code == 403
    assert check_in(nurse[0], register(clinic, desk[1], "Keza B."), service_id).status_code == 403
    assert (
        nurse[0]
        .post(
            f"{S}queue/call-next/",
            {"service_id": service_id, "stage": "consultation"},
            format="json",
        )
        .status_code
        == 403
    )
    assert nurse[0].get(f"{S}bills/").status_code == 403


def test_triage_is_optional_and_emergencies_skip_it(
    clinic: Any,  # noqa: F811
    catalogue: dict[str, Any],  # noqa: F811
    desk: tuple[APIClient, Any],  # noqa: F811
) -> None:
    service_id = catalogue["service"]["id"]
    off = check_in(desk[0], register(clinic, desk[1], "Mugisha A."), service_id)
    assert off.json()["ticket"]["stage"] == "consultation"  # off by default: nothing changes

    triage_on(clinic)
    emergency = check_in(
        desk[0],
        register(clinic, desk[1], "Ingabire B."),
        service_id,
        source="emergency",
        reason_text="Unconscious",
    )
    assert emergency.status_code == 201, emergency.content
    assert emergency.json()["ticket"]["stage"] == "consultation"
