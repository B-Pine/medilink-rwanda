"""B11: append-only audit log (DB privileges + trigger), SHA-256 hash chain, verify command,
and the Sprint 0 audit events."""

from __future__ import annotations

from io import StringIO
from typing import Any

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import DatabaseError, connection, transaction
from rest_framework.test import APIClient

from medilink.audit import actions
from medilink.audit.models import AppendOnlyError, AuditEntry
from medilink.audit.services import (
    GENESIS_HASH,
    AuditMetadataError,
    canonical_payload,
    compute_hash,
    record,
    verify_chain,
)
from tests.conftest import code_for_secret, login_patient, login_staff
from tests.factories import FacilityFactory, UserFactory, make_membership, make_staff

pytestmark = [pytest.mark.acceptance("B11"), pytest.mark.django_db]


def _actions() -> list[str]:
    return list(AuditEntry.objects.order_by("sequence").values_list("action", flat=True))


def test_b11_record_builds_a_hash_chain() -> None:
    first = record(actions.LOGOUT, metadata={"audience": "staff"})
    second = record(actions.LOGOUT, actor=UserFactory(), metadata={"audience": "patient"})
    assert first.sequence == 1 and first.prev_hash == GENESIS_HASH
    assert second.sequence == 2 and second.prev_hash == first.hash
    assert len(first.hash) == 64 and first.hash == compute_hash(first)
    assert first.actor_role == "system"
    assert verify_chain().ok


def test_b11_hash_survives_a_database_round_trip() -> None:
    entry = record(
        actions.LOGOUT,
        object_type="user",
        object_id="abc",
        metadata={"n": 1, "ok": True, "x": None},
    )
    reloaded = AuditEntry.objects.get(pk=entry.pk)
    assert canonical_payload(reloaded) == canonical_payload(entry)
    assert compute_hash(reloaded) == entry.hash


def test_b11_verify_command_reports_ok() -> None:
    record(actions.LOGOUT)
    record(actions.LOGOUT)
    out = StringIO()
    call_command("verify_audit_chain", stdout=out)
    assert "Audit chain OK: 2 entries verified" in out.getvalue()


def test_b11_app_role_cannot_update_or_delete() -> None:
    record(actions.LOGOUT)
    for sql in (
        "UPDATE audit_auditentry SET action = 'x'",
        "DELETE FROM audit_auditentry",
        "TRUNCATE audit_auditentry",
    ):
        with (
            pytest.raises(DatabaseError, match="permission denied"),
            transaction.atomic(),
            connection.cursor() as cursor,
        ):
            cursor.execute(sql)


def test_b11_trigger_blocks_even_the_table_owner() -> None:
    record(actions.LOGOUT)
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("RESET ROLE")  # back to the owner role (rolled back with the test)
        for sql in ("UPDATE audit_auditentry SET action = 'x'", "DELETE FROM audit_auditentry"):
            with pytest.raises(DatabaseError, match="append-only"), transaction.atomic():
                cursor.execute(sql)


def test_b11_orm_refuses_updates_and_deletes() -> None:
    entry = record(actions.LOGOUT)
    with pytest.raises(AppendOnlyError):
        entry.save()
    with pytest.raises(AppendOnlyError):
        entry.delete()
    with pytest.raises(AppendOnlyError):
        AuditEntry.objects.filter(pk=entry.pk).update(action="x")
    with pytest.raises(AppendOnlyError):
        AuditEntry.objects.all().delete()


def test_b11_tampering_is_detected() -> None:
    record(actions.LOGOUT)
    target = record(actions.LOGOUT, metadata={"audience": "staff"})
    record(actions.LOGOUT)
    with transaction.atomic(), connection.cursor() as cursor:
        # Simulate an attacker with owner rights who disables the trigger and edits a row.
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")  # flush deferred FK checks first
        cursor.execute("RESET ROLE")
        cursor.execute("ALTER TABLE audit_auditentry DISABLE TRIGGER audit_entry_no_update_delete")
        cursor.execute(
            "UPDATE audit_auditentry SET action = 'auth.login.success' WHERE id = %s", [target.pk]
        )
        cursor.execute("ALTER TABLE audit_auditentry ENABLE TRIGGER audit_entry_no_update_delete")
        report = verify_chain()
        assert not report.ok
        assert any("#2: content hash mismatch" in error for error in report.errors)
        with pytest.raises(CommandError, match="BROKEN"):
            call_command("verify_audit_chain", stdout=StringIO(), stderr=StringIO())
        cursor.execute("SET ROLE medilink_app")


