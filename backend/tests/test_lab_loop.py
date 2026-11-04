"""Upgrade 06 §3 (#201, FR-CLN-11): the laboratory loop. The doctor orders tests and sends the
patient to the lab; the lab technician records the samples and enters the results; the patient
returns to the same doctor with return priority; the doctor reviews and releases; the patient
sees released results only."""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient

from medilink.billing.models import Bill
from medilink.clinical.models import LabOrder
from medilink.notifications.models import Notification
from medilink.notifications.wiring_events import LAB_RESULT_READY
from medilink.tenancy.context import rls_context
from tests.conftest import login_patient
from tests.s2.conftest import client_for, membership_of
from tests.s4.conftest import (  # noqa: F401
    S,
    act,
    admin,
    call_next,
    catalogue,
    check_in,
    clinic,
    desk,
    doctor,
    doctor2,
    on_duty,
    patient_account,
    patient_keys,
)
from tests.s8.conftest import tariff

pytestmark = pytest.mark.django_db
RESULTS = "/api/v1/patient/results/"


@pytest.fixture
def lab_tech(clinic: Any) -> tuple[APIClient, Any]:  # noqa: F811
    return client_for(clinic, ("lab_technician",), "q-lab@example.test")


@pytest.fixture
def at_doctor(
    clinic: Any,  # noqa: F811
    catalogue: dict[str, Any],  # noqa: F811
    desk: tuple[APIClient, Any],  # noqa: F811
    doctor: tuple[APIClient, Any],  # noqa: F811
    patient_account: tuple[Any, Any],  # noqa: F811
) -> dict[str, Any]:
    """The patient (with an account) in the doctor's room, the consultation open."""
    tariff(clinic, desk[1], "MAL-RDT", 1500)
    user, record = patient_account
    checked = check_in(desk[0], record, catalogue["service"]["id"])
    assert checked.status_code == 201, checked.content
    on_duty(doctor[0], catalogue["point"]["id"])
    called = call_next(doctor[0], catalogue["service"]["id"])
    assert called.status_code == 200, called.content
    started = act(doctor[0], called.json(), "start")
    assert started.status_code == 200, started.content
    consultation = doctor[0].post(f"{S}visits/{started.json()['visit_id']}/consultation/")
    assert consultation.status_code in (200, 201), consultation.content
    return {"user": user, "ticket": started.json(), "consultation": consultation.json()}


def order(doctor_client: APIClient, consultation: dict[str, Any], *tests: str) -> Any:
    return doctor_client.post(
        f"{S}consultations/{consultation['id']}/lab-orders/",
        {"tests": list(tests), "reason": "Fever 3 days, rule out malaria"},
        format="json",
    )


def lab_post(client: APIClient, row: dict[str, Any], step: str, **data: Any) -> Any:
    return client.post(
        f"{S}lab-orders/{row['id']}/{step}/", {"version": row["version"], **data}, format="json"
    )


