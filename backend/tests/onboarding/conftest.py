"""Onboarding fixtures: temporary upload storage, a platform admin, a village, and helpers that
walk an application through the wizard."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APIClient

from medilink.accounts.models import User
from medilink.masterdata import services as md
from medilink.masterdata.kinds import KINDS
from tests.conftest import login_staff
from tests.factories import make_staff
from tests.uploads.conftest import make_pdf

PUBLIC = "/api/v1/public/facility-applications/"
PLATFORM = "/api/v1/platform/facility-applications/"
FACILITIES = "/api/v1/platform/facilities/"


@pytest.fixture(autouse=True)
def _uploads_in_tmp(tmp_path: Any) -> Iterator[None]:
    with override_settings(
        UPLOADS={
            "storage": "local",
            "scanner": "fake",
            "local_root": str(tmp_path / "objects"),
            "download_base_url": "http://testserver/api/v1/files",
        }
    ):
        yield


@pytest.fixture
def platform_admin(db: Any) -> User:
    return make_staff(None, email="super.admin@example.test", is_platform_admin=True)


@pytest.fixture
def platform_client(platform_admin: User) -> APIClient:
    client = APIClient()
    login_staff(client, platform_admin)
    return client


@pytest.fixture
def village(db: Any) -> str:
    kind = KINDS["locations"]
    for code, level, parent, name in (
        ("1209", "sector", "12", "Kimironko"),
        ("120901", "cell", "1209", "Bibare"),
        ("12090101", "village", "120901", "Sample village"),
    ):
        md.create(
            kind, {"code": code, "level": level, "parent_code": parent, "name": name}, actor=None
        )
    return "12090101"


def start(client: APIClient, email: str = "jeanne@ubuzima.example") -> dict[str, Any]:
    response = client.post(
        PUBLIC,
        {
            "applicant": {"name": "Mukamana Jeanne", "email": email, "phone": "+250788000111"},
            "facility_name": "Clinique Ubuzima",
            "preferred_language": "rw",
        },
        format="json",
    )
    assert response.status_code == 201, response.content
    return dict(response.json())


def fill(
    client: APIClient, app: dict[str, Any], village: str, ownership: str = "private"
) -> dict[str, Any]:
    response = client.patch(
        f"{PUBLIC}{app['id']}/",
        {
            "version": app["version"],
            "facility": {
                "facility_type": "private_clinic",
                "ownership": ownership,
                "organization_name": "Ubuzima Ltd",
                "phone": "+250788123456",
                "email": "info@ubuzima.example",
            },
            "location": {"village_code": village, "address": "KG 11 Ave 5"},
            "applicant": {"position": "Director"},
            "proposed_admin": {
                "name": "Habimana Eric",
                "email": "eric@ubuzima.example",
                "phone": "+250788000222",
            },
        },
        format="json",
    )
    assert response.status_code == 200, response.content
    return dict(response.json())


def upload(
    client: APIClient, base: str, app_id: str, kind: str, capture: Any, **fields: Any
) -> Any:
    payload = {"file": SimpleUploadedFile(f"{kind}.pdf", make_pdf()), "kind": kind, **fields}
    with capture(execute=True):
        return client.post(f"{base}{app_id}/documents/", payload, format="multipart")


def upload_required(client: APIClient, app_id: str, capture: Any) -> None:
    for kind, extra in (
        ("moh_licence", {"number": "MOH/FL/2024/0312", "expires_on": "2030-02-28"}),
        ("rdb_registration", {}),
        ("tin_certificate", {}),
    ):
        assert upload(client, PUBLIC, app_id, kind, capture, **extra).status_code == 201


def submitted(
    client: APIClient, village: str, capture: Any, email: str = "jeanne@ubuzima.example"
) -> dict[str, Any]:
    app = fill(client, start(client, email), village)
    upload_required(client, app["id"], capture)
    app = client.get(f"{PUBLIC}{app['id']}/").json()
    with capture(execute=True):
        response = client.post(
            f"{PUBLIC}{app['id']}/submit/",
            {
                "version": app["version"],
                "accepted_terms_version": "2026-10",
                "accepted_dpa_version": "2026-10",
                "ncsa_registration_confirmed": True,
            },
            format="json",
        )
    assert response.status_code == 200, response.content
    return dict(response.json())


def under_review(platform: APIClient, app: dict[str, Any]) -> dict[str, Any]:
    response = platform.post(
        f"{PLATFORM}{app['id']}/start-review/", {"version": app["version"]}, format="json"
    )
    assert response.status_code == 200, response.content
    return dict(response.json())


def accept_all(platform: APIClient, app: dict[str, Any]) -> None:
    for document in app["documents"]:
        response = platform.post(
            f"{PLATFORM}{app['id']}/documents/{document['id']}/review/",
            {"review_status": "accepted"},
            format="json",
        )
        assert response.status_code == 200, response.content


def approve_body(app: dict[str, Any], slug: str = "clinique-ubuzima") -> dict[str, Any]:
    moh = next(d for d in app["documents"] if d["kind"] == "moh_licence")
    return {
        "version": app["version"],
        "slug": slug,
        "organization_name": "Ubuzima Ltd",
        "facility_type": "private_clinic",
        "ownership": "private",
        "licences": [
            {
                "document_id": moh["id"],
                "kind": "moh_operating",
                "number": "MOH/FL/2024/0312",
                "expires_on": "2030-02-28",
            }
        ],
    }
