"""R2 remediation (issue #84): clinical access reasons, claim oracle, merge undo rule, strict
merge bodies, idempotent dependents and claim confirmations, normalisers, constraint mapping,
access-history actor groups, `can_revoke`, consent versions and the OpenAPI contract."""

from __future__ import annotations

import datetime as dt
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
import yaml
from django.conf import settings
from django.db import IntegrityError
from django.test import override_settings

from medilink.audit.models import AuditEntry
from medilink.core.exceptions import Conflict
from medilink.patients import self_service, staff
from medilink.patients.errors import FieldConflict
from medilink.patients.models import (
    AuditLink,
    FacilityPatient,
    InsuranceProfile,
    Merge,
    Patient,
    PatientLink,
)
from medilink.tenancy.context import rls_context
from tests.conftest import error_code
from tests.masterdata.conftest import age_recent_auth
from tests.patients.conftest import NATIONAL_ID, patient_client_for, staff_client_for, walk_in

pytestmark = pytest.mark.django_db

PATIENTS = "/api/v1/staff/patients/"
MERGES = "/api/v1/staff/merge-requests/"
P = "/api/v1/patient/"


def _age_record(fp_id: str, facility: Any, days: int = 90) -> None:
    with rls_context(facility_id=facility.pk):
        FacilityPatient.objects.filter(pk=fp_id).update(
            first_visit_on=dt.date.today() - dt.timedelta(days=days)
        )


# ---- clinical reads need a care relationship or a reason -----------------------------------------


def test_record_read_without_care_relationship_needs_a_reason(
    reception: Any, doctor: Any, facility: Any
) -> None:
    data = walk_in(reception)
    fp_id = data["facility_patient_id"]
    detail = f"{PATIENTS}{fp_id}/"
    health = f"{PATIENTS}{fp_id}/health-profile/"
    # registered here today: a care relationship
    assert reception.get(detail).status_code == 200
    _age_record(fp_id, facility)
    for client, url in ((reception, detail), (doctor, health)):
        refused = client.get(url)
        assert refused.status_code == 403
        assert error_code(refused) == "access_reason_required"
    reasons = f"{PATIENTS}{fp_id}/access-reasons/"
    missing_text = doctor.post(reasons, {"reason_code": "other"}, format="json")
    assert missing_text.status_code == 400
    assert "reason_text" in missing_text.json()["error"]["fields"]
    unknown = doctor.post(reasons, {"reason_code": "care_continuity", "x": 1}, format="json")
    assert unknown.status_code == 400
    given = doctor.post(
        reasons, {"reason_code": "other", "reason_text": "Lab called back"}, format="json"
    )
    assert given.status_code == 201, given.content
    assert "expires_at" in given.json()
    assert doctor.get(health).status_code == 200
    # the reason is per staff session: reception still has to give one
    assert reception.get(detail).status_code == 403
    viewed = AuditEntry.objects.filter(action="patients.health_profile.viewed").latest(
        "occurred_at"
    )
    assert viewed.reason == "other: Lab called back"
    assert viewed.metadata["basis"] == "reason"
    assert AuditEntry.objects.filter(
        action="patients.access_reason.given", reason="other: Lab called back"
    ).exists()


def test_open_or_recent_visit_is_a_care_relationship(
    reception: Any, doctor: Any, admin_client: Any, facility: Any
) -> None:
    from medilink.visits.models import Visit
    from tests.s2.conftest import make_catalogue

    service = make_catalogue(admin_client)["service"]
    data = walk_in(reception)
    fp_id = data["facility_patient_id"]
    _age_record(fp_id, facility)
    health = f"{PATIENTS}{fp_id}/health-profile/"
    assert doctor.get(health).status_code == 403
    with rls_context(facility_id=facility.pk):
        visit = Visit.objects.create(
            facility=facility,
            facility_patient_id=fp_id,
            patient_id=data["patient_id"],
            service_date=dt.date.today() - dt.timedelta(days=5),
            source="walk_in",
            status="completed",
            first_service_id=service["id"],
        )
    response = doctor.get(health)
    assert response.status_code == 200
    entry = AuditEntry.objects.filter(action="patients.health_profile.viewed").latest("occurred_at")
    assert entry.metadata["basis"] == "care_relationship"
    with rls_context(facility_id=facility.pk):
        Visit.objects.filter(pk=visit.pk).update(
            service_date=dt.date.today() - dt.timedelta(days=200)
        )
    assert doctor.get(health).status_code == 403
    with rls_context(facility_id=facility.pk):
        Visit.objects.filter(pk=visit.pk).update(status="on_site")
    assert doctor.get(health).status_code == 200


