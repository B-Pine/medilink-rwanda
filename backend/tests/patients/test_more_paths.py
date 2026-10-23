"""Card photos, matching branches, guardians, revokes, access history after merges."""

from __future__ import annotations

import io
from typing import Any

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from medilink.patients.models import DelegationInvite, PatientLink
from tests.factories import PASSWORD
from tests.patients.conftest import NATIONAL_ID, patient_client_for, walk_in

pytestmark = pytest.mark.django_db

S = "/api/v1/staff/patients/"
P = "/api/v1/patient/"


def _png() -> SimpleUploadedFile:
    buffer = io.BytesIO()
    Image.new("RGB", (40, 30), (200, 10, 10)).save(buffer, format="PNG")
    return SimpleUploadedFile("card.png", buffer.getvalue(), content_type="image/png")


def test_staff_card_photo_and_link(
    reception: Any, doctor: Any, django_capture_on_commit_callbacks: Any
) -> None:
    data = walk_in(reception)
    url = f"{S}{data['facility_patient_id']}/insurance-profiles/"
    profile = reception.post(
        url, {"insurer_code": "mutuelle", "member_number": "555/01"}, format="json"
    ).json()
    with django_capture_on_commit_callbacks(execute=True):
        uploaded = reception.post(
            f"{url}{profile['id']}/card-images/",
            {"side": "front", "file": _png()},
            format="multipart",
        )
    assert uploaded.status_code == 201, uploaded.content
    assert uploaded.json()["card_images"]["front"] is not None
    assert uploaded.json()["status"] == "unverified"
    link = doctor.post(f"{url}{profile['id']}/card-images/front/download-links/")
    assert link.status_code == 200, link.content
    assert link.json()["url"].startswith("http://testserver/api/v1/files/")
    assert doctor.post(f"{url}{profile['id']}/card-images/back/download-links/").status_code == 404
    assert doctor.post(f"{url}{profile['id']}/card-images/side/download-links/").status_code == 404
    bad = reception.post(
        f"{url}{profile['id']}/card-images/",
        {"side": "back", "file": SimpleUploadedFile("x.txt", b"hello", "text/plain")},
        format="multipart",
    )
    assert bad.status_code == 400


def test_patient_card_photo(patient_client: Any, django_capture_on_commit_callbacks: Any) -> None:
    pid = patient_client.get(f"{P}profiles/").json()["results"][0]["patient_id"]
    profile = patient_client.post(
        f"{P}profiles/{pid}/insurance-profiles/",
        {"insurer_code": "mutuelle", "member_number": "777/01"},
        format="json",
    ).json()
    with django_capture_on_commit_callbacks(execute=True):
        uploaded = patient_client.post(
            f"{P}insurance-profiles/{profile['id']}/card-images/",
            {"side": "back", "file": _png()},
            format="multipart",
        )
    assert uploaded.status_code == 201, uploaded.content
    link = patient_client.post(
        f"{P}insurance-profiles/{profile['id']}/card-images/back/download-links/"
    )
    assert link.status_code == 200, link.content


def test_duplicate_check_branches(reception: Any, other_reception: Any) -> None:
    here = walk_in(reception, identifier={"kind": "national_id", "value": NATIONAL_ID})
    # §2.2: a phone match alone isn't a duplicate; with a similar name it is
    phone_only = reception.post(
        f"{S}duplicate-checks/", {"phone_e164": "0788123456"}, format="json"
    ).json()
    assert phone_only["matches"] == []
    with_name = reception.post(
        f"{S}duplicate-checks/",
        {"phone_e164": "0788123456", "full_name": "Mukamana J"},
        format="json",
    ).json()
    assert with_name["matches"][0]["level"] in ("strong", "possible")
    by_number = other_reception.post(
        f"{S}duplicate-checks/", {"medilink_number": here["medilink_number"]}, format="json"
    ).json()
    assert by_number["external_match"]["matched_on"] == "medilink_number"
    exact_here = reception.post(
        f"{S}duplicate-checks/",
        {"identifier": {"kind": "national_id", "value": NATIONAL_ID}},
        format="json",
    ).json()
    assert exact_here["matches"][0]["level"] == "exact_identifier"
    other_reception.post(
        f"{S}add-existing/",
        {
            "patient_ref": here["patient_id"],
            "proof": {"medilink_number": here["medilink_number"]},
            "care_consent": {"version": "2026-10", "granted": True},
        },
        format="json",
    )
    walk_in(other_reception, full_name="Somebody Else", sex="male", phone_e164="0722111222")
    elsewhere = reception.post(
        f"{S}duplicate-checks/",
        {"full_name": "Somebody Else", "date_of_birth": "1984-03-02", "sex": "male"},
        format="json",
    ).json()
    assert elsewhere["matches"] == []
    assert elsewhere["other_facility_possible_count"] == 1
    invalid = reception.post(
        f"{S}duplicate-checks/",
        {"identifier": {"kind": "national_id", "value": "12"}},
        format="json",
    )
    assert invalid.status_code == 400


