"""Staff patient endpoints (contract §3.3, §9 backend checks)."""

from __future__ import annotations

from typing import Any

import pytest

from medilink.audit.models import AuditEntry
from medilink.patients.models import (
    AuditLink,
    ConsentRecord,
    Identifier,
    Patient,
)
from tests.conftest import error_code
from tests.patients.conftest import NATIONAL_ID, walk_in

pytestmark = pytest.mark.django_db

BASE = "/api/v1/staff/patients/"


def test_walk_in_creates_patient_record_consent_and_audit(reception: Any) -> None:
    data = walk_in(
        reception,
        identifier={"kind": "national_id", "value": NATIONAL_ID},
        file_number="A-1",
        insurance={"insurer_code": "mutuelle", "member_number": "1234567/01"},
    )
    assert data["medilink_number"].startswith("ML-")
    assert data["phone_masked"] == "+250 7•• ••• 456"
    assert data["national_id_masked"] == "••••5678"
    assert data["identifiers"][0]["masked_value"] == "••••5678"
    assert data["insurance"][0]["insurer_code"] == "mutuelle"
    assert data["has_care_consent"] is True
    patient = Patient.objects.get(pk=data["patient_id"])
    assert patient.created_via == "walk_in"
    assert patient.phone_e164 == "+250788123456"
    identifier = Identifier.objects.get(patient=patient)
    assert NATIONAL_ID.encode() not in bytes(identifier.value_enc)
    assert ConsentRecord.objects.filter(
        patient=patient, kind="care", channel="staff_assisted"
    ).exists()
    assert AuditLink.objects.filter(
        patient=patient, audit_entry__action="patients.walk_in.registered"
    ).exists()
    # no plaintext identifier in any audit metadata
    for entry in AuditEntry.objects.all():
        assert NATIONAL_ID not in str(entry.metadata)


def test_walk_in_needs_age_and_consent(reception: Any) -> None:
    response = reception.post(
        BASE,
        {
            "full_name": "Keza",
            "sex": "female",
            "care_consent": {"version": "2026-10", "granted": False},
        },
        format="json",
    )
    assert response.status_code == 400
    fields = response.json()["error"]["fields"]
    assert "date_of_birth" in fields or "care_consent" in fields


def test_estimated_age(reception: Any) -> None:
    data = walk_in(reception, date_of_birth=None, estimated_age_years=40)
    assert data["is_birth_date_estimated"] is True
    assert data["date_of_birth"].endswith("-01-01")


def test_walk_in_idempotent(reception: Any) -> None:
    body = {
        "full_name": "Habimana Eric",
        "sex": "male",
        "date_of_birth": "1990-01-01",
        "care_consent": {"version": "2026-10", "granted": True},
    }
    first = reception.post(BASE, body, format="json", HTTP_IDEMPOTENCY_KEY="k-1")
    second = reception.post(BASE, body, format="json", HTTP_IDEMPOTENCY_KEY="k-1")
    assert first.status_code == second.status_code == 201
    assert first.json()["facility_patient_id"] == second.json()["facility_patient_id"]
    assert Patient.objects.filter(full_name="Habimana Eric").count() == 1


def test_identifier_conflict_and_file_number_conflict(reception: Any) -> None:
    walk_in(reception, identifier={"kind": "national_id", "value": NATIONAL_ID}, file_number="F1")
    response = reception.post(
        BASE,
        {
            "full_name": "Someone Else",
            "sex": "male",
            "date_of_birth": "1970-01-01",
            "identifier": {"kind": "national_id", "value": NATIONAL_ID},
            "care_consent": {"version": "2026-10", "granted": True},
        },
        format="json",
    )
    assert response.status_code == 409
    assert "identifier" in response.json()["error"]["fields"]
    response = reception.post(
        BASE,
        {
            "full_name": "Someone Else",
            "sex": "male",
            "date_of_birth": "1970-01-01",
            "file_number": "F1",
            "care_consent": {"version": "2026-10", "granted": True},
        },
        format="json",
    )
    assert response.status_code == 409
    assert "file_number" in response.json()["error"]["fields"]


def test_strong_duplicate_needs_confirmation(reception: Any) -> None:
    walk_in(reception)
    body = {
        "full_name": "Jeanne Mukamana",
        "sex": "female",
        "date_of_birth": "1984-03-02",
        "care_consent": {"version": "2026-10", "granted": True},
    }
    check_body = {k: v for k, v in body.items() if k != "care_consent"}
    check = reception.post(f"{BASE}duplicate-checks/", check_body, format="json")
    assert check.status_code == 200
    assert check.json()["matches"][0]["level"] == "strong"
    response = reception.post(BASE, body, format="json")
    assert response.status_code == 409
    assert "non_field_errors" in response.json()["error"]["fields"]
    response = reception.post(BASE, {**body, "confirm_not_duplicate": True}, format="json")
    assert response.status_code == 201
    assert AuditEntry.objects.filter(action="patients.duplicates.dismissed").exists()


