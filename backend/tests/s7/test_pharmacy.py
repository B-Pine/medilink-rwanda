"""S7a backend checks (contract sprint-07 §9): S7-B2..B11, B13, B14 against the real database."""

from __future__ import annotations

import datetime as dt
import types
from typing import Any

import pytest
from django.db import DatabaseError, connection, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from medilink.audit.models import AuditEntry
from medilink.clinical.models import Consultation
from medilink.documents.models import NumberCounter
from medilink.documents.numbers import next_number
from medilink.facilities.models import Settings
from medilink.patients.models import Allergy, FacilityPatient
from medilink.pharmacy import services, tasks
from medilink.pharmacy.models import (
    DispenseLine,
    DispenseRecord,
    Prescription,
    PrescriptionEvent,
    PrescriptionItem,
)
from medilink.tenancy.context import rls_context
from tests.conftest import error_code, login_staff
from tests.factories import FacilityFactory
from tests.masterdata.conftest import age_recent_auth
from tests.s2.conftest import client_for
from tests.s7.conftest import (
    AMOX,
    S,
    add_item,
    check_in,
    dispense,
    draft,
    prescribe,
    register,
    sign,
)

pytestmark = pytest.mark.django_db(transaction=False)

PARA = {"drug_code": "PARA500", "dose": "2 tablets", "frequency_code": "qds", "route": "oral"}


def _settings(facility: Any, **sections: dict[str, Any]) -> None:
    with rls_context(facility_id=facility.pk):
        Settings.objects.update_or_create(facility=facility, defaults=sections)


def _actions(facility: Any) -> list[str]:
    return list(AuditEntry.objects.filter(facility_id=facility.pk).values_list("action", flat=True))


def _penicillin_allergy(patient: Any, user: Any) -> None:
    Allergy.objects.create(
        patient=patient,
        source="clinician",
        verification_status="verified",
        recorded_by=user,
        category="drug",
        substance_text="Penicillin",
        severity="severe",
    )


# ---- S7-B3 items and drafts -------------------------------------------------------------------


def test_items_default_quantity_free_text_and_versions(
    visit: dict[str, Any], doctor: tuple[APIClient, Any], drugs: dict[str, Any]
) -> None:
    client = doctor[0]
    c = draft(client, visit["visit_id"])
    first = add_item(client, c["id"], **AMOX)
    assert first.status_code == 201, first.content
    body = first.json()
    item = body["items"][0]
    assert item["quantity"] == 21 and item["status"] == "draft"
    assert item["drug_display"] == "Amoxicillin 500 mg capsule"
    assert item["instructions"] == "After meals" and body["number"] is None

    free = add_item(
        client,
        c["id"],
        free_text_drug="Herbal syrup",
        dose="10 ml",
        frequency_code="bd",
        route="oral",
        quantity=1,
    )
    assert free.status_code == 201
    free_item = free.json()["items"][1]
    assert free_item["is_off_catalogue"] and free_item["drug_code"] == ""

    both = add_item(client, c["id"], **{**AMOX, "free_text_drug": "X"})
    assert both.status_code == 400
    unknown = add_item(client, c["id"], **{**AMOX, "drug_code": "NOPE"})
    assert unknown.status_code == 422
    no_quantity = add_item(client, c["id"], **{**PARA, "frequency_code": "prn"})
    assert no_quantity.status_code == 422

    version = free.json()["version"]
    stale = client.patch(
        f"{S}prescription-items/{item['id']}/", {**AMOX, "version": version - 1}, format="json"
    )
    assert stale.status_code == 409
    edited = client.patch(
        f"{S}prescription-items/{item['id']}/",
        {**AMOX, "quantity": 30, "version": version},
        format="json",
    )
    assert edited.status_code == 200 and edited.json()["items"][0]["quantity"] == 30
    bad_version = client.delete(f"{S}prescription-items/{free_item['id']}/?version=x")
    assert bad_version.status_code == 400
    removed = client.delete(
        f"{S}prescription-items/{free_item['id']}/?version={edited.json()['version']}"
    )
    assert removed.status_code == 200 and len(removed.json()["items"]) == 1


