"""S6b part 1 (contract sprint-06 §9): S6-B18 results inbox, S6-B20 scans and back-entry,
S6-B21 break-glass, health attributes."""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Iterator
from typing import Any

import pytest
from django.db import DatabaseError, transaction
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from medilink.audit.models import AuditEntry
from medilink.clinical import break_glass
from medilink.clinical.models import (
    BreakGlassSession,
    ClinicalScan,
    HealthAttribute,
    HistoryEntry,
    ResultReview,
)
from medilink.masterdata.models import DiagnosisCode
from medilink.masterdata.services import writer
from medilink.patients.models import Allergy
from medilink.tenancy.context import rls_context
from medilink.uploads.models import UploadedFile
from tests.conftest import error_code, login_staff
from tests.factories import FacilityFactory, make_staff
from tests.masterdata.conftest import age_recent_auth
from tests.s2.conftest import client_for
from tests.s6.conftest import S, open_consultation

pytestmark = pytest.mark.django_db(transaction=False)
P = "/api/v1/platform/break-glass/"


@pytest.fixture(autouse=True)
def local_storage(tmp_path: Any) -> Iterator[None]:
    with override_settings(
        UPLOADS={
            "storage": "local",
            "scanner": "fake",
            "local_root": str(tmp_path / "objects"),
            "download_base_url": "http://testserver/api/v1/files",
        }
    ):
        yield


def clean_upload(user: Any, purpose: str = "clinical_document") -> UploadedFile:
    return UploadedFile.objects.create(
        purpose=purpose,
        owner_kind="patient",
        data_class="C3",
        storage_bucket="documents",
        storage_key=uuid.uuid4(),
        original_sha256="0" * 64,
        sha256="0" * 64,
        size_bytes=1024,
        content_type="application/pdf",
        original_filename="result.pdf",
        scan_status="clean",
        uploaded_by=user,
        uploaded_via="staff",
        idempotency_scope=f"user:{user.pk}",
    )


def _scan(client: APIClient, user: Any, record: Any, **extra: Any) -> Any:
    body = {
        "upload_id": str(clean_upload(user).pk),
        "document_type": "outside_result",
        "document_date": str(timezone.localdate() - dt.timedelta(days=3)),
        "description": "Full blood count",
        **extra,
    }
    return client.post(f"{S}clinical/patients/{record.pk}/scans/", body, format="json")


def _actions(facility: Any) -> list[str]:
    return list(AuditEntry.objects.filter(facility_id=facility.pk).values_list("action", flat=True))


# ---- S6-B18 results inbox and S6-B20 scans --------------------------------------------------------


def test_outside_result_goes_to_the_uploading_doctor_and_is_reviewed(
    clinic: Any,
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    doctor2: tuple[APIClient, Any],
) -> None:
    record = visit["record"]
    created = _scan(doctor[0], doctor[1], record)
    assert created.status_code == 201, created.content
    scan = created.json()
    assert scan["review_id"] and scan["document_type"] == "outside_result"

    inbox = doctor[0].get(f"{S}results-inbox/").json()
    assert inbox["count"] == 1
    item = inbox["results"][0]
    assert item["scan"]["id"] == scan["id"] and item["status"] == "pending"
    assert doctor2[0].get(f"{S}results-inbox/").json()["count"] == 0

    other = doctor2[0].post(
        f"{S}results-inbox/{item['id']}/review/", {"version": item["version"]}, format="json"
    )
    assert other.status_code == 422
    stale = doctor[0].post(
        f"{S}results-inbox/{item['id']}/review/", {"version": item["version"] + 1}, format="json"
    )
    assert stale.status_code == 409
    done = doctor[0].post(
        f"{S}results-inbox/{item['id']}/review/",
        {"version": item["version"], "comment": "Haemoglobin low, repeat in 4 weeks"},
        format="json",
    )
    assert done.status_code == 200, done.content
    assert done.json()["status"] == "reviewed"
    assert done.json()["comment"] == "Haemoglobin low, repeat in 4 weeks"
    again = doctor[0].post(
        f"{S}results-inbox/{item['id']}/review/",
        {"version": done.json()["version"]},
        format="json",
    )
    assert again.status_code == 422
    assert doctor[0].get(f"{S}results-inbox/").json()["count"] == 0
    assert doctor[0].get(f"{S}results-inbox/?status=reviewed").json()["count"] == 1
    with rls_context(facility_id=clinic.pk):
        raw = ResultReview.objects.get(pk=item["id"])
        assert b"Haemoglobin" not in bytes(raw.comment_enc)
        with pytest.raises(DatabaseError), transaction.atomic():
            ResultReview.objects.filter(pk=item["id"]).update(status="pending")
        with pytest.raises(DatabaseError), transaction.atomic():
            ClinicalScan.objects.filter(pk=scan["id"]).delete()
    assert "clinical.result.reviewed" in _actions(clinic)


