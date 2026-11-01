"""S7-B1 schema, S7-B12 My medicines, S7-B14 security (contract sprint-07 §9)."""

from __future__ import annotations

import json
from typing import Any

import pytest
from django.db import connection
from rest_framework.test import APIClient

from medilink.patients.models import PatientLink, Relationship
from tests.conftest import login_patient
from tests.factories import make_patient_user
from tests.s4.conftest import patient_account  # noqa: F401
from tests.s7.conftest import AMOX, S, add_item, check_in, dispense, draft, patch, prescribe, sign

pytestmark = pytest.mark.django_db(transaction=False)

ENDPOINTS = [
    ("/api/v1/staff/consultations/{consultation_id}/prescription/", "get"),
    ("/api/v1/staff/consultations/{consultation_id}/prescription/items/", "post"),
    ("/api/v1/staff/prescription-items/{item_id}/", "patch"),
    ("/api/v1/staff/prescription-items/{item_id}/", "delete"),
    ("/api/v1/staff/prescription-items/{item_id}/cancel/", "post"),
    ("/api/v1/staff/prescriptions/{prescription_id}/", "get"),
    ("/api/v1/staff/prescriptions/{prescription_id}/cancel/", "post"),
    ("/api/v1/staff/prescriptions/{prescription_id}/dispense/", "post"),
    ("/api/v1/staff/prescriptions/{prescription_id}/labels/", "get"),
    ("/api/v1/staff/prescriptions/{prescription_id}/queries/", "post"),
    ("/api/v1/staff/prescription-queries/{query_id}/answer/", "post"),
    ("/api/v1/staff/prescription-queries/{query_id}/close/", "post"),
    ("/api/v1/staff/pharmacy/queue/", "get"),
    ("/api/v1/staff/pharmacy/availability/", "get"),
    ("/api/v1/staff/pharmacy/availability/{drug_code}/", "put"),
    ("/api/v1/staff/drugs/", "get"),
    ("/api/v1/patient/prescriptions/", "get"),
    ("/api/v1/patient/prescriptions/{prescription_id}/", "get"),
]
OVERRIDE_REASON = "Tolerated before without reaction"


@pytest.fixture(scope="module")
def schema(django_db_setup: Any, django_db_blocker: Any) -> dict[str, Any]:
    from drf_spectacular.generators import SchemaGenerator

    with django_db_blocker.unblock():
        return dict(SchemaGenerator().get_schema(request=None, public=True))


def test_every_s7a_endpoint_is_in_the_schema(schema: dict[str, Any]) -> None:
    for path, method in ENDPOINTS:
        assert method in schema["paths"].get(path, {}), (path, method)


def test_patient_schemas_carry_no_overrides_or_consultation_text(schema: dict[str, Any]) -> None:
    components = schema["components"]["schemas"]
    for name in ("PatientPrescription", "PatientPrescriptionRow", "PatientItem"):
        props = set(components[name]["properties"])
        assert not props & {"alert_overrides", "alerts", "private_notes", "diagnoses"}, name


def _patient_client(user: Any) -> APIClient:
    client = APIClient()
    login_patient(client, user)
    return client


@pytest.fixture
def medicines(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
    pharmacist: tuple[APIClient, Any],
    drugs: dict[str, Any],
    patient_account: tuple[Any, Any],  # noqa: F811
) -> dict[str, Any]:
    user, record = patient_account
    visit = check_in(desk[0], record, catalogue["service"]["id"]).json()
    overridden = {**AMOX, "alert_overrides": [{"kind": "dose", "reason": OVERRIDE_REASON}]}
    _c, open_ = prescribe(doctor[0], visit["visit_id"], overridden)
    given = dispense(
        pharmacist[0],
        open_,
        {"item_id": open_["items"][0]["id"], "outcome": "partial", "quantity": 10},
    )
    assert given.status_code == 201
    # a restricted consultation with a prescription
    restricted = draft(doctor[0], visit["visit_id"])
    restricted = patch(doctor[0], restricted, is_restricted=True).json()
    add_item(doctor[0], restricted["id"])
    assert sign(doctor[0], restricted["id"]).status_code == 200
    hidden = doctor[0].get(f"{S}consultations/{restricted['id']}/prescription/").json()
    # a draft prescription is never shown
    pending = draft(doctor[0], visit["visit_id"])
    draft_rx = add_item(doctor[0], pending["id"]).json()
    return {
        "user": user,
        "patient": record.patient,
        "open": open_,
        "restricted": hidden,
        "draft": draft_rx,
    }