def test_only_the_author_drafts_and_other_roles_are_refused(
    clinic: Any,
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    doctor2: tuple[APIClient, Any],
    pharmacist: tuple[APIClient, Any],
    desk: tuple[APIClient, Any],
    drugs: dict[str, Any],
) -> None:
    c = draft(doctor[0], visit["visit_id"])
    body = add_item(doctor[0], c["id"]).json()
    other = add_item(doctor2[0], c["id"])
    assert other.status_code == 422
    item_id = body["items"][0]["id"]
    edit = doctor2[0].patch(
        f"{S}prescription-items/{item_id}/", {**AMOX, "version": body["version"]}, format="json"
    )
    assert edit.status_code == 422
    delete = doctor2[0].delete(f"{S}prescription-items/{item_id}/?version={body['version']}")
    assert delete.status_code == 422
    assert add_item(pharmacist[0], c["id"]).status_code == 403
    assert desk[0].get(f"{S}consultations/{c['id']}/prescription/").status_code == 403
    assert desk[0].get(f"{S}prescriptions/{body['id']}/").status_code == 403
    assert desk[0].get(f"{S}pharmacy/queue/").status_code == 403
    assert doctor[0].get(f"{S}pharmacy/queue/").status_code == 403
    assert doctor[0].get(f"{S}prescription-items/{item_id}/").status_code == 405
    missing = "00000000-0000-0000-0000-000000000000"
    assert doctor[0].get(f"{S}consultations/{missing}/prescription/").status_code == 404
    assert doctor[0].post(f"{S}prescription-items/{missing}/cancel/", {}).status_code == 404
    assert pharmacist[0].get(f"{S}prescriptions/{missing}/").status_code == 404
    assert pharmacist[0].post(f"{S}prescription-queries/{missing}/close/").status_code == 404


# ---- S7-B4 / B5 alerts and issue on sign -------------------------------------------------------


def test_allergy_override_blocks_signing_until_given(
    clinic: Any, visit: dict[str, Any], doctor: tuple[APIClient, Any], drugs: dict[str, Any]
) -> None:
    client = doctor[0]
    _penicillin_allergy(visit["record"].patient, doctor[1])
    c = draft(client, visit["visit_id"])
    body = add_item(client, c["id"]).json()
    assert [(a["kind"], a["overridden"]) for a in body["alerts"]] == [("allergy", False)]

    refused = sign(client, c["id"])
    assert refused.status_code == 422, refused.content
    assert error_code(refused) == "alert_override_required"
    assert Consultation.objects.get(pk=c["id"]).status == "draft"  # signing rolled back
    assert Prescription.objects.get(pk=body["id"]).status == "draft"

    item = body["items"][0]
    overridden = client.patch(
        f"{S}prescription-items/{item['id']}/",
        {
            **AMOX,
            "version": body["version"],
            "alert_overrides": [{"kind": "allergy", "reason": "Tolerated before, mild rash"}],
        },
        format="json",
    )
    assert overridden.status_code == 200
    assert overridden.json()["alerts"][0]["overridden"] is True
    assert sign(client, c["id"]).status_code == 200
    issued = client.get(f"{S}consultations/{c['id']}/prescription/").json()
    assert issued["status"] == "ready_to_dispense"
    assert issued["items"][0]["alert_overrides"][0]["kind"] == "allergy"


def test_issue_numbers_expiry_and_payment_first(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    drugs: dict[str, Any],
) -> None:
    _settings(clinic, documents={"prescription_valid_days": 10})
    _c, p = prescribe(doctor[0], visit["visit_id"])
    year = timezone.now().year
    assert p["number"] == f"RX-{year}-000001"
    issued = dt.datetime.fromisoformat(p["issued_at"])
    assert dt.datetime.fromisoformat(p["expires_at"]) - issued == dt.timedelta(days=10)
    assert {i["status"] for i in p["items"]} == {"issued"}
    assert "pharmacy.prescription.issued" in _actions(clinic)

    # locked after issue
    item = p["items"][0]
    locked = doctor[0].patch(
        f"{S}prescription-items/{item['id']}/", {**AMOX, "version": p["version"]}, format="json"
    )
    assert locked.status_code == 422
    assert (
        doctor[0].delete(f"{S}prescription-items/{item['id']}/?version={p['version']}").status_code
        == 422
    )
    with rls_context(facility_id=clinic.pk):
        with pytest.raises(DatabaseError), transaction.atomic():
            PrescriptionItem.objects.filter(pk=item["id"]).update(quantity=99)
        with pytest.raises(DatabaseError), transaction.atomic():
            Prescription.objects.filter(pk=p["id"]).update(number="RX-2026-999999")
        with pytest.raises(DatabaseError), transaction.atomic():
            PrescriptionEvent.objects.filter(prescription_id=p["id"]).delete()

    _settings(
        clinic, documents={"prescription_valid_days": 10}, billing={"pay_before_dispensing": True}
    )
    second = register(clinic, desk[1], "Mugisha Eric")
    visit2 = check_in(desk[0], second, catalogue["service"]["id"]).json()
    _c2, p2 = prescribe(doctor[0], visit2["visit_id"])
    assert p2["number"] == f"RX-{year}-000002"
    assert p2["status"] == "awaiting_payment"
    with rls_context(facility_id=clinic.pk):
        covered = services.mark_covered(p2["id"])
        assert covered.status == "ready_to_dispense"
        assert services.mark_covered(p2["id"]).status == "ready_to_dispense"  # idempotent
    assert "pharmacy.prescription.covered" in _actions(clinic)


