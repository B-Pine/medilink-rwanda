"""Merge requests, execution and undo (contract §2.5, §3.3 ST18-ST25, §3.4 PL1-PL5)."""

from __future__ import annotations

from typing import Any

import pytest

from medilink.patients.models import Identifier, MergeEvent, Patient
from tests.masterdata.conftest import age_recent_auth
from tests.patients.conftest import NATIONAL_ID, staff_client_for, walk_in

pytestmark = pytest.mark.django_db

MERGES = "/api/v1/staff/merge-requests/"
PLATFORM = "/api/v1/platform/merge-requests/"
PATIENTS = "/api/v1/staff/patients/"


def _pair(desk: Any) -> tuple[dict[str, Any], dict[str, Any]]:
    first = walk_in(
        desk, identifier={"kind": "national_id", "value": NATIONAL_ID}, file_number="A-1"
    )
    second = walk_in(
        desk,
        full_name="Mukamana Jeane",
        phone_e164=None,
        file_number="A-2",
        confirm_not_duplicate=True,
    )
    return first, second


def _request(desk: Any, first: dict[str, Any], second: dict[str, Any]) -> dict[str, Any]:
    response = desk.post(
        MERGES,
        {
            "surviving_facility_patient_id": first["facility_patient_id"],
            "merged_facility_patient_id": second["facility_patient_id"],
            "reason": "Registered twice",
        },
        format="json",
    )
    assert response.status_code == 201, response.content
    return response.json()


def test_facility_merge_four_eyes_execute_and_undo(reception: Any, admin_client: Any) -> None:
    first, second = _pair(reception)
    merge = _request(reception, first, second)
    assert merge["scope"] == "facility"
    assert merge["preview"]["conflicts"] == []
    again = reception.post(
        MERGES,
        {
            "surviving_facility_patient_id": first["facility_patient_id"],
            "merged_facility_patient_id": second["facility_patient_id"],
            "reason": "x",
        },
        format="json",
    )
    assert again.status_code == 409
    approve = f"{MERGES}{merge['id']}/approve/"
    # receptionists hold merge_request only; approvers need a recent step-up
    assert reception.post(approve, {"version": 1}, format="json").status_code == 403
    age_recent_auth(admin_client)
    stale = admin_client.post(approve, {"version": 1}, format="json")
    assert stale.status_code == 403
    assert stale.json()["error"]["code"] == "step_up_required"
    age_recent_auth(admin_client, seconds=0)
    done = admin_client.post(
        approve, {"version": merge["version"], "decision_reason": "Same person"}, format="json"
    )
    assert done.status_code == 200, done.content
    assert done.json()["status"] == "executed"
    merged = Patient.objects.get(pk=second["patient_id"])
    assert str(merged.merged_into_id) == first["patient_id"]
    found = reception.post(
        f"{PATIENTS}search/", {"query": "A-2", "by": "file_number"}, format="json"
    ).json()["results"]
    assert [r["patient_id"] for r in found] == [first["patient_id"]]
    detail = reception.get(f"{PATIENTS}{second['facility_patient_id']}/").json()
    assert detail["is_active"] is False
    assert detail["merged_into_facility_patient_id"] == first["facility_patient_id"]
    assert MergeEvent.objects.filter(merge_id=merge["id"]).count() == 2
    undo = admin_client.post(
        f"{MERGES}{merge['id']}/undo/",
        {"version": done.json()["version"], "reason": "Wrong person"},
        format="json",
    )
    assert undo.status_code == 200, undo.content
    assert undo.json()["skipped_rows"] == 0
    assert undo.json()["merge"]["status"] == "undone"
    merged.refresh_from_db()
    assert merged.merged_into_id is None
    detail = reception.get(f"{PATIENTS}{second['facility_patient_id']}/").json()
    assert detail["is_active"] is True


