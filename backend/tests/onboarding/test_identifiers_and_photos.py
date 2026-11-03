"""Onboarding step 3 (2026-11-03): the map pin is required to submit; the MoH facility code (FOSA
ID) and TIN travel from the application to the facility; facility photos uploaded with the
application become the profile's photos at approval."""

from __future__ import annotations

from typing import Any

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from medilink.audit.models import AuditEntry
from medilink.facilities.models import Profile
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import Facility
from medilink.uploads.models import UploadedFile
from tests.onboarding.conftest import (
    FACILITIES,
    PLATFORM,
    PUBLIC,
    accept_all,
    approve_body,
    fill,
    start,
    under_review,
    upload,
    upload_required,
)
from tests.uploads.conftest import make_pdf, make_png

pytestmark = pytest.mark.django_db


def _photo(client: APIClient, app_id: str, capture: Any, content: bytes | None = None) -> Any:
    payload = {
        "file": SimpleUploadedFile("front.png", content or make_png()),
        "kind": "facility_photo",
    }
    with capture(execute=True):
        return client.post(f"{PUBLIC}{app_id}/documents/", payload, format="multipart")


def _submit(client: APIClient, app: dict[str, Any], capture: Any) -> Any:
    app = client.get(f"{PUBLIC}{app['id']}/").json()
    with capture(execute=True):
        return client.post(
            f"{PUBLIC}{app['id']}/submit/",
            {
                "version": app["version"],
                "accepted_terms_version": "2026-10",
                "accepted_dpa_version": "2026-10",
                "ncsa_registration_confirmed": True,
            },
            format="json",
        )


def test_the_map_pin_is_required_to_submit(
    village: str, django_capture_on_commit_callbacks: Any
) -> None:
    client = APIClient()
    app = fill(client, start(client), village)
    upload_required(client, app["id"], django_capture_on_commit_callbacks)
    app = client.get(f"{PUBLIC}{app['id']}/").json()
    cleared = client.patch(
        f"{PUBLIC}{app['id']}/",
        {"version": app["version"], "location": {"latitude": None, "longitude": None}},
        format="json",
    ).json()
    assert "location.latitude" in cleared["missing_for_submit"]
    refused = _submit(client, cleared, django_capture_on_commit_callbacks)
    assert refused.status_code == 400, refused.content
    assert "location.latitude" in refused.json()["error"]["fields"]
    outside = client.patch(
        f"{PUBLIC}{app['id']}/",
        {"version": cleared["version"], "location": {"latitude": "5.1", "longitude": "30.1"}},
        format="json",
    )
    assert outside.status_code == 400  # not in Rwanda


def test_identifiers_are_validated_and_reach_the_facility(
    village: str, platform_client: APIClient, django_capture_on_commit_callbacks: Any
) -> None:
    client = APIClient()
    app = fill(client, start(client), village)
    bad = client.patch(
        f"{PUBLIC}{app['id']}/",
        {"version": app["version"], "facility": {"tin": "12345", "moh_facility_code": "a b"}},
        format="json",
    )
    assert bad.status_code == 400
    assert {"facility.tin", "facility.moh_facility_code"} <= set(bad.json()["error"]["fields"])
    app = client.patch(
        f"{PUBLIC}{app['id']}/",
        {
            "version": app["version"],
            "facility": {"tin": "102345678", "moh_facility_code": "FOSA-0451"},
        },
        format="json",
    ).json()
    assert (app["facility"]["tin"], app["facility"]["moh_facility_code"]) == (
        "102345678",
        "FOSA-0451",
    )
    upload_required(client, app["id"], django_capture_on_commit_callbacks)
    assert _submit(client, app, django_capture_on_commit_callbacks).status_code == 200
    app = under_review(platform_client, client.get(f"{PUBLIC}{app['id']}/").json())
    accept_all(platform_client, app)
    app = platform_client.get(f"{PLATFORM}{app['id']}/").json()
    with django_capture_on_commit_callbacks(execute=True):
        approved = platform_client.post(
            f"{PLATFORM}{app['id']}/approve/", approve_body(app), format="json"
        )
    assert approved.status_code == 200, approved.content
    facility_id = approved.json()["facility"]["id"]
    facility = Facility.objects.get(pk=facility_id)
    assert (facility.moh_facility_code, facility.tin) == ("FOSA-0451", "102345678")
    detail = platform_client.get(f"{FACILITIES}{facility_id}/").json()
    assert (detail["moh_facility_code"], detail["tin"]) == ("FOSA-0451", "102345678")

    # the platform corrects them later (FOSA IDs are often given after approval)
    changed = platform_client.patch(
        f"{FACILITIES}{facility_id}/", {"moh_facility_code": "RW-0451"}, format="json"
    )
    assert changed.status_code == 200, changed.content
    assert changed.json()["moh_facility_code"] == "RW-0451"
    assert AuditEntry.objects.filter(
        action="facility.identifiers_updated", object_id=str(facility_id)
    ).exists()
    wrong = platform_client.patch(f"{FACILITIES}{facility_id}/", {"tin": "ABC"}, format="json")
    assert wrong.status_code == 400
    unknown = platform_client.patch(f"{FACILITIES}{facility_id}/", {"name": "X"}, format="json")
    assert unknown.status_code == 400