def test_empty_prescription_is_removed_on_sign(
    visit: dict[str, Any], doctor: tuple[APIClient, Any], drugs: dict[str, Any]
) -> None:
    c = draft(doctor[0], visit["visit_id"])
    body = add_item(doctor[0], c["id"]).json()
    doctor[0].delete(f"{S}prescription-items/{body['items'][0]['id']}/?version={body['version']}")
    assert sign(doctor[0], c["id"]).status_code == 200
    assert doctor[0].get(f"{S}consultations/{c['id']}/prescription/").status_code == 404
    assert not Prescription.objects.filter(pk=body["id"]).exists()
    # signing without any prescription is unaffected
    c2 = draft(doctor[0], visit["visit_id"])
    assert sign(doctor[0], c2["id"]).status_code == 200


def test_number_counter_has_no_gaps_and_validates(clinic: Any) -> None:
    with rls_context(facility_id=clinic.pk):
        with transaction.atomic():
            assert next_number(clinic.pk, "RX", year=2030) == "RX-2030-000001"
        try:
            with transaction.atomic():
                next_number(clinic.pk, "RX", year=2030)
                raise ZeroDivisionError  # rolled back: the number is given back
        except ZeroDivisionError:
            pass
        with transaction.atomic():
            assert next_number(clinic.pk, "RX", year=2030) == "RX-2030-000002"
            assert next_number(clinic.pk, "LAB", year=2030) == "LAB-2030-000001"
        with pytest.raises(DatabaseError), transaction.atomic():
            NumberCounter.objects.create(facility=clinic, prefix="rx", year=2030)


# ---- S7-B6 after issue -----------------------------------------------------------------------


def test_cancel_and_change_after_issue(
    clinic: Any, visit: dict[str, Any], doctor: tuple[APIClient, Any], drugs: dict[str, Any]
) -> None:
    client = doctor[0]
    c, p = prescribe(client, visit["visit_id"], AMOX, PARA | {"duration_days": 3})
    amox, para = p["items"]
    short = client.post(
        f"{S}prescription-items/{amox['id']}/cancel/",
        {"version": p["version"], "reason": "no"},
        format="json",
    )
    assert short.status_code == 400
    stale = client.post(
        f"{S}prescription-items/{amox['id']}/cancel/",
        {"version": p["version"] - 1, "reason": "Wrong strength"},
        format="json",
    )
    assert stale.status_code == 409

    # change = new item that replaces the old one; needs recent authentication
    age_recent_auth(client)
    refused = add_item(
        client, c["id"], **{**AMOX, "duration_days": 5, "replaces_item_id": amox["id"]}
    )
    assert refused.status_code == 403 and error_code(refused) == "step_up_required"
    doctor_client = APIClient()
    login_staff(doctor_client, doctor[1])  # a fresh login counts as recent authentication
    changed = add_item(
        doctor_client, c["id"], **{**AMOX, "duration_days": 5, "replaces_item_id": amox["id"]}
    )
    assert changed.status_code == 201, changed.content
    body = changed.json()
    by_id = {i["id"]: i for i in body["items"]}
    assert by_id[amox["id"]]["status"] == "cancelled"
    new = next(i for i in body["items"] if i["replaces_item_id"] == amox["id"])
    assert new["status"] == "issued" and new["quantity"] == 15
    unknown = add_item(
        doctor_client,
        c["id"],
        **{**AMOX, "replaces_item_id": "00000000-0000-0000-0000-000000000000"},
    )
    assert unknown.status_code == 422

    cancelled = doctor_client.post(
        f"{S}prescription-items/{para['id']}/cancel/",
        {"version": body["version"], "reason": "Not needed any more"},
        format="json",
    )
    assert cancelled.status_code == 200
    whole = doctor_client.post(
        f"{S}prescriptions/{p['id']}/cancel/",
        {"version": cancelled.json()["version"], "reason": "Patient transferred"},
        format="json",
    )
    assert whole.status_code == 200
    assert whole.json()["status"] == "cancelled"
    assert {i["status"] for i in whole.json()["items"]} == {"cancelled"}
    again = doctor_client.post(
        f"{S}prescriptions/{p['id']}/cancel/",
        {"version": whole.json()["version"], "reason": "Patient transferred"},
        format="json",
    )
    assert again.status_code == 422
    late = add_item(doctor_client, c["id"])
    assert late.status_code == 422
    actions = _actions(clinic)
    assert "pharmacy.prescription.item_added_after_issue" in actions
    assert "pharmacy.prescription.item_cancelled" in actions
    assert "pharmacy.prescription.cancelled" in actions