def test_staff_as_patient_always_needs_a_reason(reception: Any, facility: Any) -> None:
    data = walk_in(reception)
    fp_id = data["facility_patient_id"]
    with rls_context(facility_id=facility.pk):
        FacilityPatient.objects.filter(pk=fp_id).update(is_staff_member=True)
    detail = f"{PATIENTS}{fp_id}/"
    assert error_code(reception.get(detail)) == "access_reason_required"
    given = reception.post(
        f"{PATIENTS}{fp_id}/access-reasons/", {"reason_code": "admin_request"}, format="json"
    )
    assert given.status_code == 201
    assert given.json() and reception.get(detail).status_code == 200
    entry = AuditEntry.objects.filter(action="patients.access_reason.given").latest("occurred_at")
    assert entry.metadata == {"reason_code": "admin_request", "staff_member": True}


def test_access_reason_is_scoped_to_the_facility(reception: Any, other_reception: Any) -> None:
    data = walk_in(reception)
    response = other_reception.post(
        f"{PATIENTS}{data['facility_patient_id']}/access-reasons/",
        {"reason_code": "care_continuity"},
        format="json",
    )
    assert response.status_code == 404


# ---- record claims: no existence oracle ----------------------------------------------------------


def test_claim_refusals_do_not_reveal_whether_a_record_matched(
    reception: Any, facility: Any
) -> None:
    walk_in(reception, identifier={"kind": "national_id", "value": NATIONAL_ID})
    client, user = patient_client_for("claimer@example.test", "Mukamana Jeanne")
    own = PatientLink.objects.get(account=user, relationship="self").patient
    with rls_context(facility_id=facility.pk):
        FacilityPatient.objects.create(
            facility=facility, patient=own, first_visit_on=dt.date.today(), registered_by=user
        )
    bodies = [
        {"lookup": {"identifier": {"kind": "national_id", "value": NATIONAL_ID}}},
        {"lookup": {"identifier": {"kind": "national_id", "value": "1199999999999999"}}},
    ]
    answers = set()
    for body in bodies:
        response = client.post(
            f"{P}record-claims/", {**body, "date_of_birth": "1984-03-02"}, format="json"
        )
        assert response.status_code == 422
        answers.add(response.json()["error"]["message"])
    assert len(answers) == 1


def test_claimed_record_answers_like_no_match(reception: Any) -> None:
    walk_in(reception, identifier={"kind": "national_id", "value": NATIONAL_ID})
    target = Patient.objects.get(full_name="Mukamana Jeanne", created_via="walk_in")
    _holder, holder_user = patient_client_for("holder@example.test", "Other Person")
    PatientLink.objects.filter(account=holder_user, relationship="self").update(patient=target)
    client, _user = patient_client_for("late@example.test", "Mukamana Jeanne")
    taken = client.post(
        f"{P}record-claims/",
        {
            "lookup": {"identifier": {"kind": "national_id", "value": NATIONAL_ID}},
            "date_of_birth": "1984-03-02",
        },
        format="json",
    )
    unknown = client.post(
        f"{P}record-claims/",
        {"lookup": {"medilink_number": "ML-0000-0000"}, "date_of_birth": "1984-03-02"},
        format="json",
    )
    assert taken.status_code == unknown.status_code == 422
    assert taken.json()["error"]["message"] == unknown.json()["error"]["message"]


