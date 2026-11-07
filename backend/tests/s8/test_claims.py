"""#203 (W4) cashier and insurance finish: the monthly claim list per insurer, marking claims,
the end-of-shift summary by payment method, and the add-a-line function for other apps."""

from __future__ import annotations

import csv
import io
from typing import Any

import pytest
from django.db import DatabaseError, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from medilink.audit.models import AuditEntry
from medilink.billing import bills
from medilink.billing.models import Bill, BillLine, InsuranceClaim
from medilink.patients.models import InsuranceProfile
from medilink.tenancy.context import rls_context
from medilink.visits.models import Visit
from tests.s8.conftest import S, bill_of, pay, rule, tariff, walk_in

pytestmark = pytest.mark.django_db(transaction=False)

MONTH = timezone.localdate().strftime("%Y-%m")
BOM = "﻿"


def _verified(client: APIClient, visit: dict[str, Any]) -> dict[str, Any]:
    response = client.post(
        f"{S}visits/{visit['visit_id']}/insurance-verifications/",
        {"insurance_profile_id": str(visit["profile"].pk), "result": "verified"},
        format="json",
    )
    assert response.status_code == 201, response.content
    return response.json()


def _actions(facility: Any) -> list[str]:
    return list(AuditEntry.objects.filter(facility_id=facility.pk).values_list("action", flat=True))


def test_monthly_claim_list_marking_and_downloads(
    clinic: Any, priced: dict[str, Any], desk: tuple[APIClient, Any], admin: tuple[APIClient, Any]
) -> None:
    rule(clinic, admin[1], "rama", bp=1500)
    rule(clinic, admin[1], "mmi", bp=1000)
    insured = walk_in(clinic, desk, priced["service_id"], insurer="rama")
    bill = _verified(desk[0], insured)
    other = walk_in(clinic, desk, priced["service_id"], "Mugisha Eric", insurer="mmi")
    _verified(desk[0], other)
    walk_in(clinic, desk, priced["service_id"], "Uwase Aline", insurer="rama")  # not verified
    walk_in(clinic, desk, priced["service_id"], "Ineza Grace")  # self-pay

    # the cashier neither sees nor marks claims
    assert desk[0].get(f"{S}insurance-claims/?insurer=rama&month={MONTH}").status_code == 403
    client = admin[0]
    insurers = client.get(f"{S}insurance-claims/insurers/").json()
    assert {"rama", "mmi"} <= {x["code"] for x in insurers}
    assert client.get(f"{S}insurance-claims/?insurer=rama&month=2026-13").status_code == 400

    listed = client.get(f"{S}insurance-claims/?insurer=rama&month={MONTH}")
    assert listed.status_code == 200, listed.content
    body = listed.json()
    assert [r["bill_id"] for r in body["results"]] == [bill["id"]]
    row = body["results"][0]
    assert row["member_number"] == "RAMA-0001" and row["status"] == "pending"
    assert (row["insurer_share_rwf"], row["patient_share_rwf"]) == (4250, 750)
    assert row["lines"][0]["code"] == "CONSULT" and row["version"] == 0
    assert body["summary"]["count"] == 1 and body["summary"]["pending_count"] == 1

    url = f"{S}bills/{bill['id']}/claim/"
    assert desk[0].post(url, {"version": 0, "status": "paid"}, format="json").status_code == 403
    no_reason = client.post(url, {"version": 0, "status": "rejected"}, format="json")
    assert no_reason.status_code == 422
    rejected = client.post(
        url,
        {"version": 0, "status": "rejected", "reason": "Member number not active"},
        format="json",
    )
    assert rejected.status_code == 200, rejected.content
    assert rejected.json()["status"] == "rejected" and rejected.json()["version"] == 1
    stale = client.post(url, {"version": 0, "status": "paid"}, format="json")
    assert stale.status_code == 409
    paid = client.post(
        url, {"version": 1, "status": "paid", "reference": "RAMA-B-77"}, format="json"
    )
    assert paid.status_code == 200 and paid.json()["reference"] == "RAMA-B-77"
    summary = client.get(f"{S}insurance-claims/?insurer=rama&month={MONTH}").json()["summary"]
    assert (summary["paid_count"], summary["paid_rwf"]) == (1, 4250)

    exported = client.get(f"{S}insurance-claims/export/?insurer=rama&month={MONTH}")
    assert exported.status_code == 200
    assert exported["Content-Type"].startswith("text/csv")
    text = exported.content.decode("utf-8")
    assert text.startswith(BOM)
    table = list(csv.reader(io.StringIO(text.removeprefix(BOM))))
    assert table[0][:3] == ["Visit date", "Member number", "Patient"]
    assert table[1][1] == "RAMA-0001" and table[1][8] == "paid"
    assert table[-1][0] == "Total" and table[-1][6] == "4250"
    pdf = client.get(f"{S}insurance-claims/export/?insurer=rama&month={MONTH}&kind=pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")

    actions = _actions(clinic)
    assert actions.count("billing.claim.marked") == 2
    assert "billing.claims.listed" in actions and actions.count("billing.claims.exported") == 2

    # a claim is never deleted and keeps its bill
    with rls_context(facility_id=clinic.pk):
        claim = InsuranceClaim.objects.get(bill_id=bill["id"])
        with pytest.raises(DatabaseError), transaction.atomic():
            InsuranceClaim.objects.filter(pk=claim.pk).delete()


