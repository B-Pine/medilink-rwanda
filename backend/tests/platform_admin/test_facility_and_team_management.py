"""Platform management (2026-11-18): facility summary and "no admin" filter, a facility's staff
and invitations, correcting platform-managed facts, roles at a facility, the platform team."""

from __future__ import annotations

from typing import Any

import pytest
from django.core import mail
from django.core.cache import cache
from rest_framework.test import APIClient

from medilink.audit.models import AuditEntry
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import FacilityMembership, FacilityStatus
from tests.conftest import error_code, login_staff
from tests.factories import FacilityFactory, make_patient_user, make_staff
from tests.masterdata.conftest import age_recent_auth
from tests.s4.conftest import admin, clinic, desk  # noqa: F401

pytestmark = pytest.mark.django_db
PL = "/api/v1/platform/"
WHY = {"reason": "The facility admin left the clinic."}


@pytest.fixture(autouse=True)
def _clean_cache() -> Any:
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def platform() -> tuple[APIClient, Any]:
    user = make_staff(None, email="plat.mgmt@example.test", is_platform_admin=True)
    client = APIClient()
    login_staff(client, user)
    return client, user


def test_summary_and_no_admin_filter(
    platform: tuple[APIClient, Any],
    clinic: Any,  # noqa: F811
    admin: Any,  # noqa: F811
) -> None:
    client, _ = platform
    orphan = FacilityFactory(name="Nyamata Clinic", slug="nyamata", status=FacilityStatus.LIVE)
    summary = client.get(f"{PL}facilities/summary/").json()
    assert summary["total"] == 2 and summary["by_status"]["live"] == 2
    assert summary["no_admin"] == 1
    listed = client.get(f"{PL}facilities/", {"no_admin": "true"}).json()["results"]
    assert [r["id"] for r in listed] == [str(orphan.pk)]
    assert "cover_url" in listed[0] and "logo_url" in listed[0]


def test_staff_invite_and_cancel(
    platform: tuple[APIClient, Any],
    clinic: Any,  # noqa: F811
    admin: Any,  # noqa: F811
    desk: Any,  # noqa: F811
    django_capture_on_commit_callbacks: Any,
) -> None:
    client, _ = platform
    staff = client.get(f"{PL}facilities/{clinic.pk}/staff/").json()
    assert {m["email"] for m in staff["members"]} == {admin[1].email, desk[1].email}
    assert staff["invitations"] == []

    body = {"email": "new.admin@example.test", "role_codes": ["facility_admin"], **WHY}
    with django_capture_on_commit_callbacks(execute=True):
        invited = client.post(f"{PL}facilities/{clinic.pk}/invitations/", body, format="json")
    assert invited.status_code == 201, invited.content
    rows = invited.json()["invitations"]
    assert rows[0]["email"] == "new.admin@example.test"
    assert rows[0]["role_codes"] == ["facility_admin"]
    assert mail.outbox and "new.admin@example.test" in mail.outbox[-1].to
    entry = AuditEntry.objects.get(action="facility.staff_invited")
    assert entry.reason == WHY["reason"]

    again = client.post(f"{PL}facilities/{clinic.pk}/invitations/", body, format="json")
    assert again.status_code == 409  # already invited
    member = client.post(
        f"{PL}facilities/{clinic.pk}/invitations/",
        {"email": desk[1].email, "role_codes": ["doctor"], **WHY},
        format="json",
    )
    assert member.status_code == 409  # already works there

    cancelled = client.delete(f"{PL}facilities/{clinic.pk}/invitations/{rows[0]['id']}/")
    assert cancelled.status_code == 200 and cancelled.json()["invitations"] == []