def test_cancelling_the_last_item_cancels_the_prescription_and_dispensed_items_stay(
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    pharmacist: tuple[APIClient, Any],
    drugs: dict[str, Any],
) -> None:
    _c, p = prescribe(doctor[0], visit["visit_id"], AMOX, PARA | {"duration_days": 3})
    amox, para = p["items"]
    given = dispense(pharmacist[0], p, {"item_id": amox["id"], "outcome": "partial", "quantity": 5})
    assert given.status_code == 201
    v = given.json()["version"]
    refused = doctor[0].post(
        f"{S}prescription-items/{amox['id']}/cancel/",
        {"version": v, "reason": "Wrong strength"},
        format="json",
    )
    assert refused.status_code == 422
    whole = doctor[0].post(
        f"{S}prescriptions/{p['id']}/cancel/",
        {"version": v, "reason": "Patient transferred"},
        format="json",
    )
    assert whole.status_code == 422
    ok = doctor[0].post(
        f"{S}prescription-items/{para['id']}/cancel/",
        {"version": v, "reason": "Not needed any more"},
        format="json",
    )
    assert ok.status_code == 200 and ok.json()["status"] == "partly_dispensed"


def test_cancel_of_a_draft_item_is_refused(
    visit: dict[str, Any], doctor: tuple[APIClient, Any], drugs: dict[str, Any]
) -> None:
    c = draft(doctor[0], visit["visit_id"])
    body = add_item(doctor[0], c["id"]).json()
    item = body["items"][0]
    response = doctor[0].post(
        f"{S}prescription-items/{item['id']}/cancel/",
        {"version": body["version"], "reason": "Changed my mind"},
        format="json",
    )
    assert response.status_code == 422
    whole = doctor[0].post(
        f"{S}prescriptions/{body['id']}/cancel/",
        {"version": body["version"], "reason": "Changed my mind"},
        format="json",
    )
    assert whole.status_code == 422


def test_last_item_cancelled_moves_the_prescription(
    visit: dict[str, Any], doctor: tuple[APIClient, Any], drugs: dict[str, Any]
) -> None:
    _c, p = prescribe(doctor[0], visit["visit_id"])
    response = doctor[0].post(
        f"{S}prescription-items/{p['items'][0]['id']}/cancel/",
        {"version": p["version"], "reason": "Not needed any more"},
        format="json",
    )
    assert response.status_code == 200 and response.json()["status"] == "cancelled"


# ---- S7-B7 queue and reads ---------------------------------------------------------------------


