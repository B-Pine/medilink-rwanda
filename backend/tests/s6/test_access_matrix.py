"""S6-B1 schema, S6-B2 authorisation matrix, S6-B14 private notes never reach patients,
S6-B15 patient read (contract sprint-06 §9)."""

from __future__ import annotations

import json
from typing import Any

import pytest
from drf_spectacular.generators import SchemaGenerator
from rest_framework.test import APIClient

from medilink.clinical import serializers as clinical_serializers
from medilink.patients.models import PatientLink, Relationship
from tests.conftest import login_patient
from tests.factories import make_patient_user
from tests.s4.conftest import act, call_next, check_in, on_duty, patient_account  # noqa: F401
from tests.s6.conftest import S, open_consultation, patch, signed_consultation

pytestmark = pytest.mark.django_db(transaction=False)

PRIVATE = "PRIVATE-NOTE-7731"
EXAM = "EXAM-FINDING-4410"


# ---- S6-B1 --------------------------------------------------------------------------------------

CONTRACT = {
    ("/api/v1/staff/visits/{visit_id}/consultation/", "post"),
    ("/api/v1/staff/consultations/", "get"),
    ("/api/v1/staff/consultations/{consultation_id}/", "get"),
    ("/api/v1/staff/consultations/{consultation_id}/", "patch"),
    ("/api/v1/staff/consultations/{consultation_id}/sign/", "post"),
    ("/api/v1/staff/consultations/{consultation_id}/addenda/", "post"),
    ("/api/v1/staff/consultations/{consultation_id}/entered-in-error/", "post"),
    ("/api/v1/staff/visits/{visit_id}/vitals/", "get"),
    ("/api/v1/staff/visits/{visit_id}/vitals/", "post"),
    ("/api/v1/staff/vitals/{vitals_id}/entered-in-error/", "post"),
    ("/api/v1/staff/clinical/patients/{facility_patient_id}/history/", "get"),
    ("/api/v1/staff/clinical/patients/{facility_patient_id}/problem-summary/", "get"),
    ("/api/v1/staff/clinical/patients/{facility_patient_id}/access-reasons/", "post"),
    ("/api/v1/staff/clinical/patients/{facility_patient_id}/access/", "get"),
    ("/api/v1/staff/clinical/alerts/", "post"),
    ("/api/v1/patient/records/", "get"),
    ("/api/v1/patient/records/{consultation_id}/", "get"),
}


@pytest.fixture(scope="module")
def schema(django_db_setup: Any, django_db_blocker: Any) -> dict[str, Any]:
    with django_db_blocker.unblock():
        return SchemaGenerator().get_schema(request=None, public=True)


def test_every_s6a_endpoint_is_in_the_schema(schema: dict[str, Any]) -> None:
    present = {(path, method) for path, ops in schema["paths"].items() for method in ops}
    assert CONTRACT - present == set()


# ---- S6-B14 -------------------------------------------------------------------------------------

FORBIDDEN = {"private_notes", "examination_text", "private_notes_enc", "examination_enc"}


def _property_names(node: Any, schema: dict[str, Any], seen: set[str]) -> set[str]:
    names: set[str] = set()
    if isinstance(node, dict):
        ref = node.get("$ref")
        if isinstance(ref, str):
            name = ref.rsplit("/", 1)[-1]
            if name not in seen:
                seen.add(name)
                names |= _property_names(schema["components"]["schemas"][name], schema, seen)
        names |= set((node.get("properties") or {}).keys())
        for value in node.values():
            names |= _property_names(value, schema, seen)
    elif isinstance(node, list):
        for value in node:
            names |= _property_names(value, schema, seen)
    return names


def test_no_patient_facing_schema_has_private_notes(schema: dict[str, Any]) -> None:
    patient_paths = {
        p: ops for p, ops in schema["paths"].items() if p.startswith("/api/v1/patient/")
    }
    assert "/api/v1/patient/records/{consultation_id}/" in patient_paths
    names = _property_names(patient_paths, schema, set())
    assert names & FORBIDDEN == set()


def test_patient_serializers_have_no_private_fields() -> None:
    for serializer in clinical_serializers.PATIENT_SERIALIZERS:
        assert set(serializer().fields) & FORBIDDEN == set(), serializer.__name__
    assert "private_notes" in clinical_serializers.ConsultationSerializer().fields  # staff only


# ---- S6-B15 + B14 at runtime -------------------------------------------------------------------