def test_invite_needs_step_up_and_a_reason(
    platform: tuple[APIClient, Any],
    clinic: Any,  # noqa: F811
) -> None:
    client, _ = platform
    no_reason = client.post(
        f"{PL}facilities/{clinic.pk}/invitations/",
        {"email": "x@example.test", "role_codes": ["facility_admin"]},
        format="json",
    )
    assert no_reason.status_code == 400
    age_recent_auth(client)
    stale = client.post(
        f"{PL}facilities/{clinic.pk}/invitations/",
        {"email": "x@example.test", "role_codes": ["facility_admin"], **WHY},
        format="json",
    )
    assert stale.status_code == 403 and error_code(stale) == "step_up_required"


def test_correct_platform_managed_details(
    platform: tuple[APIClient, Any],
    clinic: Any,  # noqa: F811
    django_capture_on_commit_callbacks: Any,
) -> None:
    client, _ = platform
    with django_capture_on_commit_callbacks(execute=True):
        saved = client.patch(
            f"{PL}facilities/{clinic.pk}/details/",
            {
                "name": "Gisozi Medical Clinic",
                "ownership": "faith_based",
                "level_of_care": "secondary",
                "reason": "Name corrected per the MoH register.",
            },
            format="json",
        )
    assert saved.status_code == 200, saved.content
    data = saved.json()
    assert data["name"] == "Gisozi Medical Clinic" and data["slug"] == "gisozi"
    assert data["ownership"] == "faith_based" and data["level_of_care"] == "secondary"
    entry = AuditEntry.objects.get(action="facility.details_updated")
    assert entry.metadata["fields"] == ["level_of_care", "name", "ownership"]
    assert entry.reason.startswith("Name corrected")
    bad = client.patch(f"{PL}facilities/{clinic.pk}/details/", {"name": "X Y"}, format="json")
    assert bad.status_code == 400  # a reason is required


def test_change_roles_keeps_one_admin(
    platform: tuple[APIClient, Any],
    clinic: Any,  # noqa: F811
    admin: Any,  # noqa: F811
    desk: Any,  # noqa: F811
) -> None:
    client, _ = platform
    url = f"{PL}users/{desk[1].pk}/facilities/{clinic.pk}/roles/"
    promoted = client.post(
        url, {"role_codes": ["receptionist", "facility_admin"], **WHY}, format="json"
    )
    assert promoted.status_code == 200, promoted.content
    with rls_context(facility_id=clinic.pk):
        roles = set(
            FacilityMembership.objects.get(user=desk[1], facility=clinic).roles.values_list(
                "code", flat=True
            )
        )
    assert roles == {"receptionist", "facility_admin"}
    assert AuditEntry.objects.filter(action="platform.user.roles_changed").count() == 1

    # the old admin can step down now; the last admin can't
    old = f"{PL}users/{admin[1].pk}/facilities/{clinic.pk}/roles/"
    assert client.post(old, {"role_codes": ["doctor"], **WHY}, format="json").status_code == 200
    last = client.post(url, {"role_codes": ["receptionist"], **WHY}, format="json")
    assert last.status_code == 422


def test_platform_team_grant_and_revoke(
    platform: tuple[APIClient, Any],
    clinic: Any,  # noqa: F811
    desk: Any,  # noqa: F811
) -> None:
    client, me = platform
    person = make_staff(None, email="ops.person@example.test")
    granted = client.post(f"{PL}users/{person.pk}/platform-admin/grant/", WHY, format="json")
    assert granted.status_code == 200, granted.content
    person.refresh_from_db()
    assert person.is_platform_admin

    patient = make_patient_user(email="pat.team@example.test")
    refused = client.post(f"{PL}users/{patient.pk}/platform-admin/grant/", WHY, format="json")
    assert refused.status_code == 422

    revoked = client.post(f"{PL}users/{person.pk}/platform-admin/revoke/", WHY, format="json")
    assert revoked.status_code == 200
    person.refresh_from_db()
    assert not person.is_platform_admin
    assert AuditEntry.objects.filter(action="platform.user.platform_admin_revoked").exists()

    own = client.post(f"{PL}users/{me.pk}/platform-admin/revoke/", WHY, format="json")
    assert own.status_code == 422  # never your own account
