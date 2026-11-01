"""S2 schedule rules (contract sprint-02, FR-ONB-06): what a weekly template and a schedule
exception must satisfy, who may decide on an exception, and the cross-facility warning for an
extra session."""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from medilink.facilities.models import ServicePoint
from medilink.tenancy.context import rls_context
from tests.factories import make_membership
from tests.s2.conftest import S, attest, client_for, make_catalogue, membership_of, set_hours

pytestmark = pytest.mark.django_db


def _template(client: APIClient, membership_id: Any, service_id: Any, **extra: Any) -> Any:
    body = {
        "membership_id": str(membership_id),
        "service_id": service_id,
        "weekday": 0,
        "starts_at": "08:00",
        "ends_at": "12:00",
        "slot_minutes": 15,
        **extra,
    }
    return client.post(f"{S}schedule-templates/", body, format="json")


def _fields(response: Any) -> set[str]:
    return set(response.json()["error"]["fields"])


def test_template_needs_active_member_service_point_and_a_real_range(
    admin_client: APIClient, doctor: tuple[APIClient, Any], setup_facility: Any
) -> None:
    catalogue = make_catalogue(admin_client)
    set_hours(admin_client)
    _client, doc_user = doctor
    membership = attest(doc_user, setup_facility)
    service_id = catalogue["service"]["id"]

    unknown_member = _template(admin_client, uuid.uuid4(), service_id)
    assert unknown_member.status_code == 400 and "membership_id" in _fields(unknown_member)
    unknown_service = _template(admin_client, membership.pk, str(uuid.uuid4()))
    assert unknown_service.status_code == 400 and "service_id" in _fields(unknown_service)
    backwards = _template(admin_client, membership.pk, service_id, starts_at="12:00")
    assert backwards.status_code == 400 and "ends_at" in _fields(backwards)
    with rls_context(facility_id=setup_facility.pk):
        ServicePoint.objects.filter(pk=catalogue["point"]["id"]).update(is_active=False)
    closed_room = _template(
        admin_client, membership.pk, service_id, service_point_id=catalogue["point"]["id"]
    )
    assert closed_room.status_code == 400 and "service_point_id" in _fields(closed_room)

    created = _template(admin_client, membership.pk, service_id)
    assert created.status_code == 201, created.content
    template = created.json()["template"]
    stale = admin_client.patch(
        f"{S}schedule-templates/{template['id']}/",
        {"version": template["version"] + 1, "capacity": 3},
        format="json",
    )
    assert stale.status_code == 409
    gone = admin_client.patch(
        f"{S}schedule-templates/{uuid.uuid4()}/", {"version": 1, "capacity": 3}, format="json"
    )
    assert gone.status_code == 404


def test_exception_rules_and_decisions(
    admin_client: APIClient, doctor: tuple[APIClient, Any], setup_facility: Any
) -> None:
    doc_client, doc_user = doctor
    membership = membership_of(doc_user, setup_facility)
    start = timezone.now() + dt.timedelta(days=10)
    body = {
        "membership_id": str(membership.pk),
        "kind": "leave",
        "starts_at": start.isoformat(),
        "ends_at": (start + dt.timedelta(days=1)).isoformat(),
    }
    unknown = admin_client.post(
        f"{S}schedule-exceptions/", {**body, "membership_id": str(uuid.uuid4())}, format="json"
    )
    assert unknown.status_code == 400 and "membership_id" in _fields(unknown)
    backwards = admin_client.post(
        f"{S}schedule-exceptions/", {**body, "ends_at": start.isoformat()}, format="json"
    )
    assert backwards.status_code == 400 and "ends_at" in _fields(backwards)

    # approved by the admin straight away: approving again or rejecting is no longer possible
    approved = admin_client.post(f"{S}schedule-exceptions/", body, format="json")
    assert approved.status_code == 201, approved.content
    exception_id = approved.json()["exception"]["id"]
    again = admin_client.post(f"{S}schedule-exceptions/{exception_id}/approve/", {}, format="json")
    assert again.status_code == 422
    # a doctor may cancel only their own requests
    not_theirs = doc_client.post(
        f"{S}schedule-exceptions/{exception_id}/cancel/", {}, format="json"
    )
    assert not_theirs.status_code in (403, 404)
    assert (
        admin_client.post(
            f"{S}schedule-exceptions/{exception_id}/archive/", {}, format="json"
        ).status_code
        == 404
    )
    assert (
        admin_client.post(
            f"{S}schedule-exceptions/{uuid.uuid4()}/cancel/", {}, format="json"
        ).status_code
        == 404
    )

    requested = doc_client.post(
        f"{S}schedule-exceptions/",
        {
            **body,
            "starts_at": (start + dt.timedelta(days=5)).isoformat(),
            "ends_at": (start + dt.timedelta(days=6)).isoformat(),
        },
        format="json",
    )
    assert requested.status_code == 201, requested.content
    rejected = admin_client.post(
        f"{S}schedule-exceptions/{requested.json()['exception']['id']}/reject/",
        {"decision_note": "Short-staffed that week"},
        format="json",
    )
    assert rejected.status_code == 200 and rejected.json()["status"] == "rejected"


def test_extra_session_warns_about_work_elsewhere(
    admin_client: APIClient, doctor: tuple[APIClient, Any], setup_facility: Any, other_facility: Any
) -> None:
    _client, doc_user = doctor
    attest(doc_user, setup_facility)
    # the same doctor works at another facility on Mondays 10:00-14:00
    other_admin, _ = client_for(other_facility, ("facility_admin",), "extra-other@example.test")
    make_membership(doc_user, other_facility, ("doctor",))
    attest(doc_user, other_facility)
    other_catalogue = make_catalogue(other_admin)
    set_hours(other_admin)
    assert (
        _template(
            other_admin,
            membership_of(doc_user, other_facility).pk,
            other_catalogue["service"]["id"],
            starts_at="10:00",
            ends_at="14:00",
        ).status_code
        == 201
    )
    catalogue = make_catalogue(admin_client)
    today = timezone.localdate()
    monday = today + dt.timedelta(days=7 - today.weekday())
    start = timezone.make_aware(dt.datetime.combine(monday, dt.time(12, 0)))
    extra = admin_client.post(
        f"{S}schedule-exceptions/",
        {
            "membership_id": str(membership_of(doc_user, setup_facility).pk),
            "kind": "extra_session",
            "service_id": catalogue["service"]["id"],
            "starts_at": start.isoformat(),
            "ends_at": (start + dt.timedelta(hours=3)).isoformat(),
        },
        format="json",
    )
    assert extra.status_code == 201, extra.content
    assert extra.json()["warnings"] == [
        {"kind": "other_facility", "weekday": 0, "starts_at": "10:00", "ends_at": "14:00"}
    ]
    assert other_facility.name not in str(extra.json())
