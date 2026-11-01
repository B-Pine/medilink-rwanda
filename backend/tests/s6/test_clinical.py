"""S6a backend checks (contract sprint-06 §9): S6-B3..B13, B16 against the real database."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
from typing import Any

import pytest
from django.db import DatabaseError, connection, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from medilink.clinical import services
from medilink.clinical.models import (
    AccessReason,
    Addendum,
    Consultation,
    Diagnosis,
    Vitals,
)
from medilink.patients.models import Allergy, Medication, Patient
from medilink.tenancy.context import rls_context
from tests.conftest import error_code
from tests.factories import FacilityFactory
from tests.masterdata.conftest import age_recent_auth
from tests.s2.conftest import client_for, membership_of
from tests.s4.conftest import act, call_next, on_duty
from tests.s6.conftest import (
    MALARIA,
    S,
    facility_record,
    open_consultation,
    patch,
    signed_consultation,
)

pytestmark = pytest.mark.django_db(transaction=False)


# ---- S6-B4 draft and autosave ---------------------------------------------------------------


def test_open_is_idempotent_per_author_and_autosave_versions(
    visit: dict[str, Any], doctor: tuple[APIClient, Any], doctor2: tuple[APIClient, Any]
) -> None:
    client = doctor[0]
    first = open_consultation(client, visit["visit_id"])
    assert first.status_code == 201, first.content
    body = first.json()
    assert body["status"] == "draft" and body["can_edit"] and body["can_sign"]
    again = open_consultation(client, visit["visit_id"])
    assert again.status_code == 200 and again.json()["id"] == body["id"]
    other = open_consultation(doctor2[0], visit["visit_id"])
    assert other.status_code == 201 and other.json()["id"] != body["id"]

    saved = patch(
        client,
        body,
        history_text="Fever for two days",
        private_notes="Consider typhoid",
        diagnoses=[*MALARIA, {"code": "J06.9", "rank": "secondary", "certainty": "provisional"}],
    )
    assert saved.status_code == 200, saved.content
    data = saved.json()
    assert data["version"] == body["version"] + 1
    assert data["history_text"] == "Fever for two days"
    assert [d["code"] for d in data["diagnoses"]] == ["B54", "J06.9"]
    assert data["diagnoses"][0]["display"]

    stale = patch(client, body, plan_text="late")
    assert stale.status_code == 409
    replaced = patch(
        client, data, diagnoses=[{"code": "I10", "rank": "primary", "certainty": "confirmed"}]
    )
    assert [d["code"] for d in replaced.json()["diagnoses"]] == ["I10"]

    not_author = patch(doctor2[0], replaced.json(), plan_text="mine")
    assert not_author.status_code == 422
    for bad in (
        [{"code": "ZZZ9", "rank": "primary", "certainty": "confirmed"}],
        [*MALARIA, {"code": "B54", "rank": "secondary", "certainty": "confirmed"}],
        [*MALARIA, {"code": "I10", "rank": "primary", "certainty": "confirmed"}],
    ):
        refused = patch(client, replaced.json(), diagnoses=bad)
        assert refused.status_code == 422, bad
    unknown = patch(client, replaced.json(), surprise="x")
    assert unknown.status_code == 400


def test_sensitive_diagnosis_suggests_restricted(
    visit: dict[str, Any], doctor: tuple[APIClient, Any]
) -> None:
    client = doctor[0]
    body = open_consultation(client, visit["visit_id"]).json()
    saved = patch(
        client, body, diagnoses=[{"code": "B20", "rank": "primary", "certainty": "confirmed"}]
    )
    assert saved.json()["suggest_restricted"] is True and saved.json()["is_restricted"] is False
    restricted = patch(client, saved.json(), is_restricted=True)
    assert restricted.json()["is_restricted"] is True
    assert restricted.json()["suggest_restricted"] is False


# ---- S6-B5 sign, hash, late entry, integrity; S6-B16 encryption --------------------------------


def test_sign_needs_step_up_and_primary_and_stores_hash(
    clinic: Any, visit: dict[str, Any], doctor: tuple[APIClient, Any]
) -> None:
    client = doctor[0]
    body = open_consultation(client, visit["visit_id"]).json()
    saved = patch(client, body, history_text="Fever", private_notes="secret reasoning").json()
    no_primary = client.post(
        f"{S}consultations/{saved['id']}/sign/", {"version": saved["version"]}, format="json"
    )
    assert no_primary.status_code == 422
    saved = patch(client, saved, diagnoses=MALARIA).json()

    age_recent_auth(client)
    stale_auth = client.post(
        f"{S}consultations/{saved['id']}/sign/", {"version": saved["version"]}, format="json"
    )
    assert stale_auth.status_code == 403 and error_code(stale_auth) == "step_up_required"
    _refresh_auth(client)
    signed = client.post(
        f"{S}consultations/{saved['id']}/sign/", {"version": saved["version"]}, format="json"
    )
    assert signed.status_code == 200, signed.content
    data = signed.json()
    assert data["status"] == "signed" and data["signed_at"] and data["integrity"] == "ok"
    assert data["is_late_entry"] is False and data["can_edit"] is False

    with rls_context(facility_id=clinic.pk):
        row = Consultation.objects.get(pk=data["id"])
        canonical = services.canonical_content(row)
        text = json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        assert bytes(row.content_hash) == hashlib.sha256(text.encode()).digest()
        assert bytes(row.content_hash).hex() == data["content_hash"]
        assert canonical["sections"]["private_notes"] == "secret reasoning"
        # S6-B16: no plaintext in the stored row
        for column in ("history_enc", "private_notes_enc"):
            assert b"secret" not in bytes(getattr(row, column)) and b"Fever" not in bytes(
                getattr(row, column)
            )
        # tampering is detected (the trigger is bypassed only by the owner; simulate in memory)
        row.content_hash = b"\x00" * 32
        assert services.integrity(row) == "mismatch"


def _refresh_auth(client: APIClient) -> None:
    import time
    from importlib import import_module

    from django.conf import settings

    from medilink.accounts.sessions import MFA_AT_KEY

    cookie = settings.SESSION_AUDIENCES["staff"]["COOKIE_NAME"]
    store = import_module(settings.SESSION_ENGINE).SessionStore(
        client.cookies[cookie].value, audience="staff"
    )
    store[MFA_AT_KEY] = int(time.time())
    store.save()


def test_late_entry_after_24_hours(
    clinic: Any, visit: dict[str, Any], doctor: tuple[APIClient, Any]
) -> None:
    client = doctor[0]
    body = open_consultation(client, visit["visit_id"]).json()
    with rls_context(facility_id=clinic.pk):
        Consultation.objects.filter(pk=body["id"]).update(
            started_at=timezone.now() - dt.timedelta(hours=30)
        )
    saved = patch(client, body, diagnoses=MALARIA).json()
    signed = client.post(
        f"{S}consultations/{saved['id']}/sign/", {"version": saved["version"]}, format="json"
    )
    assert signed.json()["is_late_entry"] is True


# ---- S6-B6 lock in the service and the database -------------------------------------------------


def test_signed_record_is_locked_by_service_and_trigger(
    clinic: Any, visit: dict[str, Any], doctor: tuple[APIClient, Any]
) -> None:
    client = doctor[0]
    data = signed_consultation(client, visit["visit_id"], plan_text="Rest")
    refused = patch(client, data, plan_text="changed")
    assert refused.status_code == 422
    with rls_context(facility_id=clinic.pk):
        row = Consultation.objects.get(pk=data["id"])
        for change in (
            {"plan_enc": b"x"},
            {"signed_at": timezone.now()},
            {"is_restricted": True},
            {"status": "draft"},
        ):
            with pytest.raises(DatabaseError), transaction.atomic():
                Consultation.objects.filter(pk=row.pk).update(**change)
        with pytest.raises(DatabaseError), transaction.atomic():
            Consultation.objects.filter(pk=row.pk).delete()
        diagnosis = Diagnosis.objects.get(consultation=row)
        with pytest.raises(DatabaseError), transaction.atomic():
            Diagnosis.objects.filter(pk=diagnosis.pk).update(certainty="provisional")
        with pytest.raises(DatabaseError), transaction.atomic():
            Diagnosis.objects.filter(pk=diagnosis.pk).delete()
        with pytest.raises(DatabaseError), transaction.atomic():
            Diagnosis.objects.create(
                facility_id=clinic.pk,
                consultation=row,
                code="I10",
                display="x",
                rank="secondary",
                certainty="confirmed",
            )
        assert services.integrity(Consultation.objects.get(pk=row.pk)) == "ok"


# ---- S6-B7 addenda ------------------------------------------------------------------------------


def test_addenda_by_author_and_other_doctor(
    clinic: Any,
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    doctor2: tuple[APIClient, Any],
) -> None:
    data = signed_consultation(doctor[0], visit["visit_id"], plan_text="Rest")
    url = f"{S}consultations/{data['id']}/addenda/"
    draft = open_consultation(doctor2[0], visit["visit_id"]).json()
    on_draft = doctor2[0].post(
        f"{S}consultations/{draft['id']}/addenda/", {"reason": "r", "body": "b"}, format="json"
    )
    assert on_draft.status_code == 422

    own = doctor[0].post(
        url, {"reason": "Lab result", "body": "Malaria RDT positive"}, format="json"
    )
    assert own.status_code == 201, own.content
    assert own.json()["is_by_author"] is True and len(own.json()["content_hash"]) == 64
    other = doctor2[0].post(url, {"reason": "Second opinion", "body": "Agree"}, format="json")
    assert other.status_code == 201 and other.json()["is_by_author"] is False

    age_recent_auth(doctor[0])
    stale = doctor[0].post(url, {"reason": "x", "body": "y"}, format="json")
    assert error_code(stale) == "step_up_required"

    detail = doctor2[0].get(f"{S}consultations/{data['id']}/").json()
    assert [a["reason"] for a in detail["addenda"]] == ["Lab result", "Second opinion"]
    assert detail["plan_text"] == "Rest" and detail["integrity"] == "ok"
    with rls_context(facility_id=clinic.pk):
        addendum = Addendum.objects.get(pk=own.json()["id"])
        assert b"Malaria" not in bytes(addendum.body_enc)
        with pytest.raises(DatabaseError), transaction.atomic():
            Addendum.objects.filter(pk=addendum.pk).update(reason="edited")


# ---- S6-B8 entered in error ---------------------------------------------------------------------


def test_entered_in_error_by_author_only_and_hidden(
    clinic: Any,
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    doctor2: tuple[APIClient, Any],
) -> None:
    data = signed_consultation(doctor[0], visit["visit_id"])
    url = f"{S}consultations/{data['id']}/entered-in-error/"
    by_other = doctor2[0].post(url, {"version": data["version"], "reason": "x"}, format="json")
    assert by_other.status_code == 422
    marked = doctor[0].post(
        url, {"version": data["version"], "reason": "Wrong patient"}, format="json"
    )
    assert marked.status_code == 200, marked.content
    assert marked.json()["status"] == "entered_in_error"
    assert marked.json()["entered_in_error"]["reason"] == "Wrong patient"
    again = doctor[0].post(url, {"version": marked.json()["version"], "reason": "x"}, format="json")
    assert again.status_code == 422
    history = doctor[0].get(f"{S}clinical/patients/{visit['record'].pk}/history/?type=consultation")
    assert history.json()["count"] == 0
    with rls_context(facility_id=clinic.pk):
        assert Consultation.objects.filter(pk=data["id"]).exists()
        with pytest.raises(DatabaseError), transaction.atomic():
            Consultation.objects.filter(pk=data["id"]).update(entered_in_error_reason="edit")


def test_draft_can_be_entered_in_error(
    visit: dict[str, Any], doctor: tuple[APIClient, Any]
) -> None:
    body = open_consultation(doctor[0], visit["visit_id"]).json()
    marked = doctor[0].post(
        f"{S}consultations/{body['id']}/entered-in-error/",
        {"version": body["version"], "reason": "Opened for the wrong visit"},
        format="json",
    )
    assert marked.status_code == 200


# ---- S6-B9 completion guard and unsigned list ---------------------------------------------------


def test_visit_cannot_complete_with_a_draft(
    clinic: Any,
    catalogue: dict[str, Any],
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    admin: tuple[APIClient, Any],
) -> None:
    client = doctor[0]
    on_duty(client, catalogue["point"]["id"])
    called = call_next(client, catalogue["service"]["id"])
    assert called.status_code == 200, called.content
    started = act(client, called.json(), "start").json()
    body = open_consultation(client, visit["visit_id"]).json()

    for action, extra in (("complete", {}), ("next-stage", {"stage": "pharmacy"})):
        refused = act(client, started, action, **extra)
        assert refused.status_code == 422, (action, refused.content)

    rows = client.get(f"{S}consultations/?status=draft").json()
    assert rows["count"] == 1 and rows["results"][0]["id"] == body["id"]
    assert "history_text" not in rows["results"][0] and "diagnoses" not in rows["results"][0]
    admin_rows = admin[0].get(f"{S}consultations/").json()
    assert admin_rows["count"] == 1 and admin_rows["results"][0]["is_overdue"] is False

    saved = patch(client, body, diagnoses=MALARIA).json()
    client.post(
        f"{S}consultations/{saved['id']}/sign/", {"version": saved["version"]}, format="json"
    )
    done = act(client, started, "complete")
    assert done.status_code == 200, done.content
    assert client.get(f"{S}consultations/").json()["count"] == 0


def test_visit_without_consultation_still_completes(
    catalogue: dict[str, Any], visit: dict[str, Any], doctor: tuple[APIClient, Any]
) -> None:
    client = doctor[0]
    on_duty(client, catalogue["point"]["id"])
    started = act(client, call_next(client, catalogue["service"]["id"]).json(), "start").json()
    assert act(client, started, "complete").status_code == 200


def test_completed_visit_gets_a_late_consultation(
    catalogue: dict[str, Any], visit: dict[str, Any], doctor: tuple[APIClient, Any]
) -> None:
    client = doctor[0]
    on_duty(client, catalogue["point"]["id"])
    started = act(client, call_next(client, catalogue["service"]["id"]).json(), "start").json()
    act(client, started, "complete")
    assert open_consultation(client, visit["visit_id"]).status_code == 201


def test_cancelled_visit_refuses_consultation_and_vitals(
    visit: dict[str, Any], desk: tuple[APIClient, Any], doctor: tuple[APIClient, Any]
) -> None:
    act(desk[0], visit["ticket"], "cancel", reason_code="patient_request")
    assert open_consultation(doctor[0], visit["visit_id"]).status_code in (403, 422)
    vitals = desk[0].post(
        f"{S}visits/{visit['visit_id']}/vitals/", {"pulse_bpm": 80}, format="json"
    )
    assert vitals.status_code == 422


# ---- S6-B10 vitals ------------------------------------------------------------------------------


def test_vitals_ranges_ownership_and_entered_in_error(
    clinic: Any,
    visit: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
) -> None:
    url = f"{S}visits/{visit['visit_id']}/vitals/"
    assert desk[0].post(url, {}, format="json").status_code == 400
    assert desk[0].post(url, {"temperature_c": "51.0"}, format="json").status_code == 400
    assert (
        desk[0].post(url, {"systolic_mmhg": 80, "diastolic_mmhg": 90}, format="json").status_code
        == 400
    )
    by_desk = desk[0].post(
        url, {"temperature_c": "38.4", "systolic_mmhg": 118, "diastolic_mmhg": 76}, format="json"
    )
    assert by_desk.status_code == 201, by_desk.content
    body = open_consultation(doctor[0], visit["visit_id"]).json()
    assert [v["id"] for v in body["vitals"]] == [by_desk.json()["id"]]
    by_doctor = doctor[0].post(url, {"pulse_bpm": 92, "spo2_pct": 98}, format="json")
    assert by_doctor.status_code == 201

    assert len(desk[0].get(url).json()["results"]) == 1  # reception: own rows only
    assert len(doctor[0].get(url).json()["results"]) == 2
    with rls_context(facility_id=clinic.pk):
        assert Vitals.objects.get(pk=by_doctor.json()["id"]).consultation_id is not None

    other_desk = client_for(clinic, ("receptionist",), "c-desk2@example.test")[0]
    eie = f"{S}vitals/{by_desk.json()['id']}/entered-in-error/"
    assert other_desk.post(eie, {"reason": "x"}, format="json").status_code == 403
    marked = desk[0].post(eie, {"reason": "Wrong thermometer"}, format="json")
    assert marked.status_code == 200 and marked.json()["is_entered_in_error"] is True
    assert desk[0].post(eie, {"reason": "again"}, format="json").status_code == 422
    with rls_context(facility_id=clinic.pk):
        with pytest.raises(DatabaseError), transaction.atomic():
            Vitals.objects.filter(pk=by_doctor.json()["id"]).update(pulse_bpm=60)
        with pytest.raises(DatabaseError), transaction.atomic():
            Vitals.objects.filter(pk=by_doctor.json()["id"]).delete()


# ---- S6-B11 alerts ------------------------------------------------------------------------------


def test_allergy_duplicate_and_dose_alerts(
    clinic: Any, visit: dict[str, Any], doctor: tuple[APIClient, Any], drugs: dict[str, Any]
) -> None:
    patient = visit["record"].patient
    user = doctor[1]
    Allergy.objects.create(
        patient=patient,
        source="clinician",
        verification_status="verified",
        recorded_by=user,
        category="drug",
        substance_text="Pénicilline",
        severity="severe",
    )
    Allergy.objects.create(
        patient=patient,
        source="patient",
        verification_status="refuted",
        recorded_by=user,
        category="drug",
        substance_text="Paracetamol",
    )
    Medication.objects.create(
        patient=patient,
        source="patient",
        verification_status="unverified",
        recorded_by=user,
        drug_display="Metformin 500 mg twice daily",
    )
    response = doctor[0].post(
        f"{S}clinical/alerts/",
        {
            "facility_patient_id": str(visit["record"].pk),
            "items": [
                {"drug_code": "AMOX500", "quantity": 21},
                {"drug_code": "PARA500", "quantity": 100},
                {"drug_code": "METF500"},
                {"drug_code": "PARA500"},
            ],
        },
        format="json",
    )
    assert response.status_code == 200, response.content
    found = {(a["drug_code"], a["kind"], a["severity"]) for a in response.json()["alerts"]}
    assert found == {
        ("AMOX500", "allergy", "high"),
        ("PARA500", "dose", "medium"),
        ("METF500", "duplicate", "medium"),
        ("PARA500", "duplicate", "medium"),
    }
    unknown = doctor[0].post(
        f"{S}clinical/alerts/",
        {"facility_patient_id": str(visit["record"].pk), "items": [{"drug_code": "NOPE"}]},
        format="json",
    )
    assert unknown.status_code == 400
    banner = open_consultation(doctor[0], visit["visit_id"]).json()["allergies"]
    assert [a["substance"] for a in banner] == ["Pénicilline"]


# ---- S6-B12 treatment relationship and reason for access ---------------------------------------


def test_reason_required_without_relationship_and_for_staff_members(
    clinic: Any, desk: tuple[APIClient, Any], doctor: tuple[APIClient, Any]
) -> None:
    client = doctor[0]
    stranger = facility_record(clinic, Patient.objects.create(full_name="Mugisha Paul"), desk[1])
    url = f"{S}clinical/patients/{stranger.pk}/history/"
    state = client.get(f"{S}clinical/patients/{stranger.pk}/access/").json()
    assert state == {
        "has_relationship": False,
        "is_staff_member": False,
        "reason_required": True,
        "granted_until": None,
    }
    blocked = client.get(url)
    assert blocked.status_code == 403 and error_code(blocked) == "access_reason_required"
    assert client.get(f"{S}clinical/patients/{stranger.pk}/problem-summary/").status_code == 403

    reasons = f"{S}clinical/patients/{stranger.pk}/access-reasons/"
    assert client.post(reasons, {"reason_code": "other"}, format="json").status_code == 422
    given = client.post(reasons, {"reason_code": "results_review"}, format="json")
    assert given.status_code == 201
    assert client.get(url).status_code == 200
    assert (
        client.get(f"{S}clinical/patients/{stranger.pk}/access/").json()["reason_required"] is False
    )
    with rls_context(facility_id=clinic.pk):
        assert AccessReason.objects.filter(facility_patient=stranger).count() == 1
        with pytest.raises(DatabaseError), transaction.atomic():
            AccessReason.objects.update(reason_text="edited")


def test_access_reason_expires_and_is_audited(
    clinic: Any, desk: tuple[APIClient, Any], doctor: tuple[APIClient, Any]
) -> None:
    from medilink.patients.models import AuditLink

    client = doctor[0]
    stranger = facility_record(clinic, Patient.objects.create(full_name="Mugisha Paul"), desk[1])
    client.post(
        f"{S}clinical/patients/{stranger.pk}/access-reasons/",
        {"reason_code": "care_continuity"},
        format="json",
    )
    assert client.get(f"{S}clinical/patients/{stranger.pk}/history/").status_code == 200
    links = set(
        AuditLink.objects.filter(patient=stranger.patient).values_list(
            "audit_entry__action", flat=True
        )
    )
    assert {"clinical.access_reason.given", "clinical.history.viewed"} <= links
    # expire by moving time forward (append-only rows are never edited)
    later = timezone.now() + dt.timedelta(minutes=121)
    from unittest import mock

    with mock.patch("django.utils.timezone.now", return_value=later):
        assert client.get(f"{S}clinical/patients/{stranger.pk}/history/").status_code == 403


def test_staff_member_patient_always_needs_a_reason(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
) -> None:
    from tests.s4.conftest import check_in

    colleague = facility_record(
        clinic, Patient.objects.create(full_name="Nurse Colleague"), desk[1], is_staff_member=True
    )
    assert check_in(desk[0], colleague, catalogue["service"]["id"]).status_code == 201
    state = doctor[0].get(f"{S}clinical/patients/{colleague.pk}/access/").json()
    assert state["has_relationship"] is True and state["reason_required"] is True
    assert doctor[0].get(f"{S}clinical/patients/{colleague.pk}/history/").status_code == 403


def test_recent_care_counts_as_relationship(
    clinic: Any,
    visit: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
    doctor2: tuple[APIClient, Any],
) -> None:
    signed_consultation(doctor[0], visit["visit_id"])
    act(desk[0], visit["ticket"], "left", reason_code="patient_left")  # visit no longer open
    record = visit["record"]
    assert (
        doctor[0].get(f"{S}clinical/patients/{record.pk}/access/").json()["has_relationship"]
        is True
    )
    assert (
        doctor2[0].get(f"{S}clinical/patients/{record.pk}/access/").json()["reason_required"]
        is True
    )


# ---- S6-B13 history timeline -------------------------------------------------------------------


def test_history_timeline_filters_and_problem_summary(
    clinic: Any, visit: dict[str, Any], desk: tuple[APIClient, Any], doctor: tuple[APIClient, Any]
) -> None:
    client = doctor[0]
    desk[0].post(f"{S}visits/{visit['visit_id']}/vitals/", {"pulse_bpm": 80}, format="json")
    first = signed_consultation(client, visit["visit_id"])
    second_open = open_consultation(client, visit["visit_id"]).json()
    saved = patch(
        client,
        second_open,
        diagnoses=[{"code": "I10", "rank": "primary", "certainty": "provisional"}],
    ).json()
    client.post(
        f"{S}consultations/{saved['id']}/sign/", {"version": saved["version"]}, format="json"
    )
    open_consultation(client, visit["visit_id"])  # my own new draft shows too

    url = f"{S}clinical/patients/{visit['record'].pk}/history/"
    everything = client.get(url).json()
    assert everything["count"] == 4
    kinds = [i["kind"] for i in everything["results"]]
    assert kinds.count("vitals") == 1 and kinds.count("consultation") == 3
    stamps = [i["occurred_at"] for i in everything["results"]]
    assert stamps == sorted(stamps, reverse=True)
    malaria = client.get(url + "?code=B5").json()
    assert [i["id"] for i in malaria["results"]] == [first["id"]]
    assert client.get(url + "?type=vitals").json()["count"] == 1
    tomorrow = (timezone.localdate() + dt.timedelta(days=1)).isoformat()
    assert client.get(url + f"?from={tomorrow}").json()["count"] == 0
    assert client.get(url + "?type=nope").status_code == 400
    assert client.get(url + "?from=31-12-2026").status_code == 400

    summary = client.get(f"{S}clinical/patients/{visit['record'].pk}/problem-summary/").json()
    assert {d["code"] for d in summary["recent_diagnoses"]} == {"B54", "I10"}
    assert summary["is_staff_member"] is False and summary["allergies"] == []


# ---- S6-B3 cross facility and RLS ---------------------------------------------------------------


def test_other_facility_ids_are_not_found_and_rls_fails_closed(
    clinic: Any, visit: dict[str, Any], doctor: tuple[APIClient, Any]
) -> None:
    data = signed_consultation(doctor[0], visit["visit_id"])
    elsewhere = FacilityFactory(name="Huye Clinic", slug="huye-s6")
    outsider = client_for(elsewhere, ("doctor",), "c-out@example.test")[0]
    for method, url in (
        ("post", f"{S}visits/{visit['visit_id']}/consultation/"),
        ("get", f"{S}visits/{visit['visit_id']}/vitals/"),
        ("get", f"{S}consultations/{data['id']}/"),
        ("patch", f"{S}consultations/{data['id']}/"),
        ("post", f"{S}consultations/{data['id']}/addenda/"),
        ("get", f"{S}clinical/patients/{visit['record'].pk}/history/"),
        ("get", f"{S}clinical/patients/{visit['record'].pk}/access/"),
    ):
        body = {"version": 1, "reason": "x", "body": "y"}
        response = getattr(outsider, method)(url, body, format="json")
        assert response.status_code == 404, (method, url, response.status_code)
    assert outsider.get(f"{S}consultations/").json()["count"] == 0
    with connection.cursor() as cursor:
        cursor.execute("SELECT count(*) FROM clinical_consultation")
        assert cursor.fetchone()[0] == 0  # no context, no rows
    with rls_context(facility_id=elsewhere.pk):
        assert Consultation.objects.count() == 0 and Vitals.objects.count() == 0
    with rls_context(facility_id=clinic.pk):
        assert Consultation.objects.count() == 1
    assert membership_of(doctor[1], clinic)