def test_result_uploaded_by_reception_goes_to_the_last_doctor(
    clinic: Any,
    visit: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
) -> None:
    record = visit["record"]
    nobody = _scan(desk[0], desk[1], record)
    assert nobody.status_code == 422  # no consultation yet: no reviewer
    assert open_consultation(doctor[0], visit["visit_id"]).status_code == 201
    created = _scan(desk[0], desk[1], record)
    assert created.status_code == 201
    assert doctor[0].get(f"{S}results-inbox/").json()["count"] == 1
    scan_only = _scan(desk[0], desk[1], record, document_type="legacy_record")
    assert scan_only.status_code == 201 and scan_only.json()["review_id"] is None


def test_scan_rules_timeline_and_audited_download(
    clinic: Any, visit: dict[str, Any], doctor: tuple[APIClient, Any], pharmacist: Any
) -> None:
    record = visit["record"]
    client = doctor[0]
    future = _scan(
        client, doctor[1], record, document_date=str(timezone.localdate() + dt.timedelta(days=1))
    )
    assert future.status_code == 422
    unknown = client.post(
        f"{S}clinical/patients/{record.pk}/scans/",
        {"upload_id": str(uuid.uuid4()), "document_type": "other", "document_date": "2020-01-01"},
        format="json",
    )
    assert unknown.status_code == 422
    others = clean_upload(make_staff(clinic, roles=("doctor",), email="other-up@example.test"))
    not_mine = client.post(
        f"{S}clinical/patients/{record.pk}/scans/",
        {"upload_id": str(others.pk), "document_type": "other", "document_date": "2020-01-01"},
        format="json",
    )
    assert not_mine.status_code == 422
    scan = _scan(
        client, doctor[1], record, document_type="legacy_record", document_date="2019-05-02"
    ).json()
    listing = client.get(f"{S}clinical/patients/{record.pk}/scans/").json()
    assert [s["id"] for s in listing] == [scan["id"]]
    timeline = client.get(f"{S}clinical/patients/{record.pk}/history/?type=scan").json()
    assert timeline["results"][0]["scan"]["document_type"] == "legacy_record"
    assert timeline["results"][0]["visit_id"] is None
    link = client.post(f"{S}clinical/scans/{scan['id']}/download-link/")
    assert link.status_code == 200 and link.json()["url"]
    assert "clinical.scan.downloaded" in _actions(clinic)
    assert pharmacist[0].post(f"{S}clinical/scans/{scan['id']}/download-link/").status_code == 403
    outsider = client_for(FacilityFactory(slug="other-scan"), ("doctor",), "far-doc@example.test")[
        0
    ]
    assert outsider.post(f"{S}clinical/scans/{scan['id']}/download-link/").status_code == 404


# ---- S6-B20 back-entry --------------------------------------------------------------------------


