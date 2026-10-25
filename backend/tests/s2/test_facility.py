"""S2 facility configuration: profile, catalogue, hours, calendar, settings, change log, RLS."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.db import DatabaseError, connection, transaction

from medilink.audit.models import AuditEntry
from medilink.facilities.models import ConfigChange, Department
from medilink.tenancy.context import rls_context
from tests.s2.conftest import NAMES, F, S, client_for, make_catalogue, set_hours

pytestmark = pytest.mark.django_db


def test_profile_read_by_members_and_edited_by_admin(admin_client: Any, reception: Any) -> None:
    profile = reception.get(F).json()
    assert profile["status"] == "setup"
    assert reception.patch(F, {"version": 1, "phone": "x"}, format="json").status_code == 403
    response = admin_client.patch(
        F,
        {
            "version": profile["version"],
            "phone": "+250788000000",
            "address": "KG 11 Ave",
            "latitude": "-1.95",
            "longitude": "30.06",
        },
        format="json",
    )
    assert response.status_code == 200, response.content
    assert response.json()["version"] == 2
    stale = admin_client.patch(F, {"version": 1, "phone": "1"}, format="json")
    assert stale.status_code == 409
    outside = admin_client.patch(F, {"version": 2, "latitude": "5.0"}, format="json")
    assert outside.status_code == 400
    changes = ConfigChange.objects.filter(entity="profile")
    assert {c.field for c in changes} >= {"phone", "address", "latitude", "longitude"}
    assert AuditEntry.objects.filter(action="facilities.profile.updated").exists()


def test_catalogue_and_prefix_conflict(admin_client: Any) -> None:
    catalogue = make_catalogue(admin_client)
    duplicate = admin_client.post(
        f"{S}services/",
        {"department_id": catalogue["department"]["id"], "name_i18n": NAMES, "ticket_prefix": "g"},
        format="json",
    )
    assert duplicate.status_code == 409
    assert "ticket_prefix" in duplicate.json()["error"]["fields"]
    missing_lang = admin_client.post(
        f"{S}departments/", {"name_i18n": {"en": "Lab"}}, format="json"
    )
    assert missing_lang.status_code == 400
    retire_dept = admin_client.patch(
        f"{S}departments/{catalogue['department']['id']}/", {"is_active": False}, format="json"
    )
    assert retire_dept.status_code == 422
    service = catalogue["service"]
    retired = admin_client.patch(
        f"{S}services/{service['id']}/",
        {"version": service["version"], "is_active": False},
        format="json",
    )
    assert retired.status_code == 200
    assert retired.json()["service"]["is_active"] is False
    points = admin_client.get(f"{S}service-points/").json()["results"]
    assert points[0]["service_ids"] == [service["id"]]


def test_hours_rules_and_effective_calendar(admin_client: Any) -> None:
    catalogue = make_catalogue(admin_client)
    hours = set_hours(admin_client)
    assert len(hours["days"]) == 5
    late = admin_client.put(
        f"{F}opening-hours/",
        {
            "service_id": catalogue["service"]["id"],
            "version": 1,
            "days": [{"weekday": 0, "opens_at": "07:00", "closes_at": "18:00"}],
        },
        format="json",
    )
    assert late.status_code == 422
    bad_break = admin_client.put(
        f"{F}opening-hours/",
        {
            "version": hours["version"],
            "days": [
                {
                    "weekday": 0,
                    "opens_at": "08:00",
                    "closes_at": "12:00",
                    "break_starts_at": "13:00",
                    "break_ends_at": "14:00",
                }
            ],
        },
        format="json",
    )
    assert bad_break.status_code == 400
    # a closure next Monday afternoon
    today = dt.date.today()
    monday = today + dt.timedelta(days=(7 - today.weekday()) % 7 or 7)
    event = admin_client.post(
        f"{F}calendar-events/",
        {
            "kind": "closure",
            "starts_at": f"{monday}T13:00:00+02:00",
            "ends_at": f"{monday}T23:59:00+02:00",
            "reason": "Staff training",
        },
        format="json",
    )
    assert event.status_code == 201, event.content
    calendar = admin_client.get(
        f"{F}calendar/?from={monday}&to={monday + dt.timedelta(days=6)}"
    ).json()["days"]
    first = calendar[0]
    assert first["open"] == [{"starts": "08:00", "ends": "12:00"}]
    assert calendar[5]["closed_reason"] == "closed_weekday"  # Saturday
    too_long = admin_client.get(f"{F}calendar/?from={today}&to={today + dt.timedelta(days=200)}")
    assert too_long.status_code == 400


def test_umuganda_modes() -> None:
    from medilink.facilities.calendar import is_umuganda

    assert is_umuganda(dt.date(2026, 10, 31))
    assert not is_umuganda(dt.date(2026, 10, 24))


def test_settings_schema_and_step_up(admin_client: Any) -> None:
    settings = admin_client.get(f"{F}settings/").json()
    assert settings["booking"]["lead_time_hours"] == 2
    assert "queue" in settings["schema"]
    unknown = admin_client.patch(
        f"{F}settings/",
        {"version": settings["version"], "section": "queue", "values": {"nope": 1}},
        format="json",
    )
    assert unknown.status_code == 400
    ok = admin_client.patch(
        f"{F}settings/",
        {"version": settings["version"], "section": "booking", "values": {"lead_time_hours": 4}},
        format="json",
    )
    assert ok.status_code == 200, ok.content
    assert ok.json()["booking"]["lead_time_hours"] == 4
    umuganda = admin_client.patch(
        f"{F}settings/",
        {"version": ok.json()["version"], "section": "umuganda", "values": {"value": "open"}},
        format="json",
    )
    assert umuganda.json()["umuganda"] == "open"


def test_settings_billing_needs_step_up(admin_client: Any) -> None:
    from tests.masterdata.conftest import age_recent_auth

    settings = admin_client.get(f"{F}settings/").json()
    age_recent_auth(admin_client)
    refused = admin_client.patch(
        f"{F}settings/",
        {"version": settings["version"], "section": "billing", "values": {"no_insurers": True}},
        format="json",
    )
    assert refused.status_code == 403
    assert refused.json()["error"]["code"] == "step_up_required"


def test_register_settings_fields() -> None:
    from medilink.facilities import settings_schema

    with pytest.raises(ValueError, match="already registered"):
        settings_schema.register_settings_fields(
            "queue", {"ticket_reset": settings_schema.SettingField("bool", True)}
        )
    with pytest.raises(ValueError, match="Unknown settings section"):
        settings_schema.register_settings_fields("nope", {})


def test_change_log_is_append_only(admin_client: Any, setup_facility: Any) -> None:
    make_catalogue(admin_client)
    with rls_context(facility_id=setup_facility.pk):
        change = ConfigChange.objects.filter(facility=setup_facility).first()
        assert change is not None
        with pytest.raises(DatabaseError), transaction.atomic(), connection.cursor() as cursor:
            cursor.execute(
                "UPDATE facilities_config_change SET field = 'x' WHERE id = %s", [change.pk]
            )
    history = admin_client.get(f"{F}config-changes/?entity=service").json()
    assert history["count"] > 0
    assert "@" not in str(history)  # no emails in the log


def test_other_facility_and_no_context(
    admin_client: Any, other_facility: Any, setup_facility: Any
) -> None:
    catalogue = make_catalogue(admin_client)
    other, _user = client_for(other_facility, ("facility_admin",), "other-admin@example.test")
    assert (
        other.patch(
            f"{S}services/{catalogue['service']['id']}/", {"version": 1}, format="json"
        ).status_code
        == 404
    )
    assert other.get(f"{S}services/").json()["results"] == []
    with rls_context(facility_id=None):
        assert Department.objects.count() == 0


def test_checklist_and_go_live(admin_client: Any, admin: Any, setup_facility: Any) -> None:
    checklist = admin_client.get(f"{F}setup-checklist/").json()
    assert checklist["complete"] is False
    assert {i["code"] for i in checklist["items"]} >= {"profile", "services", "tariff", "licence"}
    refused = admin_client.post(f"{F}go-live/", {"version": 0}, format="json")
    assert refused.status_code == 422
    assert any(
        k.startswith("checks.setup.checklist_complete") for k in refused.json()["error"]["fields"]
    )
    assert AuditEntry.objects.filter(action="facilities.go_live.requested").exists()
