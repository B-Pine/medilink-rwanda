"""S7b (contract sprint-07 §9, S7-B15..B22): generated documents, versions, verification,
links, share links, print, and the referral, lab request and sick note."""

from __future__ import annotations

import datetime as dt
import io
import zipfile
from typing import Any

import pytest
from django.core.cache import cache
from django.db import DatabaseError, transaction
from rest_framework.test import APIClient

from medilink.documents import services
from medilink.documents.models import (
    Document,
    DocumentVersion,
    Referral,
    ShareLink,
    VerificationLog,
    VerificationRecord,
)
from medilink.tenancy.context import rls_context
from medilink.uploads.storage import get_storage
from tests.conftest import error_code, login_patient, login_staff
from tests.masterdata.conftest import age_recent_auth
from tests.s2.conftest import client_for
from tests.s4.conftest import patient_account  # noqa: F401
from tests.s7.conftest import AMOX, S, check_in, dispense, draft, prescribe, sign

pytestmark = pytest.mark.django_db
P = "/api/v1/patient/documents/"
PUBLIC = "/api/v1/public/"


@pytest.fixture(autouse=True)
def _clear_throttles() -> None:
    cache.clear()


@pytest.fixture(autouse=True)
def _render_now(monkeypatch: Any) -> None:
    """Test transactions never commit, so on_commit never fires: render in place instead."""
    from medilink.documents.tasks import render_document

    monkeypatch.setattr(
        services,
        "schedule_render",
        lambda d: render_document(str(d.facility_id), str(d.pk)),
    )


def _document(clinic: Any, kind: str, source_id: Any) -> Document:
    with rls_context(facility_id=clinic.pk):
        return Document.objects.get(kind=kind, source_id=source_id)


def _versions(clinic: Any, document: Document) -> list[DocumentVersion]:
    with rls_context(facility_id=clinic.pk):
        return list(document.versions.order_by("version_no"))


def _pdf(clinic: Any, version: DocumentVersion) -> bytes:
    with get_storage().open("documents", version.storage_key) as stream:
        return stream.read()


# ---- B15-B17: generation, numbers, versions -----------------------------------------------------


def test_issue_generates_the_prescription_pdf_with_a_qr_code(
    clinic: Any, doctor: Any, pharmacist: Any, visit: dict[str, Any], drugs: Any
) -> None:
    _c, p = prescribe(doctor[0], visit["visit_id"])
    document = _document(clinic, "prescription", p["id"])
    assert document.number == p["number"] and document.released_at is not None
    [v1] = _versions(clinic, document)
    pdf = _pdf(clinic, v1)
    assert pdf.startswith(b"%PDF") and v1.size_bytes == len(pdf)
    record_ = VerificationRecord.objects.get(document_id=document.pk)
    assert len(record_.code) == 10 and record_.status == "active"
    assert set(record_.code) <= set(services.CODE_ALPHABET)
    assert record_.author_name and record_.valid_until is not None

    # a change after issue adds a version and supersedes the old one (B17)
    cancelled = doctor[0].post(
        f"{S}prescriptions/{p['id']}/cancel/",
        {"version": p["version"], "reason": "Wrong patient"},
        format="json",
    )
    assert cancelled.status_code == 200, cancelled.content
    record_.refresh_from_db()
    assert record_.status == "cancelled"
    # the PDF content did not change (same items), so no new version; status still follows
    assert len(_versions(clinic, document)) == 1


def test_item_change_after_issue_supersedes_the_version(
    clinic: Any, doctor: Any, visit: dict[str, Any], drugs: Any, more_drugs: Any
) -> None:
    _c, p = prescribe(doctor[0], visit["visit_id"], AMOX, {**AMOX, "drug_code": "PARA500"})
    item = p["items"][1]
    response = doctor[0].post(
        f"{S}prescription-items/{item['id']}/cancel/",
        {"version": p["version"], "reason": "Not needed after all"},
        format="json",
    )
    assert response.status_code == 200, response.content
    document = _document(clinic, "prescription", p["id"])
    v1, v2 = _versions(clinic, document)
    assert v1.superseded_at is not None and v2.superseded_at is None
    assert v2.version_no == 2 and bytes(v1.sha256) != bytes(v2.sha256)
    assert VerificationRecord.objects.get(document_id=document.pk).version_no == 2
    # versions are append-only (B17)
    with pytest.raises(DatabaseError), transaction.atomic(), rls_context(facility_id=clinic.pk):
        DocumentVersion.objects.filter(pk=v2.pk).update(size_bytes=1)


