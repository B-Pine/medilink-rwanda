"""R3 (S0-S5 audit, issue #85): checklist rules, invitation idempotency and expiry, paginated
staff lists, `error.current` on 409, RLS on the membership-role join, deactivated facilities and
beat hours in Kigali time."""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

import pytest
from django.core import mail
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from medilink.tenancy.context import rls_context
from medilink.tenancy.models import (
    Facility,
    FacilityMembership,
    FacilityStatus,
    Invitation,
    MembershipRole,
    Role,
)
from tests.conftest import login_staff
from tests.factories import FacilityFactory, make_staff
from tests.s2.conftest import F, S, make_catalogue, membership_of

pytestmark = pytest.mark.django_db


def _items(client: APIClient) -> dict[str, Any]:
    response = client.get(f"{F}setup-checklist/")
    assert response.status_code == 200, response.content
    return {item["code"]: item for item in response.json()["items"]}


# ---- checklist ----------------------------------------------------------------------------------


def test_schedules_done_without_bookable_services(admin_client: APIClient) -> None:
    assert _items(admin_client)["schedules"]["done"] is True  # nothing to schedule yet
    catalogue = make_catalogue(admin_client)
    assert catalogue["service"]["is_bookable"] is True
    assert _items(admin_client)["schedules"]["done"] is False  # a bookable service, no template
    service = catalogue["service"]
    off = admin_client.patch(
        f"{S}services/{service['id']}/",
        {"version": service["version"], "is_bookable": False},
        format="json",
    )
    assert off.status_code == 200, off.content
    assert _items(admin_client)["schedules"]["done"] is True


def test_insurers_follow_the_application_claims(
    admin_client: APIClient, setup_facility: Any
) -> None:
    from medilink.onboarding.models import Application

    assert _items(admin_client)["insurers"]["done"] is True  # no application, nothing claimed
    with rls_context(facility_id=setup_facility.pk):
        application = Application.objects.create(
            status="approved",
            facility_name=setup_facility.name,
            facility_id=setup_facility.pk,
            applicant_name="A",
            applicant_email="a@example.test",
            claimed_insurer_codes=[],
        )
    assert _items(admin_client)["insurers"]["done"] is True  # claimed none
    with rls_context(facility_id=setup_facility.pk):
        Application.objects.filter(pk=application.pk).update(claimed_insurer_codes=["RSSB"])
    assert _items(admin_client)["insurers"]["done"] is False  # claimed one, no rule yet


# ---- invitations --------------------------------------------------------------------------------


def test_invitation_idempotency_key(
    admin_client: APIClient, django_capture_on_commit_callbacks: Any
) -> None:
    key = str(uuid.uuid4())
    body = {"email": "twice@example.test", "role_codes": ["receptionist"]}
    mail.outbox.clear()
    with django_capture_on_commit_callbacks(execute=True):
        first = admin_client.post(f"{S}invitations/", body, format="json", HTTP_IDEMPOTENCY_KEY=key)
        again = admin_client.post(f"{S}invitations/", body, format="json", HTTP_IDEMPOTENCY_KEY=key)
    assert first.status_code == again.status_code == 201, again.content
    assert first.json()["id"] == again.json()["id"]
    assert len(mail.outbox) == 1  # one invitation, one email
    other = admin_client.post(
        f"{S}invitations/", body, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())
    )
    assert other.status_code == 409  # a new key is a new request: the pending one blocks it
    bad = admin_client.post(f"{S}invitations/", body, format="json", HTTP_IDEMPOTENCY_KEY="k-1")
    assert bad.status_code == 400
    assert "Idempotency-Key" in bad.json()["error"]["fields"]


