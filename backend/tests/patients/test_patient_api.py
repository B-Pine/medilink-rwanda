"""Patient endpoints (contract §3.2): profiles, rights per link, dependents, delegations,
identifiers, insurance, health items, consents, access history and record claims."""

from __future__ import annotations

import re
from typing import Any

import pytest
from django.core import mail

from medilink.patients.models import ClaimStatus, Patient, PatientLink, RecordClaim
from medilink.patients.tasks import expire_claims, expire_delegation_invites
from tests.factories import PASSWORD
from tests.patients.conftest import NATIONAL_ID, patient_client_for, walk_in

pytestmark = pytest.mark.django_db

P = "/api/v1/patient/"


def _self_id(client: Any) -> str:
    profiles = client.get(f"{P}profiles/").json()["results"]
    assert profiles[0]["relationship"] == "self"
    return str(profiles[0]["patient_id"])


def test_profiles_and_patch(patient_client: Any) -> None:
    pid = _self_id(patient_client)
    profile = patient_client.get(f"{P}profiles/{pid}/").json()
    assert profile["relationship"] == "self"
    response = patient_client.patch(
        f"{P}profiles/{pid}/",
        {
            "version": profile["version"],
            "date_of_birth": "1990-05-01",
            "sex": "female",
            "phone_e164": "0788999000",
            "emergency_contact": {
                "name": "Habimana Eric",
                "phone_e164": "0788000111",
                "relationship": "spouse",
            },
        },
        format="json",
    )
    assert response.status_code == 200, response.content
    data = response.json()
    assert data["phone_e164"] == "+250788999000"
    assert data["completion"]["details"] and data["completion"]["emergency_contact"]
    stale = patient_client.patch(
        f"{P}profiles/{pid}/", {"version": profile["version"]}, format="json"
    )
    assert stale.status_code == 409
    future = patient_client.patch(
        f"{P}profiles/{pid}/",
        {"version": data["version"], "date_of_birth": "2999-01-01"},
        format="json",
    )
    assert future.status_code == 400


def test_other_account_profile_is_404(patient_client: Any) -> None:
    other, _user = patient_client_for("other@example.test")
    pid = _self_id(other)
    assert patient_client.get(f"{P}profiles/{pid}/").status_code == 404
    assert patient_client.get(f"{P}profiles/{pid}/health-profile/").status_code == 404


def test_dependents_rules(patient_client: Any) -> None:
    adult = patient_client.post(
        f"{P}dependents/",
        {
            "relationship": "guardian",
            "full_name": "Keza Uwase",
            "sex": "female",
            "date_of_birth": "1980-01-01",
            "consent_version": "2026-10",
        },
        format="json",
    )
    assert adult.status_code == 422
    child = patient_client.post(
        f"{P}dependents/",
        {
            "relationship": "guardian",
            "full_name": "Keza Uwase",
            "sex": "female",
            "date_of_birth": "2019-04-02",
            "consent_version": "2026-10",
        },
        format="json",
    )
    assert child.status_code == 201, child.content
    assert child.json()["relationship"] == "guardian"
    unagreed = patient_client.post(
        f"{P}dependents/",
        {
            "relationship": "delegate",
            "full_name": "Old Parent",
            "sex": "male",
            "estimated_age_years": 70,
            "consent_version": "2026-10",
        },
        format="json",
    )
    assert unagreed.status_code == 422
    listed = patient_client.get(f"{P}profiles/").json()["results"]
    assert [p["relationship"] for p in listed] == ["self", "guardian"]


def test_delegation_invite_accept_rights_and_revoke(patient_client: Any) -> None:
    pid = _self_id(patient_client)
    wrong = patient_client.post(
        f"{P}delegations/",
        {"patient_id": pid, "current_password": "nope", "consent_version": "2026-10"},
        format="json",
    )
    assert wrong.status_code == 400
    assert "current_password" in wrong.json()["error"]["fields"]
    invite = patient_client.post(
        f"{P}delegations/",
        {"patient_id": pid, "current_password": PASSWORD, "consent_version": "2026-10"},
        format="json",
    )
    assert invite.status_code == 201, invite.content
    code = invite.json()["code"]
    assert re.fullmatch(r"[0-9A-Z]{4}-[0-9A-Z]{4}", code)
    assert invite.json()["relationship"] == "delegate"
    # the grantor can't accept their own invite
    assert (
        patient_client.post(f"{P}delegations/accept/", {"code": code}, format="json").status_code
        == 422
    )
    holder, _user = patient_client_for("holder@example.test", "Habimana Eric")
    bad = holder.post(f"{P}delegations/accept/", {"code": "AAAA-AAAA"}, format="json")
    assert bad.status_code == 400
    accepted = holder.post(f"{P}delegations/accept/", {"code": code.lower()}, format="json")
    assert accepted.status_code == 201
    assert accepted.json()["relationship"] == "delegate"
    # used code is invalid now
    assert holder.post(f"{P}delegations/accept/", {"code": code}, format="json").status_code == 400
    # delegates see the profile and edit contacts, not names, identifiers or history
    profile = holder.get(f"{P}profiles/{pid}/").json()
    assert (
        holder.patch(
            f"{P}profiles/{pid}/",
            {"version": profile["version"], "full_name": "Changed"},
            format="json",
        ).status_code
        == 403
    )
    assert (
        holder.patch(
            f"{P}profiles/{pid}/",
            {"version": profile["version"], "address": "Kimironko"},
            format="json",
        ).status_code
        == 200
    )
    assert (
        holder.post(
            f"{P}profiles/{pid}/identifiers/",
            {"kind": "national_id", "value": NATIONAL_ID},
            format="json",
        ).status_code
        == 403
    )
    assert holder.get(f"{P}profiles/{pid}/access-history/").status_code == 403
    granted = patient_client.get(f"{P}delegations/").json()["granted"]
    assert granted[0]["holder_name"] == "Habimana E."
    # access history of the owner shows the delegate's edit, not the owner's own actions
    history = patient_client.get(f"{P}profiles/{pid}/access-history/").json()["results"]
    assert {h["action"] for h in history} >= {"patients.delegation.accepted"}
    assert patient_client.post(f"{P}delegations/{granted[0]['id']}/revoke/").status_code == 204
    assert holder.get(f"{P}profiles/{pid}/").status_code == 404