def test_queue_rows_flags_filters_and_facility_isolation(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    doctor2: tuple[APIClient, Any],
    pharmacist: tuple[APIClient, Any],
    more_drugs: dict[str, Any],
) -> None:
    _c, p1 = prescribe(
        doctor[0],
        visit["visit_id"],
        {
            "drug_code": "MORPH10",
            "dose": "1 tablet",
            "frequency_code": "prn",
            "route": "oral",
            "quantity": 10,
        },
    )
    second = register(clinic, desk[1], "Mugisha Eric", dt.date(2015, 6, 1))
    visit2 = check_in(desk[0], second, catalogue["service"]["id"]).json()
    _c2, p2 = prescribe(doctor[0], visit2["visit_id"], PARA | {"duration_days": 2})
    client = pharmacist[0]
    rows = client.get(f"{S}pharmacy/queue/").json()["results"]
    assert [r["number"] for r in rows] == [p1["number"], p2["number"]]  # oldest first
    assert rows[0]["has_controlled"] and not rows[1]["has_controlled"]
    assert rows[0]["ticket_number"] == visit["ticket"]["number"]

    client.put(f"{S}pharmacy/availability/PARA500/", {"is_available": False}, format="json")
    client.post(f"{S}prescriptions/{p1['id']}/queries/", {"message": "Dose?"}, format="json")
    dispense(client, p2, {"item_id": p2["items"][0]["id"], "outcome": "partial", "quantity": 4})
    rows = {r["number"]: r for r in client.get(f"{S}pharmacy/queue/").json()["results"]}
    assert rows[p1["number"]]["has_open_query"] and rows[p2["number"]]["has_unavailable"]
    assert rows[p2["number"]]["patient_age"] == 11 or rows[p2["number"]]["patient_age"] == 10

    def numbers(query: str) -> list[str]:
        return [r["number"] for r in client.get(f"{S}pharmacy/queue/?{query}").json()["results"]]

    assert numbers("status=ready") == [p1["number"]]
    assert numbers("status=partly") == [p2["number"]]
    assert numbers("status=queried") == [p1["number"]]
    assert numbers("q=Mugisha") == [p2["number"]]
    assert numbers(f"q={p1['number'][-6:]}") == [p1["number"]]

    # P7: the pharmacist reads without the relationship rule; the other doctor needs a reason
    detail = client.get(f"{S}prescriptions/{p1['id']}/")
    assert detail.status_code == 200 and detail.json()["queries"][0]["message"] == "Dose?"
    assert "history_text" not in detail.json() and "diagnoses" not in detail.json()
    assert doctor[0].get(f"{S}prescriptions/{p1['id']}/").status_code == 200
    with rls_context(facility_id=clinic.pk):  # a staff member as patient always needs a reason
        FacilityPatient.objects.filter(pk=visit["record"].pk).update(is_staff_member=True)
    assert client.get(f"{S}prescriptions/{p1['id']}/").status_code == 200
    refused = doctor2[0].get(f"{S}prescriptions/{p1['id']}/")
    assert refused.status_code == 403 and error_code(refused) == "access_reason_required"
    assert "pharmacy.prescription.viewed" in _actions(clinic)

    other = FacilityFactory(name="Other Clinic", slug="other-clinic")
    outsider = client_for(other, ("pharmacist",), "other-pharm@example.test")[0]
    assert outsider.get(f"{S}prescriptions/{p1['id']}/").status_code == 404
    assert outsider.get(f"{S}pharmacy/queue/").json()["count"] == 0
    assert (
        dispense(outsider, p1, {"item_id": p1["items"][0]["id"], "outcome": "full"}).status_code
        == 404
    )


# ---- S7-B8 dispensing --------------------------------------------------------------------------


def test_dispense_partial_then_full_and_records_are_immutable(
    clinic: Any,
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    pharmacist: tuple[APIClient, Any],
    drugs: dict[str, Any],
) -> None:
    _c, p = prescribe(doctor[0], visit["visit_id"])
    item = p["items"][0]
    client = pharmacist[0]
    no_identity = client.post(
        f"{S}prescriptions/{p['id']}/dispense/",
        {"version": p["version"], "lines": [{"item_id": item["id"], "outcome": "full"}]},
        format="json",
    )
    assert no_identity.status_code == 400
    wrong = dispense(
        client,
        p,
        {"item_id": item["id"], "outcome": "full"},
        identity_check_method="verification_code",
        verification_code="RX-0000-000000",
    )
    assert wrong.status_code == 422
    too_much = dispense(client, p, {"item_id": item["id"], "outcome": "partial", "quantity": 22})
    assert too_much.status_code == 422
    zero = dispense(client, p, {"item_id": item["id"], "outcome": "partial", "quantity": 0})
    assert zero.status_code == 422
    repeated = dispense(
        client,
        p,
        {"item_id": item["id"], "outcome": "partial", "quantity": 1},
        {"item_id": item["id"], "outcome": "partial", "quantity": 1},
    )
    assert repeated.status_code == 422
    empty = dispense(client, p)
    assert empty.status_code == 400

    part = dispense(client, p, {"item_id": item["id"], "outcome": "partial", "quantity": 10})
    assert part.status_code == 201
    body = part.json()
    assert body["status"] == "partly_dispensed"
    assert body["items"][0]["dispensed_quantity"] == 10
    assert body["dispense_records"][0]["identity_check_method"] == "ticket_name_dob"
    stale = dispense(client, p, {"item_id": item["id"], "outcome": "full"})
    assert stale.status_code == 409
    rest = dispense(
        client,
        body,
        {"item_id": item["id"], "outcome": "partial", "quantity": 11},
        identity_check_method="verification_code",
        verification_code=p["number"].lower(),
    )
    assert rest.status_code == 201, rest.content
    done = rest.json()
    assert done["status"] == "dispensed"
    assert done["items"][0]["status"] == "dispensed"
    assert done["dispense_records"][1]["lines"][0]["outcome"] == "full"
    assert dispense(client, done, {"item_id": item["id"], "outcome": "full"}).status_code == 422
    assert "pharmacy.dispensed" in _actions(clinic)

    with rls_context(facility_id=clinic.pk):
        with pytest.raises(DatabaseError), transaction.atomic():
            DispenseRecord.objects.filter(prescription_id=p["id"]).update(controlled_confirmed=True)
        with pytest.raises(DatabaseError), transaction.atomic():
            DispenseLine.objects.filter(dispense_record__prescription_id=p["id"]).delete()
        with pytest.raises(DatabaseError), transaction.atomic():
            PrescriptionItem.objects.filter(pk=item["id"]).update(dispensed_quantity=22)