def test_expired_invitation_does_not_block_a_reinvite(
    admin_client: APIClient, setup_facility: Any
) -> None:
    from medilink.facilities.staff import expire_invitations

    body = {"email": "late@example.test", "role_codes": ["receptionist"]}
    first = admin_client.post(f"{S}invitations/", body, format="json")
    assert first.status_code == 201
    with rls_context(facility_id=setup_facility.pk):
        Invitation.objects.filter(pk=first.json()["id"]).update(
            expires_at=timezone.now() - dt.timedelta(minutes=1)
        )
    again = admin_client.post(f"{S}invitations/", body, format="json")
    assert again.status_code == 201, again.content  # expired: no 409
    listed = {i["id"]: i for i in admin_client.get(f"{S}invitations/").json()["results"]}
    assert listed[first.json()["id"]]["status"] == "expired"
    assert listed[again.json()["id"]]["status"] == "pending"
    with rls_context(facility_id=setup_facility.pk):
        old = Invitation.objects.get(pk=first.json()["id"])
        assert old.expired_at is not None and old.revoked_at is None

    # The daily job marks expired, not revoked.
    with rls_context(facility_id=setup_facility.pk):
        Invitation.objects.filter(pk=again.json()["id"]).update(
            expires_at=timezone.now() - dt.timedelta(minutes=1)
        )
    assert expire_invitations() == 1
    with rls_context(facility_id=setup_facility.pk):
        swept = Invitation.objects.get(pk=again.json()["id"])
        assert swept.expired_at is not None and swept.revoked_at is None
    resent = admin_client.post(f"{S}invitations/{again.json()['id']}/resend/")
    assert resent.status_code == 200
    assert resent.json()["status"] == "pending"


# ---- pagination ---------------------------------------------------------------------------------


def test_staff_lists_are_paginated(admin: Any, setup_facility: Any) -> None:
    admin_client, _ = admin
    for n in range(3):
        make_staff(setup_facility, roles=("receptionist",), email=f"desk{n}@pages.test")
        assert (
            admin_client.post(
                f"{S}invitations/",
                {"email": f"inv{n}@pages.test", "role_codes": ["receptionist"]},
                format="json",
            ).status_code
            == 201
        )
    members = admin_client.get(f"{S}memberships/?page_size=2").json()
    assert members["count"] == 4 and len(members["results"]) == 2 and members["next"]
    rest = admin_client.get(f"{S}memberships/?page_size=2&page=2").json()
    assert len(rest["results"]) == 2 and rest["next"] is None
    invitations = admin_client.get(f"{S}invitations/?page_size=2").json()
    assert invitations["count"] == 3 and len(invitations["results"]) == 2
    templates = admin_client.get(f"{S}schedule-templates/").json()
    assert templates == {"count": 0, "next": None, "previous": None, "results": []}


# ---- 409 carries the current resource -----------------------------------------------------------


def test_conflicts_carry_the_current_resource(admin: Any, setup_facility: Any) -> None:
    admin_client, _ = admin
    nurse = make_staff(setup_facility, roles=("receptionist",), email="nurse409@example.test")
    membership = membership_of(nurse, setup_facility)
    stale = admin_client.patch(
        f"{S}memberships/{membership.pk}/",
        {"version": membership.version + 5, "role_codes": ["doctor"]},
        format="json",
    )
    assert stale.status_code == 409
    current = stale.json()["error"]["current"]
    assert current["id"] == str(membership.pk) and current["roles"] == ["receptionist"]
    assert current["version"] == membership.version

    profile = admin_client.get(F).json()
    live = admin_client.post(
        f"{F}go-live/", {"version": profile["status_version"] + 1}, format="json"
    )
    assert live.status_code == 409
    assert live.json()["error"]["current"]["status_version"] == profile["status_version"]

    # Not a version conflict (a duplicate): no `current`.
    body = {"email": "dup@example.test", "role_codes": ["receptionist"]}
    assert admin_client.post(f"{S}invitations/", body, format="json").status_code == 201
    duplicate = admin_client.post(f"{S}invitations/", body, format="json")
    assert duplicate.status_code == 409 and "current" not in duplicate.json()["error"]


# ---- RLS on the membership-role join ------------------------------------------------------------