def test_patient_reads_own_prescriptions(medicines: dict[str, Any]) -> None:
    client = _patient_client(medicines["user"])
    listing = client.get("/api/v1/patient/prescriptions/")
    assert listing.status_code == 200, listing.content
    ids = [r["id"] for r in listing.json()["results"]]
    assert set(ids) == {medicines["open"]["id"], medicines["restricted"]["id"]}
    assert medicines["draft"]["id"] not in ids
    detail = client.get(f"/api/v1/patient/prescriptions/{medicines['open']['id']}/")
    assert detail.status_code == 200
    data = detail.json()
    assert data["status"] == "partly_dispensed"
    assert data["items"][0]["dispensed_quantity"] == 10
    assert data["items"][0]["instructions"] == "After meals"
    raw = detail.content.decode()
    assert OVERRIDE_REASON not in raw and "alert_overrides" not in json.loads(raw)["items"][0]
    assert (
        client.get(f"/api/v1/patient/prescriptions/{medicines['draft']['id']}/").status_code == 404
    )

    active = client.get("/api/v1/patient/prescriptions/?status=active").json()
    assert active["count"] == 2
    assert client.get("/api/v1/patient/prescriptions/?status=past").json()["count"] == 0
    mine = client.get(f"/api/v1/patient/prescriptions/?patient_id={medicines['patient'].pk}")
    assert mine.json()["count"] == 2


def test_delegates_do_not_see_restricted_and_strangers_see_nothing(
    medicines: dict[str, Any],
) -> None:
    delegate = make_patient_user(email="rx-delegate@example.test", full_name="Delegate Rx")
    PatientLink.objects.create(
        account=delegate, patient=medicines["patient"], relationship=Relationship.DELEGATE
    )
    d_client = _patient_client(delegate)
    rows = d_client.get("/api/v1/patient/prescriptions/").json()["results"]
    assert [r["id"] for r in rows] == [medicines["open"]["id"]]
    restricted = f"/api/v1/patient/prescriptions/{medicines['restricted']['id']}/"
    assert d_client.get(restricted).status_code == 404
    stranger = _patient_client(
        make_patient_user(email="rx-stranger@example.test", full_name="Stranger Rx")
    )
    assert stranger.get("/api/v1/patient/prescriptions/").json()["count"] == 0
    assert (
        stranger.get(f"/api/v1/patient/prescriptions/{medicines['open']['id']}/").status_code == 404
    )


def test_staff_cannot_use_patient_endpoints(
    medicines: dict[str, Any], pharmacist: tuple[APIClient, Any]
) -> None:
    assert pharmacist[0].get("/api/v1/patient/prescriptions/").status_code in (401, 403)


def test_every_pharmacy_table_has_forced_rls() -> None:
    tables = [
        "pharmacy_prescription",
        "pharmacy_prescription_item",
        "pharmacy_prescription_event",
        "pharmacy_dispense_record",
        "pharmacy_dispense_line",
        "pharmacy_drug_availability",
        "pharmacy_prescription_query",
        "documents_number_counter",
    ]
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class"
            " WHERE relname = ANY(%s)",
            [tables],
        )
        rows = {name: (enabled, forced) for name, enabled, forced in cursor.fetchall()}
    assert rows == dict.fromkeys(tables, (True, True))


def test_audit_entries_carry_ids_only(clinic: Any, medicines: dict[str, Any]) -> None:
    from medilink.audit.models import AuditEntry

    for entry in AuditEntry.objects.filter(action__startswith="pharmacy."):
        text = json.dumps(entry.metadata)
        assert "After meals" not in text and OVERRIDE_REASON not in text
