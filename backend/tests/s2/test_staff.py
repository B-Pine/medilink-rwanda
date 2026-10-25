"""S2 staff: invitations and acceptance, role edits, deactivation, MFA reset, attestation, the S1
approval hook, and the full checklist → go-live path."""

from __future__ import annotations

import re
from typing import Any

import pytest
from django.core import mail
from rest_framework.test import APIClient

from medilink.accounts.models import User
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import FacilityMembership, Invitation
from tests.factories import PASSWORD, make_staff
from tests.s2.conftest import NAMES, F, S, attest, make_catalogue, membership_of, set_hours

pytestmark = pytest.mark.django_db
AUTH = "/api/v1/staff/auth/invitations/"


def _invite(client: Any, email: str, capture: Any, roles: list[str] | None = None) -> str:
    mail.outbox.clear()
    with capture(execute=True):
        response = client.post(
            f"{S}invitations/",
            {"email": email, "role_codes": roles or ["receptionist"]},
            format="json",
        )
    assert response.status_code == 201, response.content
    return re.search(r"/invite/([\w-]+)", mail.outbox[-1].body).group(1)  # type: ignore[union-attr]


def test_invite_new_account_and_accept(
    admin_client: Any, django_capture_on_commit_callbacks: Any
) -> None:
    token = _invite(admin_client, "new.nurse@example.test", django_capture_on_commit_callbacks)
    again = admin_client.post(
        f"{S}invitations/",
        {"email": "new.nurse@example.test", "role_codes": ["receptionist"]},
        format="json",
    )
    assert again.status_code == 409
    anon = APIClient()
    info = anon.post(f"{AUTH}lookup/", {"token": token}, format="json").json()
    assert info["account_exists"] is False and info["email_masked"].startswith("n•••@")
    assert anon.post(f"{AUTH}lookup/", {"token": "bad"}, format="json").status_code == 400
    weak = anon.post(
        f"{AUTH}accept/",
        {"token": token, "full_name": "Nurse New", "password": "short"},
        format="json",
    )
    assert weak.status_code == 400
    accepted = anon.post(
        f"{AUTH}accept/",
        {"token": token, "full_name": "Nurse New", "password": PASSWORD + " staff"},
        format="json",
    )
    assert accepted.status_code == 200, accepted.content
    assert accepted.json()["status"] == "mfa_setup_required"
    assert (
        anon.post(f"{AUTH}accept/", {"token": token, "password": "x"}, format="json").status_code
        == 400
    )  # single use
    listed = admin_client.get(f"{S}memberships/").json()["results"]
    assert "new.nurse@example.test" in [m["email"] for m in listed]


def test_existing_account_accepts_with_password(
    admin_client: Any, other_facility: Any, django_capture_on_commit_callbacks: Any
) -> None:
    existing = make_staff(other_facility, roles=("doctor",), email="doc.elsewhere@example.test")
    token = _invite(admin_client, existing.email, django_capture_on_commit_callbacks, ["doctor"])
    anon = APIClient()
    assert (
        anon.post(f"{AUTH}lookup/", {"token": token}, format="json").json()["account_exists"]
        is True
    )
    wrong = anon.post(f"{AUTH}accept/", {"token": token, "password": "nope"}, format="json")
    assert wrong.status_code == 400
    ok = anon.post(f"{AUTH}accept/", {"token": token, "password": PASSWORD}, format="json")
    assert ok.status_code == 200
    assert ok.json()["status"] == "mfa_required"


def test_resend_invalidates_and_revoke(
    admin_client: Any, django_capture_on_commit_callbacks: Any
) -> None:
    token = _invite(admin_client, "temp@example.test", django_capture_on_commit_callbacks)
    invitation = admin_client.get(f"{S}invitations/").json()["results"][0]
    with django_capture_on_commit_callbacks(execute=True):
        assert admin_client.post(f"{S}invitations/{invitation['id']}/resend/").status_code == 200
    assert APIClient().post(f"{AUTH}lookup/", {"token": token}, format="json").status_code == 400
    revoked = admin_client.post(f"{S}invitations/{invitation['id']}/revoke/")
    assert revoked.json()["status"] == "revoked"


def test_roles_last_admin_and_deactivation(admin: Any, setup_facility: Any) -> None:
    admin_client, admin_user = admin
    nurse = make_staff(setup_facility, roles=("receptionist",), email="desk3@example.test")
    nurse_membership = membership_of(nurse, setup_facility)
    me = membership_of(admin_user, setup_facility)
    demote = admin_client.patch(
        f"{S}memberships/{me.pk}/",
        {"version": me.version, "role_codes": ["receptionist"]},
        format="json",
    )
    assert demote.status_code == 422
    promoted = admin_client.patch(
        f"{S}memberships/{nurse_membership.pk}/",
        {"version": nurse_membership.version, "role_codes": ["receptionist", "doctor"]},
        format="json",
    )
    assert promoted.status_code == 200
    assert promoted.json()["roles"] == ["doctor", "receptionist"]
    assert (
        admin_client.post(
            f"{S}memberships/{me.pk}/deactivate/", {"reason": "x"}, format="json"
        ).status_code
        == 422
    )
    nurse_client = APIClient()
    from tests.conftest import login_staff

    login_staff(nurse_client, nurse)
    assert nurse_client.get(F).status_code == 200
    off = admin_client.post(
        f"{S}memberships/{nurse_membership.pk}/deactivate/",
        {"reason": "Left the clinic"},
        format="json",
    )
    assert off.status_code == 200
    assert off.json()["is_active"] is False
    assert nurse_client.get(F).status_code in (401, 403)  # access ends at the next request
    assert (
        admin_client.post(f"{S}memberships/{nurse_membership.pk}/reactivate/").json()["is_active"]
        is True
    )