def test_identifiers_patient_side(patient_client: Any, reception: Any) -> None:
    pid = _self_id(patient_client)
    added = patient_client.post(
        f"{P}profiles/{pid}/identifiers/",
        {"kind": "national_id", "value": "1199080011112222"},
        format="json",
    )
    assert added.status_code == 201, added.content
    replaced = patient_client.post(
        f"{P}profiles/{pid}/identifiers/",
        {"kind": "national_id", "value": "1199080011113333"},
        format="json",
    )
    assert replaced.status_code == 201
    listed = patient_client.get(f"{P}profiles/{pid}/identifiers/").json()["results"]
    assert [i["masked_value"] for i in listed] == ["••••3333"]
    reveal = patient_client.post(f"{P}profiles/{pid}/identifiers/{listed[0]['id']}/reveal/")
    assert reveal.json() == {"value": "1199080011113333"}
    walk_in(reception, identifier={"kind": "passport", "issuing_country": "UG", "value": "XY12345"})
    taken = patient_client.post(
        f"{P}profiles/{pid}/identifiers/",
        {"kind": "passport", "issuing_country": "UG", "value": "XY12345"},
        format="json",
    )
    assert taken.status_code == 409
    assert "value" in taken.json()["error"]["fields"]


def test_insurance_and_health_patient_side(patient_client: Any) -> None:
    pid = _self_id(patient_client)
    created = patient_client.post(
        f"{P}profiles/{pid}/insurance-profiles/",
        {"insurer_code": "mutuelle", "member_number": "1234567/01"},
        format="json",
    )
    assert created.status_code == 201
    profile = created.json()
    patched = patient_client.patch(
        f"{P}insurance-profiles/{profile['id']}/",
        {"version": profile["version"], "valid_until": "2099-01-01"},
        format="json",
    )
    assert patched.status_code == 200
    off = patient_client.post(f"{P}insurance-profiles/{profile['id']}/deactivate/")
    assert off.json()["is_active"] is False
    item = patient_client.post(
        f"{P}profiles/{pid}/allergies/",
        {"category": "food", "substance_text": "Peanuts"},
        format="json",
    )
    assert item.status_code == 201
    assert item.json()["verification_status"] == "unverified"
    removed = patient_client.post(
        f"{P}profiles/{pid}/allergies/{item.json()['id']}/entered-in-error/"
    )
    assert removed.status_code == 200
    assert patient_client.get(f"{P}profiles/{pid}/health-profile/").json()["allergies"] == []


def test_consents(patient_client: Any) -> None:
    pid = _self_id(patient_client)
    state = patient_client.get(f"{P}consents/").json()
    assert state["current_versions"]["terms"] == "2026-10"
    withdraw = patient_client.post(
        f"{P}consents/", {"kind": "terms", "version": "2026-10", "granted": False}, format="json"
    )
    assert withdraw.status_code == 422
    care = patient_client.post(
        f"{P}consents/",
        {"kind": "care", "version": "2026-10", "granted": True, "patient_id": pid},
        format="json",
    )
    assert care.status_code == 201
    assert patient_client.get(f"{P}profiles/{pid}/").json()["has_care_consent"] is True


def _facility_record_with_email(reception: Any) -> dict[str, Any]:
    data = walk_in(
        reception,
        full_name="Uwase Aline",
        date_of_birth="1995-07-07",
        identifier={"kind": "national_id", "value": NATIONAL_ID},
    )
    detail = reception.get(f"/api/v1/staff/patients/{data['facility_patient_id']}/").json()
    reception.patch(
        f"/api/v1/staff/patients/{data['facility_patient_id']}/",
        {
            "version": detail["version"],
            "patient_version": detail["patient_version"],
            "email": "aline@example.test",
        },
        format="json",
    )
    return data