@pytest.fixture
def records(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
    patient_account: tuple[Any, Any],  # noqa: F811
) -> dict[str, Any]:
    user, record = patient_account
    visit = check_in(desk[0], record, catalogue["service"]["id"]).json()
    desk[0].post(f"{S}visits/{visit['visit_id']}/vitals/", {"temperature_c": "38.1"}, format="json")
    open_ = signed_consultation(
        doctor[0],
        visit["visit_id"],
        history_text="Fever two days",
        examination_text=EXAM,
        plan_text="Artemether-lumefantrine",
        patient_instructions_text="Come back if the fever lasts",
        private_notes=PRIVATE,
    )
    doctor[0].post(
        f"{S}consultations/{open_['id']}/addenda/",
        {"reason": "Result", "body": "RDT positive"},
        format="json",
    )
    second = open_consultation(doctor[0], visit["visit_id"]).json()
    second = patch(
        doctor[0],
        second,
        is_restricted=True,
        private_notes=PRIVATE,
        diagnoses=[{"code": "F32.9", "rank": "primary", "certainty": "provisional"}],
    ).json()
    restricted = (
        doctor[0]
        .post(
            f"{S}consultations/{second['id']}/sign/", {"version": second["version"]}, format="json"
        )
        .json()
    )
    draft = open_consultation(doctor[0], visit["visit_id"]).json()
    return {
        "user": user,
        "patient": record.patient,
        "open": open_,
        "restricted": restricted,
        "draft": draft,
    }


def _patient_client(user: Any) -> APIClient:
    client = APIClient()
    login_patient(client, user)
    return client


def test_patient_reads_own_records_without_private_notes(records: dict[str, Any]) -> None:
    client = _patient_client(records["user"])
    listing = client.get("/api/v1/patient/records/")
    assert listing.status_code == 200, listing.content
    ids = [r["id"] for r in listing.json()["results"]]
    assert set(ids) == {records["open"]["id"], records["restricted"]["id"]}  # self sees restricted
    assert records["draft"]["id"] not in ids
    detail = client.get(f"/api/v1/patient/records/{records['open']['id']}/")
    assert detail.status_code == 200
    data = detail.json()
    assert data["patient_instructions_text"] == "Come back if the fever lasts"
    assert data["diagnoses"][0]["plain_language"]
    assert data["addenda"][0]["body"] == "RDT positive"
    assert data["vitals"][0]["temperature_c"] == "38.1"
    for response in (
        listing,
        detail,
        client.get(f"/api/v1/patient/records/{records['restricted']['id']}/"),
    ):
        raw = response.content.decode()
        assert PRIVATE not in raw and EXAM not in raw
        assert not FORBIDDEN & set(json.loads(raw).keys())
    assert client.get(f"/api/v1/patient/records/{records['draft']['id']}/").status_code == 404


def test_guardian_delegate_and_other_accounts(records: dict[str, Any]) -> None:
    guardian = make_patient_user(email="guardian@example.test", full_name="Guardian One")
    PatientLink.objects.create(
        account=guardian, patient=records["patient"], relationship=Relationship.GUARDIAN
    )
    delegate = make_patient_user(email="delegate@example.test", full_name="Delegate One")
    PatientLink.objects.create(
        account=delegate, patient=records["patient"], relationship=Relationship.DELEGATE
    )
    stranger = make_patient_user(email="stranger@example.test", full_name="Stranger One")

    g = _patient_client(guardian).get("/api/v1/patient/records/").json()
    assert g["count"] == 2
    d_client = _patient_client(delegate)
    d = d_client.get("/api/v1/patient/records/").json()
    assert [r["id"] for r in d["results"]] == [records["open"]["id"]]
    assert (
        d_client.get(f"/api/v1/patient/records/{records['restricted']['id']}/").status_code == 404
    )
    s_client = _patient_client(stranger)
    assert s_client.get("/api/v1/patient/records/").json()["count"] == 0
    assert s_client.get(f"/api/v1/patient/records/{records['open']['id']}/").status_code == 404
    filtered = _patient_client(guardian).get(
        f"/api/v1/patient/records/?patient_id={records['patient'].pk}"
    )
    assert filtered.json()["count"] == 2