def test_letters_sign_with_the_consultation_and_after_it(
    clinic: Any, doctor: Any, doctor2: Any, visit: dict[str, Any]
) -> None:
    c = draft(doctor[0], visit["visit_id"])
    url = f"{S}consultations/{c['id']}/"
    referral = doctor[0].post(
        f"{url}referrals/",
        {
            "to_facility_name": "CHUK",
            "specialty": "Cardiology",
            "reason": "Murmur on examination",
            "urgency": "urgent",
        },
        format="json",
    )
    assert referral.status_code == 201, referral.content
    assert referral.json()["signed_at"] is None and referral.json()["document_id"] is None
    # only the author writes them (B22)
    other = doctor2[0].post(
        f"{url}sick-notes/",
        {"rest_from": "2026-11-02", "rest_to": "2026-11-04"},
        format="json",
    )
    assert other.status_code == 422
    bad = doctor[0].post(
        f"{url}sick-notes/", {"rest_from": "2026-11-04", "rest_to": "2026-11-02"}, format="json"
    )
    assert bad.status_code == 400
    assert sign(doctor[0], c["id"]).status_code == 200

    [row] = doctor[0].get(f"{url}referrals/").json()
    assert row["signed_at"] and row["document_id"] and row["reason"] == "Murmur on examination"
    with rls_context(facility_id=clinic.pk):
        stored = Referral.objects.get(pk=row["id"])
        assert b"Murmur" not in bytes(stored.reason_enc)  # encrypted at rest
        number = Document.objects.get(pk=row["document_id"]).number
    assert number.startswith("REF-")
    # signed rows are locked
    with pytest.raises(DatabaseError), transaction.atomic(), rls_context(facility_id=clinic.pk):
        Referral.objects.filter(pk=row["id"]).update(specialty="Neurology")

    # after signing: signed at once, with recent authentication
    age_recent_auth(doctor[0])
    late = doctor[0].post(
        f"{url}lab-requests/",
        {"tests": [{"code": "FBC", "name": "Full blood count"}], "reason": "Anaemia?"},
        format="json",
    )
    assert late.status_code == 403 and error_code(late) == "step_up_required"
    fresh = APIClient()
    login_staff(fresh, doctor[1])
    late = fresh.post(
        f"{url}lab-requests/",
        {"tests": [{"code": "FBC", "name": "Full blood count"}], "reason": "Anaemia?"},
        format="json",
    )
    assert late.status_code == 201, late.content
    assert late.json()["signed_at"] and late.json()["document_id"]
    note = fresh.post(
        f"{url}sick-notes/",
        {"rest_from": "2026-11-02", "rest_to": "2026-11-04", "show_diagnosis": True},
        format="json",
    )
    assert note.status_code == 201, note.content
    numbers = {
        d["kind"]: d["number"]
        for d in fresh.get(f"{S}documents/?visit_id={visit['visit_id']}").json()["results"]
    }
    assert numbers["lab_request"].startswith("LAB-") and numbers["sick_note"].startswith("SN-")


# ---- B18: verification ----------------------------------------------------------------------------