def test_substitution_not_available_and_controlled(
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    pharmacist: tuple[APIClient, Any],
    more_drugs: dict[str, Any],
) -> None:
    morph = {
        "drug_code": "MORPH10",
        "dose": "1 tablet",
        "frequency_code": "prn",
        "route": "oral",
        "quantity": 6,
    }
    fixed = {**PARA, "duration_days": 2, "substitution_allowed": False}
    _c, p = prescribe(doctor[0], visit["visit_id"], AMOX, morph, fixed)
    amox, morphine, para = p["items"]
    client = pharmacist[0]

    def sub(code: str, reason: str = "Brand out of stock") -> dict[str, Any]:
        return {
            "item_id": amox["id"],
            "outcome": "substituted",
            "substitute_drug_code": code,
            "substitution_reason": reason,
        }

    assert dispense(client, p, sub("AMOX250")).status_code == 422  # other strength
    assert dispense(client, p, sub("PARA500")).status_code == 422  # other ingredient
    assert dispense(client, p, sub("AMOX500")).status_code == 422  # same drug
    assert dispense(client, p, sub("AMOX500G", "no")).status_code == 422  # reason
    not_allowed = dispense(
        client,
        p,
        {
            "item_id": para["id"],
            "outcome": "substituted",
            "substitute_drug_code": "PARA500",
            "substitution_reason": "Brand out of stock",
        },
    )
    assert not_allowed.status_code == 422
    unconfirmed = dispense(client, p, {"item_id": morphine["id"], "outcome": "full"})
    assert unconfirmed.status_code == 422
    unknown = dispense(client, p, {"item_id": morphine["id"], "outcome": "maybe"})
    assert unknown.status_code == 400

    response = dispense(
        client,
        p,
        sub("AMOX500G"),
        {"item_id": morphine["id"], "outcome": "full"},
        {"item_id": para["id"], "outcome": "not_available"},
        controlled_confirmed=True,
    )
    assert response.status_code == 201, response.content
    body = response.json()
    by_id = {i["id"]: i for i in body["items"]}
    assert by_id[amox["id"]]["status"] == "dispensed"
    assert by_id[morphine["id"]]["status"] == "dispensed"
    assert by_id[para["id"]]["status"] == "not_available"
    lines = {line["item_id"]: line for line in body["dispense_records"][0]["lines"]}
    assert lines[amox["id"]]["substitute_display"] == "Amoxicillin 500 mg capsule"
    assert body["dispense_records"][0]["controlled_confirmed"] is True
    assert body["status"] == "partly_dispensed"

    labels = client.get(f"{S}prescriptions/{p['id']}/labels/").json()["labels"]
    assert len(labels) == 2 and {lb["language"] for lb in labels} == {"rw"}
    english = client.get(f"{S}prescriptions/{p['id']}/labels/?language=en").json()["labels"]
    assert {lb["frequency"] for lb in english} >= {"When needed"}
    assert english[0]["prescription_number"] == p["number"]


