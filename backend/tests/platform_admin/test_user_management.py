"""Super admin user management (#198): directory filters, counts and export, correcting an
account, help emails, the sign-in block, and facility access."""

from __future__ import annotations

from typing import Any

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from medilink.accounts.lockout import login_policy
from medilink.audit.models import AuditEntry
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import FacilityMembership
from tests.conftest import error_code, login_staff
from tests.factories import UserFactory, make_patient_user, make_staff
from tests.masterdata.conftest import age_recent_auth
from tests.s4.conftest import admin, clinic, desk, patient_keys  # noqa: F401

pytestmark = pytest.mark.django_db
PL = "/api/v1/platform/"
WHY = {"reason": "The person called the help desk."}


@pytest.fixture(autouse=True)
def _clean_cache() -> Any:
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def platform() -> tuple[APIClient, Any]:
    user = make_staff(None, email="plat.users@example.test", is_platform_admin=True)
    client = APIClient()
    login_staff(client, user)
    return client, user


def ids(response: Any) -> set[str]:
    return {r["id"] for r in response.json()["results"]}


def test_directory_filters_and_summary(
    platform: tuple[APIClient, Any],
    clinic: Any,  # noqa: F811
    admin: Any,  # noqa: F811
    desk: Any,  # noqa: F811
) -> None:
    client, _me = platform
    receptionist, facility_admin = desk[1], admin[1]
    receptionist.phone = "+250788123456"
    receptionist.save()
    patient = make_patient_user(email="pat.users@example.test")
    pending = UserFactory(email="new.users@example.test", email_verification_pending=True)

    at_clinic = ids(client.get(f"{PL}users/", {"facility": str(clinic.pk)}))
    assert at_clinic == {str(receptionist.pk), str(facility_admin.pk)}
    admins = ids(client.get(f"{PL}users/", {"role": "facility_admin"}))
    assert str(facility_admin.pk) in admins and str(receptionist.pk) not in admins
    assert ids(client.get(f"{PL}users/", {"q": "0788 123 456"})) == {str(receptionist.pk)}
    patients = ids(client.get(f"{PL}users/", {"kind": "patient"}))
    assert str(patient.pk) in patients and str(receptionist.pk) not in patients
    assert ids(client.get(f"{PL}users/", {"verification": "pending"})) == {str(pending.pk)}

    summary = client.get(f"{PL}users/summary/").json()
    assert summary["platform"] == 1 and summary["staff"] == 2
    assert summary["verification_pending"] == 1
    assert summary["total"] == summary["platform"] + summary["staff"] + summary["patient"]
    assert summary["facilities"] == [{"id": str(clinic.pk), "name": clinic.name}]


def test_export_is_staff_only_formula_safe_and_audited(
    platform: tuple[APIClient, Any],
    desk: Any,  # noqa: F811
) -> None:
    client, _me = platform
    receptionist = desk[1]
    receptionist.full_name = "=HYPERLINK(1)"
    receptionist.save()
    patient = make_patient_user(email="pat.export@example.test")

    response = client.get(f"{PL}users/export/")
    assert response.status_code == 200
    assert response["Content-Type"].startswith("text/csv")
    body = response.content.decode("utf-8-sig")
    assert "'=HYPERLINK(1)" in body and receptionist.email in body
    assert patient.email not in body
    assert AuditEntry.objects.filter(action="platform.user.list_exported").exists()


def test_correct_an_account(
    platform: tuple[APIClient, Any],
    desk: Any,  # noqa: F811
) -> None:
    client, me = platform
    receptionist = desk[1]
    url = f"{PL}users/{receptionist.pk}/"

    assert client.patch(url, {"full_name": "Uwase Grace"}, format="json").status_code == 400
    response = client.patch(
        url,
        {"full_name": "Uwase Grace", "phone": "0788 555 111", "preferred_language": "fr", **WHY},
        format="json",
    )
    assert response.status_code == 200, response.content
    body = response.json()
    assert body["full_name"] == "Uwase Grace" and body["phone"] == "+250788555111"
    assert body["preferred_language"] == "fr"
    entry = AuditEntry.objects.get(action="platform.user.updated")
    assert entry.metadata["fields"] == ["full_name", "phone", "preferred_language"]
    assert entry.reason == WHY["reason"]
    assert body["changes"][0]["action"] == "platform.user.updated"

    patient = make_patient_user(email="pat.edit@example.test")
    refused = client.patch(
        f"{PL}users/{patient.pk}/", {"phone": "0788000000", **WHY}, format="json"
    )
    assert refused.status_code == 400

    yourself = client.patch(f"{PL}users/{me.pk}/", {"full_name": "Me", **WHY}, format="json")
    assert yourself.status_code == 422

    age_recent_auth(client)
    stale = client.patch(url, {"full_name": "Someone", **WHY}, format="json")
    assert stale.status_code == 403 and error_code(stale) == "step_up_required"
    assert client.get(url).status_code == 200  # reading needs no step-up