def test_entered_in_error_record_disappears_for_the_patient(
    records: dict[str, Any], doctor: tuple[APIClient, Any]
) -> None:
    open_ = records["open"]
    current = doctor[0].get(f"{S}consultations/{open_['id']}/").json()
    doctor[0].post(
        f"{S}consultations/{open_['id']}/entered-in-error/",
        {"version": current["version"], "reason": "Wrong patient"},
        format="json",
    )
    client = _patient_client(records["user"])
    assert client.get(f"/api/v1/patient/records/{open_['id']}/").status_code == 404


# ---- S6-B2 authorisation matrix -----------------------------------------------------------------

ROLES = ("doctor", "receptionist", "pharmacist", "facility_admin")
ALLOWED: dict[str, set[str]] = {
    "C1": {"doctor"},
    "C2": {"doctor"},
    "C3": {"doctor"},
    "C4": {"doctor"},
    "C5": {"doctor"},
    "C6": {"doctor"},
    "C7": {"doctor", "facility_admin"},
    "V1-get": {"doctor", "receptionist"},
    "V1-post": {"doctor", "receptionist"},
    "V2": {"doctor", "receptionist"},
    "H1": {"doctor"},
    "H2": {"doctor"},
    "A1": {"doctor"},
    "A2": {"doctor"},
    "AL1": {"doctor"},
}


def test_authorisation_matrix(
    clinic: Any,
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    desk: tuple[APIClient, Any],
    pharmacist: tuple[APIClient, Any],
    admin: tuple[APIClient, Any],
    drugs: dict[str, Any],
) -> None:
    signed = signed_consultation(doctor[0], visit["visit_id"])
    vitals = (
        desk[0]
        .post(f"{S}visits/{visit['visit_id']}/vitals/", {"pulse_bpm": 70}, format="json")
        .json()
    )
    fp = visit["record"].pk
    c = signed["id"]
    calls: dict[str, tuple[str, str, dict[str, Any]]] = {
        "C1": ("post", f"{S}visits/{visit['visit_id']}/consultation/", {}),
        "C2": ("get", f"{S}consultations/{c}/", {}),
        "C3": ("patch", f"{S}consultations/{c}/", {"version": signed["version"]}),
        "C4": ("post", f"{S}consultations/{c}/sign/", {"version": signed["version"]}),
        "C5": ("post", f"{S}consultations/{c}/addenda/", {"reason": "r", "body": "b"}),
        "C6": ("post", f"{S}consultations/{c}/entered-in-error/", {"version": 999, "reason": "r"}),
        "C7": ("get", f"{S}consultations/", {}),
        "V1-get": ("get", f"{S}visits/{visit['visit_id']}/vitals/", {}),
        "V1-post": ("post", f"{S}visits/{visit['visit_id']}/vitals/", {"pulse_bpm": 71}),
        "V2": ("post", f"{S}vitals/{vitals['id']}/entered-in-error/", {"reason": "r"}),
        "H1": ("get", f"{S}clinical/patients/{fp}/history/", {}),
        "H2": ("get", f"{S}clinical/patients/{fp}/problem-summary/", {}),
        "A1": (
            "post",
            f"{S}clinical/patients/{fp}/access-reasons/",
            {"reason_code": "care_continuity"},
        ),
        "A2": ("get", f"{S}clinical/patients/{fp}/access/", {}),
        "AL1": (
            "post",
            f"{S}clinical/alerts/",
            {"facility_patient_id": str(fp), "items": [{"drug_code": "PARA500"}]},
        ),
    }
    clients = {
        "doctor": doctor[0],
        "receptionist": desk[0],
        "pharmacist": pharmacist[0],
        "facility_admin": admin[0],
    }
    anonymous = APIClient()
    patient_user = make_patient_user(email="matrix@example.test", full_name="Matrix Patient")
    patient_session = _patient_client(patient_user)
    failures = []
    for key, (method, url, body) in calls.items():
        for role in ROLES:
            response = getattr(clients[role], method)(url, body, format="json")
            allowed = role in ALLOWED[key]
            ok = response.status_code not in (401, 403) if allowed else response.status_code == 403
            if not ok:
                failures.append((key, role, response.status_code))
        for name, client in (("anonymous", anonymous), ("patient", patient_session)):
            response = getattr(client, method)(url, body, format="json")
            if response.status_code not in (401, 403):
                failures.append((key, name, response.status_code))
    staff_on_patient = doctor[0].get("/api/v1/patient/records/")
    assert staff_on_patient.status_code in (401, 403)
    assert failures == []