def test_claim_by_email_code(reception: Any, django_capture_on_commit_callbacks: Any) -> None:
    record = _facility_record_with_email(reception)
    client, user = patient_client_for("aline.account@example.test", "Uwase Aline")
    nomatch = client.post(
        f"{P}record-claims/",
        {"lookup": {"medilink_number": record["medilink_number"]}, "date_of_birth": "1990-01-01"},
        format="json",
    )
    assert nomatch.status_code == 422
    mail.outbox.clear()
    with django_capture_on_commit_callbacks(execute=True):
        claim = client.post(
            f"{P}record-claims/",
            {
                "lookup": {"identifier": {"kind": "national_id", "value": NATIONAL_ID}},
                "date_of_birth": "1995-07-07",
            },
            format="json",
        )
    assert claim.status_code == 201, claim.content
    assert "aline@example.test" in mail.outbox[0].to
    body = claim.json()
    assert body["method"] == "contact_code" and body["contact_hint"] == "a•••@e•••.test"
    assert body["reference"] is None
    code = re.search(r"\b(\d{6})\b", mail.outbox[0].body).group(1)  # type: ignore[union-attr]
    wrong = client.post(f"{P}record-claims/{body['id']}/verify/", {"code": "000000"}, format="json")
    if code != "000000":
        assert wrong.status_code == 400
        assert RecordClaim.objects.get(pk=body["id"]).attempts == 1
    done = client.post(f"{P}record-claims/{body['id']}/verify/", {"code": code}, format="json")
    assert done.status_code == 200, done.content
    assert done.json()["claim"]["status"] == "completed"
    assert str(done.json()["profile"]["patient_id"]) == record["patient_id"]
    link = PatientLink.objects.active().get(account=user, relationship="self")
    assert str(link.patient_id) == record["patient_id"]


def test_claim_by_reception_and_failed_codes(reception: Any) -> None:
    record = walk_in(reception, full_name="Ntwari Paul", sex="male", date_of_birth="1988-02-02")
    client, _user = patient_client_for("paul@example.test", "Ntwari Paul")
    claim = client.post(
        f"{P}record-claims/",
        {
            "lookup": {"phone_e164": "0788123456", "full_name": "Paul Ntwari"},
            "date_of_birth": "1988-02-02",
        },
        format="json",
    )
    assert claim.status_code == 201, claim.content
    reference = claim.json()["reference"]
    assert claim.json()["method"] == "reception_check" and len(reference) == 8
    url = f"/api/v1/staff/patients/{record['facility_patient_id']}/claim-confirmations/"
    missing = reception.post(
        url,
        {"claim_reference": "ZZZZZZZZ", "document_kind": "national_id", "document_matches": True},
        format="json",
    )
    assert missing.status_code == 404
    done = reception.post(
        url,
        {"claim_reference": reference, "document_kind": "national_id", "document_matches": True},
        format="json",
    )
    assert done.status_code == 200, done.content
    assert done.json()["status"] == "completed"
    assert client.get(f"{P}record-claims/{claim.json()['id']}/").json()["status"] == "completed"


def test_claim_code_limits_and_expiry(reception: Any) -> None:
    _facility_record_with_email(reception)
    client, _user = patient_client_for("aline2@example.test", "Uwase Aline")
    claim = client.post(
        f"{P}record-claims/",
        {
            "lookup": {"identifier": {"kind": "national_id", "value": NATIONAL_ID}},
            "date_of_birth": "1995-07-07",
        },
        format="json",
    ).json()
    RecordClaim.objects.filter(pk=claim["id"]).update(attempts=4)
    last = client.post(f"{P}record-claims/{claim['id']}/verify/", {"code": "99999x"}, format="json")
    assert last.status_code == 422
    assert RecordClaim.objects.get(pk=claim["id"]).status == ClaimStatus.FAILED
    RecordClaim.objects.filter(pk=claim["id"]).update(status=ClaimStatus.CODE_SENT, attempts=0)
    from datetime import timedelta

    from django.utils import timezone

    RecordClaim.objects.filter(pk=claim["id"]).update(
        expires_at=timezone.now() - timedelta(minutes=1)
    )
    assert expire_claims() == 1
    assert RecordClaim.objects.get(pk=claim["id"]).status == ClaimStatus.EXPIRED
    assert expire_delegation_invites() == 0


def test_signup_patient_gets_medilink_number(api: Any) -> None:
    response = api.post(
        "/api/v1/patient/auth/register/",
        {
            "full_name": "Ishimwe Claude",
            "email": "ishimwe@example.test",
            "password": "a-Long-and-unusual-passphrase-42",
            "preferred_language": "rw",
            "accepted_terms_version": "2026-10",
            "accepted_privacy_version": "2026-10",
            "research_consent": False,
        },
        format="json",
    )
    assert response.status_code == 201, response.content
    patient = Patient.objects.get(full_name="Ishimwe Claude")
    assert patient.medilink_number and patient.medilink_number.startswith("ML-")
