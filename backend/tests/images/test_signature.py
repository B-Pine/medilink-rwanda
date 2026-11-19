"""Cloudinary signed uploads (medilink.images): signature endpoints, asset checks, URLs.

Never calls Cloudinary: cloudinary.api.resource is mocked, signatures are compared with the SDK.
"""

from __future__ import annotations

from typing import Any
from unittest import mock

import cloudinary.exceptions
import cloudinary.utils
import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from medilink.images import services
from tests.conftest import login_patient, login_staff
from tests.factories import make_patient_user, make_staff

pytestmark = pytest.mark.django_db

CFG = {
    "cloud_name": "demo-cloud",
    "api_key": "123456",
    "api_secret": "test-secret",
    "upload_preset": "medilink_signed",
    "root_folder": "medilink",
}
STAFF = "/api/v1/staff/uploads/signature/"
PATIENT = "/api/v1/patient/uploads/signature/"


@pytest.fixture(autouse=True)
def _cloudinary() -> Any:
    with override_settings(CLOUDINARY=CFG):
        yield


def test_sign_upload_matches_the_sdk() -> None:
    signed = services.sign_upload("facility_photo")
    params = {k: signed[k] for k in ("timestamp", "upload_preset", "asset_folder", "tags")}
    assert params["asset_folder"] == "medilink/facilities"
    assert params["tags"] == "medilink,facility_photo"
    assert signed["signature"] == cloudinary.utils.api_sign_request(params, "test-secret")
    assert signed["upload_url"] == "https://api.cloudinary.com/v1_1/demo-cloud/image/upload"
    assert signed["api_key"] == "123456" and "api_secret" not in signed
    assert "test-secret" not in str(signed)


def test_staff_admin_gets_a_facility_signature(api: APIClient, facility: Any) -> None:
    login_staff(api, make_staff(facility, roles=("facility_admin",)))
    response = api.post(STAFF, {"kind": "facility_logo"}, format="json")
    assert response.status_code == 200, response.content
    assert response.json()["asset_folder"] == "medilink/facilities/logos"


def test_receptionist_cannot_sign_facility_images(api: APIClient, facility: Any) -> None:
    login_staff(api, make_staff(facility, roles=("receptionist",)))
    assert api.post(STAFF, {"kind": "facility_photo"}, format="json").status_code == 403
    # but any staff member may set their own avatar
    response = api.post(STAFF, {"kind": "provider_avatar"}, format="json")
    assert response.status_code == 200
    assert response.json()["asset_folder"] == "medilink/providers/avatars"


def test_kinds_are_a_whitelist(api: APIClient, facility: Any) -> None:
    login_staff(api, make_staff(facility, roles=("facility_admin",)))
    assert api.post(STAFF, {"kind": "patient_avatar"}, format="json").status_code == 400
    assert api.post(STAFF, {"kind": "../secrets"}, format="json").status_code == 400


def test_patient_signature(api: APIClient) -> None:
    login_patient(api, make_patient_user())
    response = api.post(PATIENT, {"kind": "patient_avatar"}, format="json")
    assert response.status_code == 200
    assert response.json()["asset_folder"] == "medilink/patients/avatars"
    assert api.post(PATIENT, {"kind": "facility_photo"}, format="json").status_code == 400


def test_anonymous_is_refused(api: APIClient) -> None:
    assert api.post(STAFF, {"kind": "provider_avatar"}, format="json").status_code == 401
    assert api.post(PATIENT, {"kind": "patient_avatar"}, format="json").status_code == 401


def test_unconfigured_server_answers_503(api: APIClient) -> None:
    login_patient(api, make_patient_user())
    for secret in ("", "replace-me"):  # empty, or still the .env.example placeholder
        with override_settings(CLOUDINARY={**CFG, "api_secret": secret}):
            response = api.post(PATIENT, {"kind": "patient_avatar"}, format="json")
        assert response.status_code == 503