def test_help_emails(
    platform: tuple[APIClient, Any],
    desk: Any,  # noqa: F811
    mailoutbox: Any,
    django_capture_on_commit_callbacks: Any,
) -> None:
    client, _me = platform
    receptionist = desk[1]
    url = f"{PL}users/{receptionist.pk}/"

    with django_capture_on_commit_callbacks(execute=True):
        sent = client.post(f"{url}send-password-reset/", WHY, format="json")
    assert sent.status_code == 200
    assert mailoutbox[-1].to == [receptionist.email]
    assert mailoutbox[-1].subject == "Reset your MediLink password"
    for _ in range(2):
        client.post(f"{url}send-password-reset/", WHY, format="json")
    limited = client.post(f"{url}send-password-reset/", WHY, format="json")
    assert limited.status_code == 422

    confirmed = client.post(f"{url}resend-verification/", WHY, format="json")
    assert confirmed.status_code == 422
    pending = UserFactory(email="pending.help@example.test", email_verification_pending=True)
    with django_capture_on_commit_callbacks(execute=True):
        resent = client.post(f"{PL}users/{pending.pk}/resend-verification/", WHY, format="json")
    assert resent.status_code == 200
    assert mailoutbox[-1].to == [pending.email]
    no_reset = client.post(f"{PL}users/{pending.pk}/send-password-reset/", WHY, format="json")
    assert no_reset.status_code == 422

    client.post(f"{url}lock/", WHY, format="json")
    locked = client.post(f"{url}send-password-reset/", WHY, format="json")
    assert locked.status_code == 422


def test_clear_the_sign_in_block(
    platform: tuple[APIClient, Any],
    desk: Any,  # noqa: F811
) -> None:
    client, _me = platform
    receptionist = desk[1]
    url = f"{PL}users/{receptionist.pk}/"
    policy = login_policy()
    for _ in range(policy.lock_after):
        policy.register_failure(receptionist.email)
    assert client.get(url).json()["sign_in_blocked_for"] > 0

    cleared = client.post(f"{url}clear-sign-in-block/", WHY, format="json")
    assert cleared.status_code == 200
    assert client.get(url).json()["sign_in_blocked_for"] == 0
    assert AuditEntry.objects.filter(action="platform.user.sign_in_unblocked").exists()


def test_remove_and_restore_facility_access(
    platform: tuple[APIClient, Any],
    clinic: Any,  # noqa: F811
    admin: Any,  # noqa: F811
    desk: Any,  # noqa: F811
) -> None:
    client, _me = platform
    receptionist, facility_admin = desk[1], admin[1]
    base = f"{PL}users/{receptionist.pk}/facilities/{clinic.pk}/"

    removed = client.post(
        f"{base}remove/", {"reason": "Left the clinic in October."}, format="json"
    )
    assert removed.status_code == 200, removed.content
    row = removed.json()["facilities"][0]
    assert row["is_active"] is False and row["deactivation_reason"] == "Left the clinic in October."
    assert removed.json()["changes"][0]["action"] == "staff.membership.deactivated"
    with rls_context(facility_id=clinic.pk):
        assert not FacilityMembership.objects.get(user=receptionist).is_active

    restored = client.post(f"{base}restore/", {"reason": "Came back in November."}, format="json")
    assert restored.json()["facilities"][0]["is_active"] is True
    assert AuditEntry.objects.filter(
        action="staff.membership.updated", reason="Came back in November."
    ).exists()

    last_admin = client.post(
        f"{PL}users/{facility_admin.pk}/facilities/{clinic.pk}/remove/", WHY, format="json"
    )
    assert last_admin.status_code == 422
    assert client.post(f"{base}delete/", WHY, format="json").status_code == 404


def test_facility_page_links_its_admins(
    platform: tuple[APIClient, Any],
    clinic: Any,  # noqa: F811
    admin: Any,  # noqa: F811
) -> None:
    client, _me = platform
    body = client.get(f"{PL}facilities/{clinic.pk}/").json()
    assert body["admins"][0]["user_id"] == str(admin[1].pk)
