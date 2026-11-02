"""S8-B1 schema, S8-B2 patient reads, S8-B12 My bills, S8-B14 security (contract sprint-08 §9)."""

from __future__ import annotations

import json
from typing import Any

import pytest
from django.db import connection
from rest_framework.test import APIClient

from medilink.audit.models import AuditEntry
from medilink.patients.models import PatientLink, Relationship
from tests.conftest import login_patient
from tests.factories import make_patient_user
from tests.s4.conftest import patient_account  # noqa: F401
from tests.s8.conftest import AMOX, CONSULTATION, bill_of, check_in, pay, prescribe, tariff

pytestmark = pytest.mark.django_db(transaction=False)

ENDPOINTS = [
    ("/api/v1/staff/visits/{visit_id}/bill/", "get"),
    ("/api/v1/staff/visits/{visit_id}/insurance-verifications/", "post"),
    ("/api/v1/staff/bills/", "get"),
    ("/api/v1/staff/bills/{bill_id}/", "get"),
    ("/api/v1/staff/bills/{bill_id}/lines/", "post"),
    ("/api/v1/staff/bill-lines/{line_id}/remove/", "post"),
    ("/api/v1/staff/bills/{bill_id}/payments/", "post"),
    ("/api/v1/staff/bills/{bill_id}/exemptions/", "post"),
    ("/api/v1/staff/bills/{bill_id}/refund-requests/", "post"),
    ("/api/v1/staff/payments/{payment_id}/void-requests/", "post"),
    ("/api/v1/staff/approval-requests/", "get"),
    ("/api/v1/staff/approval-requests/{approval_id}/approve/", "post"),
    ("/api/v1/staff/approval-requests/{approval_id}/reject/", "post"),
    ("/api/v1/staff/approval-requests/{approval_id}/cancel/", "post"),
    ("/api/v1/staff/credit-notes/{credit_note_id}/payouts/", "post"),
    ("/api/v1/staff/receipts/{receipt_id}/", "get"),
    ("/api/v1/staff/receipts/{receipt_id}/send/", "post"),
    ("/api/v1/staff/cash-shifts/", "get"),
    ("/api/v1/staff/cash-shifts/", "post"),
    ("/api/v1/staff/cash-shifts/current/", "get"),
    ("/api/v1/staff/cash-shifts/{shift_id}/close/", "post"),
    ("/api/v1/staff/cash-shifts/{shift_id}/review/", "post"),
    ("/api/v1/staff/billing/patients/{facility_patient_id}/balances/", "get"),
    ("/api/v1/patient/bills/", "get"),
    ("/api/v1/patient/bills/{bill_id}/", "get"),
]
TABLES = (
    "billing_bill",
    "billing_bill_line",
    "billing_bill_event",
    "billing_insurance_verification",
    "billing_cash_shift",
    "billing_payment",
    "billing_receipt",
    "billing_exemption",
    "billing_approval_request",
    "billing_credit_note",
    "billing_refund_payout",
)


@pytest.fixture(scope="module")
def schema(django_db_setup: Any, django_db_blocker: Any) -> dict[str, Any]:
    from drf_spectacular.generators import SchemaGenerator

    with django_db_blocker.unblock():
        return dict(SchemaGenerator().get_schema(request=None, public=True))


def test_every_s8_endpoint_is_in_the_schema(schema: dict[str, Any]) -> None:
    for path, method in ENDPOINTS:
        assert method in schema["paths"].get(path, {}), (path, method)


def _patient(user: Any) -> APIClient:
    client = APIClient()
    login_patient(client, user)
    return client


@pytest.fixture
def billed(
    clinic: Any,
    priced: dict[str, Any],
    cashier: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
    admin: tuple[APIClient, Any],
    drugs: dict[str, Any],
    patient_account: tuple[Any, Any],  # noqa: F811
) -> dict[str, Any]:
    from tests.s6.conftest import patch
    from tests.s7.conftest import draft, sign

    user, record = patient_account
    tariff(clinic, admin[1], "AMOX500", 100, kind="medicine")
    visit = check_in(cashier[0], record, priced["service_id"]).json()
    prescribe(doctor[0], visit["visit_id"], AMOX)
    bill = bill_of(cashier[0], visit["visit_id"]).json()
    paid = pay(cashier[0], bill, 2000).json()
    # a restricted consultation on the same visit hides the bill from delegates
    restricted = draft(doctor[0], visit["visit_id"])
    patch(doctor[0], restricted, is_restricted=True)
    assert sign(doctor[0], restricted["id"]).status_code == 200
    return {"user": user, "patient": record.patient, "bill": paid}


def test_patient_reads_own_bills_with_receipts(billed: dict[str, Any]) -> None:
    client = _patient(billed["user"])
    listing = client.get("/api/v1/patient/bills/")
    assert listing.status_code == 200, listing.content
    rows = listing.json()["results"]
    assert [r["id"] for r in rows] == [billed["bill"]["id"]]
    assert rows[0]["balance_rwf"] == CONSULTATION + 2100 - 2000
    detail = client.get(f"/api/v1/patient/bills/{billed['bill']['id']}/").json()
    assert [line["name"] for line in detail["lines"]] == ["Consult", "Amoxicillin 500 mg capsule"]
    assert detail["payments"][0]["receipt_number"].startswith("RC-")
    raw = json.dumps(detail)
    assert "received_by" not in raw and "reason" not in raw
    assert client.get("/api/v1/patient/bills/?has_balance=true").json()["count"] == 1
    assert client.get("/api/v1/patient/bills/?has_balance=false").json()["count"] == 0
    mine = client.get(f"/api/v1/patient/bills/?patient_id={billed['patient'].pk}")
    assert mine.json()["count"] == 1


def test_delegates_strangers_and_staff(
    billed: dict[str, Any], cashier: tuple[APIClient, Any]
) -> None:
    guardian = make_patient_user(email="bill-guardian@example.test", full_name="Guardian Bill")
    PatientLink.objects.create(
        account=guardian, patient=billed["patient"], relationship=Relationship.GUARDIAN
    )
    assert _patient(guardian).get("/api/v1/patient/bills/").json()["count"] == 1
    delegate = make_patient_user(email="bill-delegate@example.test", full_name="Delegate Bill")
    PatientLink.objects.create(
        account=delegate, patient=billed["patient"], relationship=Relationship.DELEGATE
    )
    d = _patient(delegate)
    assert d.get("/api/v1/patient/bills/").json()["count"] == 0  # restricted consultation
    assert d.get(f"/api/v1/patient/bills/{billed['bill']['id']}/").status_code == 404
    stranger = _patient(make_patient_user(email="bill-stranger@example.test", full_name="S B"))
    assert stranger.get("/api/v1/patient/bills/").json()["count"] == 0
    assert stranger.get(f"/api/v1/patient/bills/{billed['bill']['id']}/").status_code == 404
    assert cashier[0].get("/api/v1/patient/bills/").status_code in (401, 403)


def test_every_billing_table_has_forced_rls() -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class"
            " WHERE relname = ANY(%s)",
            [list(TABLES)],
        )
        rows = {name: (enabled, forced) for name, enabled, forced in cursor.fetchall()}
    assert rows == dict.fromkeys(TABLES, (True, True))


def test_audit_entries_carry_no_medicine_names(billed: dict[str, Any]) -> None:
    entries = AuditEntry.objects.filter(action__startswith="billing.")
    assert entries.exists()
    for entry in entries:
        assert "Amoxicillin" not in json.dumps(entry.metadata)
