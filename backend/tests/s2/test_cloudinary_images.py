"""Cloudinary images on the facility profile, the doctor's public profile and the patient profile:
public ids are checked with the Admin API (mocked), stored, and read back as delivery URLs."""

from __future__ import annotations

from typing import Any
from unittest import mock

import cloudinary.exceptions
import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from medilink.scheduling.tasks import refresh_facility
from medilink.tenancy.models import FacilityStatus
from tests.conftest import login_patient
from tests.factories import make_patient_user
from tests.s2.conftest import F, S, make_catalogue

pytestmark = pytest.mark.django_db

CFG = {
    "cloud_name": "demo-cloud",
    "api_key": "123456",
    "api_secret": "test-secret",
    "upload_preset": "medilink_signed",
    "root_folder": "medilink",
}
FOLDERS = {
    "photo": "medilink/facilities",
    "logo": "medilink/facilities/logos",
    "doc": "medilink/providers/avatars",
    "me": "medilink/patients/avatars",
}


def _resource(public_id: str) -> dict[str, Any]:
    """Fake Admin API: the id's prefix says which folder it was uploaded to."""
    prefix = public_id.split("-", 1)[0]
    if prefix not in FOLDERS:
        raise cloudinary.exceptions.NotFound(public_id)
    return {"public_id": public_id, "asset_folder": FOLDERS[prefix], "resource_type": "image"}


@pytest.fixture(autouse=True)
def admin_api() -> Any:
    with (
        override_settings(CLOUDINARY=CFG),
        mock.patch("cloudinary.api.resource", side_effect=_resource) as resource,
    ):
        yield resource


def test_facility_photos_and_logo(admin_client: Any, setup_facility: Any, admin_api: Any) -> None:
    make_catalogue(admin_client)  # a service, so the facility shows in search
    version = admin_client.get(F).json()["version"]
    saved = admin_client.patch(
        F,
        {
            "version": version,
            "photo_public_ids": ["photo-a", "photo-b"],
            "logo_public_id": "logo-1",
        },
        format="json",
    )
    assert saved.status_code == 200, saved.content
    data = saved.json()
    assert data["photo_public_ids"] == ["photo-a", "photo-b"]
    assert data["photo_images"][0]["url"].startswith("https://res.cloudinary.com/demo-cloud/")
    assert "w_320" in data["photo_images"][0]["thumb_url"]
    assert data["logo_url"].endswith("/logo-1")

    # re-sending stored ids needs no new check; a new one does
    admin_api.reset_mock()
    reordered = admin_client.patch(
        F,
        {"version": data["version"], "photo_public_ids": ["photo-b", "photo-a"]},
        format="json",
    )
    assert reordered.status_code == 200
    admin_api.assert_not_called()

    setup_facility.status = FacilityStatus.LIVE
    setup_facility.save(update_fields=["status"])
    public = APIClient().get("/api/v1/public/facilities/remera-test/").json()
    assert public["photos"][0].endswith("/photo-b")
    assert public["logo_url"].endswith("/logo-1")
    # the search cards show the cover photo instead of the drawing
    refresh_facility(str(setup_facility.pk))
    found = APIClient().post("/api/v1/public/facilities/search/", {}, format="json").json()
    card = next(r for r in found["results"] if r["slug"] == "remera-test")
    assert card["cover_url"].endswith("/photo-b")


def test_facility_refuses_invented_or_misplaced_ids(admin_client: Any) -> None:
    version = admin_client.get(F).json()["version"]
    for ids in (["invented"], ["me-face"], ["photo-a", "photo-a"]):
        bad = admin_client.patch(F, {"version": version, "photo_public_ids": ids}, format="json")
        assert bad.status_code == 400, ids
        assert any(k.startswith("photo_public_ids") for k in bad.json()["error"]["fields"])
    too_many = [f"photo-{n}" for n in range(7)]
    assert (
        admin_client.patch(
            F, {"version": version, "photo_public_ids": too_many}, format="json"
        ).status_code
        == 400
    )
    logo = admin_client.patch(F, {"version": version, "logo_public_id": "photo-a"}, format="json")
    assert logo.status_code == 400


def test_facility_images_need_a_configured_server(admin_client: Any) -> None:
    version = admin_client.get(F).json()["version"]
    with override_settings(CLOUDINARY={**CFG, "api_secret": ""}):
        bad = admin_client.patch(
            F, {"version": version, "photo_public_ids": ["photo-a"]}, format="json"
        )
    assert bad.status_code == 400


def test_doctor_avatar(doctor: tuple[APIClient, Any]) -> None:
    client = doctor[0]
    client.patch(
        f"{S}clinician-profile/",
        {"council": "rmdc", "licence_number": "RMDC/9002", "specialty": "General practice"},
        format="json",
    )
    client.patch(
        f"{S}clinician-profile/public/",
        {"bio_i18n": {"en": "Family doctor."}, "languages": ["rw"], "is_public": True},
        format="json",
    )
    saved = client.patch(
        f"{S}clinician-profile/public/", {"avatar_public_id": "doc-face"}, format="json"
    )
    # the photo alone keeps the bio and languages
    assert saved.json()["bio_i18n"] == {"en": "Family doctor."}
    assert saved.json()["languages"] == ["rw"]
    assert saved.status_code == 200, saved.content
    assert saved.json()["avatar_public_id"] == "doc-face"
    assert saved.json()["photo_url"].endswith("/doc-face")
    wrong = client.patch(
        f"{S}clinician-profile/public/", {"avatar_public_id": "me-face"}, format="json"
    )
    assert wrong.status_code == 400
    cleared = client.patch(f"{S}clinician-profile/public/", {"avatar_public_id": ""}, format="json")
    assert cleared.json()["photo_url"] is None


def test_patient_avatar(api: APIClient) -> None:
    user = make_patient_user()
    login_patient(api, user)
    patient_id = api.get("/api/v1/patient/profiles/").json()["results"][0]["patient_id"]
    url = f"/api/v1/patient/profiles/{patient_id}/avatar/"
    saved = api.put(url, {"public_id": "me-face"}, format="json")
    assert saved.status_code == 200, saved.content
    assert saved.json()["avatar_url"].endswith("/me-face")
    assert api.put(url, {"public_id": "photo-a"}, format="json").status_code == 400
    assert api.put(url, {"public_id": "invented"}, format="json").status_code == 400
    removed = api.delete(url)
    assert removed.status_code == 200 and removed.json()["avatar_url"] is None