def test_photos_become_the_facility_profile_photos(
    village: str, platform_client: APIClient, django_capture_on_commit_callbacks: Any
) -> None:
    capture = django_capture_on_commit_callbacks
    client = APIClient()
    app = fill(client, start(client), village)
    upload_required(client, app["id"], capture)
    # a PDF is not a photo
    pdf = _photo(client, app["id"], capture, content=make_pdf())
    assert pdf.status_code == 400 and "file" in pdf.json()["error"]["fields"]
    for _ in range(6):
        assert _photo(client, app["id"], capture).status_code == 201
    assert _photo(client, app["id"], capture).status_code == 422  # 7th: up to 6
    assert _submit(client, app, capture).status_code == 200
    app = under_review(platform_client, client.get(f"{PUBLIC}{app['id']}/").json())
    accept_all(platform_client, app)
    app = platform_client.get(f"{PLATFORM}{app['id']}/").json()
    photo_ids = [d["upload"]["id"] for d in app["documents"] if d["kind"] == "facility_photo"]
    assert len(photo_ids) == 6
    with capture(execute=True):
        approved = platform_client.post(
            f"{PLATFORM}{app['id']}/approve/", approve_body(app), format="json"
        )
    assert approved.status_code == 200, approved.content
    facility_id = approved.json()["facility"]["id"]
    with rls_context(facility_id=facility_id):
        profile = Profile.objects.get(facility_id=facility_id)
        files = list(UploadedFile.objects.filter(pk__in=photo_ids))
    assert [str(p) for p in profile.photo_file_ids] == photo_ids
    assert {(f.purpose, f.owner_kind, str(f.facility_id), f.data_class) for f in files} == {
        ("facility_photo", "facility", str(facility_id), "C0")
    }
    # the licence documents stay application documents
    assert not UploadedFile.objects.filter(purpose="facility_photo", owner_id=app["id"]).exists()


def test_rejected_photos_are_not_adopted(
    village: str, platform_client: APIClient, django_capture_on_commit_callbacks: Any
) -> None:
    from medilink.onboarding.models import Application, ApplicationDocument

    capture = django_capture_on_commit_callbacks
    client = APIClient()
    app = fill(client, start(client), village)
    upload_required(client, app["id"], capture)
    assert _photo(client, app["id"], capture).status_code == 201
    assert upload(client, PUBLIC, app["id"], "other", capture).status_code == 201
    application = Application.objects.get(pk=app["id"])
    ApplicationDocument.objects.filter(application=application, kind="facility_photo").update(
        review_status="needs_change"
    )
    from medilink.facilities.services import adopt_application_photos
    from tests.factories import FacilityFactory

    facility = FacilityFactory()
    with rls_context(facility_id=facility.pk):
        profile = adopt_application_photos(facility, application)
    assert profile.photo_file_ids == []