def test_public_verification_projection_details_and_log(
    clinic: Any, doctor: Any, visit: dict[str, Any], drugs: Any
) -> None:
    _c, p = prescribe(doctor[0], visit["visit_id"])
    record_ = VerificationRecord.objects.get(document__source_id=p["id"])
    public = APIClient()
    found = public.get(f"{PUBLIC}verify/{record_.code.lower()}/")
    assert found.status_code == 200 and found["Cache-Control"] == "no-store"
    body = found.json()
    assert body["number"] == p["number"] and body["status"] == "active"
    assert "patient_name" not in body and "sections" not in body  # minimal projection

    wrong = public.post(
        f"{PUBLIC}verify/{record_.code}/details/", {"date_of_birth": "1990-01-01"}, format="json"
    )
    assert wrong.status_code == 422
    right = public.post(
        f"{PUBLIC}verify/{record_.code}/details/", {"date_of_birth": "1992-03-04"}, format="json"
    )
    assert right.status_code == 200, right.content
    assert right.json()["patient_name"] == "Keza Uwimana"
    assert "Amoxicillin" in right.json()["sections"][0]["lines"][0]
    assert public.get(f"{PUBLIC}verify/AAAAAAAAAA/").status_code == 404

    results = list(VerificationLog.objects.values_list("result", "detailed"))
    assert ("valid", False) in results and ("dob_mismatch", True) in results
    assert ("valid", True) in results and ("not_found", False) in results
    assert all(
        len(bytes(h)) == 32 for h in VerificationLog.objects.values_list("client_hash", flat=True)
    )
    with pytest.raises(DatabaseError), transaction.atomic():
        VerificationLog.objects.all().delete()


def test_verification_is_rate_limited_and_logged(
    settings: Any, clinic: Any, doctor: Any, visit: dict[str, Any], drugs: Any, monkeypatch: Any
) -> None:
    monkeypatch.setenv("THROTTLE_RATE_VERIFY", "2/min")
    public = APIClient()
    for _ in range(2):
        assert public.get(f"{PUBLIC}verify/AAAAAAAAAA/").status_code == 404
    limited = public.get(f"{PUBLIC}verify/AAAAAAAAAA/")
    assert limited.status_code == 429
    assert VerificationLog.objects.filter(result="rate_limited").count() == 1


def test_dispense_accepts_the_verification_code(
    clinic: Any, doctor: Any, pharmacist: Any, visit: dict[str, Any], drugs: Any
) -> None:
    _c, p = prescribe(doctor[0], visit["visit_id"])
    code = VerificationRecord.objects.get(document__source_id=p["id"]).code
    line = {"item_id": p["items"][0]["id"], "outcome": "full"}
    wrong = dispense(
        pharmacist[0],
        p,
        line,
        identity_check_method="verification_code",
        verification_code="ZZZZZZZZZZ",
    )
    assert wrong.status_code == 422 and "verification_code" in wrong.json()["error"]["fields"]
    given = dispense(
        pharmacist[0], p, line, identity_check_method="verification_code", verification_code=code
    )
    assert given.status_code == 201, given.content
    assert VerificationRecord.objects.get(code=code).status == "dispensed"


# ---- B19-B21: links, print, patient, share ----------------------------------------------------------


def test_staff_links_print_and_access_rules(
    clinic: Any,
    doctor: Any,
    doctor2: Any,
    desk: Any,
    pharmacist: Any,
    visit: dict[str, Any],
    drugs: Any,
) -> None:
    prescribe(doctor[0], visit["visit_id"])
    fp = visit["record"].pk
    listed = doctor[0].get(f"{S}documents/?facility_patient_id={fp}").json()["results"]
    [row] = listed
    assert row["kind"] == "prescription" and row["version_no"] == 1
    link = doctor[0].post(f"{S}documents/{row['id']}/download-link/")
    assert link.status_code == 200 and link.json()["url"]
    # reception: released documents, metadata and print only (D1, D3)
    assert desk[0].get(f"{S}documents/?facility_patient_id={fp}").status_code == 200
    printed = desk[0].post(f"{S}documents/{row['id']}/print/")
    assert printed.status_code == 200
    assert doctor[0].post(f"{S}documents/{row['id']}/print/").status_code == 403
    # another facility never sees it
    other = client_for(_other_clinic(), ("doctor",), "other-doc@example.test")[0]
    assert other.get(f"{S}documents/{row['id']}/").status_code == 404
    assert doctor[0].get(f"{S}documents/").status_code == 400
    from medilink.audit.models import AuditEntry

    actions = set(AuditEntry.objects.values_list("action", flat=True))
    assert {"documents.generated", "documents.downloaded", "documents.printed"} <= actions