def test_mfa_reset_and_attestation(
    admin: Any, setup_facility: Any, django_capture_on_commit_callbacks: Any
) -> None:
    from django_otp.plugins.otp_totp.models import TOTPDevice

    admin_client, admin_user = admin
    doc = make_staff(setup_facility, roles=("doctor",), email="doc3@example.test")
    membership = membership_of(doc, setup_facility)
    assert admin_client.post(f"{S}memberships/{membership.pk}/attest-licence/").status_code == 422
    doc_client = APIClient()
    from tests.conftest import login_staff

    login_staff(doc_client, doc)
    profile = doc_client.patch(
        f"{S}clinician-profile/", {"council": "rmdc", "licence_number": "RMDC/77"}, format="json"
    )
    assert profile.status_code == 200
    attested = admin_client.post(f"{S}memberships/{membership.pk}/attest-licence/")
    assert attested.json()["clinician"]["attested_at"] is not None
    self_reset = admin_client.post(
        f"{S}memberships/{membership_of(admin_user, setup_facility).pk}/mfa-reset/"
    )
    assert self_reset.status_code == 422
    with django_capture_on_commit_callbacks(execute=True):
        reset = admin_client.post(f"{S}memberships/{membership.pk}/mfa-reset/")
    assert reset.status_code == 200
    assert not TOTPDevice.objects.filter(user=doc).exists()
    assert doc_client.get(F).status_code == 401  # sessions ended


def test_approval_hook_invites_admin_and_starts_setup(
    db: Any, django_capture_on_commit_callbacks: Any
) -> None:
    from medilink.onboarding.models import Application
    from medilink.onboarding.services import application_approved
    from medilink.tenancy.models import FacilityStatus
    from tests.factories import FacilityFactory

    platform = make_staff(None, email="plat@example.test", is_platform_admin=True)
    facility = FacilityFactory(status=FacilityStatus.APPROVED)
    with rls_context(facility_id=facility.pk):
        application = Application.objects.create(
            status="approved",
            facility_name="X",
            facility_id=facility.pk,
            reviewer=platform,
            applicant_name="A",
            applicant_email="a@example.test",
            proposed_admin_name="Admin",
            proposed_admin_email="boss@example.test",
        )
    mail.outbox.clear()
    with django_capture_on_commit_callbacks(execute=True):
        application_approved.send(
            sender=None, application_id=application.pk, facility_id=facility.pk
        )
        application_approved.send(
            sender=None, application_id=application.pk, facility_id=facility.pk
        )
    facility.refresh_from_db()
    assert facility.status == FacilityStatus.SETUP
    with rls_context(facility_id=facility.pk):
        assert Invitation.objects.filter(facility=facility, email="boss@example.test").count() == 1
    assert any("boss@example.test" in m.to for m in mail.outbox)


def test_full_setup_then_go_live(admin: Any, setup_facility: Any) -> None:
    from medilink.onboarding.models import FacilityLicence

    admin_client, _ = admin
    profile = admin_client.get(F).json()
    admin_client.patch(
        F,
        {
            "version": profile["version"],
            "phone": "+250788000001",
            "address": "KG 1",
            "latitude": "-1.95",
            "longitude": "30.06",
        },
        format="json",
    )
    catalogue = make_catalogue(admin_client)
    set_hours(admin_client)
    doc = make_staff(setup_facility, roles=("doctor",), email="doc4@example.test")
    attest(doc, setup_facility, "RMDC/9")
    template = admin_client.post(
        f"{S}schedule-templates/",
        {
            "membership_id": str(membership_of(doc, setup_facility).pk),
            "service_id": catalogue["service"]["id"],
            "weekday": 0,
            "starts_at": "08:00",
            "ends_at": "12:00",
            "slot_minutes": 15,
        },
        format="json",
    )
    assert template.status_code == 201, template.content
    admin_client.post(
        f"{S}tariff-items/",
        {
            "code": "CONS",
            "name_i18n": NAMES,
            "kind": "service",
            "service_id": catalogue["service"]["id"],
            "amount_rwf": 3000,
        },
        format="json",
    )
    settings = admin_client.get(f"{F}settings/").json()
    admin_client.patch(
        f"{F}settings/",
        {"version": settings["version"], "section": "billing", "values": {"no_insurers": True}},
        format="json",
    )
    from django.utils import timezone

    FacilityLicence.objects.create(
        facility=setup_facility,
        kind="moh_operating",
        number="MOH-1",
        issued_on=timezone.localdate(),
        expires_on=timezone.localdate().replace(year=timezone.localdate().year + 1),
    )
    checklist = admin_client.get(f"{F}setup-checklist/").json()
    assert checklist["complete"] is True, checklist
    from medilink.onboarding.services import facility_version

    live = admin_client.post(
        f"{F}go-live/", {"version": facility_version(setup_facility)}, format="json"
    )
    assert live.status_code == 200, live.content
    assert live.json()["status"] == "live"


def test_staff_endpoints_need_staff_manage(reception: Any) -> None:
    assert reception.get(f"{S}memberships/").status_code == 403
    assert (
        reception.post(
            f"{S}invitations/", {"email": "x@example.test", "role_codes": ["doctor"]}, format="json"
        ).status_code
        == 403
    )
    assert reception.get(f"{S}roles/").status_code == 200
    assert User.objects.exists()
    assert FacilityMembership.objects.model is FacilityMembership