def test_only_not_available_items_left(
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    pharmacist: tuple[APIClient, Any],
    drugs: dict[str, Any],
) -> None:
    _c, p = prescribe(doctor[0], visit["visit_id"])
    response = dispense(
        pharmacist[0], p, {"item_id": p["items"][0]["id"], "outcome": "not_available"}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "not_available"
    # still valid: the patient can come back once it is in stock
    again = dispense(pharmacist[0], body, {"item_id": p["items"][0]["id"], "outcome": "full"})
    assert again.status_code == 201 and again.json()["status"] == "dispensed"


def test_awaiting_payment_is_not_dispensable(
    clinic: Any,
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    pharmacist: tuple[APIClient, Any],
    drugs: dict[str, Any],
) -> None:
    _settings(clinic, billing={"pay_before_dispensing": True})
    _c, p = prescribe(doctor[0], visit["visit_id"])
    response = dispense(pharmacist[0], p, {"item_id": p["items"][0]["id"], "outcome": "full"})
    assert response.status_code == 422
    assert pharmacist[0].get(f"{S}pharmacy/queue/").json()["count"] == 0


# ---- S7-B9 queries -----------------------------------------------------------------------------


def test_query_raised_answered_by_addendum_and_closed(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    pharmacist: tuple[APIClient, Any],
    drugs: dict[str, Any],
) -> None:
    c, p = prescribe(doctor[0], visit["visit_id"])
    client = pharmacist[0]
    raised = client.post(
        f"{S}prescriptions/{p['id']}/queries/", {"message": "Is 7 days right?"}, format="json"
    )
    assert raised.status_code == 201, raised.content
    query = raised.json()
    assert query["status"] == "open" and query["message"] == "Is 7 days right?"
    second = client.post(f"{S}prescriptions/{p['id']}/queries/", {"message": "?"}, format="json")
    assert second.status_code == 409
    early = client.post(f"{S}prescription-queries/{query['id']}/close/")
    assert early.status_code == 422

    other_patient = register(clinic, desk[1], "Mugisha Eric")
    visit2 = check_in(desk[0], other_patient, catalogue["service"]["id"]).json()
    other_c, _p2 = prescribe(doctor[0], visit2["visit_id"])
    wrong = (
        doctor[0]
        .post(
            f"{S}consultations/{other_c['id']}/addenda/",
            {"reason": "Other", "body": "Unrelated"},
            format="json",
        )
        .json()
    )
    refused = doctor[0].post(
        f"{S}prescription-queries/{query['id']}/answer/",
        {"addendum_id": wrong["id"]},
        format="json",
    )
    assert refused.status_code == 422
    addendum = (
        doctor[0]
        .post(
            f"{S}consultations/{c['id']}/addenda/",
            {"reason": "Pharmacy query", "body": "Yes, 7 days is right"},
            format="json",
        )
        .json()
    )
    assert (
        client.post(
            f"{S}prescription-queries/{query['id']}/answer/",
            {"addendum_id": addendum["id"]},
            format="json",
        ).status_code
        == 403
    )
    answered = doctor[0].post(
        f"{S}prescription-queries/{query['id']}/answer/",
        {"addendum_id": addendum["id"]},
        format="json",
    )
    assert answered.status_code == 200 and answered.json()["status"] == "answered"
    twice = doctor[0].post(
        f"{S}prescription-queries/{query['id']}/answer/",
        {"addendum_id": addendum["id"]},
        format="json",
    )
    assert twice.status_code == 422
    closed = client.post(f"{S}prescription-queries/{query['id']}/close/")
    assert closed.status_code == 200 and closed.json()["status"] == "closed"
    assert (
        client.post(
            f"{S}prescriptions/{p['id']}/queries/", {"message": "One more"}, format="json"
        ).status_code
        == 201
    )
    actions = _actions(clinic)
    for action in ("pharmacy.query.raised", "pharmacy.query.answered", "pharmacy.query.closed"):
        assert action in actions
    with rls_context(facility_id=clinic.pk), transaction.atomic():
        raw = connection.cursor()
        raw.execute(
            "SELECT message_enc FROM pharmacy_prescription_query WHERE id = %s", [query["id"]]
        )
        assert b"7 days" not in bytes(raw.fetchone()[0])


def test_query_on_a_cancelled_prescription_is_refused(
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    pharmacist: tuple[APIClient, Any],
    drugs: dict[str, Any],
) -> None:
    _c, p = prescribe(doctor[0], visit["visit_id"])
    doctor[0].post(
        f"{S}prescriptions/{p['id']}/cancel/",
        {"version": p["version"], "reason": "Patient transferred"},
        format="json",
    )
    response = pharmacist[0].post(
        f"{S}prescriptions/{p['id']}/queries/", {"message": "Why?"}, format="json"
    )
    assert response.status_code == 422


# ---- S7-B10 availability and drug search -------------------------------------------------------


def test_availability_toggle_and_drug_search(
    clinic: Any,
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    pharmacist: tuple[APIClient, Any],
    admin: tuple[APIClient, Any],
    drugs: dict[str, Any],
) -> None:
    client = pharmacist[0]
    assert (
        doctor[0]
        .put(f"{S}pharmacy/availability/AMOX500/", {"is_available": False}, format="json")
        .status_code
        == 403
    )
    off = client.put(f"{S}pharmacy/availability/AMOX500/", {"is_available": False}, format="json")
    assert off.status_code == 200 and off.json()["is_available"] is False
    assert (
        client.put(
            f"{S}pharmacy/availability/NOPE/", {"is_available": False}, format="json"
        ).status_code
        == 404
    )
    assert (
        admin[0]
        .put(f"{S}pharmacy/availability/PARA500/", {"is_available": True}, format="json")
        .status_code
        == 200
    )
    assert "pharmacy.availability.changed" in _actions(clinic)

    found = doctor[0].get(f"{S}drugs/?q=amox").json()
    assert found[0]["code"] == "AMOX500" and found[0]["available_here"] is False
    assert doctor[0].get(f"{S}drugs/?q=a").status_code == 400
    assert pharmacist[0].get(f"{S}drugs/?q=para").json()[0]["available_here"] is True

    listing = client.get(f"{S}pharmacy/availability/").json()
    assert listing["count"] == 3
    unavailable = client.get(f"{S}pharmacy/availability/?available=false").json()["results"]
    assert [r["drug_code"] for r in unavailable] == ["AMOX500"]
    available = client.get(f"{S}pharmacy/availability/?available=true&q=par").json()["results"]
    assert [r["drug_code"] for r in available] == ["PARA500"]
    assert doctor[0].get(f"{S}pharmacy/availability/").status_code == 403

    # the prescriber sees "not in stock here" on the item and can still prescribe it
    c = draft(doctor[0], visit["visit_id"])
    body = add_item(doctor[0], c["id"]).json()
    assert body["items"][0]["available_here"] is False


# ---- S7-B13 expiry ---------------------------------------------------------------------------


def test_expiry_job(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    pharmacist: tuple[APIClient, Any],
    drugs: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    past = timezone.now() - dt.timedelta(days=40)
    monkeypatch.setattr(services, "timezone", types.SimpleNamespace(now=lambda: past))
    _c, p = prescribe(doctor[0], visit["visit_id"], AMOX, PARA | {"duration_days": 2})
    second = register(clinic, desk[1], "Mugisha Eric")
    visit2 = check_in(desk[0], second, catalogue["service"]["id"]).json()
    _c2, p2 = prescribe(doctor[0], visit2["visit_id"])
    monkeypatch.undo()
    # a partly dispensed item of the second prescription (dispensed before expiry)
    with rls_context(facility_id=clinic.pk), transaction.atomic():
        item = PrescriptionItem.objects.select_for_update().get(pk=p2["items"][0]["id"])
        item.dispensed_quantity = 5
        item.status = "partly_dispensed"
        item.save(update_fields=["dispensed_quantity", "status"])
    expired = dispense(pharmacist[0], p, {"item_id": p["items"][0]["id"], "outcome": "full"})
    assert expired.status_code == 422

    assert tasks.expire_prescriptions() == 2
    with rls_context(facility_id=clinic.pk):
        first = Prescription.objects.get(pk=p["id"])
        assert first.status == "expired"
        assert set(first.items.values_list("status", flat=True)) == {"expired"}
        assert Prescription.objects.get(pk=p2["id"]).status == "expired"
        assert services.expire(clinic.pk) == 0
    assert tasks.expire_prescriptions() == 0
    assert "pharmacy.prescription.expired" in _actions(clinic)


def test_number_counter_guards(clinic: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    from django.db import IntegrityError

    from medilink.documents import numbers

    with monkeypatch.context() as m:
        m.setattr(
            numbers.transaction,
            "get_connection",
            lambda: types.SimpleNamespace(in_atomic_block=False),
        )
        with pytest.raises(RuntimeError):
            numbers.next_number(clinic.pk, "RX")

    # a parallel first number: the create loses the race and the row it lost to is locked
    with rls_context(facility_id=clinic.pk), transaction.atomic():
        NumberCounter.objects.create(facility=clinic, prefix="SN", year=2031, last_value=4)
        real = NumberCounter.objects

        class Racing:
            def select_for_update(self) -> Any:
                return types.SimpleNamespace(
                    filter=lambda **kw: types.SimpleNamespace(first=lambda: None),
                    get=lambda **kw: real.select_for_update().get(**kw),
                )

            def create(self, **kwargs: Any) -> Any:
                raise IntegrityError("duplicate")

        monkeypatch.setattr(numbers.NumberCounter, "objects", Racing())
        assert numbers.next_number(clinic.pk, "SN", year=2031) == "SN-2031-000005"