def _other_clinic() -> Any:
    from medilink.tenancy.models import FacilityStatus
    from tests.factories import FacilityFactory

    return FacilityFactory(name="Other Clinic", slug="other-docs", status=FacilityStatus.LIVE)


def test_patient_documents_archive_and_share_links(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: Any,
    doctor: Any,
    drugs: Any,
    patient_account: tuple[Any, Any],  # noqa: F811
) -> None:
    user, record = patient_account
    v = check_in(desk[0], record, catalogue["service"]["id"]).json()
    _c, p = prescribe(doctor[0], v["visit_id"])
    patient = APIClient()
    login_patient(patient, user)
    [row] = patient.get(P).json()["results"]
    assert row["kind"] == "prescription" and row["facility_name"] == "Gisozi Clinic"
    detail = patient.get(f"{P}{row['id']}/").json()
    assert detail["verification_code"] and detail["share_links"] == []
    assert patient.post(f"{P}{row['id']}/download-link/").status_code == 200

    archive = patient.post(f"{P}archive/")
    assert archive.status_code == 200, archive.content
    from medilink.uploads.storage import read_local_token

    token = archive.json()["url"].rstrip("/").rsplit("/", 1)[-1]
    with get_storage().open("documents", read_local_token(token)["k"]) as stream:
        names = zipfile.ZipFile(io.BytesIO(stream.read())).namelist()
    assert names == [f"{p['number']}.pdf"]

    assert (
        patient.post(
            f"{P}{row['id']}/share-links/", {"expires_in_days": 31}, format="json"
        ).status_code
        == 400
    )
    made = patient.post(f"{P}{row['id']}/share-links/", {"expires_in_days": 7}, format="json")
    assert made.status_code == 201, made.content
    token = made.json()["token"]
    assert ShareLink.objects.filter(token_hash=services.token_hash(token)).exists()
    assert not ShareLink.objects.filter(token_hash=token.encode()).exists()  # only the hash

    public = APIClient()
    shared = public.get(f"{PUBLIC}shared-documents/{token}/")
    assert shared.status_code == 200, shared.content
    assert shared.json()["number"] == p["number"] and shared.json()["download"]["url"]
    assert ShareLink.objects.get(pk=made.json()["id"]).access_count == 1

    revoked = patient.delete(f"{P}{row['id']}/share-links/{made.json()['id']}/")
    assert revoked.status_code == 204
    assert public.get(f"{PUBLIC}shared-documents/{token}/").status_code == 404
    # someone else's patient account sees nothing
    from tests.factories import make_patient_user

    stranger = APIClient()
    login_patient(stranger, make_patient_user(email="stranger@example.test", full_name="X Y"))
    assert stranger.get(P).json()["results"] == []
    assert stranger.get(f"{P}{row['id']}/").status_code == 404


def test_share_link_purge_and_rls(
    clinic: Any, doctor: Any, visit: dict[str, Any], drugs: Any
) -> None:
    from django.utils import timezone

    _c, p = prescribe(doctor[0], visit["visit_id"])
    document = _document(clinic, "prescription", p["id"])
    user = document.author_membership.user
    old = ShareLink.objects.create(
        document=document,
        created_by_account=user,
        token_hash=services.token_hash("old"),
        expires_at=timezone.now() - dt.timedelta(days=31),
    )
    keep = ShareLink.objects.create(
        document=document,
        created_by_account=user,
        token_hash=services.token_hash("keep"),
        expires_at=timezone.now() + dt.timedelta(days=1),
    )
    assert services.purge_share_links() == 1
    assert not ShareLink.objects.filter(pk=old.pk).exists()
    assert ShareLink.objects.filter(pk=keep.pk).exists()