def test_history_back_entry_labelled_historical(
    clinic: Any, visit: dict[str, Any], doctor: tuple[APIClient, Any], desk: tuple[APIClient, Any]
) -> None:
    with writer():
        DiagnosisCode.objects.get_or_create(
            code="E11.9", defaults={"title_i18n": {"en": "Type 2 diabetes"}}
        )
    record = visit["record"]
    url = f"{S}clinical/patients/{record.pk}/history-entries/"
    client = doctor[0]
    no_code = client.post(url, {"kind": "diagnosis", "code": "ZZZ"}, format="json")
    assert no_code.status_code == 422
    future = client.post(
        url,
        {
            "kind": "condition",
            "display": "Asthma",
            "occurred_on": str(timezone.localdate() + dt.timedelta(days=2)),
        },
        format="json",
    )
    assert future.status_code == 422
    empty = client.post(url, {"kind": "condition"}, format="json")
    assert empty.status_code == 422
    dx = client.post(
        url,
        {
            "kind": "diagnosis",
            "code": "e11.9",
            "occurred_on": "2018-03-01",
            "note": "From paper file 112",
        },
        format="json",
    )
    assert dx.status_code == 201, dx.content
    assert dx.json()["display"].startswith("Type 2 diabetes") and dx.json()["is_historical"] is True
    allergy = client.post(url, {"kind": "allergy", "display": "Penicillin"}, format="json")
    assert allergy.status_code == 201
    assert Allergy.objects.filter(patient=record.patient, substance_text="Penicillin").exists()
    assert (
        desk[0].post(url, {"kind": "condition", "display": "Asthma"}, format="json").status_code
        == 403
    )
    rows = client.get(url).json()
    assert {r["kind"] for r in rows} == {"diagnosis", "allergy"}
    timeline = client.get(f"{S}clinical/patients/{record.pk}/history/?type=legacy").json()[
        "results"
    ]
    assert {i["legacy"]["entry_kind"] for i in timeline} == {"diagnosis", "allergy"}
    by_code = client.get(f"{S}clinical/patients/{record.pk}/history/?code=E11").json()["results"]
    assert [i["kind"] for i in by_code] == ["legacy"]
    assert client.get(f"{S}clinical/patients/{record.pk}/history/?type=nope").status_code == 400
    with rls_context(facility_id=clinic.pk):
        with pytest.raises(DatabaseError), transaction.atomic():
            HistoryEntry.objects.filter(pk=dx.json()["id"]).update(display="x")
        assert b"paper file" not in bytes(HistoryEntry.objects.get(pk=dx.json()["id"]).note_enc)
    assert "clinical.history_entry.added" in _actions(clinic)


def test_back_entry_can_cite_its_scan(visit: dict[str, Any], doctor: tuple[APIClient, Any]) -> None:
    record = visit["record"]
    scan = _scan(doctor[0], doctor[1], record, document_type="legacy_record").json()
    url = f"{S}clinical/patients/{record.pk}/history-entries/"
    ok = doctor[0].post(
        url,
        {"kind": "procedure", "display": "Appendectomy", "source_scan_id": scan["id"]},
        format="json",
    )
    assert ok.status_code == 201 and ok.json()["source_scan_id"] == scan["id"]
    bad = doctor[0].post(
        url,
        {"kind": "procedure", "display": "X", "source_scan_id": str(uuid.uuid4())},
        format="json",
    )
    assert bad.status_code == 422


# ---- health attributes --------------------------------------------------------------------------


def test_blood_group_and_pregnancy_flag(
    visit: dict[str, Any], doctor: tuple[APIClient, Any], desk: tuple[APIClient, Any]
) -> None:
    record = visit["record"]
    url = f"{S}clinical/patients/{record.pk}/health-attributes/"
    client = doctor[0]
    assert client.get(url).json() == {"blood_group": None, "pregnancy": None}
    assert (
        client.post(url, {"kind": "blood_group", "value": "pregnant"}, format="json").status_code
        == 422
    )
    assert (
        client.post(url, {"kind": "pregnancy", "value": "pregnant"}, format="json").status_code
        == 422
    )
    client.post(url, {"kind": "blood_group", "value": "O+"}, format="json")
    due = timezone.localdate() + dt.timedelta(days=120)
    body = client.post(
        url, {"kind": "pregnancy", "value": "pregnant", "due_date": str(due)}, format="json"
    ).json()
    assert body["blood_group"] == "O+" and body["pregnancy"]["is_active"] is True
    consultation = open_consultation(client, visit["visit_id"]).json()
    assert consultation["health_attributes"]["pregnancy"]["status"] == "pregnant"
    summary = client.get(f"{S}clinical/patients/{record.pk}/problem-summary/").json()
    assert summary["health_attributes"]["blood_group"] == "O+"
    later = client.post(url, {"kind": "pregnancy", "value": "not_pregnant"}, format="json").json()
    assert later["pregnancy"]["is_active"] is False and later["pregnancy"]["due_date"] is None
    assert (
        desk[0].post(url, {"kind": "blood_group", "value": "A+"}, format="json").status_code == 403
    )
    with pytest.raises(DatabaseError), transaction.atomic():
        HealthAttribute.objects.filter(patient=record.patient).update(value="B+")


# ---- S6-B21 break-glass -------------------------------------------------------------------------


@pytest.fixture
def admins(db: Any) -> tuple[tuple[APIClient, Any], tuple[APIClient, Any]]:
    out = []
    for email in ("bg-one@example.test", "bg-two@example.test"):
        user = make_staff(None, email=email, is_platform_admin=True)
        client = APIClient()
        login_staff(client, user)
        out.append((client, user))
    return out[0], out[1]