def test_claim_confirmation_replay_returns_the_completed_claim(reception: Any) -> None:
    record = walk_in(reception, full_name="Ntwari Paul", sex="male", date_of_birth="1988-02-02")
    client, _user = patient_client_for("paul.r2@example.test", "Ntwari Paul")
    claim = client.post(
        f"{P}record-claims/",
        {
            "lookup": {"phone_e164": "0788123456", "full_name": "Paul Ntwari"},
            "date_of_birth": "1988-02-02",
        },
        format="json",
    ).json()
    url = f"{PATIENTS}{record['facility_patient_id']}/claim-confirmations/"
    body = {
        "claim_reference": claim["reference"],
        "document_kind": "national_id",
        "document_matches": True,
    }
    first = reception.post(url, body, format="json")
    assert first.status_code == 200, first.content
    again = reception.post(url, body, format="json")
    assert again.status_code == 200
    assert again.json() == first.json()
    assert Merge.objects.filter(scope="claim").count() == 1


# ---- merges ------------------------------------------------------------------------------------


def _merge_pair(reception: Any) -> dict[str, Any]:
    first = walk_in(
        reception, identifier={"kind": "national_id", "value": NATIONAL_ID}, file_number="A-1"
    )
    second = walk_in(
        reception,
        full_name="Mukamana Jeane",
        phone_e164=None,
        file_number="A-2",
        confirm_not_duplicate=True,
    )
    response = reception.post(
        MERGES,
        {
            "surviving_facility_patient_id": first["facility_patient_id"],
            "merged_facility_patient_id": second["facility_patient_id"],
            "reason": "Registered twice",
        },
        format="json",
    )
    assert response.status_code == 201, response.content
    return response.json()


def test_merge_bodies_are_strict(reception: Any, admin_client: Any) -> None:
    merge = _merge_pair(reception)
    response = admin_client.post(
        f"{MERGES}{merge['id']}/approve/", {"version": 1, "approved": True}, format="json"
    )
    assert response.status_code == 400
    assert "approved" in response.json()["error"]["fields"]


def test_undo_uses_the_approver_rule(reception: Any, admin_client: Any, facility: Any) -> None:
    requester, _ = staff_client_for(
        facility, ("facility_admin", "receptionist"), "requester@example.test"
    )
    merge = _merge_pair(requester)
    done = admin_client.post(f"{MERGES}{merge['id']}/approve/", {"version": 1}, format="json")
    assert done.status_code == 200, done.content
    own = requester.post(
        f"{MERGES}{merge['id']}/undo/",
        {"version": done.json()["version"], "reason": "Mine"},
        format="json",
    )
    assert own.status_code == 422
    Merge.objects.filter(pk=merge["id"]).update(is_escalated=True)
    escalated = admin_client.post(
        f"{MERGES}{merge['id']}/undo/",
        {"version": done.json()["version"], "reason": "Platform decided"},
        format="json",
    )
    assert escalated.status_code == 422
    Merge.objects.filter(pk=merge["id"]).update(is_escalated=False)
    age_recent_auth(admin_client, seconds=0)
    undone = admin_client.post(
        f"{MERGES}{merge['id']}/undo/",
        {"version": done.json()["version"], "reason": "Wrong person"},
        format="json",
    )
    assert undone.status_code == 200, undone.content


# ---- dependents: Idempotency-Key and the age setting ---------------------------------------------


def _dependent(client: Any, key: str | None = None, **overrides: Any) -> Any:
    body = {
        "relationship": "guardian",
        "full_name": "Keza Uwase",
        "sex": "female",
        "date_of_birth": "2019-04-02",
        "consent_version": "2026-10",
    }
    body.update(overrides)
    headers = {"HTTP_IDEMPOTENCY_KEY": key} if key else {}
    return client.post(f"{P}dependents/", body, format="json", **headers)