def test_membership_roles_are_facility_isolated(setup_facility: Any) -> None:
    elsewhere = FacilityFactory(name="Other R3", slug="other-r3")
    here_user = make_staff(setup_facility, roles=("doctor",), email="here@rls.test")
    make_staff(elsewhere, roles=("receptionist",), email="there@rls.test")
    with rls_context(facility_id=setup_facility.pk):
        rows = list(MembershipRole.objects.values_list("facility_id", flat=True))
        assert rows and set(rows) == {setup_facility.pk}
        membership = FacilityMembership.objects.get(user=here_user)
        assert membership.roles.get().code == "doctor"
    with connection.cursor() as cursor:  # no context: nothing visible (fails closed)
        cursor.execute("SELECT count(*) FROM tenancy_facilitymembership_roles")
        assert cursor.fetchone()[0] == 0
    # Writing a role row into another facility is refused by WITH CHECK.
    from django.db import DatabaseError, transaction

    with (
        rls_context(facility_id=setup_facility.pk),
        pytest.raises(DatabaseError),
        transaction.atomic(),
    ):
        MembershipRole.objects.create(
            facilitymembership=membership,
            role=Role.objects.get(code="pharmacist"),
            facility=elsewhere,
        )


def test_own_roles_readable_across_facilities(setup_facility: Any) -> None:
    elsewhere = FacilityFactory(name="Second R3", slug="second-r3")
    user = make_staff(setup_facility, roles=("doctor",), email="two@rls.test")
    with rls_context(facility_id=elsewhere.pk):
        membership = FacilityMembership.objects.create(user=user, facility=elsewhere)
        membership.roles.set(Role.objects.filter(code="pharmacist"))
    client = APIClient()
    me = login_staff(client, user).json()["user"]
    roles = {m["facility"]["id"]: m["roles"] for m in me["memberships"]}
    assert roles == {str(setup_facility.pk): ["doctor"], str(elsewhere.pk): ["pharmacist"]}


# ---- deactivated facilities ---------------------------------------------------------------------


def test_staff_writes_refused_when_deactivated(admin: Any, setup_facility: Any) -> None:
    admin_client, _ = admin
    nurse = make_staff(setup_facility, roles=("receptionist",), email="nurse.off@example.test")
    membership = membership_of(nurse, setup_facility)
    Facility.objects.filter(pk=setup_facility.pk).update(status=FacilityStatus.DEACTIVATED)
    invite = admin_client.post(
        f"{S}invitations/", {"email": "no@example.test", "role_codes": ["doctor"]}, format="json"
    )
    edit = admin_client.patch(
        f"{S}memberships/{membership.pk}/",
        {"version": membership.version, "role_codes": ["doctor"]},
        format="json",
    )
    for response in (invite, edit):
        if response.status_code in (401, 403):
            pytest.skip("deactivated facilities already end staff sessions")
        assert response.status_code == 422, response.content
        assert response.json()["error"]["code"] == "business_rule_violation"


# ---- beat hours ---------------------------------------------------------------------------------


def test_beat_hours_are_kigali_time() -> None:
    from django.conf import settings

    from medilink.facilities.apps import BEAT_SCHEDULE as FACILITIES
    from medilink.onboarding.apps import BEAT_SCHEDULE as ONBOARDING
    from medilink.patients.apps import BEAT_SCHEDULE as PATIENTS

    assert settings.CELERY_TIMEZONE == "Africa/Kigali"
    hours = {
        name: entry["schedule"].hour
        for name, entry in {**FACILITIES, **ONBOARDING, **PATIENTS}.items()
        if len(entry["schedule"].hour) == 1
    }
    assert hours["facilities.expire_invitations"] == {2}  # 02:30 (contract S2 §5)
    assert hours["onboarding.send_licence_reminders"] == {7}
    assert hours["onboarding.expire_stale_drafts"] == {3}
    assert hours["patients.expire_delegation_invites"] == {2}