REASON = "Patient unconscious in emergency, family requests the allergy list"


def test_break_glass_open_read_review(
    clinic: Any,
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    admins: Any,
) -> None:
    (first, first_user), (second, _second_user) = admins
    record = visit["record"]
    open_consultation(doctor[0], visit["visit_id"])
    body = {
        "patient_id": str(record.patient_id),
        "facility_id": str(clinic.pk),
        "reason_code": "patient_safety",
        "reason_text": REASON,
    }
    assert doctor[0].post(P, body, format="json").status_code == 403
    short = first.post(P, {**body, "reason_text": "urgent"}, format="json")
    assert short.status_code == 400
    elsewhere = first.post(
        P, {**body, "facility_id": str(FacilityFactory(slug="bg-x").pk)}, format="json"
    )
    assert elsewhere.status_code == 422
    age_recent_auth(first)
    assert error_code(first.post(P, body, format="json")) == "step_up_required"
    first = APIClient()
    login_staff(first, first_user)
    opened = first.post(P, body, format="json")
    assert opened.status_code == 201, opened.content
    session = opened.json()
    assert session["is_open"] is True
    assert first.post(P, body, format="json").status_code == 409

    url = f"{P}{session['id']}/patients/{record.patient_id}/history/"
    read = first.get(url)
    assert read.status_code == 200, read.content
    assert read.json()["patient"]["id"] == str(record.patient_id)
    assert second.get(url).status_code == 422  # someone else's session
    assert first.get(f"{P}{session['id']}/patients/{uuid.uuid4()}/history/").status_code == 422
    actions = list(
        AuditEntry.objects.filter(action__startswith="authz.break_glass").values_list(
            "action", flat=True
        )
    )
    assert {"authz.break_glass.opened", "authz.break_glass.viewed"} <= set(actions)

    own = first.post(f"{P}{session['id']}/review/", {"outcome": "appropriate"}, format="json")
    assert own.status_code == 422
    assert second.post(f"{P}{session['id']}/end/").status_code == 422
    ended = first.post(f"{P}{session['id']}/end/")
    assert ended.status_code == 200 and ended.json()["is_open"] is False
    assert first.get(url).status_code == 422
    assert first.post(f"{P}{session['id']}/end/").status_code == 422
    waiting = second.get(f"{P}?needs_review=true").json()
    assert [s["id"] for s in waiting["results"]] == [session["id"]]
    reviewed = second.post(
        f"{P}{session['id']}/review/",
        {"outcome": "appropriate", "note": "Matches the ER log"},
        format="json",
    )
    assert reviewed.status_code == 200 and reviewed.json()["review_outcome"] == "appropriate"
    assert (
        second.post(
            f"{P}{session['id']}/review/", {"outcome": "inappropriate"}, format="json"
        ).status_code
        == 422
    )
    assert second.get(f"{P}?needs_review=true").json()["count"] == 0
    assert (
        first.post(
            f"{P}{uuid.uuid4()}/review/", {"outcome": "appropriate"}, format="json"
        ).status_code
        == 404
    )
    assert first.post(f"{P}{uuid.uuid4()}/end/").status_code == 404
    with pytest.raises(DatabaseError), transaction.atomic():
        BreakGlassSession.objects.filter(pk=session["id"]).update(reason_text="changed")
    with pytest.raises(DatabaseError), transaction.atomic():
        BreakGlassSession.objects.filter(pk=session["id"]).delete()


def test_break_glass_window_expires_and_reminder(
    clinic: Any, visit: dict[str, Any], admins: Any
) -> None:
    from medilink.notifications.models import Notification

    (_first, first_user), _ = admins
    record = visit["record"]
    session = break_glass.open_session(
        user=first_user,
        patient_id=record.patient_id,
        facility_id=clinic.pk,
        reason_code="incident",
        reason_text=REASON,
        request=None,
    )
    later = timezone.now() + dt.timedelta(minutes=61)
    assert break_glass.is_open(session, later) is False
    assert break_glass.remind_reviews(now=later) == 1
    assert Notification.objects.filter(event_type="authz.break_glass.review_due").exists()
    assert break_glass.remind_reviews(now=timezone.now()) == 0
    from medilink.clinical import tasks

    assert tasks.break_glass_review_reminder() == 0