def test_add_dependent_honours_idempotency_key(patient_client: Any) -> None:
    first = _dependent(patient_client, key="dep-1")
    assert first.status_code == 201, first.content
    again = _dependent(patient_client, key="dep-1")
    assert again.status_code == 201
    assert again.json()["patient_id"] == first.json()["patient_id"]
    other = _dependent(patient_client, key="dep-2")
    assert other.json()["patient_id"] != first.json()["patient_id"]
    assert Patient.objects.filter(full_name="Keza Uwase").count() == 2


def test_dependent_age_and_consent_version(patient_client: Any) -> None:
    born = dt.date.today().replace(year=dt.date.today().year - 17) - dt.timedelta(days=1)
    assert _dependent(patient_client, date_of_birth=born.isoformat()).status_code == 201
    with override_settings(PATIENTS_DEPENDENT_MAX_AGE=16):
        refused = _dependent(patient_client, date_of_birth=born.isoformat(), full_name="Teen")
    assert refused.status_code == 422
    assert "16" in refused.json()["error"]["message"]
    stale = _dependent(patient_client, consent_version="2020-01", full_name="Old Text")
    assert stale.status_code == 422
    assert "consent_version" in stale.json()["error"]["fields"]


# ---- normalisers and constraint mapping ----------------------------------------------------------


def test_file_and_member_numbers_are_normalised(reception: Any) -> None:
    data = walk_in(
        reception,
        file_number="  a-12 ",
        insurance={"insurer_code": "mutuelle", "member_number": " 1234 567/ab "},
    )
    assert data["file_number"] == "A-12"
    assert InsuranceProfile.objects.get().member_number == "1234567/AB"
    found = reception.post(
        f"{PATIENTS}search/", {"query": "a-12", "by": "file_number"}, format="json"
    ).json()["results"]
    assert [r["patient_id"] for r in found] == [data["patient_id"]]
    clash = reception.post(
        PATIENTS,
        {
            "full_name": "Habimana Eric",
            "sex": "male",
            "date_of_birth": "1980-01-01",
            "file_number": "A-12",
            "care_consent": {"version": "2026-10", "granted": True},
        },
        format="json",
    )
    assert clash.status_code == 409
    assert "file_number" in clash.json()["error"]["fields"]


def test_integrity_errors_map_by_constraint_name(reception: Any, facility: Any) -> None:
    data = walk_in(reception, file_number="B-1")
    patient = Patient.objects.get(pk=data["patient_id"])
    other = Patient.objects.create(full_name="Someone Else")
    with rls_context(facility_id=facility.pk):
        user = FacilityPatient.objects.get(pk=data["facility_patient_id"]).registered_by
        with pytest.raises(Conflict):
            staff._create_record(
                facility_id=facility.pk, patient=patient, file_number=None, actor=user
            )
        with pytest.raises(FieldConflict) as taken:
            staff._create_record(
                facility_id=facility.pk, patient=other, file_number="b-1", actor=user
            )
    assert taken.value.field == "file_number"
    unknown = IntegrityError("x")
    assert staff.integrity_conflict(unknown) is unknown


# ---- access history, can_revoke, consents --------------------------------------------------------


def test_access_history_filters_actor_kinds_per_action(patient_client: Any) -> None:
    from medilink.audit.services import record

    profile = patient_client.get(f"{P}profiles/").json()["results"][0]
    patient = Patient.objects.get(pk=profile["patient_id"])

    def link(action: str, actor_kind: str) -> None:
        entry = record(action, request=None, object_type="patient", object_id=patient.pk)
        AuditLink.objects.create(
            audit_entry=entry,
            patient=patient,
            occurred_at=entry.occurred_at,
            actor_kind=actor_kind,
        )

    link("patients.record.viewed", "linked_account")  # facility event from an account: hidden
    link("patients.record.viewed", "staff")
    link("patients.delegation.created", "staff")  # self-service event from staff: hidden
    link("patients.delegation.created", "linked_account")
    rows = patient_client.get(f"{P}profiles/{patient.pk}/access-history/").json()["results"]
    assert sorted((r["action"], r["actor_kind"]) for r in rows) == [
        ("patients.delegation.created", "linked_account"),
        ("patients.record.viewed", "staff"),
    ]


