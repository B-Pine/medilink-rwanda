"""Facilities: S1-B6 (lifecycle and go-live), S1-B7 (licence reminders), S1-B17 (flag admin),
S1-B19 (notifications), stale draft expiry."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import pytest
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from medilink.audit.models import AuditEntry
from medilink.onboarding import golive, services, tasks
from medilink.onboarding.flags import RequiresFeatureFlag, is_enabled
from medilink.onboarding.models import (
    Application,
    FacilityFeatureFlag,
    FacilityLicence,
    FacilityStatusEvent,
    FeatureFlag,
)
from medilink.tenancy.models import Facility, FacilityStatus
from tests.factories import FacilityFactory
from tests.masterdata.conftest import age_recent_auth
from tests.onboarding.conftest import FACILITIES

pytestmark = pytest.mark.django_db


@pytest.fixture
def approved(platform_admin: Any) -> Facility:
    facility = FacilityFactory(status=FacilityStatus.APPROVED, slug="clinique-ubuzima")
    FacilityStatusEvent.objects.create(
        facility=facility, to_status=FacilityStatus.APPROVED, actor=platform_admin
    )
    Application.objects.create(
        facility_name=facility.name,
        applicant_name="Mukamana Jeanne",
        applicant_email="jeanne@ubuzima.example",
        email="info@ubuzima.example",
        status="approved",
        facility=facility,
    )
    return facility


def _licence(facility: Facility, expires_on: date, kind: str = "moh_operating") -> FacilityLicence:
    return FacilityLicence.objects.create(
        facility=facility, kind=kind, number="MOH/1", expires_on=expires_on
    )


def _post(client: APIClient, facility: Facility, action: str, **body: Any) -> Any:
    version = services.facility_version(Facility.objects.get(pk=facility.pk))
    return client.post(
        f"{FACILITIES}{facility.pk}/{action}/", {"version": version, **body}, format="json"
    )


# ---- S1-B6: lifecycle -----------------------------------------------------------------------------


@pytest.mark.acceptance("S1-B6")
def test_lifecycle_with_go_live_checks(
    approved: Facility, platform_client: APIClient, django_capture_on_commit_callbacks: Any
) -> None:
    assert _post(platform_client, approved, "go-live").status_code == 422  # not in setup
    assert _post(platform_client, approved, "start-setup").json()["status"] == "setup"
    failing = _post(platform_client, approved, "go-live")
    assert failing.status_code == 422
    assert "checks.licence.moh_operating_valid" in failing.json()["error"]["fields"]
    _licence(approved, timezone.localdate() - timedelta(days=1))  # expired: still failing
    assert _post(platform_client, approved, "go-live").status_code == 422
    _licence(approved, timezone.localdate() + timedelta(days=365))
    live = _post(
        platform_client,
        approved,
        "go-live",
    )
    assert live.status_code == 200 and live.json()["status"] == "live"
    assert services.is_publicly_listed(Facility.objects.get(pk=approved.pk))
    no_reason = _post(platform_client, approved, "suspend", reason_code="")
    assert no_reason.status_code == 400
    with django_capture_on_commit_callbacks(execute=True):
        suspended = _post(platform_client, approved, "suspend", reason_code="licence_expired")
    assert suspended.json()["status"] == "suspended"
    assert not services.accepts_new_bookings(Facility.objects.get(pk=approved.pk))
    assert f"{approved.name} was suspended on MediLink" in [m.subject for m in mail.outbox]
    assert (
        _post(platform_client, approved, "reactivate", reason_code="licence_renewed").json()[
            "status"
        ]
        == "live"
    )
    mismatch = _post(
        platform_client, approved, "deactivate", reason_code="closed", confirm_slug="wrong"
    )
    assert mismatch.status_code == 400 and "confirm_slug" in mismatch.json()["error"]["fields"]
    gone = _post(
        platform_client,
        approved,
        "deactivate",
        reason_code="closed",
        confirm_slug="clinique-ubuzima",
    )
    assert gone.json()["status"] == "deactivated"
    assert (
        _post(
            platform_client, approved, "reactivate", reason_code="other", reason_text="x"
        ).status_code
        == 422
    )
    history = platform_client.get(f"{FACILITIES}{approved.pk}/status-events/").json()
    assert [e["to_status"] for e in history] == [
        "approved",
        "setup",
        "live",
        "suspended",
        "live",
        "deactivated",
    ]
    assert history[3]["reason_label"] == "Licence expired"
    assert AuditEntry.objects.filter(action="facility.status_changed").count() == 5


@pytest.mark.acceptance("S1-B6")
def test_versions_idempotency_and_step_up(approved: Facility, platform_client: APIClient) -> None:
    url = f"{FACILITIES}{approved.pk}/start-setup/"
    assert platform_client.post(url, {"version": 99}, format="json").status_code == 409
    first = platform_client.post(url, {"version": 1}, format="json", HTTP_IDEMPOTENCY_KEY="s-1")
    again = platform_client.post(url, {"version": 1}, format="json", HTTP_IDEMPOTENCY_KEY="s-1")
    assert first.status_code == again.status_code == 200
    assert FacilityStatusEvent.objects.filter(facility=approved).count() == 2
    age_recent_auth(platform_client)
    blocked = _post(platform_client, approved, "go-live")
    assert blocked.status_code == 403


@pytest.mark.acceptance("S1-B6")
def test_registered_check_is_honoured(approved: Facility, platform_client: APIClient) -> None:
    _licence(approved, timezone.localdate() + timedelta(days=365))
    golive.register(
        "test.always_fails", lambda f: [{"code": "test.always_fails", "message": "Nope."}]
    )
    try:
        _post(platform_client, approved, "start-setup")
        response = _post(platform_client, approved, "go-live")
        assert response.json()["error"]["fields"] == {"checks.test.always_fails": ["Nope."]}
    finally:
        golive.unregister("test.always_fails")
    assert _post(platform_client, approved, "go-live").status_code == 200


def test_facility_list_and_detail(approved: Facility, platform_client: APIClient) -> None:
    _licence(approved, timezone.localdate() + timedelta(days=20))
    rows = platform_client.get(FACILITIES).json()["results"]
    assert rows[0]["licence_state"] == "expiring" and rows[0]["version"] == 1
    assert platform_client.get(FACILITIES, {"licence_state": "valid"}).json()["count"] == 0
    detail = platform_client.get(f"{FACILITIES}{approved.pk}/").json()
    assert detail["application"]["applicant_name"] == "Mukamana Jeanne"
    assert len(detail["licences"]) == 1


# ---- licences -------------------------------------------------------------------------------------


@pytest.mark.acceptance("S1-B7")
def test_add_renew_and_correct_licences(approved: Facility, platform_client: APIClient) -> None:
    url = f"{FACILITIES}{approved.pk}/licences/"
    created = platform_client.post(
        url, {"kind": "moh_operating", "number": "MOH/2", "expires_on": "2027-01-31"}, format="json"
    )
    assert created.status_code == 201
    first = created.json()
    renewed = platform_client.post(
        url,
        {
            "kind": "moh_operating",
            "number": "MOH/3",
            "expires_on": "2029-01-31",
            "renews_licence_id": first["id"],
        },
        format="json",
    )
    assert renewed.status_code == 201
    old = FacilityLicence.objects.get(pk=first["id"])
    assert old.superseded_by_id is not None
    again = platform_client.post(
        url,
        {
            "kind": "moh_operating",
            "number": "MOH/4",
            "expires_on": "2030-01-31",
            "renews_licence_id": first["id"],
        },
        format="json",
    )
    assert again.status_code == 422
    licence = renewed.json()
    patched = platform_client.patch(
        f"{url}{licence['id']}/", {"version": licence["version"], "number": "MOH/3A"}, format="json"
    )
    assert patched.status_code == 200 and patched.json()["number"] == "MOH/3A"
    stale = platform_client.patch(
        f"{url}{licence['id']}/", {"version": 1, "number": "x"}, format="json"
    )
    assert stale.status_code == 409
    assert (
        platform_client.patch(
            f"{url}{first['id']}/", {"version": 2, "number": "x"}, format="json"
        ).status_code
        == 422
    )
    assert {e.action for e in AuditEntry.objects.filter(object_type="facility_licence")} == {
        "facility.licence.recorded",
        "facility.licence.renewed",
        "facility.licence.updated",
    }


@pytest.mark.acceptance("S1-B7")
def test_licence_reminders_with_a_frozen_clock(
    approved: Facility, platform_admin: Any, django_capture_on_commit_callbacks: Any
) -> None:
    from unittest import mock

    licence = _licence(approved, date(2027, 3, 31))

    def run(day: date) -> dict[str, int]:
        with (
            mock.patch("medilink.onboarding.tasks.timezone.localdate", return_value=day),
            django_capture_on_commit_callbacks(execute=True),
        ):
            return dict(tasks.send_licence_reminders())

    assert run(date(2027, 1, 1)) == {"60": 0, "30": 0, "expired": 0}
    assert run(date(2027, 1, 31)) == {"60": 1, "30": 0, "expired": 0}
    assert run(date(2027, 2, 15)) == {"60": 0, "30": 0, "expired": 0}  # once per step
    assert run(date(2027, 3, 1)) == {"60": 0, "30": 1, "expired": 0}
    assert run(date(2027, 3, 31)) == {"60": 0, "30": 0, "expired": 0}  # expires today
    assert run(date(2027, 4, 1)) == {"60": 0, "30": 0, "expired": 1}
    assert run(date(2027, 4, 2)) == {"60": 0, "30": 0, "expired": 0}
    subjects = [m.subject for m in mail.outbox]
    assert subjects.count(f"Licence expires in 60 days: {approved.name}") == 1
    assert subjects.count(f"Licence expires in 30 days: {approved.name}") == 1
    assert subjects.count(f"Licence expired: {approved.name}") == 1
    recipients = next(m.to for m in mail.outbox if m.subject.startswith("Licence expired"))
    assert set(recipients) == {
        "info@ubuzima.example",
        "jeanne@ubuzima.example",
        platform_admin.email,
    }
    # Renewal supersedes and restarts the reminders on the new licence.
    renewal = services.add_licence(
        approved,
        data={
            "kind": "moh_operating",
            "number": "MOH/9",
            "expires_on": date(2027, 5, 31),
            "renews_licence_id": licence.pk,
        },
        actor=platform_admin,
    )
    assert run(date(2027, 4, 2)) == {"60": 1, "30": 0, "expired": 0}
    renewal.refresh_from_db()
    assert renewal.last_reminder_days == 60


def test_moving_expiry_resets_reminders(approved: Facility, platform_admin: Any) -> None:
    licence = _licence(approved, date(2027, 1, 1))
    FacilityLicence.objects.filter(pk=licence.pk).update(last_reminder_days=30)
    licence.refresh_from_db()
    services.correct_licence(
        licence, data={"expires_on": date(2028, 1, 1)}, version=1, actor=platform_admin
    )
    licence.refresh_from_db()
    assert licence.last_reminder_days is None


# ---- S1-B17: flag administration -----------------------------------------------------------------


@pytest.mark.acceptance("S1-B17")
def test_flag_overrides_and_defaults(approved: Facility, platform_client: APIClient) -> None:
    url = f"{FACILITIES}{approved.pk}/feature-flags/"
    listed = platform_client.get(url).json()
    assert listed == [
        {
            "code": "security.pin_unlock",
            "is_enabled": True,
            "source": "default",
            "note": "",
            "set_by": None,
            "updated_at": None,
        }
    ]
    off = platform_client.put(
        f"{url}security.pin_unlock/", {"is_enabled": False, "note": "Shared PCs"}, format="json"
    )
    assert off.status_code == 200 and off.json()["source"] == "override"
    assert not is_enabled("security.pin_unlock", approved.pk)
    assert platform_client.get("/api/v1/platform/feature-flags/").json()[0]["override_count"] == 1
    assert (
        platform_client.put(f"{url}nope/", {"is_enabled": True}, format="json").status_code == 404
    )
    assert platform_client.delete(f"{url}security.pin_unlock/").status_code == 204
    assert is_enabled("security.pin_unlock", approved.pk)
    flag = platform_client.patch(
        "/api/v1/platform/feature-flags/security.pin_unlock/",
        {"version": 1, "default_enabled": False},
        format="json",
    )
    assert flag.status_code == 200 and flag.json()["default_enabled"] is False
    assert not is_enabled("security.pin_unlock", None)
    stale = platform_client.patch(
        "/api/v1/platform/feature-flags/security.pin_unlock/",
        {"version": 1, "default_enabled": True},
        format="json",
    )
    assert stale.status_code == 409
    actions = set(AuditEntry.objects.values_list("action", flat=True))
    assert {"facility.feature_flag.changed", "feature_flag.default_changed"} <= actions


@pytest.mark.acceptance("S1-B17")
def test_requires_feature_flag_hides_endpoints(staff_client: APIClient, facility: Any) -> None:
    from django.http import Http404
    from rest_framework.test import APIRequestFactory

    from medilink.accounts.principal import Principal, PrincipalState

    permission = RequiresFeatureFlag("security.pin_unlock")()
    request = APIRequestFactory().get("/")
    request.principal = Principal(audience="staff", state=PrincipalState.AUTHENTICATED)  # type: ignore[attr-defined]
    assert permission.has_permission(request, None)
    FacilityFeatureFlag.objects.create(
        flag=FeatureFlag.objects.get(code="security.pin_unlock"),
        facility=facility,
        is_enabled=False,
    )
    assert is_enabled("security.pin_unlock", None)
    assert not is_enabled("security.pin_unlock", facility.pk)
    with pytest.raises(Http404):
        RequiresFeatureFlag("unknown.flag")().has_permission(request, None)


# ---- stale drafts --------------------------------------------------------------------------------


def test_stale_drafts_reminded_then_purged(django_capture_on_commit_callbacks: Any) -> None:
    now = timezone.now()
    old = Application.objects.create(
        facility_name="Old",
        applicant_name="A",
        applicant_email="old@example.test",
        last_activity_at=now - timedelta(days=91),
    )
    quiet = Application.objects.create(
        facility_name="Quiet",
        applicant_name="B",
        applicant_email="quiet@example.test",
        last_activity_at=now - timedelta(days=84),
    )
    Application.objects.create(
        facility_name="Fresh",
        applicant_name="C",
        applicant_email="fresh@example.test",
        last_activity_at=now,
    )
    with django_capture_on_commit_callbacks(execute=True):
        counts = tasks.expire_stale_drafts()
    assert counts == {"reminded": 1, "purged": 1}
    assert not Application.objects.filter(pk=old.pk).exists()
    assert AuditEntry.objects.filter(
        action="facility_application.purged", object_id=str(old.pk)
    ).exists()
    assert [m.to for m in mail.outbox] == [["quiet@example.test"]]
    with django_capture_on_commit_callbacks(execute=True):
        assert tasks.expire_stale_drafts() == {"reminded": 0, "purged": 0}
    quiet.refresh_from_db()
    assert quiet.draft_reminder_sent_at is not None


def test_beat_schedule() -> None:
    from config.celery import app

    schedule = app.conf.beat_schedule
    assert (
        schedule["onboarding.send_licence_reminders"]["task"]
        == "medilink.onboarding.tasks.send_licence_reminders"
    )
    assert (
        schedule["onboarding.expire_stale_drafts"]["task"]
        == "medilink.onboarding.tasks.expire_stale_drafts"
    )


@pytest.mark.acceptance("S1-B19")
def test_unknown_notification_event_refused() -> None:
    from medilink.onboarding import notifications

    with pytest.raises(ValueError, match="Unknown notification"):
        notifications.dispatch("facility.exploded", facility_id="x")