def test_search_by_name_phone_id_file_and_number(reception: Any) -> None:
    data = walk_in(
        reception, identifier={"kind": "national_id", "value": NATIONAL_ID}, file_number="A-77"
    )
    for query, by in (
        ("mukamana", "name"),
        ("0788 123 456", "phone"),
        (NATIONAL_ID, "national_id"),
        ("A-77", "file_number"),
        (data["medilink_number"], "medilink_number"),
    ):
        response = reception.post(f"{BASE}search/", {"query": query}, format="json")
        assert response.status_code == 200, query
        results = response.json()["results"]
        assert [r["facility_patient_id"] for r in results] == [data["facility_patient_id"]], by
        assert results[0]["match"] == by
    entry = AuditEntry.objects.filter(action="patients.search.performed").last()
    assert entry is not None and set(entry.metadata) == {"by", "result_count"}


def test_other_facility_sees_external_match_only_and_adds_existing(
    reception: Any, other_reception: Any
) -> None:
    data = walk_in(reception, identifier={"kind": "national_id", "value": NATIONAL_ID})
    # RLS: the record of the first facility is not visible
    assert other_reception.get(f"{BASE}{data['facility_patient_id']}/").status_code == 404
    response = other_reception.post(f"{BASE}search/", {"query": "Mukamana"}, format="json")
    assert response.json()["results"] == []
    response = other_reception.post(f"{BASE}search/", {"query": NATIONAL_ID}, format="json")
    external = response.json()["external_match"]
    assert external["patient_ref"] == data["patient_id"]
    assert external["birth_year"] == 1984
    bad = other_reception.post(
        f"{BASE}add-existing/",
        {
            "patient_ref": data["patient_id"],
            "proof": {"medilink_number": "ML-0000-0000"},
            "care_consent": {"version": "2026-10", "granted": True},
        },
        format="json",
    )
    assert bad.status_code in (400, 422)
    added = other_reception.post(
        f"{BASE}add-existing/",
        {
            "patient_ref": data["patient_id"],
            "proof": {"identifier": {"kind": "national_id", "value": NATIONAL_ID}},
            "care_consent": {"version": "2026-10", "granted": True},
        },
        format="json",
    )
    assert added.status_code == 201, added.content
    again = other_reception.post(
        f"{BASE}add-existing/",
        {
            "patient_ref": data["patient_id"],
            "proof": {"medilink_number": data["medilink_number"]},
            "care_consent": {"version": "2026-10", "granted": True},
        },
        format="json",
    )
    assert again.status_code == 200
    assert again.json()["facility_patient_id"] == added.json()["facility_patient_id"]
    assert added.json()["facility_patient_id"] != data["facility_patient_id"]


def test_detail_is_audited_and_patch_checks_versions(reception: Any) -> None:
    data = walk_in(reception)
    url = f"{BASE}{data['facility_patient_id']}/"
    detail = reception.get(url).json()
    assert AuditEntry.objects.filter(action="patients.record.viewed").count() == 1
    response = reception.patch(
        url,
        {
            "version": detail["version"],
            "patient_version": detail["patient_version"],
            "preferred_name": "Jeanne",
            "reception_notes": "Prefers Kinyarwanda",
        },
        format="json",
    )
    assert response.status_code == 200, response.content
    assert response.json()["preferred_name"] == "Jeanne"
    entry = AuditEntry.objects.get(action="patients.record.updated")
    assert entry.metadata == {"fields": ["preferred_name", "reception_notes"]}
    stale = reception.patch(
        url,
        {"version": detail["version"], "patient_version": detail["patient_version"]},
        format="json",
    )
    assert stale.status_code == 409


def test_identifiers_and_reveal(reception: Any, doctor: Any) -> None:
    data = walk_in(reception)
    url = f"{BASE}{data['facility_patient_id']}/"
    added = reception.post(
        f"{url}identifiers/",
        {"kind": "passport", "issuing_country": "ke", "value": "ak 123456", "seen_document": True},
        format="json",
    )
    assert added.status_code == 201, added.content
    assert added.json()["is_verified"] is True
    assert added.json()["issuing_country"] == "KE"
    identifier_id = added.json()["id"]
    body = {"field": "identifier", "identifier_id": identifier_id, "reason_code": "identity_check"}
    revealed = reception.post(f"{url}reveal/", body, format="json")
    assert revealed.status_code == 200
    assert revealed.json() == {"value": "AK123456"}
    assert revealed["Cache-Control"] == "no-store"
    entry = AuditEntry.objects.get(action="patients.identifier.revealed")
    assert entry.reason == "identity_check"
    assert "AK123456" not in str(entry.metadata)
    # doctors may reveal the phone, not identifiers
    assert doctor.post(f"{url}reveal/", body, format="json").status_code == 403
    phone = doctor.post(
        f"{url}reveal/", {"field": "phone", "reason_code": "patient_request"}, format="json"
    )
    assert phone.json() == {"value": "+250788123456"}
    other = reception.post(
        f"{url}reveal/", {"field": "phone", "reason_code": "other"}, format="json"
    )
    assert other.status_code == 400


