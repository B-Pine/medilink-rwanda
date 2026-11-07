"""Patient profile photo (decision 2026-11-05): the patient adds it; their accounts and staff where
they have a record can see it."""

from __future__ import annotations

import io
from typing import Any

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from medilink.audit.models import AuditEntry
from medilink.patients import photos
from medilink.patients.models import Patient
from tests.patients.conftest import patient_client_for, staff_client_for, walk_in

pytestmark = pytest.mark.django_db

P = "/api/v1/patient/"
S = "/api/v1/staff/patients/"


def _png(name: str = "me.png") -> SimpleUploadedFile:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), (20, 120, 80)).save(buffer, format="PNG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


def test_patient_adds_sees_and_removes_their_photo(
    patient_client: Any, django_capture_on_commit_callbacks: Any
) -> None:
    pid = patient_client.get(f"{P}profiles/").json()["results"][0]["patient_id"]
    assert patient_client.get(f"{P}profiles/{pid}/").json()["has_photo"] is False
    assert patient_client.post(f"{P}profiles/{pid}/photo/download-links/").status_code == 404

    with django_capture_on_commit_callbacks(execute=True):
        added = patient_client.post(
            f"{P}profiles/{pid}/photo/", {"file": _png()}, format="multipart"
        )
    assert added.status_code == 201, added.content
    assert added.json()["has_photo"] is True
    link = patient_client.post(f"{P}profiles/{pid}/photo/download-links/")
    assert link.status_code == 200, link.content
    assert link.json()["url"].startswith("http://testserver/api/v1/files/")
    assert AuditEntry.objects.filter(action="patients.photo.updated").count() == 1

    removed = patient_client.delete(f"{P}profiles/{pid}/photo/")
    assert removed.status_code == 200
    assert removed.json()["has_photo"] is False
    assert AuditEntry.objects.filter(action="patients.photo.removed").count() == 1


def test_photo_must_be_an_image(patient_client: Any) -> None:
    pid = patient_client.get(f"{P}profiles/").json()["results"][0]["patient_id"]
    bad = patient_client.post(
        f"{P}profiles/{pid}/photo/",
        {"file": SimpleUploadedFile("x.txt", b"hello", "text/plain")},
        format="multipart",
    )
    assert bad.status_code == 400


def test_another_account_cannot_touch_the_photo(patient_client: Any) -> None:
    pid = patient_client.get(f"{P}profiles/").json()["results"][0]["patient_id"]
    stranger, _user = patient_client_for("stranger@example.test")
    assert (
        stranger.post(f"{P}profiles/{pid}/photo/", {"file": _png()}, format="multipart").status_code
        == 404
    )
    assert stranger.post(f"{P}profiles/{pid}/photo/download-links/").status_code == 404


def test_staff_see_the_photo_where_the_patient_has_a_record(
    facility: Any,
    doctor: Any,
    other_reception: Any,
    django_capture_on_commit_callbacks: Any,
) -> None:
    desk, desk_user = staff_client_for(facility, ("receptionist",), "desk@example.test")
    data = walk_in(desk)
    patient = Patient.objects.get(pk=data["patient_id"])
    with django_capture_on_commit_callbacks(execute=True):
        photos.set_photo(
            patient, django_file=_png(), actor=desk_user, audience="staff", request=None
        )
    assert desk.get(f"{S}{data['facility_patient_id']}/").json().get("has_photo") in (True, None)
    link = doctor.post(f"{S}{data['facility_patient_id']}/photo/download-links/")
    assert link.status_code == 200, link.content
    assert AuditEntry.objects.filter(action="patients.photo.viewed").count() == 1
    # another facility, where the patient has no record, cannot
    assert (
        other_reception.post(f"{S}{data['facility_patient_id']}/photo/download-links/").status_code
        == 404
    )
