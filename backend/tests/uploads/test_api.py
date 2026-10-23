"""Upload endpoints end to end: S1-B8, S1-B10, S1-B11, S1-B18 (uploads part)."""

from __future__ import annotations

import io
import time
from datetime import timedelta
from typing import Any
from unittest import mock

import pytest
from django.core import signing
from django.utils import timezone
from rest_framework.test import APIClient

from medilink.audit.models import AuditEntry
from medilink.tenancy.context import rls_context
from medilink.uploads import services
from medilink.uploads.models import ScanStatus, UploadedFile
from medilink.uploads.scanner import EICAR, ScanVerdict
from medilink.uploads.tasks import purge_files
from tests.conftest import error_code, login_patient, login_staff
from tests.factories import make_patient_user, make_staff
from tests.uploads.conftest import (
    READERS,
    TEST_CSV_PURPOSE,
    TEST_PURPOSE,
    make_jpeg_with_gps,
    make_pdf,
    make_png,
    upload_file,
)

STAFF = "/api/v1/staff/uploads/"
PATIENT = "/api/v1/patient/uploads/"


def post_upload(
    client: APIClient,
    base: str,
    name: str,
    data: bytes,
    purpose: str = TEST_PURPOSE,
    capture: Any = None,
    **extra: Any,
) -> Any:
    payload = {"file": upload_file(name, data), "purpose": purpose, **extra.pop("fields", {})}
    if capture is None:
        return client.post(base, payload, format="multipart", **extra)
    with capture(execute=True):
        return client.post(base, payload, format="multipart", **extra)


def get_file(file_id: str) -> UploadedFile:
    with rls_context():
        return UploadedFile.objects.get(pk=file_id)


# ---- S1-B8: controls through the API ----------------------------------------------------------


@pytest.mark.acceptance("S1-B8")
@pytest.mark.parametrize(
    ("name", "maker", "stored_type"),
    [
        ("licence.pdf", make_pdf, "application/pdf"),
        ("photo.jpg", make_jpeg_with_gps, "image/jpeg"),
        ("scan.png", make_png, "image/png"),
        ("no-extension", make_pdf, "application/pdf"),  # content decides, not the name
    ],
)
def test_accepted_by_content_and_scanned_clean(
    staff_client: APIClient,
    django_capture_on_commit_callbacks: Any,
    name: str,
    maker: Any,
    stored_type: str,
) -> None:
    response = post_upload(
        staff_client, STAFF, name, maker(), capture=django_capture_on_commit_callbacks
    )
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["status"] == "pending"
    file = get_file(body["id"])
    assert file.scan_status == ScanStatus.CLEAN
    assert file.storage_bucket == "documents"
    assert file.content_type == stored_type
    polled = staff_client.get(f"{STAFF}{body['id']}/").json()
    assert polled["status"] == "clean"
    assert polled["is_attached"] is False


