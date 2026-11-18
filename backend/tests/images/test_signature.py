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