def test_claim_csv_is_formula_safe(
    clinic: Any, priced: dict[str, Any], desk: tuple[APIClient, Any], admin: tuple[APIClient, Any]
) -> None:
    rule(clinic, admin[1], "rama", bp=1500)
    visit = walk_in(clinic, desk, priced["service_id"], insurer="rama")
    InsuranceProfile.objects.filter(pk=visit["profile"].pk).update(member_number="=SUM(A1)")
    _verified(desk[0], visit)
    text = admin[0].get(f"{S}insurance-claims/export/?insurer=rama&month={MONTH}").content
    table = list(csv.reader(io.StringIO(text.decode("utf-8").removeprefix(BOM))))
    assert table[1][1] == "'=SUM(A1)"


def test_only_verified_insured_bills_can_be_marked(
    clinic: Any, priced: dict[str, Any], desk: tuple[APIClient, Any], admin: tuple[APIClient, Any]
) -> None:
    visit = walk_in(clinic, desk, priced["service_id"])
    bill = bill_of(desk[0], visit["visit_id"]).json()
    response = admin[0].post(
        f"{S}bills/{bill['id']}/claim/", {"version": 0, "status": "paid"}, format="json"
    )
    assert response.status_code == 422


def test_end_of_shift_summary_by_method(
    clinic: Any, priced: dict[str, Any], cashier: tuple[APIClient, Any]
) -> None:
    client = cashier[0]
    visit = walk_in(clinic, cashier, priced["service_id"])
    bill = bill_of(client, visit["visit_id"]).json()
    bill = pay(client, bill, 3000).json()
    pay(client, bill, 2000, method="mtn_momo", reference="MM-1")
    shift = client.get(f"{S}cash-shifts/current/").json()
    rows = {r["method"]: r for r in shift["by_method"]}
    assert rows["cash"] == {
        "method": "cash",
        "payment_count": 1,
        "received_rwf": 3000,
        "paid_out_rwf": 0,
        "expected_rwf": 13000,  # with the 10,000 float
        "counted_rwf": None,
        "difference_rwf": None,
    }
    assert rows["mtn_momo"]["received_rwf"] == 2000
    closed = client.post(
        f"{S}cash-shifts/{shift['id']}/close/",
        {
            "version": shift["version"],
            "counted_totals": {"cash": 12500, "mtn_momo": 2000},
            "note": "Gave change twice",
        },
        format="json",
    ).json()
    rows = {r["method"]: r for r in closed["by_method"]}
    assert (rows["cash"]["counted_rwf"], rows["cash"]["difference_rwf"]) == (12500, -500)
    assert rows["mtn_momo"]["difference_rwf"] == 0
    mine = client.get(f"{S}cash-shifts/?mine=true").json()["results"]
    assert mine[0]["id"] == shift["id"]


def test_add_tariff_line_for_other_apps(
    clinic: Any, priced: dict[str, Any], desk: tuple[APIClient, Any], admin: tuple[APIClient, Any]
) -> None:
    tariff(clinic, admin[1], "LAB-MAL-RDT", 1500)
    tariff(clinic, admin[1], "PARACETAMOL", 100, kind="medicine")
    visit = walk_in(clinic, desk, priced["service_id"])
    with rls_context(facility_id=clinic.pk):
        row = Visit.objects.get(pk=visit["visit_id"])
        line = bills.add_tariff_line(row, tariff_code="LAB-MAL-RDT", name="Malaria RDT")
        assert line is not None and line.name == "Malaria RDT" and line.total_rwf == 1500
        assert bills.add_tariff_line(row, tariff_code="UNKNOWN") is None
        assert bills.add_tariff_line(row, tariff_code="PARACETAMOL") is None  # not a medicine
        with pytest.raises(ValueError, match="quantity"):
            bills.add_tariff_line(row, tariff_code="LAB-MAL-RDT", quantity=0)
        bill = Bill.objects.get(visit_id=row.pk)
        assert bill.total_rwf == 5000 + 1500
        assert bills.remove_tariff_line(line.pk, reason="lab_order_cancelled")
        assert not bills.remove_tariff_line(line.pk, reason="again")
        bill.refresh_from_db()
        assert bill.total_rwf == 5000
        assert BillLine.objects.get(pk=line.pk).removed_reason == "lab_order_cancelled"
    assert _actions(clinic).count("billing.bill.line_added") >= 1