@pytest.mark.acceptance("S1-B8")
@pytest.mark.parametrize(
    ("name", "data"),
    [
        ("logo.svg", b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"),
        ("page.html", b"<!doctype html><script>alert(1)</script>"),
        ("archive.zip", b"PK\x03\x04" + b"\x00" * 100),
        ("letter.docx", b"PK\x03\x04\x14\x00\x06\x00" + b"\x00" * 100),
        ("fake.pdf", b"<html><body>not a pdf</body></html>"),
        ("data.csv", b"code,name\nA,B\n"),  # CSV only for CSV purposes
    ],
)
def test_refused_types_store_nothing(
    staff_client: APIClient, upload_settings: Any, name: str, data: bytes
) -> None:
    response = post_upload(staff_client, STAFF, name, data)
    assert response.status_code == 400
    assert "file" in response.json()["error"]["fields"]
    with rls_context():
        assert not UploadedFile.objects.exists()
    assert not upload_settings.exists() or not any(upload_settings.rglob("*.*"))


@pytest.mark.acceptance("S1-B8")
def test_size_limit(staff_client: APIClient, settings: Any, tmp_path: Any) -> None:
    settings.UPLOADS = {**settings.UPLOADS, "max_bytes": 1024}
    response = post_upload(staff_client, STAFF, "big.pdf", make_pdf() + b"\n%" + b"x" * 2048)
    assert response.status_code == 400
    assert response.json()["error"]["fields"]["file"]


def test_csv_purpose(staff_client: APIClient, django_capture_on_commit_callbacks: Any) -> None:
    ok = post_upload(
        staff_client,
        STAFF,
        "drugs.csv",
        b"code,generic_name\nAMOX500C,Amoxicillin\n",
        purpose=TEST_CSV_PURPOSE,
        capture=django_capture_on_commit_callbacks,
    )
    assert ok.status_code == 201
    assert get_file(ok.json()["id"]).scan_status == ScanStatus.CLEAN
    bad = post_upload(staff_client, STAFF, "x.csv", b"a,b\x00\n", purpose=TEST_CSV_PURPOSE)
    assert bad.status_code == 400
    pdf = post_upload(staff_client, STAFF, "x.csv", make_pdf(), purpose=TEST_CSV_PURPOSE)
    assert pdf.status_code == 400


@pytest.mark.acceptance("S1-B8")
def test_quarantine_key_is_a_uuid(staff_client: APIClient, upload_settings: Any) -> None:
    response = post_upload(staff_client, STAFF, "../../etc/passwd.pdf", make_pdf())
    assert response.status_code == 201
    file = get_file(response.json()["id"])
    assert file.storage_bucket == "quarantine"
    assert (upload_settings / "quarantine" / str(file.storage_key)).is_file()
    assert file.original_filename == "passwd.pdf"


@pytest.mark.acceptance("S1-B8")
def test_eicar_is_infected_deleted_audited_and_logged(
    staff_client: APIClient,
    django_capture_on_commit_callbacks: Any,
    upload_settings: Any,
    caplog: Any,
) -> None:
    response = post_upload(
        staff_client,
        STAFF,
        "invoice.pdf",
        b"%PDF-1.4\n" + EICAR,
        capture=django_capture_on_commit_callbacks,
    )
    assert response.status_code == 201
    file = get_file(response.json()["id"])
    assert file.scan_status == ScanStatus.INFECTED
    assert not (upload_settings / "quarantine" / str(file.storage_key)).exists()
    assert not (upload_settings / "documents" / str(file.storage_key)).exists()
    entry = AuditEntry.objects.filter(action="upload.rejected", object_id=str(file.pk)).get()
    assert entry.metadata["reason"] == "infected"
    assert any(r.name == "medilink.security" and r.levelname == "ERROR" for r in caplog.records)
    link = staff_client.post(f"{STAFF}{file.pk}/download-links/", {}, format="json")
    assert link.status_code == 422


@pytest.mark.acceptance("S1-B8")
def test_unsafe_pdf_rejected(
    staff_client: APIClient, django_capture_on_commit_callbacks: Any
) -> None:
    response = post_upload(
        staff_client,
        STAFF,
        "x.pdf",
        make_pdf(javascript=True),
        capture=django_capture_on_commit_callbacks,
    )
    body = staff_client.get(f"{STAFF}{response.json()['id']}/").json()
    assert body["status"] == "rejected"
    assert body["rejection_reason"] == "unsafe_pdf"


@pytest.mark.acceptance("S1-B8")
def test_stored_image_has_no_gps(
    staff_client: APIClient, django_capture_on_commit_callbacks: Any, upload_settings: Any
) -> None:
    from PIL import Image

    response = post_upload(
        staff_client,
        STAFF,
        "photo.jpg",
        make_jpeg_with_gps(),
        capture=django_capture_on_commit_callbacks,
    )
    file = get_file(response.json()["id"])
    stored = (upload_settings / "documents" / str(file.storage_key)).read_bytes()
    assert not Image.open(io.BytesIO(stored)).getexif()
    assert file.sha256 != file.original_sha256


@pytest.mark.acceptance("S1-B8")
def test_no_download_before_clean(staff_client: APIClient) -> None:
    response = post_upload(staff_client, STAFF, "x.pdf", make_pdf())  # scan not run (no commit)
    link = staff_client.post(f"{STAFF}{response.json()['id']}/download-links/", {}, format="json")
    assert link.status_code == 422
    assert error_code(link) == "business_rule_violation"


def test_scanner_errors_retry_then_fail(
    staff_client: APIClient, django_capture_on_commit_callbacks: Any
) -> None:
    with (
        mock.patch(
            "medilink.uploads.services.get_scanner",
            return_value=mock.Mock(scan=mock.Mock(return_value=ScanVerdict("error", "timeout"))),
        ),
        mock.patch("medilink.uploads.tasks.scan_file.retry", side_effect=RuntimeError("retry")),
        pytest.raises(RuntimeError, match="retry"),
    ):
        post_upload(
            staff_client, STAFF, "x.pdf", make_pdf(), capture=django_capture_on_commit_callbacks
        )
    with rls_context():
        file = UploadedFile.objects.get()
    assert file.scan_status == ScanStatus.PENDING
    services.mark_failed(file)
    assert get_file(str(file.pk)).scan_status == ScanStatus.FAILED


# ---- S1-B10: signed links ---------------------------------------------------------------------


@pytest.fixture
def clean_upload(
    staff_client: APIClient, django_capture_on_commit_callbacks: Any
) -> dict[str, Any]:
    response = post_upload(
        staff_client, STAFF, "licence é.pdf", make_pdf(), capture=django_capture_on_commit_callbacks
    )
    return dict(response.json())


@pytest.mark.acceptance("S1-B10")
def test_signed_link_headers_and_audit(
    staff_client: APIClient, clean_upload: dict[str, Any]
) -> None:
    response = staff_client.post(
        f"{STAFF}{clean_upload['id']}/download-links/", {"disposition": "attachment"}, format="json"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["disposition"] == "attachment"
    url = body["url"].removeprefix("http://testserver")
    download = APIClient().get(url)
    assert download.status_code == 200
    assert b"".join(download.streaming_content).startswith(b"%PDF")
    assert download["Content-Disposition"].startswith('attachment; filename="licence .pdf"')
    assert "filename*=UTF-8''licence%20%C3%A9.pdf" in download["Content-Disposition"]
    assert download["X-Content-Type-Options"] == "nosniff"
    assert download["Content-Security-Policy"] == "sandbox; default-src 'none'"
    assert download["Cache-Control"] == "private, no-store"
    assert download["Cross-Origin-Resource-Policy"] == "same-site"
    assert download["Content-Type"] == "application/pdf"
    assert AuditEntry.objects.filter(
        action="upload.download_link_issued", object_id=clean_upload["id"]
    ).exists()


@pytest.mark.acceptance("S1-B10")
def test_expired_or_tampered_links_404(
    staff_client: APIClient, clean_upload: dict[str, Any]
) -> None:
    body = staff_client.post(
        f"{STAFF}{clean_upload['id']}/download-links/", {}, format="json"
    ).json()
    url = body["url"].removeprefix("http://testserver")
    expires = timezone.datetime.fromisoformat(body["expires_at"].replace("Z", "+00:00"))
    assert timedelta(seconds=295) < expires - timezone.now() <= timedelta(seconds=300)
    token = url.rstrip("/").rsplit("/", 1)[1]
    assert APIClient().get(f"/api/v1/files/{token[:-2]}xx/").status_code == 404
    real_time = time.time
    with mock.patch("django.core.signing.time.time", side_effect=lambda: real_time() + 301):
        assert APIClient().get(url).status_code == 404
    forged = signing.TimestampSigner(salt="other").sign_object({"b": "documents", "k": "x"})
    assert APIClient().get(f"/api/v1/files/{forged}/").status_code == 404


# ---- S1-B11: the reusable interface ----------------------------------------------------------


@pytest.mark.acceptance("S1-B11")
def test_patient_end_to_end(
    patient_client: APIClient, patient_user: Any, django_capture_on_commit_callbacks: Any
) -> None:
    response = post_upload(
        patient_client, PATIENT, "card.png", make_png(), capture=django_capture_on_commit_callbacks
    )
    assert response.status_code == 201
    file_id = response.json()["id"]
    assert patient_client.get(f"{PATIENT}{file_id}/").json()["status"] == "clean"
    with rls_context():
        file = UploadedFile.objects.get(pk=file_id)
        patient = patient_user.patient_links.get().patient
        services.attach(
            file,
            purpose=TEST_PURPOSE,
            owner_id=patient.pk,
            patient_id=patient.pk,
            actor=patient_user,
        )
    # Attached: reads go through the purpose's can_read.
    assert patient_client.get(f"{PATIENT}{file_id}/").status_code == 404
    READERS.add(patient_user.pk)
    assert patient_client.get(f"{PATIENT}{file_id}/").json()["is_attached"] is True
    assert (
        patient_client.post(f"{PATIENT}{file_id}/download-links/", {}, format="json").status_code
        == 200
    )


@pytest.mark.acceptance("S1-B11")
def test_unknown_purpose_or_wrong_audience(staff_client: APIClient, patient_user: Any) -> None:
    unknown = post_upload(staff_client, STAFF, "x.pdf", make_pdf(), purpose="nope")
    assert unknown.status_code == 400
    assert "purpose" in unknown.json()["error"]["fields"]
    client = APIClient()
    login_patient(client, patient_user)
    wrong = post_upload(client, PATIENT, "x.csv", b"a,b\n", purpose=TEST_CSV_PURPOSE)
    assert wrong.status_code == 400
    assert "purpose" in wrong.json()["error"]["fields"]


def test_can_upload_denied(staff_client: APIClient) -> None:
    response = post_upload(staff_client, STAFF, "x.pdf", make_pdf(), fields={"deny": "yes"})
    assert response.status_code == 403


@pytest.mark.acceptance("S1-B11")
def test_attach_rules(
    staff_client: APIClient, staff_user: Any, facility: Any, django_capture_on_commit_callbacks: Any
) -> None:
    pending = post_upload(staff_client, STAFF, "a.pdf", make_pdf()).json()
    clean = post_upload(
        staff_client, STAFF, "b.pdf", make_pdf(), capture=django_capture_on_commit_callbacks
    ).json()
    other = make_staff(facility, email="other@example.test")
    with rls_context():
        pending_file = UploadedFile.objects.get(pk=pending["id"])
        clean_file = UploadedFile.objects.get(pk=clean["id"])
        with pytest.raises(services.NotClean):
            services.attach(
                pending_file, purpose=TEST_PURPOSE, owner_id=staff_user.pk, actor=staff_user
            )
        with pytest.raises(services.UploadRejected):
            services.attach(clean_file, purpose=TEST_PURPOSE, owner_id=staff_user.pk, actor=other)
        with pytest.raises(services.UploadRejected):
            services.attach(
                clean_file, purpose=TEST_CSV_PURPOSE, owner_id=staff_user.pk, actor=staff_user
            )
        services.attach(clean_file, purpose=TEST_PURPOSE, owner_id=staff_user.pk, actor=staff_user)
        with pytest.raises(services.UploadRejected):
            services.attach(
                clean_file, purpose=TEST_PURPOSE, owner_id=staff_user.pk, actor=staff_user
            )


@pytest.mark.acceptance("S1-B2")
def test_someone_elses_upload_is_404(
    staff_client: APIClient, facility: Any, patient_user: Any
) -> None:
    file_id = post_upload(staff_client, STAFF, "x.pdf", make_pdf()).json()["id"]
    other = APIClient()
    login_staff(other, make_staff(facility, email="colleague@example.test"))
    assert other.get(f"{STAFF}{file_id}/").status_code == 404
    assert other.post(f"{STAFF}{file_id}/download-links/", {}, format="json").status_code == 404
    patient = APIClient()
    login_patient(patient, patient_user)
    assert patient.get(f"{PATIENT}{file_id}/").status_code == 404
    assert APIClient().get(f"{STAFF}{file_id}/").status_code == 401


def test_idempotent_upload(staff_client: APIClient) -> None:
    first = post_upload(staff_client, STAFF, "x.pdf", make_pdf(), HTTP_IDEMPOTENCY_KEY="k-1")
    again = post_upload(staff_client, STAFF, "y.pdf", make_pdf(), HTTP_IDEMPOTENCY_KEY="k-1")
    assert first.status_code == again.status_code == 201
    assert first.json()["id"] == again.json()["id"]
    with rls_context():
        assert UploadedFile.objects.count() == 1


@pytest.mark.acceptance("S1-B11")
def test_purge(
    staff_client: APIClient,
    staff_user: Any,
    django_capture_on_commit_callbacks: Any,
    upload_settings: Any,
) -> None:
    old = post_upload(
        staff_client, STAFF, "old.pdf", make_pdf(), capture=django_capture_on_commit_callbacks
    ).json()
    fresh = post_upload(
        staff_client, STAFF, "new.pdf", make_pdf(), capture=django_capture_on_commit_callbacks
    ).json()
    infected = post_upload(
        staff_client,
        STAFF,
        "bad.pdf",
        b"%PDF-1.4\n" + EICAR,
        capture=django_capture_on_commit_callbacks,
    ).json()
    kept = post_upload(
        staff_client, STAFF, "kept.pdf", make_pdf(), capture=django_capture_on_commit_callbacks
    ).json()
    with rls_context():
        UploadedFile.objects.filter(pk=old["id"]).update(
            created_at=timezone.now() - timedelta(hours=25)
        )
        UploadedFile.objects.filter(pk=infected["id"]).update(
            created_at=timezone.now() - timedelta(days=2)
        )
        services.attach(
            UploadedFile.objects.get(pk=kept["id"]),
            purpose=TEST_PURPOSE,
            owner_id=staff_user.pk,
            actor=staff_user,
        )
        UploadedFile.objects.filter(pk=kept["id"]).update(
            created_at=timezone.now() - timedelta(days=90)
        )
        old_key = UploadedFile.objects.get(pk=old["id"]).storage_key
    assert purge_files() == 1
    with rls_context():
        remaining = set(map(str, UploadedFile.objects.values_list("pk", flat=True)))
    assert remaining == {fresh["id"], infected["id"], kept["id"]}
    assert not (upload_settings / "documents" / str(old_key)).exists()
    with rls_context():
        UploadedFile.objects.filter(pk=infected["id"]).update(
            created_at=timezone.now() - timedelta(days=8)
        )
        file = UploadedFile.objects.get(pk=kept["id"])
        services.soft_delete(file, actor=staff_user)
        UploadedFile.objects.filter(pk=kept["id"]).update(
            deleted_at=timezone.now() - timedelta(days=31)
        )
    assert purge_files() == 2


@pytest.mark.acceptance("S1-B18")
def test_rls_isolates_facility_rows(facility: Any, other_facility: Any, staff_user: Any) -> None:
    with rls_context(facility_id=facility.pk):
        UploadedFile.objects.create(
            purpose=TEST_PURPOSE,
            owner_kind="facility",
            facility=facility,
            data_class="C1",
            storage_bucket="documents",
            storage_key="00000000-0000-7000-8000-000000000001",
            original_sha256="0" * 64,
            size_bytes=1,
            content_type="application/pdf",
            original_filename="a.pdf",
            uploaded_via="staff",
            idempotency_scope="user:x",
        )
    with rls_context(facility_id=other_facility.pk):
        assert not UploadedFile.objects.filter(facility=facility).exists()
    with rls_context():
        assert not UploadedFile.objects.exists()
    with rls_context(facility_id=facility.pk):
        assert UploadedFile.objects.count() == 1
    from django.db import DatabaseError

    with pytest.raises(DatabaseError), rls_context(facility_id=other_facility.pk):
        UploadedFile.objects.create(
            purpose=TEST_PURPOSE,
            owner_kind="facility",
            facility=facility,
            data_class="C1",
            storage_bucket="documents",
            storage_key="00000000-0000-7000-8000-000000000002",
            original_sha256="0" * 64,
            size_bytes=1,
            content_type="application/pdf",
            original_filename="b.pdf",
            uploaded_via="staff",
            idempotency_scope="user:x",
        )


def test_beat_schedule_has_purge() -> None:
    from config.celery import app

    assert (
        app.conf.beat_schedule["uploads.purge_files"]["task"]
        == "medilink.uploads.tasks.purge_files"
    )


def test_upload_rate_limit(staff_client: APIClient, monkeypatch: Any) -> None:
    monkeypatch.setenv("THROTTLE_RATE_UPLOAD", "2/hour")
    for _ in range(2):
        assert post_upload(staff_client, STAFF, "x.pdf", make_pdf()).status_code == 201
    assert post_upload(staff_client, STAFF, "x.pdf", make_pdf()).status_code == 429


def test_patients_cannot_read_each_others_uploads(db: Any) -> None:
    owner, intruder = (
        make_patient_user(email="p1@example.test"),
        make_patient_user(email="p2@example.test"),
    )
    a, b = APIClient(), APIClient()
    login_patient(a, owner)
    login_patient(b, intruder)
    file_id = post_upload(a, PATIENT, "card.png", make_png()).json()["id"]
    assert b.get(f"{PATIENT}{file_id}/").status_code == 404