def test_verify_asset_checks_the_folder() -> None:
    found = {"public_id": "abc123", "asset_folder": "medilink/facilities", "resource_type": "image"}
    with mock.patch("cloudinary.api.resource", return_value=found) as resource:
        assert services.verify_asset("abc123", "facility_photo") == found
        resource.assert_called_once_with("abc123")
        with pytest.raises(services.AssetNotFound):  # uploaded for another kind
            services.verify_asset("abc123", "patient_avatar")
    with (
        mock.patch("cloudinary.api.resource", side_effect=cloudinary.exceptions.NotFound("x")),
        pytest.raises(services.AssetNotFound),
    ):
        services.verify_asset("invented", "facility_photo")
    with pytest.raises(services.AssetNotFound):
        services.verify_asset("../etc", "facility_photo")


def test_image_url() -> None:
    url = services.image_url("abc123", w=160, h=160)
    assert url is not None
    assert url.startswith("https://res.cloudinary.com/demo-cloud/image/upload/")
    assert "w_160" in url and "h_160" in url and "f_auto" in url and "q_auto" in url
    assert url.endswith("/abc123")
    assert services.image_url("") is None


def test_deploy_check_wants_all_three_credentials() -> None:
    from medilink.images.checks import check_deploy_cloudinary

    assert check_deploy_cloudinary() == []
    with override_settings(CLOUDINARY={**CFG, "api_secret": ""}):
        assert [m.id for m in check_deploy_cloudinary()] == ["medilink.images.E001"]
    with override_settings(CLOUDINARY={"cloud_name": "", "api_key": "", "api_secret": ""}):
        assert check_deploy_cloudinary() == []


def test_cloudinary_errors_become_a_clear_field_error() -> None:
    with (
        mock.patch(
            "cloudinary.api.resource",
            side_effect=cloudinary.exceptions.AuthorizationRequired("bad key"),
        ),
        pytest.raises(services.CloudinaryUnavailable),
    ):
        services.verify_asset("abc", "facility_photo")


def test_patient_avatar_answers_400_not_500_when_cloudinary_fails(api: APIClient) -> None:
    login_patient(api, make_patient_user())
    patient_id = api.get("/api/v1/patient/profiles/").json()["results"][0]["patient_id"]
    with mock.patch("cloudinary.api.resource", side_effect=RuntimeError("timeout")):
        response = api.put(
            f"/api/v1/patient/profiles/{patient_id}/avatar/", {"public_id": "abc"}, format="json"
        )
    assert response.status_code == 400
    assert "Try again" in str(response.json()["error"]["fields"])


def test_asset_in_a_subfolder_of_the_kind_counts() -> None:
    found = {"asset_folder": "medilink/patients/avatars/2026", "resource_type": "image"}
    with mock.patch("cloudinary.api.resource", return_value=found):
        assert services.verify_asset("x1", "patient_avatar") == found


def test_cloudinary_check_command() -> None:
    from django.core.management import CommandError, call_command

    with (
        mock.patch("cloudinary.api.ping", return_value={"status": "ok"}),
        mock.patch(
            "cloudinary.api.upload_preset", return_value={"unsigned": False, "settings": {}}
        ),
    ):
        call_command("cloudinary_check")
    with (
        mock.patch("cloudinary.api.ping", return_value={"status": "ok"}),
        mock.patch("cloudinary.api.upload_preset", return_value={"unsigned": True}),
        pytest.raises(CommandError),
    ):
        call_command("cloudinary_check")
    with override_settings(CLOUDINARY={**CFG, "api_secret": ""}), pytest.raises(CommandError):
        call_command("cloudinary_check")


def test_logo_url_has_no_auto_gravity() -> None:
    """Cloudinary answers 400 to "pad" with auto gravity (the broken logo of 2026-11-19); photos
    keep the smart crop."""
    logo = services.image_url("logo1", w=320, h=320, crop="pad")
    assert logo is not None and "c_pad" in logo and "g_auto" not in logo
    photo = services.image_url("photo1", w=800, h=350)
    assert photo is not None and "c_fill" in photo and "g_auto" in photo
