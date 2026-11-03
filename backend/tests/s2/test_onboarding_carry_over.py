"""Approval keeps what the applicant gave (2026-11-03): the facility profile, and the proposed
admin's name, phone and language on the invitation and the new account. Staff edit their own
name, work phone and language."""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Any

import pytest
from django.core import mail
from rest_framework.test import APIClient

from medilink.accounts.models import User
from medilink.audit.models import AuditEntry
from medilink.facilities.models import ConfigChange, Profile
from medilink.masterdata.models import Location
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import FacilityStatus, Invitation
from tests.conftest import login_staff
from tests.factories import PASSWORD, make_staff
from tests.s2.conftest import S

pytestmark = pytest.mark.django_db
AUTH = "/api/v1/staff/auth/"


def _approved_application(**fields: Any) -> tuple[Any, Any, Any]:
    from medilink.onboarding.models import Application
    from tests.factories import FacilityFactory

    platform = make_staff(None, email="plat@example.test", is_platform_admin=True)
    facility = FacilityFactory(status=FacilityStatus.APPROVED, facility_type="health_center")
    with rls_context(facility_id=facility.pk):
        application = Application.objects.create(
            status="approved",
            facility_name="Ubuzima Health Centre",
            facility_id=facility.pk,
            reviewer=platform,
            applicant_name="A",
            applicant_email="a@example.test",
            proposed_admin_name="Uwase Diane",
            proposed_admin_email="diane@example.test",
            proposed_admin_phone="0788 123 456",
            preferred_language="en",
            phone="+250788000111",
            email="info@ubuzima.example",
            village=Location.objects.get(code="12090101"),
            address="KG 11 Ave 5",
            latitude=Decimal("-1.944200"),
            longitude=Decimal("30.123400"),
            **fields,
        )
    return platform, facility, application


def _approve(application: Any, facility: Any, capture: Any) -> str:
    from medilink.onboarding.services import application_approved

    mail.outbox.clear()
    with capture(execute=True):
        for _ in range(2):  # idempotent
            application_approved.send(
                sender=None, application_id=application.pk, facility_id=facility.pk
            )
    return re.search(r"/invite/([\w-]+)", mail.outbox[-1].body).group(1)  # type: ignore[union-attr]


def test_approval_copies_the_application_into_the_profile(
    django_capture_on_commit_callbacks: Any,
) -> None:
    _platform, facility, application = _approved_application()
    _approve(application, facility, django_capture_on_commit_callbacks)
    with rls_context(facility_id=facility.pk):
        profile = Profile.objects.get(facility=facility)
        logged = set(
            ConfigChange.objects.filter(facility=facility, entity="profile").values_list(
                "field", flat=True
            )
        )
        invitation = Invitation.objects.get(facility=facility)
    assert (profile.phone, profile.email, profile.address) == (
        "+250788000111",
        "info@ubuzima.example",
        "KG 11 Ave 5",
    )
    assert profile.village_code == "12090101"
    assert (profile.latitude, profile.longitude) == (Decimal("-1.944200"), Decimal("30.123400"))
    assert profile.level_of_care == "primary"  # from the facility type when not given
    assert profile.version == 2  # one change, not two (the second signal fills nothing)
    assert {"phone", "address", "village_code", "latitude", "level_of_care"} <= logged
    assert (invitation.full_name, invitation.phone, invitation.preferred_language) == (
        "Uwase Diane",
        "+250788123456",
        "en",
    )


def test_approval_keeps_what_the_facility_already_set(
    django_capture_on_commit_callbacks: Any,
) -> None:
    _platform, facility, application = _approved_application(level_of_care="secondary")
    with rls_context(facility_id=facility.pk):
        Profile.objects.create(facility=facility, phone="+250722000999")
    _approve(application, facility, django_capture_on_commit_callbacks)
    with rls_context(facility_id=facility.pk):
        profile = Profile.objects.get(facility=facility)
    assert profile.phone == "+250722000999"  # not overwritten
    assert profile.address == "KG 11 Ave 5" and profile.level_of_care == "secondary"