def test_can_revoke_mirrors_revoke() -> None:
    me = SimpleNamespace(pk=1)

    def row(account: int, relationship: str, granted_by: int | None) -> Any:
        return SimpleNamespace(
            account_id=account, relationship=relationship, granted_by_id=granted_by, patient_id=9
        )

    guardian = {9: {"guardian"}}
    owner = {9: {"self"}}
    can = self_service.can_revoke
    assert can(me, row(2, "delegate", 3), guardian) is False  # not granted by me, no self link
    assert can(me, row(2, "guardian", 1), guardian) is True
    assert can(me, row(2, "delegate", 3), owner) is True
    assert can(me, row(2, "self", None), owner) is False
    assert can(me, row(1, "delegate", 3), {}) is True  # leaving a profile shared with me
    assert can(me, row(1, "self", None), owner) is False


def test_consent_versions_and_toggles(patient_client: Any, reception: Any) -> None:
    stale = patient_client.post(
        f"{P}consents/", {"kind": "research", "version": "2020-01", "granted": True}, format="json"
    )
    assert stale.status_code == 422
    assert "version" in stale.json()["error"]["fields"]
    for granted in (True, False):
        toggle = patient_client.post(
            f"{P}consents/",
            {"kind": "notifications", "version": "2026-10", "granted": granted},
            format="json",
        )
        assert toggle.status_code == 201, toggle.content
    state = patient_client.get(f"{P}consents/").json()
    assert state["current_versions"]["location"] == "2026-10"
    notifications = [c for c in state["consents"] if c["kind"] == "notifications"]
    assert notifications[0]["granted"] is False
    desk = reception.post(
        PATIENTS,
        {
            "full_name": "Habimana Eric",
            "sex": "male",
            "date_of_birth": "1980-01-01",
            "care_consent": {"version": "2020-01", "granted": True},
        },
        format="json",
    )
    assert desk.status_code == 422
    assert "care_consent" in desk.json()["error"]["fields"]
    data = walk_in(reception)
    staff_consent = reception.post(
        f"{PATIENTS}{data['facility_patient_id']}/consents/",
        {"kind": "research", "version": "2020-01", "granted": True, "script_read": True},
        format="json",
    )
    assert staff_consent.status_code == 422


# ---- OpenAPI contract ----------------------------------------------------------------------------


def _schema() -> dict[str, Any]:
    path = Path(settings.BASE_DIR) / "openapi" / "openapi.yaml"
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def test_openapi_lists_and_patient_security_match_the_api() -> None:
    schema = _schema()
    paths = schema["paths"]

    def ref(path: str, method: str = "get") -> str:
        content = paths[path][method]["responses"]["200"]["content"]["application/json"]
        return content["schema"]["$ref"].rsplit("/", 1)[-1]

    components = schema["components"]["schemas"]
    for path in (
        "/api/v1/patient/profiles/",
        "/api/v1/patient/profiles/{patient_id}/identifiers/",
        "/api/v1/patient/profiles/{patient_id}/insurance-profiles/",
        "/api/v1/staff/patients/{fp_id}/insurance-profiles/",
    ):
        assert "results" in components[ref(path)]["properties"], path
    for path in (
        "/api/v1/patient/profiles/{patient_id}/access-history/",
        "/api/v1/staff/merge-requests/",
        "/api/v1/platform/merge-requests/",
    ):
        assert {"count", "results"} <= set(components[ref(path)]["properties"]), path
    for path, operations in paths.items():
        if path.startswith("/api/v1/patient/profiles/"):
            for operation in operations.values():
                assert operation["security"] == [{"patientSession": []}], path