def test_search_edge_cases(reception: Any, pharmacist: Any, doctor: Any) -> None:
    data = walk_in(reception)
    assert reception.post(f"{S}search/", {"query": "zzz"}, format="json").json()["results"] == []
    nothing = reception.post(
        f"{S}search/", {"query": "123", "by": "national_id"}, format="json"
    ).json()
    assert nothing == {"results": [], "external_match": None}
    reveal = reception.post(
        f"{S}{data['facility_patient_id']}/reveal/",
        {
            "field": "identifier",
            "identifier_id": "00000000-0000-0000-0000-000000000000",
            "reason_code": "identity_check",
        },
        format="json",
    )
    assert reveal.status_code == 404
    doctor.post(
        f"{S}{data['facility_patient_id']}/conditions/", {"display": "Asthma"}, format="json"
    )
    allergies_only = pharmacist.get(f"{S}{data['facility_patient_id']}/health-profile/")
    assert allergies_only.status_code == 200
    assert allergies_only.json()["conditions"] is None
    assert allergies_only.json()["allergies"] == []


def test_guardian_co_invite_revoke_and_leave(patient_client: Any) -> None:
    child = patient_client.post(
        f"{P}dependents/",
        {
            "relationship": "guardian",
            "full_name": "Keza Uwase",
            "sex": "female",
            "estimated_age_years": 6,
            "consent_version": "2026-10",
        },
        format="json",
    ).json()
    invite = patient_client.post(
        f"{P}delegations/",
        {
            "patient_id": str(child["patient_id"]),
            "current_password": PASSWORD,
            "consent_version": "2026-10",
        },
        format="json",
    ).json()
    assert invite["relationship"] == "guardian"
    pending = patient_client.get(f"{P}delegations/").json()["pending_invites"]
    assert [i["id"] for i in pending] == [invite["id"]]
    assert patient_client.post(f"{P}delegations/{invite['id']}/revoke/").status_code == 204
    assert DelegationInvite.objects.get(pk=invite["id"]).revoked_at is not None
    second = patient_client.post(
        f"{P}delegations/",
        {
            "patient_id": str(child["patient_id"]),
            "current_password": PASSWORD,
            "consent_version": "2026-10",
        },
        format="json",
    ).json()
    other, _user = patient_client_for("co-parent@example.test", "Habimana Eric")
    accepted = other.post(f"{P}delegations/accept/", {"code": second["code"]}, format="json")
    assert accepted.status_code == 201
    again = other.post(f"{P}delegations/accept/", {"code": second["code"]}, format="json")
    assert again.status_code == 400
    received = other.get(f"{P}delegations/").json()["received"]
    assert received[0]["relationship"] == "guardian"
    # the co-guardian leaves on their own
    assert other.post(f"{P}delegations/{received[0]['id']}/revoke/").status_code == 204
    # nobody can remove their own self profile
    own = patient_client.get(f"{P}profiles/").json()["results"][0]
    self_link = PatientLink.objects.active().get(patient_id=own["patient_id"], relationship="self")
    assert patient_client.post(f"{P}delegations/{self_link.pk}/revoke/").status_code == 422
    unknown = patient_client.post(f"{P}delegations/00000000-0000-0000-0000-000000000000/revoke/")
    assert unknown.status_code == 404


def test_profile_limit_and_research_consent(patient_client: Any) -> None:
    for index in range(9):
        response = patient_client.post(
            f"{P}dependents/",
            {
                "relationship": "guardian",
                "full_name": f"Child {index}",
                "sex": "male",
                "estimated_age_years": 3,
                "consent_version": "2026-10",
            },
            format="json",
        )
        assert response.status_code == 201
    over = patient_client.post(
        f"{P}dependents/",
        {
            "relationship": "guardian",
            "full_name": "Too many",
            "sex": "male",
            "estimated_age_years": 3,
            "consent_version": "2026-10",
        },
        format="json",
    )
    assert over.status_code == 422
    research = patient_client.post(
        f"{P}consents/", {"kind": "research", "version": "2026-10", "granted": True}, format="json"
    )
    assert research.status_code == 201
    assert research.json()["patient_id"] is None
    old = patient_client.post(
        f"{P}consents/", {"kind": "privacy", "version": "2020-01", "granted": True}, format="json"
    )
    assert old.status_code == 422
    kinds = {c["kind"] for c in patient_client.get(f"{P}consents/").json()["consents"]}
    assert "research" in kinds


def test_access_history_sees_staff_reads(reception: Any) -> None:
    record = walk_in(reception, full_name="Ntwari Paul", sex="male", date_of_birth="1988-02-02")
    reception.get(f"{S}{record['facility_patient_id']}/")
    client, _user = patient_client_for("paul.h@example.test", "Ntwari Paul")
    claim = client.post(
        f"{P}record-claims/",
        {
            "lookup": {"medilink_number": record["medilink_number"]},
            "date_of_birth": "1988-02-02",
        },
        format="json",
    ).json()
    reception.post(
        f"{S}{record['facility_patient_id']}/claim-confirmations/",
        {
            "claim_reference": claim["reference"],
            "document_kind": "national_id",
            "document_matches": True,
        },
        format="json",
    )
    history = client.get(f"{P}profiles/{record['patient_id']}/access-history/").json()
    actions = [item["action"] for item in history["results"]]
    assert "patients.record.viewed" in actions
    viewed = next(i for i in history["results"] if i["action"] == "patients.record.viewed")
    assert viewed["actor_kind"] == "staff"
    assert viewed["facility"]["name"] == "Kigali Test Clinic"