def test_the_full_loop_reaches_the_patient_only_after_release(
    clinic: Any,  # noqa: F811
    catalogue: dict[str, Any],  # noqa: F811
    doctor: tuple[APIClient, Any],  # noqa: F811
    lab_tech: tuple[APIClient, Any],
    at_doctor: dict[str, Any],
    django_capture_on_commit_callbacks: Any,
) -> None:
    service_id = catalogue["service"]["id"]
    consultation, ticket = at_doctor["consultation"], at_doctor["ticket"]
    patient = APIClient()
    login_patient(patient, at_doctor["user"])

    # sending to the lab needs an order first
    assert act(doctor[0], ticket, "send-to-lab").status_code == 422
    assert order(doctor[0], consultation, "NOPE").status_code == 422
    ordered = order(doctor[0], consultation, "MAL-RDT", "FBC")
    assert ordered.status_code == 201, ordered.content
    assert {o["test_code"] for o in ordered.json()} == {"MAL-RDT", "FBC"}
    assert order(doctor[0], consultation, "FBC").status_code == 422  # already ordered
    with rls_context(facility_id=clinic.pk):
        bill = Bill.objects.get(visit_id=ticket["visit_id"])
        assert bill.lines.filter(code="MAL-RDT", removed_at__isnull=True).count() == 1

    sent = act(doctor[0], ticket, "send-to-lab")
    assert sent.status_code == 200, sent.content
    assert sent.json()["stage"] == "lab"

    # the lab: the queue, the patient's identity, the payment state; no notes
    queue = lab_tech[0].get(f"{S}lab/queue/")
    assert queue.status_code == 200, queue.content
    group = queue.json()["waiting"][0]
    assert group["ticket"]["id"] == sent.json()["id"] and group["unpaid"] is True
    assert group["patient"]["full_name"] == "Uwase Aline"
    assert group["orders"][0]["reason"] == "Fever 3 days, rule out malaria"
    board = lab_tech[0].get(f"{S}queue/board/").json()
    assert {q["stage"] for q in board["queues"]} == {"lab"}

    called = lab_tech[0].post(
        f"{S}queue/call-next/", {"service_id": service_id, "stage": "lab"}, format="json"
    )
    assert called.status_code == 200, called.content
    started = act(lab_tech[0], called.json(), "start")
    assert started.status_code == 200, started.content
    mine = lab_tech[0].get(f"{S}queue/mine/", {"stage": "lab"}).json()
    assert mine["current"]["id"] == started.json()["id"]

    rdt, fbc = sorted(group["orders"], key=lambda o: o["test_code"] != "MAL-RDT")
    assert lab_post(lab_tech[0], rdt, "result", values={"result": "positive"}).status_code == 422
    rdt = lab_post(lab_tech[0], rdt, "sample").json()
    fbc_sampled = lab_post(lab_tech[0], fbc, "sample")
    assert fbc_sampled.status_code == 200, fbc_sampled.content
    fbc = fbc_sampled.json()
    # every sample taken: the technician is free for the next patient
    assert lab_tech[0].get(f"{S}queue/mine/", {"stage": "lab"}).json()["current"] is None
    assert (
        lab_tech[0].get(f"{S}lab/queue/").json()["in_progress"][0]["visit_id"]
        == (ticket["visit_id"])
    )

    bad = lab_post(lab_tech[0], fbc, "result", values={"hb": "abc", "wbc": "6"})
    assert bad.status_code == 400, bad.content
    rdt = lab_post(lab_tech[0], rdt, "result", values={"result": "positive"}).json()
    assert rdt["state"] == "resulted" and rdt["is_abnormal"] is True
    # one test still open: the patient stays with the lab
    assert doctor[0].get(f"{S}queue/mine/").json()["waiting"] == []
    fbc = lab_post(
        lab_tech[0], fbc, "result", values={"hb": "9.8", "wbc": "6.1", "plt": "210"}
    ).json()
    assert [i["flag"] for i in fbc["result"]["items"]] == ["low", None, None]

    # back to the same doctor, return priority, assigned to them
    waiting = doctor[0].get(f"{S}queue/mine/").json()["waiting"]
    assert len(waiting) == 1
    back = waiting[0]
    assert back["visit_id"] == ticket["visit_id"] and back["stage"] == "consultation"
    assert "return" in back["flags"]
    assert back["assigned_membership_id"] == str(membership_of(doctor[1], clinic).pk)

    # nothing reaches the patient before release
    assert patient.get(RESULTS).json() == []
    assert lab_post(lab_tech[0], rdt, "review").status_code == 403
    assert lab_post(lab_tech[0], rdt, "release").status_code == 403

    inbox = doctor[0].get(f"{S}lab/results/").json()
    assert {r["order"]["test_code"] for r in inbox} == {"MAL-RDT", "FBC"}
    assert lab_post(doctor[0], rdt, "release").status_code == 422  # review first
    reviewed = lab_post(doctor[0], rdt, "review", note="Malaria: start the treatment today.")
    assert reviewed.status_code == 200, reviewed.content
    assert patient.get(RESULTS).json() == []
    assert not Notification.objects.filter(event_type=LAB_RESULT_READY).exists()
    with django_capture_on_commit_callbacks(execute=True):
        released = lab_post(doctor[0], reviewed.json(), "release")
    assert released.status_code == 200, released.content
    # W7: "a result is ready", never the test's name
    [ready] = Notification.objects.filter(
        recipient_user=at_doctor["user"], event_type=LAB_RESULT_READY
    )
    assert "malaria" not in f"{ready.title} {ready.body}".lower()
    assert ready.action_path == "/dashboard/records"

    seen = patient.get(RESULTS)
    assert seen.status_code == 200, seen.content
    assert len(seen.json()) == 1
    result = seen.json()[0]
    assert result["test_code"] == "MAL-RDT" and result["note"].startswith("Malaria")
    assert result["items"][0]["value"] == "positive" and result["items"][0]["flag"] == "abnormal"

    # released results are locked
    with rls_context(facility_id=clinic.pk):
        assert LabOrder.objects.get(pk=rdt["id"]).state == "released"
    assert lab_post(doctor[0], released.json(), "review").status_code == 422


def test_the_lab_technician_sees_no_clinical_record(
    catalogue: dict[str, Any],  # noqa: F811
    doctor: tuple[APIClient, Any],  # noqa: F811
    doctor2: tuple[APIClient, Any],  # noqa: F811
    lab_tech: tuple[APIClient, Any],
    at_doctor: dict[str, Any],
) -> None:
    consultation, ticket = at_doctor["consultation"], at_doctor["ticket"]
    tech = lab_tech[0]
    assert tech.get(f"{S}consultations/{consultation['id']}/").status_code == 403
    assert tech.get(f"{S}consultations/{consultation['id']}/lab-orders/").status_code == 403
    assert order(tech, consultation, "MAL-RDT").status_code == 403
    assert tech.post(f"{S}visits/{ticket['visit_id']}/consultation/").status_code == 403
    assert tech.get(f"{S}lab/results/").status_code == 403
    assert tech.get(f"{S}bills/").status_code == 403
    assert tech.get(f"{S}queue/mine/").status_code == 403  # not the doctor's queue
    assert (
        tech.post(
            f"{S}queue/call-next/",
            {"service_id": catalogue["service"]["id"], "stage": "consultation"},
            format="json",
        ).status_code
        == 403
    )
    # the catalogue is open to the lab and the doctor
    tests = tech.get(f"{S}lab/tests/").json()
    assert {t["code"] for t in tests} >= {"MAL-RDT", "FBC", "URINE", "GLU", "HIV-RT", "PREG"}

    # only the consultation's author orders; only the orderer cancels; the doctor's note stays
    # with the clinicians
    assert order(doctor2[0], consultation, "GLU").status_code in (403, 422)
    row = order(doctor[0], consultation, "GLU").json()[0]
    assert lab_post(doctor2[0], row, "cancel").status_code == 422
    cancelled = lab_post(doctor[0], row, "cancel")
    assert cancelled.status_code == 200 and cancelled.json()["state"] == "cancelled"
    assert tech.get(f"{S}lab/queue/").json()["waiting"] == []