def test_new_admin_account_gets_name_phone_and_language(
    django_capture_on_commit_callbacks: Any,
) -> None:
    _platform, facility, application = _approved_application()
    token = _approve(application, facility, django_capture_on_commit_callbacks)
    anon = APIClient()
    info = anon.post(f"{AUTH}invitations/lookup/", {"token": token}, format="json").json()
    assert info["suggested_name"] == "Uwase Diane"
    # the name may be left out: the inviter's is used
    accepted = anon.post(
        f"{AUTH}invitations/accept/", {"token": token, "password": PASSWORD + " x"}, format="json"
    )
    assert accepted.status_code == 200, accepted.content
    user = User.objects.get(email="diane@example.test")
    assert (user.full_name, user.phone, user.preferred_language) == (
        "Uwase Diane",
        "+250788123456",
        "en",
    )


def test_invite_form_name_and_phone_prefill_the_account(
    admin_client: Any, django_capture_on_commit_callbacks: Any
) -> None:
    mail.outbox.clear()
    with django_capture_on_commit_callbacks(execute=True):
        created = admin_client.post(
            f"{S}invitations/",
            {
                "email": "nurse.two@example.test",
                "role_codes": ["receptionist"],
                "full_name": "Mugisha Eric",
                "phone": "0722 111 222",
            },
            format="json",
        )
    assert created.status_code == 201, created.content
    assert created.json()["full_name"] == "Mugisha Eric"
    assert created.json()["phone"] == "+250722111222"
    bad = admin_client.post(
        f"{S}invitations/",
        {"email": "x@example.test", "role_codes": ["receptionist"], "phone": "12345"},
        format="json",
    )
    assert bad.status_code == 400 and "phone" in bad.json()["error"]["fields"]
    token = re.search(r"/invite/([\w-]+)", mail.outbox[-1].body).group(1)  # type: ignore[union-attr]
    accepted = APIClient().post(
        f"{AUTH}invitations/accept/",
        {"token": token, "full_name": "Mugisha Eric J.", "password": PASSWORD + " y"},
        format="json",
    )
    assert accepted.status_code == 200
    user = User.objects.get(email="nurse.two@example.test")
    assert user.full_name == "Mugisha Eric J." and user.phone == "+250722111222"
    members = admin_client.get(f"{S}memberships/").json()["results"]
    assert {"email": "nurse.two@example.test", "phone": "+250722111222"}.items() <= next(
        m for m in members if m["email"] == "nurse.two@example.test"
    ).items()


@pytest.mark.parametrize(
    ("own", "kept"), [("+250788999000", "+250788999000"), ("", "+250722333444")]
)
def test_existing_account_keeps_its_own_phone(
    own: str,
    kept: str,
    admin_client: Any,
    other_facility: Any,
    django_capture_on_commit_callbacks: Any,
) -> None:
    person = make_staff(other_facility, roles=("doctor",), email="has.phone@example.test")
    person.phone = own
    person.save()
    mail.outbox.clear()
    with django_capture_on_commit_callbacks(execute=True):
        admin_client.post(
            f"{S}invitations/",
            {"email": person.email, "role_codes": ["doctor"], "phone": "0722333444"},
            format="json",
        )
    token = re.search(r"/invite/([\w-]+)", mail.outbox[-1].body).group(1)  # type: ignore[union-attr]
    client = APIClient()
    login_staff(client, person)
    assert (
        client.post(f"{AUTH}invitations/accept/", {"token": token}, format="json").status_code
        == 200
    )
    person.refresh_from_db()
    assert person.phone == kept  # filled only when the account had none


def test_staff_edit_their_own_account(setup_facility: Any) -> None:
    person = make_staff(setup_facility, roles=("receptionist",), email="me@example.test")
    client = APIClient()
    login_staff(client, person)
    me = client.get(f"{AUTH}me/").json()
    assert me["phone"] == ""
    updated = client.patch(
        f"{AUTH}me/",
        {"full_name": "  Ingabire   Claire ", "phone": "0788 000 222", "preferred_language": "fr"},
        format="json",
    )
    assert updated.status_code == 200, updated.content
    body = updated.json()
    assert (body["full_name"], body["phone"], body["preferred_language"]) == (
        "Ingabire Claire",
        "+250788000222",
        "fr",
    )
    assert AuditEntry.objects.filter(action="staff.account.updated", object_id=str(person.pk))
    assert client.patch(f"{AUTH}me/", {"phone": "0123"}, format="json").status_code == 400
    assert client.patch(f"{AUTH}me/", {"email": "x@y.z"}, format="json").status_code == 400
    assert client.patch(f"{AUTH}me/", {"phone": ""}, format="json").json()["phone"] == ""
    assert APIClient().patch(f"{AUTH}me/", {"phone": ""}, format="json").status_code == 401