def test_identifier_conflict_blocks_merge(reception: Any) -> None:
    first, second = _pair(reception)
    reception.post(
        f"{PATIENTS}{second['facility_patient_id']}/identifiers/",
        {"kind": "national_id", "value": "1199080099999999"},
        format="json",
    )
    response = reception.post(
        MERGES,
        {
            "surviving_facility_patient_id": first["facility_patient_id"],
            "merged_facility_patient_id": second["facility_patient_id"],
            "reason": "Registered twice",
        },
        format="json",
    )
    assert response.status_code == 422


def test_identifiers_move_to_the_survivor(reception: Any, admin_client: Any) -> None:
    first, second = _pair(reception)
    reception.post(
        f"{PATIENTS}{second['facility_patient_id']}/identifiers/",
        {"kind": "passport", "issuing_country": "UG", "value": "B1234567"},
        format="json",
    )
    merge = _request(reception, first, second)
    done = admin_client.post(f"{MERGES}{merge['id']}/approve/", {"version": 1}, format="json")
    assert done.status_code == 200, done.content
    kinds = set(
        Identifier.objects.filter(
            patient_id=first["patient_id"], superseded_at__isnull=True
        ).values_list("kind", flat=True)
    )
    assert kinds == {"national_id", "passport"}


def test_cancel_escalate_and_reject(
    reception: Any, admin_client: Any, platform_client: Any
) -> None:
    first, second = _pair(reception)
    merge = _request(reception, first, second)
    # an approver exists here, so escalation is refused
    assert reception.post(f"{MERGES}{merge['id']}/escalate/").status_code == 422
    assert admin_client.post(f"{MERGES}{merge['id']}/cancel/").status_code == 403
    cancelled = reception.post(f"{MERGES}{merge['id']}/cancel/")
    assert cancelled.json()["status"] == "cancelled"
    merge = _request(reception, first, second)
    no_reason = admin_client.post(f"{MERGES}{merge['id']}/reject/", {"version": 1}, format="json")
    assert no_reason.status_code == 400
    rejected = admin_client.post(
        f"{MERGES}{merge['id']}/reject/",
        {"version": 1, "decision_reason": "Different people"},
        format="json",
    )
    assert rejected.json()["status"] == "rejected"
    assert platform_client.get(PLATFORM).json()["results"] == []
    listed = reception.get(f"{MERGES}?status=rejected").json()["results"]
    assert [m["id"] for m in listed] == [merge["id"]]


def test_single_owner_clinic_escalates_to_platform(facility: Any, platform_client: Any) -> None:
    desk, _user = staff_client_for(facility, ("receptionist",), "solo-desk@example.test")
    first, second = _pair(desk)
    merge = _request(desk, first, second)
    escalated = desk.post(f"{MERGES}{merge['id']}/escalate/")
    assert escalated.status_code == 200, escalated.content
    assert escalated.json()["is_escalated"] is True
    listed = platform_client.get(PLATFORM).json()["results"]
    assert [m["id"] for m in listed] == [merge["id"]]
    assert platform_client.get(f"{PLATFORM}{merge['id']}/").json()["preview"] is not None
    done = platform_client.post(
        f"{PLATFORM}{merge['id']}/approve/",
        {"version": escalated.json()["version"]},
        format="json",
    )
    assert done.status_code == 200, done.content
    assert done.json()["status"] == "executed"
    undo = platform_client.post(
        f"{PLATFORM}{merge['id']}/undo/",
        {"version": done.json()["version"], "reason": "Mistake"},
        format="json",
    )
    assert undo.json()["merge"]["status"] == "undone"


def test_cross_facility_scope(reception: Any, other_reception: Any, admin_client: Any) -> None:
    first, second = _pair(reception)
    added = other_reception.post(
        f"{PATIENTS}add-existing/",
        {
            "patient_ref": second["patient_id"],
            "proof": {"medilink_number": second["medilink_number"]},
            "care_consent": {"version": "2026-10", "granted": True},
        },
        format="json",
    )
    assert added.status_code == 201
    merge = _request(reception, first, second)
    assert merge["scope"] == "cross_facility"
    refused = admin_client.post(f"{MERGES}{merge['id']}/approve/", {"version": 1}, format="json")
    assert refused.status_code == 422
