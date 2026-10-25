"""More S2 paths: photos and branding, calendar edits and holidays, rule changes, extra sessions,
blocks, the platform MFA reset, the invitation job and the dev seed."""

from __future__ import annotations

import datetime as dt
import io
from io import StringIO
from typing import Any

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import CommandError, call_command
from django.test import override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from medilink.facilities import calendar
from medilink.facilities.tasks import expire_invitations
from medilink.scheduling import services as scheduling
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import Invitation
from tests.conftest import login_staff
from tests.factories import make_staff
from tests.s2.conftest import NAMES, F, S, attest, make_catalogue, membership_of, set_hours

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _uploads(tmp_path: Any) -> Any:
    with override_settings(
        UPLOADS={
            "storage": "local",
            "scanner": "fake",
            "local_root": str(tmp_path / "objects"),
            "download_base_url": "http://testserver/api/v1/files",
        }
    ):
        yield


def _png(name: str = "photo.png") -> SimpleUploadedFile:
    buffer = io.BytesIO()
    Image.new("RGB", (30, 20), (10, 120, 200)).save(buffer, format="PNG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


def test_photos_and_branding(admin_client: Any, django_capture_on_commit_callbacks: Any) -> None:
    with django_capture_on_commit_callbacks(execute=True):
        added = admin_client.post(f"{F}photos/", {"file": _png()}, format="multipart")
    assert added.status_code == 201, added.content
    photo_id = added.json()["photos"][0]
    assert admin_client.delete(f"{F}photos/{photo_id}/").status_code == 204
    assert admin_client.delete(f"{F}photos/{photo_id}/").status_code == 404
    with django_capture_on_commit_callbacks(execute=True):
        logo = admin_client.post(
            "/api/v1/staff/uploads/",
            {"purpose": "facility_branding", "file": _png("logo.png")},
            format="multipart",
        )
    assert logo.status_code == 201, logo.content
    branding = admin_client.get(f"{F}branding/").json()
    saved = admin_client.put(
        f"{F}branding/",
        {
            "version": branding["version"],
            "logo_upload_id": logo.json()["id"],
            "footer_text": "Open 7 days",
        },
        format="json",
    )
    assert saved.status_code == 200, saved.content
    assert saved.json()["footer_text"] == "Open 7 days"
    wrong = admin_client.put(
        f"{F}branding/",
        {
            "version": saved.json()["version"],
            "stamp_upload_id": "00000000-0000-0000-0000-000000000000",
        },
        format="json",
    )
    assert wrong.status_code == 400


def test_calendar_events_edit_delete_and_holiday(admin_client: Any, setup_facility: Any) -> None:
    from medilink.masterdata.models import PublicHoliday

    holiday = (
        PublicHoliday.objects.filter(holiday_date__gte=timezone.localdate())
        .order_by("holiday_date")
        .first()
    )
    assert holiday is not None  # S1 seeds 2026-2027 holidays
    monday = holiday.holiday_date
    current = admin_client.get(f"{F}opening-hours/").json()
    admin_client.put(
        f"{F}opening-hours/",
        {
            "version": current["version"],
            "days": [{"weekday": d, "opens_at": "08:00", "closes_at": "17:00"} for d in range(7)],
        },
        format="json",
    )
    days = calendar.effective_calendar(setup_facility.pk, monday, monday)
    assert days[0].closed_reason == "public_holiday" and days[0].holiday_name
    override = admin_client.post(
        f"{F}calendar-events/",
        {
            "kind": "holiday_override",
            "starts_at": f"{monday}T00:00:00+02:00",
            "ends_at": f"{monday}T23:00:00+02:00",
            "is_open": True,
            "opens_at": "09:00",
            "closes_at": "12:00",
        },
        format="json",
    )
    assert override.status_code == 201
    days = calendar.effective_calendar(setup_facility.pk, monday, monday)
    assert [(a.strftime("%H:%M"), b.strftime("%H:%M")) for a, b in days[0].open] == [
        ("09:00", "12:00")
    ]
    event_id = override.json()["id"]
    edited = admin_client.patch(
        f"{F}calendar-events/{event_id}/", {"reason": "Opened for vaccination"}, format="json"
    )
    assert edited.status_code == 200
    events = admin_client.get(f"{F}calendar-events/").json()["results"]
    assert [e["id"] for e in events] == [event_id]
    assert admin_client.delete(f"{F}calendar-events/{event_id}/").status_code == 204
    bad = admin_client.post(
        f"{F}calendar-events/",
        {
            "kind": "closure",
            "starts_at": f"{monday}T12:00:00+02:00",
            "ends_at": f"{monday}T08:00:00+02:00",
        },
        format="json",
    )
    assert bad.status_code == 400


def test_umuganda_cut_and_special_day(admin_client: Any, setup_facility: Any) -> None:
    current = admin_client.get(f"{F}opening-hours/").json()
    admin_client.put(
        f"{F}opening-hours/",
        {
            "version": current["version"],
            "days": [{"weekday": 5, "opens_at": "08:00", "closes_at": "16:00"}],
        },
        format="json",
    )
    last_saturday = dt.date(2026, 11, 28)
    days = calendar.effective_calendar(setup_facility.pk, last_saturday, last_saturday)
    assert days[0].umuganda and days[0].open[0][0] == dt.time(12, 0)
    settings = admin_client.get(f"{F}settings/").json()
    admin_client.patch(
        f"{F}settings/",
        {"version": settings["version"], "section": "umuganda", "values": {"value": "open_after"}},
        format="json",
    )
    days = calendar.effective_calendar(setup_facility.pk, last_saturday, last_saturday)
    assert days[0].open[0][0] == dt.time(11, 30)
    bad = admin_client.patch(
        f"{F}settings/",
        {"version": settings["version"] + 1, "section": "umuganda", "values": {"value": "x"}},
        format="json",
    )
    assert bad.status_code == 400
    admin_client.post(
        f"{F}calendar-events/",
        {
            "kind": "special_day",
            "starts_at": f"{last_saturday + dt.timedelta(days=7)}T00:00:00+02:00",
            "ends_at": f"{last_saturday + dt.timedelta(days=7)}T23:00:00+02:00",
            "opens_at": "10:00",
            "closes_at": "11:00",
        },
        format="json",
    )
    days = calendar.effective_calendar(
        setup_facility.pk,
        last_saturday + dt.timedelta(days=7),
        last_saturday + dt.timedelta(days=7),
    )
    assert days[0].open == [(dt.time(10), dt.time(11))]
    with pytest.raises(ValueError, match="range"):
        calendar.effective_calendar(
            setup_facility.pk, last_saturday, last_saturday - dt.timedelta(days=1)
        )


def test_service_hours_and_retire_with_templates(
    admin_client: Any, doctor: Any, setup_facility: Any
) -> None:
    catalogue = make_catalogue(admin_client)
    set_hours(admin_client)
    service_hours = set_hours(admin_client, catalogue["service"]["id"])
    assert service_hours["service_id"] == catalogue["service"]["id"]
    _client, doc_user = doctor
    attest(doc_user, setup_facility)
    admin_client.post(
        f"{S}schedule-templates/",
        {
            "membership_id": str(membership_of(doc_user, setup_facility).pk),
            "service_id": catalogue["service"]["id"],
            "weekday": 0,
            "starts_at": "08:00",
            "ends_at": "10:00",
            "slot_minutes": 30,
        },
        format="json",
    )
    service = admin_client.get(f"{S}services/").json()["results"][0]
    retired = admin_client.patch(
        f"{S}services/{service['id']}/",
        {"version": service["version"], "is_active": False},
        format="json",
    )
    assert retired.json()["warnings"] == [{"kind": "templates_ended", "count": 1}]
    point = catalogue["point"]
    renamed = admin_client.patch(
        f"{S}service-points/{point['id']}/", {"name": "Room A", "service_ids": []}, format="json"
    )
    assert renamed.json()["service_ids"] == [] and renamed.json()["name"] == "Room A"
    dept = catalogue["department"]
    assert (
        admin_client.patch(
            f"{S}departments/{dept['id']}/", {"is_active": False}, format="json"
        ).status_code
        == 200
    )


def test_extra_session_blocks_and_cancel(
    admin_client: Any, doctor: Any, setup_facility: Any
) -> None:
    catalogue = make_catalogue(admin_client)
    set_hours(admin_client)
    doc_client, doc_user = doctor
    attest(doc_user, setup_facility)
    membership = membership_of(doc_user, setup_facility)
    admin_client.post(
        f"{S}schedule-templates/",
        {
            "membership_id": str(membership.pk),
            "service_id": catalogue["service"]["id"],
            "weekday": 2,
            "starts_at": "08:00",
            "ends_at": "10:00",
            "slot_minutes": 20,
        },
        format="json",
    )
    start = timezone.now().replace(hour=14, minute=0, second=0, microsecond=0) + dt.timedelta(
        days=3
    )
    extra = admin_client.post(
        f"{S}schedule-exceptions/",
        {
            "membership_id": str(membership.pk),
            "kind": "extra_session",
            "service_id": catalogue["service"]["id"],
            "starts_at": start.isoformat(),
            "ends_at": (start + dt.timedelta(hours=2)).isoformat(),
        },
        format="json",
    )
    assert extra.status_code == 201
    assert extra.json()["exception"]["status"] == "approved"
    today = timezone.localdate()
    blocks = scheduling.blocks(setup_facility.pk, today, today + dt.timedelta(days=13))
    assert any(b["template_id"] is None for b in blocks)
    assert any(b["template_id"] is not None for b in blocks)
    leave_start = timezone.now() + dt.timedelta(days=20)
    leave = doc_client.post(
        f"{S}schedule-exceptions/",
        {
            "membership_id": str(membership.pk),
            "kind": "leave",
            "starts_at": leave_start.isoformat(),
            "ends_at": (leave_start + dt.timedelta(days=1)).isoformat(),
        },
        format="json",
    )
    cancelled = doc_client.post(
        f"{S}schedule-exceptions/{leave.json()['exception']['id']}/cancel/", {}, format="json"
    )
    assert cancelled.json()["status"] == "cancelled"
    assert (
        doc_client.post(
            f"{S}schedule-exceptions/{leave.json()['exception']['id']}/cancel/", {}, format="json"
        ).status_code
        == 422
    )
    filtered = admin_client.get(
        f"{S}schedule-exceptions/?status=approved&membership_id={membership.pk}&from={today}&to={today + dt.timedelta(days=30)}"
    )
    assert len(filtered.json()["results"]) == 1
    templates = doc_client.get(f"{S}schedule-templates/?membership_id={membership.pk}").json()[
        "results"
    ]
    assert len(templates) == 1
    overview = doc_client.get(
        f"{S}schedule-overview/?from={today}&to={today + dt.timedelta(days=6)}"
    ).json()
    assert [m["full_name"] for m in overview["members"]] == [doc_user.full_name]
    assert (
        admin_client.get(
            f"{S}schedule-overview/?from={today}&to={today + dt.timedelta(days=60)}"
        ).status_code
        == 400
    )


def test_insurer_rule_versions_and_tariff_correction(
    admin_client: Any, setup_facility: Any
) -> None:
    from medilink.billing import services as billing

    catalogue = make_catalogue(admin_client)
    item = admin_client.post(
        f"{S}tariff-items/",
        {"code": "LAB", "name_i18n": NAMES, "kind": "procedure", "amount_rwf": 1000},
        format="json",
    ).json()
    corrected = admin_client.patch(
        f"{S}tariff-items/{item['id']}/",
        {"version": item["version"], "amount_rwf": 1200},
        format="json",
    )
    assert corrected.json()["current"]["id"] == item["id"]  # same-day correction replaces in place
    assert billing.price(setup_facility.pk, code="LAB").amount_rwf == 1200
    rule = admin_client.post(
        f"{S}insurer-rules/",
        {
            "insurer_code": "mmi",
            "patient_share_bp": 1500,
            "applies_to_all_services": False,
            "service_ids": [catalogue["service"]["id"]],
            "excluded_tariff_codes": ["LAB"],
        },
        format="json",
    ).json()
    future = (dt.date.today() + dt.timedelta(days=10)).isoformat()
    changed = admin_client.patch(
        f"{S}insurer-rules/{rule['id']}/",
        {"version": rule["version"], "patient_share_bp": 2000, "valid_from": future},
        format="json",
    )
    assert changed.status_code == 200, changed.content
    assert changed.json()["current"]["patient_share_bp"] == 2000
    assert (
        billing.insurer_rule(
            setup_facility.pk, "mmi", service_id=catalogue["service"]["id"]
        ).patient_share_bp
        == 1500
    )
    assert (
        billing.insurer_rule(
            setup_facility.pk, "mmi", service_id="00000000-0000-0000-0000-000000000000"
        )
        is None
    )
    stale = admin_client.patch(
        f"{S}insurer-rules/{rule['id']}/",
        {"version": rule["version"], "patient_share_bp": 1},
        format="json",
    )
    assert stale.status_code == 409


def test_platform_mfa_reset_and_invitation_job(
    admin: Any, setup_facility: Any, django_capture_on_commit_callbacks: Any
) -> None:
    _admin_client, admin_user = admin
    platform_user = make_staff(None, email="plat2@example.test", is_platform_admin=True)
    platform = APIClient()
    login_staff(platform, platform_user)
    admin_membership = membership_of(admin_user, setup_facility)
    with django_capture_on_commit_callbacks(execute=True):
        reset = platform.post(f"/api/v1/platform/memberships/{admin_membership.pk}/mfa-reset/")
    assert reset.status_code == 204
    receptionist = make_staff(setup_facility, roles=("receptionist",), email="rx@example.test")
    refused = platform.post(
        f"/api/v1/platform/memberships/{membership_of(receptionist, setup_facility).pk}/mfa-reset/"
    )
    assert refused.status_code == 422
    assert (
        platform.post(
            "/api/v1/platform/memberships/00000000-0000-0000-0000-000000000000/mfa-reset/"
        ).status_code
        == 404
    )
    with rls_context(facility_id=setup_facility.pk):
        Invitation.objects.create(
            facility=setup_facility,
            email="late@example.test",
            role_codes=["doctor"],
            token_hash=b"x" * 32,
            expires_at=timezone.now() - dt.timedelta(days=1),
        )
    assert expire_invitations() == 1


def test_memberships_filters_and_roles(admin_client: Any, setup_facility: Any) -> None:
    make_staff(setup_facility, roles=("doctor",), email="filter.doc@example.test")
    doctors = admin_client.get(f"{S}memberships/?role=doctor&status=active&q=filter").json()[
        "results"
    ]
    assert [m["email"] for m in doctors] == ["filter.doc@example.test"]
    roles = admin_client.get(f"{S}roles/").json()["results"]
    assert {"facility_admin", "doctor"} <= {r["code"] for r in roles}


def test_seed_setup_dev() -> None:
    with pytest.raises(CommandError):
        call_command("seed_setup_dev", stdout=StringIO())
    with override_settings(DEBUG=True):
        call_command("seed_dev", stdout=StringIO())
        out = StringIO()
        call_command("seed_setup_dev", stdout=out)
        assert "already seeded" in out.getvalue()
