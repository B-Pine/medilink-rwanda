"""Contract §9 checks not covered elsewhere: S3-B4 (no context), B5 (tampering), B11 (rate limit),
B13 (database four-eyes rule), B20 (audit links and chain), B21 (staff-as-patient flag)."""

from __future__ import annotations

import uuid
from io import StringIO
from typing import Any

import pytest
from django.core.management import call_command
from django.db import IntegrityError, transaction

from medilink.audit.models import AuditEntry
from medilink.patients import crypto
from medilink.patients.audit_actions import ACTIONS
from medilink.patients.models import AuditLink, FacilityPatient, Merge, Patient, PatientLink
from medilink.tenancy.context import rls_context
from tests.factories import make_staff
from tests.patients.conftest import walk_in

pytestmark = pytest.mark.django_db

S = "/api/v1/staff/patients/"


def test_b4_no_context_sees_no_facility_records(reception: Any) -> None:
    walk_in(reception)
    with rls_context(facility_id=None):
        assert FacilityPatient.objects.count() == 0


def test_b5_changed_tag_fails() -> None:
    row = uuid.uuid4()
    blob = bytearray(crypto.encrypt("1198480012345678", table="t", column="c", row_id=row))
    blob[-1] ^= 0x01
    with pytest.raises(crypto.DecryptionError):
        crypto.decrypt(bytes(blob), table="t", column="c", row_id=row)


def test_b11_search_rate_limit(reception: Any, monkeypatch: Any) -> None:
    monkeypatch.setenv("THROTTLE_RATE_PATIENTS_SEARCH", "2/min")
    codes = [
        reception.post(f"{S}search/", {"query": "x"}, format="json").status_code for _ in range(3)
    ]
    assert codes == [200, 200, 429]


def test_b13_database_refuses_self_approval(reception: Any) -> None:
    first = Patient.objects.get(pk=walk_in(reception)["patient_id"])
    second = Patient.objects.get(
        pk=walk_in(reception, full_name="Other Person", sex="male", phone_e164=None)["patient_id"]
    )
    user = make_staff(None, email="solo@example.test")
    with pytest.raises(IntegrityError), transaction.atomic():
        Merge.objects.create(
            scope="facility",
            surviving_patient=first,
            merged_patient=second,
            requested_by=user,
            decided_by=user,
            reason="x",
        )


def test_b20_one_audit_link_per_patient_event_and_chain_valid(reception: Any) -> None:
    data = walk_in(reception)
    reception.get(f"{S}{data['facility_patient_id']}/")
    reception.post(
        f"{S}{data['facility_patient_id']}/reveal/",
        {"field": "phone", "reason_code": "patient_request"},
        format="json",
    )
    patient_events = AuditEntry.objects.filter(action__in=ACTIONS, object_id__isnull=False).exclude(
        action__in=["patients.search.performed", "patients.duplicate_check.performed"]
    )
    for entry in patient_events:
        assert AuditLink.objects.filter(audit_entry=entry).count() == 1, entry.action
    out = StringIO()
    call_command("verify_audit_chain", stdout=out)
    assert "ok" in out.getvalue().lower() or "valid" in out.getvalue().lower()


def test_b21_staff_member_flag(reception: Any, facility: Any) -> None:
    nurse = make_staff(facility, roles=("doctor",), email="nurse.patient@example.test")
    patient = Patient.objects.create(full_name="Staff Patient", sex="female")
    from medilink.patients.identity import assign_medilink_number

    assign_medilink_number(patient)
    PatientLink.objects.create(account=nurse, patient=patient, relationship="self")
    added = reception.post(
        f"{S}add-existing/",
        {
            "patient_ref": str(patient.pk),
            "proof": {"medilink_number": patient.medilink_number},
            "care_consent": {"version": "2026-10", "granted": True},
        },
        format="json",
    )
    assert added.status_code == 201, added.content
    assert added.json()["is_staff_member"] is True
    walk = walk_in(reception, full_name="Not Staff", sex="male", phone_e164=None)
    assert walk["is_staff_member"] is False