def test_identifier_used_by_another_patient(reception: Any) -> None:
    walk_in(reception, identifier={"kind": "national_id", "value": NATIONAL_ID})
    second = walk_in(reception, full_name="Ntwari Paul", sex="male", phone_e164="0722000111")
    response = reception.post(
        f"{BASE}{second['facility_patient_id']}/identifiers/",
        {"kind": "national_id", "value": NATIONAL_ID},
        format="json",
    )
    assert response.status_code == 409
    assert "value" in response.json()["error"]["fields"]


def test_insurance_flow(reception: Any) -> None:
    data = walk_in(reception)
    url = f"{BASE}{data['facility_patient_id']}/insurance-profiles/"
    unknown = reception.post(url, {"insurer_code": "nope", "member_number": "1"}, format="json")
    assert unknown.status_code == 400
    created = reception.post(
        url, {"insurer_code": "mutuelle", "member_number": "1234567/01"}, format="json"
    )
    assert created.status_code == 201
    profile = created.json()
    assert profile["status"] == "unverified"
    duplicate = reception.post(
        url, {"insurer_code": "mutuelle", "member_number": "1234567/01"}, format="json"
    )
    assert duplicate.status_code == 409
    verify = reception.post(
        f"{url}{profile['id']}/verify/",
        {"outcome": "verified", "valid_until": "2099-06-30"},
        format="json",
    )
    assert verify.status_code == 200
    verified = verify.json()
    assert verified["status"] == "verified"
    assert verified["last_verified"]["facility_name"] == "Kigali Test Clinic"
    rejected = reception.post(
        f"{url}{profile['id']}/verify/", {"outcome": "rejected"}, format="json"
    )
    assert rejected.status_code == 400
    patched = reception.patch(
        f"{url}{profile['id']}/",
        {"version": verified["version"], "member_number": "7654321/01"},
        format="json",
    )
    assert patched.status_code == 200
    assert patched.json()["status"] == "unverified"
    listed = reception.get(url).json()["results"]
    assert len(listed) == 1


def test_health_profile_permissions(reception: Any, doctor: Any, pharmacist: Any) -> None:
    data = walk_in(reception)
    url = f"{BASE}{data['facility_patient_id']}/"
    assert reception.get(f"{url}health-profile/").status_code == 403
    added = doctor.post(
        f"{url}allergies/",
        {"category": "drug", "substance_text": "Penicillin", "severity": "severe"},
        format="json",
    )
    assert added.status_code == 201, added.content
    item = added.json()
    assert item["verification_status"] == "verified" and item["source"] == "clinician"
    doctor.post(f"{url}conditions/", {"display": "Hypertension"}, format="json")
    full = doctor.get(f"{url}health-profile/").json()
    assert full["no_known_allergies"] is False
    assert len(full["allergies"]) == 1 and len(full["conditions"]) == 1
    pharmacy = pharmacist.get(f"{url}health-profile/")
    # pharmacists see allergies only (if they can reach the record at all)
    if pharmacy.status_code == 200:
        assert pharmacy.json()["conditions"] is None
    review = doctor.post(
        f"{url}allergies/{item['id']}/review/", {"outcome": "entered_in_error"}, format="json"
    )
    assert review.status_code == 400
    review = doctor.post(
        f"{url}allergies/{item['id']}/review/",
        {"outcome": "entered_in_error", "note": "Wrong patient"},
        format="json",
    )
    assert review.status_code == 200
    assert doctor.get(f"{url}health-profile/").json()["allergies"] == []
    assert doctor.post(f"{url}unknown/", {}, format="json").status_code == 404


def test_staff_consent(reception: Any) -> None:
    data = walk_in(reception)
    url = f"{BASE}{data['facility_patient_id']}/consents/"
    response = reception.post(
        url,
        {"kind": "research", "version": "2026-10", "granted": True, "script_read": False},
        format="json",
    )
    assert response.status_code == 400
    response = reception.post(
        url,
        {"kind": "research", "version": "2026-10", "granted": True, "script_read": True},
        format="json",
    )
    assert response.status_code == 201
    assert response.json()["channel"] == "staff_assisted"


def test_patients_endpoints_need_staff(api: Any, patient_client: Any) -> None:
    assert api.post(f"{BASE}search/", {"query": "x"}, format="json").status_code == 401
    assert patient_client.post(f"{BASE}search/", {"query": "x"}, format="json").status_code in (
        401,
        403,
    )
    assert error_code(api.post(f"{BASE}search/", {"query": "x"}, format="json")) == (
        "not_authenticated"
    )
