"""S2 schedules (templates, leave, cross-facility warnings) and billing setup (tariffs, rules)."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.utils import timezone

from medilink.billing import services as billing
from medilink.scheduling import services as scheduling
from tests.factories import make_membership
from tests.s2.conftest import NAMES, S, attest, client_for, make_catalogue, membership_of, set_hours

pytestmark = pytest.mark.django_db


def _template(client: Any, membership_id: Any, service_id: Any, **extra: Any) -> Any:
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


def test_templates_attestation_overlap_and_warnings(
    admin_client: Any, doctor: Any, setup_facility: Any
) -> None:
    catalogue = make_catalogue(admin_client)
    set_hours(admin_client)
    _client, doc_user = doctor
    membership = membership_of(doc_user, setup_facility)
    unattested = _template(admin_client, membership.pk, catalogue["service"]["id"])
    assert unattested.status_code == 422
    assert "membership_id" in unattested.json()["error"]["fields"]
    attest(doc_user, setup_facility)
    created = _template(admin_client, membership.pk, catalogue["service"]["id"])
    assert created.status_code == 201, created.content
    assert created.json()["warnings"] == []
    overlap = _template(
        admin_client, membership.pk, catalogue["service"]["id"], starts_at="11:00", ends_at="13:00"
    )
    assert overlap.status_code == 422
    uneven = _template(
        admin_client,
        membership.pk,
        catalogue["service"]["id"],
        weekday=1,
        starts_at="08:00",
        ends_at="08:50",
    )
    assert uneven.status_code == 400
    outside = _template(
        admin_client,
        membership.pk,
        catalogue["service"]["id"],
        weekday=1,
        starts_at="17:00",
        ends_at="19:00",
    )
    assert outside.status_code == 201
    assert outside.json()["warnings"][0]["kind"] == "outside_hours"
    template = created.json()["template"]
    edited = admin_client.patch(
        f"{S}schedule-templates/{template['id']}/",
        {"version": template["version"], "capacity": 2},
        format="json",
    )
    assert edited.status_code == 200
    assert admin_client.delete(f"{S}schedule-templates/{template['id']}/").status_code == 204


def test_cross_facility_busy_ranges_reveal_times_only(
    admin_client: Any, doctor: Any, setup_facility: Any, other_facility: Any
) -> None:
    _client, doc_user = doctor
    attest(doc_user, setup_facility)
    # the same doctor works at another facility on Monday 10:00-14:00
    other_admin, _ = client_for(other_facility, ("facility_admin",), "other-sched@example.test")
    make_membership(doc_user, other_facility, ("doctor",))
    attest(doc_user, other_facility)
    other_catalogue = make_catalogue(other_admin)
    set_hours(other_admin)
    other_membership = membership_of(doc_user, other_facility)
    assert (
        _template(
            other_admin,
            other_membership.pk,
            other_catalogue["service"]["id"],
            starts_at="10:00",
            ends_at="14:00",
        ).status_code
        == 201
    )
    catalogue = make_catalogue(admin_client)
    set_hours(admin_client)
    created = _template(
        admin_client, membership_of(doc_user, setup_facility).pk, catalogue["service"]["id"]
    )
    assert created.status_code == 201, created.content
    warnings = created.json()["warnings"]
    assert warnings == [
        {"kind": "other_facility", "weekday": 0, "starts_at": "10:00", "ends_at": "14:00"}
    ]
    text = str(created.json())
    assert str(other_facility.pk) not in text and other_facility.name not in text


def test_leave_requests(admin_client: Any, doctor: Any, setup_facility: Any) -> None:
    doc_client, doc_user = doctor
    membership = membership_of(doc_user, setup_facility)
    start = timezone.now() + dt.timedelta(days=10)
    body = {
        "membership_id": str(membership.pk),
        "kind": "leave",
        "starts_at": start.isoformat(),
        "ends_at": (start + dt.timedelta(days=2)).isoformat(),
        "reason": "Family",
    }
    requested = doc_client.post(f"{S}schedule-exceptions/", body, format="json")
    assert requested.status_code == 201, requested.content
    assert requested.json()["exception"]["status"] == "requested"
    training = doc_client.post(
        f"{S}schedule-exceptions/", {**body, "kind": "training"}, format="json"
    )
    assert training.status_code == 403
    exception_id = requested.json()["exception"]["id"]
    assert (
        doc_client.post(
            f"{S}schedule-exceptions/{exception_id}/approve/", {}, format="json"
        ).status_code
        == 403
    )
    no_note = admin_client.post(f"{S}schedule-exceptions/{exception_id}/reject/", {}, format="json")
    assert no_note.status_code == 400
    received: list[Any] = []

    def listener(sender: Any, exception_id: Any, facility_id: Any, **kw: Any) -> None:
        received.append(exception_id)

    scheduling.exception_approved.connect(listener)
    try:
        from django.test import TestCase  # noqa: F401

        approved = admin_client.post(
            f"{S}schedule-exceptions/{exception_id}/approve/", {}, format="json"
        )
    finally:
        scheduling.exception_approved.disconnect(listener)
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    own = doc_client.get(f"{S}schedule-exceptions/").json()["results"]
    assert [e["id"] for e in own] == [exception_id]
    overview = admin_client.get(f"{S}schedule-overview/").json()
    assert any(m["full_name"] == doc_user.full_name for m in overview["members"])


def test_tariff_versions(admin_client: Any) -> None:
    catalogue = make_catalogue(admin_client)
    created = admin_client.post(
        f"{S}tariff-items/",
        {
            "code": "CONS",
            "name_i18n": NAMES,
            "kind": "service",
            "service_id": catalogue["service"]["id"],
            "amount_rwf": 5000,
        },
        format="json",
    )
    assert created.status_code == 201, created.content
    item = created.json()
    duplicate = admin_client.post(
        f"{S}tariff-items/",
        {"code": "CONS", "name_i18n": NAMES, "kind": "service", "amount_rwf": 1},
        format="json",
    )
    assert duplicate.status_code == 409
    future = (dt.date.today() + dt.timedelta(days=30)).isoformat()
    changed = admin_client.patch(
        f"{S}tariff-items/{item['id']}/",
        {"version": item["version"], "amount_rwf": 6000, "valid_from": future},
        format="json",
    )
    assert changed.status_code == 200, changed.content
    assert changed.json()["previous"]["valid_to"] is not None
    assert admin_client.get(f"{S}tariff-items/").json()["results"][0]["amount_rwf"] == 5000
    assert (
        admin_client.get(f"{S}tariff-items/?on={future}").json()["results"][0]["amount_rwf"] == 6000
    )
    history = admin_client.get(f"{S}tariff-items/CONS/history/").json()["results"]
    assert len(history) == 2
    past = admin_client.patch(
        f"{S}tariff-items/{changed.json()['current']['id']}/",
        {
            "version": changed.json()["current"]["version"],
            "amount_rwf": 1,
            "valid_from": "2020-01-01",
        },
        format="json",
    )
    assert past.status_code == 400


def test_insurer_rules(admin_client: Any, reception: Any, setup_facility: Any) -> None:
    unknown = admin_client.post(
        f"{S}insurer-rules/", {"insurer_code": "nope", "patient_share_bp": 1000}, format="json"
    )
    assert unknown.status_code == 400
    rule = admin_client.post(
        f"{S}insurer-rules/", {"insurer_code": "mutuelle", "patient_share_bp": 1000}, format="json"
    )
    assert rule.status_code == 201, rule.content
    assert reception.get(f"{S}insurer-rules/").json()["results"][0]["insurer_code"] == "mutuelle"
    assert (
        reception.post(
            f"{S}insurer-rules/", {"insurer_code": "mmi", "patient_share_bp": 1}, format="json"
        ).status_code
        == 403
    )
    found = billing.insurer_rule(setup_facility.pk, "mutuelle")
    assert found is not None and found.patient_share_bp == 1000
    bad_codes = admin_client.patch(
        f"{S}insurer-rules/{rule.json()['id']}/",
        {"version": 1, "excluded_tariff_codes": ["XX"]},
        format="json",
    )
    assert bad_codes.status_code == 400
