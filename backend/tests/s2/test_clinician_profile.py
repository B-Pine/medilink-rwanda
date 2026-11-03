"""The clinician's full professional profile (2026-11-03): profession, specialty list, licence end
date and scan, photo, sex, qualifications; the facility admin checks the scan before attesting,
may refuse with a reason; the daily job reminds before the licence ends and clears attestations
after; department and employment type per facility."""

from __future__ import annotations

import io
from datetime import timedelta
from typing import Any

import pytest
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from medilink.accounts.models import ClinicianProfile
from medilink.facilities import clinician
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import FacilityMembership
from tests.conftest import login_staff
from tests.factories import make_staff
from tests.s2.conftest import S, membership_of
from tests.uploads.conftest import make_pdf

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("local_uploads")]
UPLOADS = "/api/v1/staff/uploads/"
PROFILE = f"{S}clinician-profile/"


def _png(name: str = "me.png") -> SimpleUploadedFile:
    buffer = io.BytesIO()
    Image.new("RGB", (30, 20), (10, 120, 200)).save(buffer, format="PNG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


def _upload(client: APIClient, purpose: str, file: Any, capture: Any) -> Any:
    with capture(execute=True):
        return client.post(UPLOADS, {"purpose": purpose, "file": file}, format="multipart")


def _doctor(facility: Any, email: str = "doc.full@example.test") -> tuple[Any, APIClient]:
    doc = make_staff(facility, roles=("doctor",), email=email)
    client = APIClient()
    login_staff(client, doc)
    return doc, client


def _full_profile(client: APIClient, capture: Any, number: str = "RMDC/501") -> dict[str, Any]:
    scan = _upload(
        client, "clinician_licence", SimpleUploadedFile("licence.pdf", make_pdf()), capture
    )
    assert scan.status_code == 201, scan.content
    photo = _upload(client, "clinician_photo", _png(), capture)
    assert photo.status_code == 201, photo.content
    saved = client.patch(
        PROFILE,
        {
            "council": "rmdc",
            "licence_number": number,
            "licence_valid_until": str(timezone.localdate() + timedelta(days=365)),
            "licence_upload_id": scan.json()["id"],
            "photo_upload_id": photo.json()["id"],
            "profession": "medical_doctor",
            "specialty_code": "paediatrics",
            "sex": "female",
            "qualifications": [
                {"degree": "MBChB", "institution": "University of Rwanda", "year": 2015},
                {"degree": "MMed Paediatrics", "institution": "University of Rwanda", "year": 2020},
            ],
        },
        format="json",
    )
    assert saved.status_code == 200, saved.content
    return dict(saved.json())


def test_the_full_profile_is_saved_and_shown_to_the_admin(
    admin_client: Any, setup_facility: Any, django_capture_on_commit_callbacks: Any
) -> None:
    doc, client = _doctor(setup_facility)
    body = _full_profile(client, django_capture_on_commit_callbacks)
    assert body["specialty"] == "Paediatrics"  # the English name, for letters and pages
    assert (body["profession"], body["specialty_code"], body["sex"]) == (
        "medical_doctor",
        "paediatrics",
        "female",
    )
    assert body["licence_state"] == "valid"
    assert body["licence_file"]["original_filename"] == "licence.pdf"
    assert body["photo_file"] is not None
    assert len(body["qualifications"]) == 2
    assert client.get(PROFILE).json() == body

    member = admin_client.get(f"{S}memberships/{membership_of(doc, setup_facility).pk}/").json()
    block = member["clinician"]
    assert block["profession"] == "medical_doctor" and block["licence_state"] == "valid"
    assert block["licence_file"]["id"] == body["licence_file"]["id"]
    assert "photo_file" not in block
    # the admin may open the scan of a member's licence; another clinician may not
    link = admin_client.post(f"{UPLOADS}{block['licence_file']['id']}/download-links/", {})
    assert link.status_code == 200, link.content
    _other, other_client = _doctor(setup_facility, "doc.other@example.test")
    denied = other_client.post(f"{UPLOADS}{block['licence_file']['id']}/download-links/", {})
    assert denied.status_code == 404


def test_profile_fields_are_validated(
    setup_facility: Any, django_capture_on_commit_callbacks: Any
) -> None:
    _doc, client = _doctor(setup_facility)
    base = {"council": "rmdc", "licence_number": "RMDC/502"}
    for field, value in (
        ("licence_valid_until", str(timezone.localdate() - timedelta(days=1))),
        ("profession", "wizard"),
        ("specialty_code", "astrology"),
        ("sex", "x"),
        ("qualifications", [{"degree": "MD", "institution": "UR", "year": 1800}]),
        ("qualifications", [{"degree": "MD", "institution": "UR", "year": 2010}] * 6),
        ("licence_upload_id", "00000000-0000-0000-0000-000000000000"),
    ):
        refused = client.patch(PROFILE, {**base, field: value}, format="json")
        assert refused.status_code == 400, (field, refused.content)
    # a photo is not a licence: the upload's purpose must match
    photo = _upload(client, "clinician_photo", _png(), django_capture_on_commit_callbacks)
    wrong = client.patch(PROFILE, {**base, "licence_upload_id": photo.json()["id"]}, format="json")
    assert wrong.status_code == 400 and "licence_upload_id" in wrong.json()["error"]["fields"]
    # an image only for the photo
    pdf = _upload(
        client,
        "clinician_photo",
        SimpleUploadedFile("x.pdf", make_pdf()),
        django_capture_on_commit_callbacks,
    )
    assert pdf.status_code == 400


def test_attesting_needs_the_scan_and_a_valid_end_date(
    admin_client: Any, setup_facility: Any, django_capture_on_commit_callbacks: Any
) -> None:
    doc, client = _doctor(setup_facility)
    membership = membership_of(doc, setup_facility)
    attest = f"{S}memberships/{membership.pk}/attest-licence/"
    client.patch(PROFILE, {"council": "rmdc", "licence_number": "RMDC/503"}, format="json")
    assert admin_client.post(attest).status_code == 422  # no scan yet
    _full_profile(client, django_capture_on_commit_callbacks, number="RMDC/503")
    attested = admin_client.post(attest)
    assert attested.status_code == 200, attested.content
    assert attested.json()["clinician"]["attested_at"] is not None

    # refusing removes the attestation, tells the clinician why
    with django_capture_on_commit_callbacks(execute=True):
        refused = admin_client.post(
            f"{S}memberships/{membership.pk}/refuse-licence/",
            {"reason": "The number is not on the RMDC register."},
            format="json",
        )
    assert refused.status_code == 200, refused.content
    block = refused.json()["clinician"]
    assert block["attested_at"] is None
    assert block["refused_reason"] == "The number is not on the RMDC register."
    assert any(doc.email in m.to and "RMDC register" in m.body for m in mail.outbox)
    assert admin_client.post(f"{S}memberships/{membership.pk}/refuse-licence/").status_code == 400

    # attesting again clears the refusal; a new licence number needs a new attestation
    assert admin_client.post(attest).json()["clinician"]["refused_reason"] == ""
    client.patch(PROFILE, {"council": "rmdc", "licence_number": "RMDC/504"}, format="json")
    with rls_context(facility_id=setup_facility.pk):
        assert FacilityMembership.objects.get(pk=membership.pk).licence_attested_at is None


def test_the_daily_job_reminds_then_clears_expired_attestations(
    admin_client: Any, setup_facility: Any, django_capture_on_commit_callbacks: Any
) -> None:
    doc, client = _doctor(setup_facility)
    _full_profile(client, django_capture_on_commit_callbacks, number="RMDC/505")
    membership = membership_of(doc, setup_facility)
    assert admin_client.post(f"{S}memberships/{membership.pk}/attest-licence/").status_code == 200
    today = timezone.localdate()
    ClinicianProfile.objects.filter(user=doc).update(licence_valid_until=today + timedelta(days=45))
    mail.outbox.clear()
    with django_capture_on_commit_callbacks(execute=True):
        assert clinician.check_licences(today)["reminded"] == 1
        assert clinician.check_licences(today)["reminded"] == 0  # once per step
    assert len(mail.outbox) == 1
    assert doc.email in mail.outbox[0].to
    assert len(mail.outbox[0].to) >= 2  # and the facility admins
    with django_capture_on_commit_callbacks(execute=True):
        assert clinician.check_licences(today + timedelta(days=20))["reminded"] == 1  # 30 days
    # the day after it ends: no longer attested, the reason says why
    ClinicianProfile.objects.filter(user=doc).update(licence_valid_until=today - timedelta(days=1))
    assert clinician.check_licences(today)["expired"] == 1
    with rls_context(facility_id=setup_facility.pk):
        refreshed = FacilityMembership.objects.get(pk=membership.pk)
    assert refreshed.licence_attested_at is None
    assert refreshed.licence_refused_reason == "The licence ended."
    member = admin_client.get(f"{S}memberships/{membership.pk}/").json()
    assert member["clinician"]["licence_state"] == "expired"


def test_department_and_employment_type(admin_client: Any, setup_facility: Any) -> None:
    doc = make_staff(setup_facility, roles=("doctor",), email="doc.dept@example.test")
    membership = membership_of(doc, setup_facility)
    department = admin_client.post(
        f"{S}departments/",
        {"name_i18n": {"rw": "Abana", "en": "Paediatrics", "fr": "Pédiatrie"}},
        format="json",
    )
    assert department.status_code == 201, department.content
    url = f"{S}memberships/{membership.pk}/"
    version = admin_client.get(url).json()["version"]
    saved = admin_client.patch(
        url,
        {
            "version": version,
            "department_id": department.json()["id"],
            "employment_type": "part_time",
        },
        format="json",
    )
    assert saved.status_code == 200, saved.content
    assert saved.json()["department_id"] == department.json()["id"]
    assert saved.json()["employment_type"] == "part_time"
    wrong = admin_client.patch(
        url,
        {
            "version": saved.json()["version"],
            "department_id": "00000000-0000-0000-0000-000000000000",
        },
        format="json",
    )
    assert wrong.status_code == 400 and "department_id" in wrong.json()["error"]["fields"]