def test_b11_deletion_in_the_middle_is_detected() -> None:
    entries = [record(actions.LOGOUT) for _ in range(3)]
    remaining = [entries[0], entries[2]]
    report = verify_chain(remaining)
    assert not report.ok
    assert any("sequence gap" in e for e in report.errors)
    assert any("prev_hash" in e for e in report.errors)


@pytest.mark.parametrize(
    "metadata",
    [
        {"email": "a"},
        {"full_name": "x"},
        {"note": "contact me at someone@example.test"},
        {"Bad-Key": 1},
        {"nested": {"phone": "x"}},
        {"blob": "x" * 201},
        {"value": 1.5},
    ],
)
def test_b11_metadata_rejects_personal_data(metadata: dict[str, Any]) -> None:
    with pytest.raises(AuditMetadataError):
        record(actions.LOGOUT, metadata=metadata)


def test_b11_unknown_action_is_rejected() -> None:
    with pytest.raises(ValueError, match="Unknown audit action"):
        record("something.else")


def test_b11_login_events(api: APIClient, staff_user: Any) -> None:
    api.post(
        "/api/v1/staff/auth/login/", {"email": staff_user.email, "password": "wrong passphrase!!"}
    )
    api.post(
        "/api/v1/staff/auth/login/",
        {"email": "nobody@example.test", "password": "wrong passphrase!!"},
    )
    login_staff(api, staff_user)
    api.post("/api/v1/staff/auth/logout/")
    assert _actions() == [
        actions.LOGIN_FAILURE,
        actions.LOGIN_FAILURE,
        actions.MFA_SUCCESS,
        actions.LOGIN_SUCCESS,
        actions.LOGOUT,
    ]
    failure_known, failure_unknown, _mfa, success, _logout = AuditEntry.objects.order_by("sequence")
    assert failure_known.actor_id == staff_user.pk and failure_unknown.actor_id is None
    assert failure_known.metadata == {"audience": "staff", "reason": "invalid_credentials"}
    assert success.actor_id == staff_user.pk
    assert success.actor_role == "receptionist"
    assert success.facility_id is not None
    assert success.ip == "127.0.0.1"
    assert len(success.request_id) == 26
    assert "nobody@example.test" not in str([e.metadata for e in AuditEntry.objects.all()])
    assert verify_chain().ok


def test_b11_mfa_enrol_and_failure_events(api: APIClient, facility: Any) -> None:
    user = make_staff(facility, enrolled=False)
    api.post(
        "/api/v1/staff/auth/login/",
        {"email": user.email, "password": "a long synthetic test passphrase"},
    )
    secret = api.post("/api/v1/staff/auth/mfa/setup/").json()["secret"]
    api.post("/api/v1/staff/auth/mfa/confirm/", {"code": "000000"})
    from django_otp.plugins.otp_totp.models import TOTPDevice

    TOTPDevice.objects.filter(user=user).update(throttling_failure_count=0)
    api.post("/api/v1/staff/auth/mfa/confirm/", {"code": code_for_secret(secret)})
    assert _actions() == [actions.MFA_FAILURE, actions.MFA_ENROLLED, actions.LOGIN_SUCCESS]


def test_b11_facility_switch_event(api: APIClient, facility: Any) -> None:
    second = FacilityFactory()
    user = make_staff(facility, roles=("doctor",))
    make_membership(user, second, roles=("doctor",))
    login_staff(api, user)
    api.post("/api/v1/staff/auth/active-facility/", {"facility_id": str(second.pk)})
    entry = AuditEntry.objects.get(action=actions.FACILITY_SWITCHED)
    assert entry.facility_id == second.pk
    assert entry.object_type == "facility" and entry.object_id == str(second.pk)
    assert entry.metadata == {"from_facility_id": None}
    assert entry.actor_role == "doctor"


def test_b11_patient_events(api: APIClient, patient_user: Any) -> None:
    login_patient(api, patient_user)
    api.post("/api/v1/patient/auth/logout/")
    api.post(
        "/api/v1/patient/auth/register/",
        {
            "full_name": "Uwimana Claudine",
            "email": "claudine@example.test",
            "password": "amashyamba meza ya nyungwe",
            "preferred_language": "rw",
            "accepted_terms_version": "2026-10",
            "accepted_privacy_version": "2026-10",
            "research_consent": True,
        },
    )
    assert _actions() == [actions.LOGIN_SUCCESS, actions.LOGOUT, actions.PATIENT_REGISTERED]
    registered = AuditEntry.objects.get(action=actions.PATIENT_REGISTERED)
    assert registered.actor_role == "patient"
    assert registered.metadata == {
        "terms_version": "2026-10",
        "privacy_version": "2026-10",
        "research_consent": True,
    }
