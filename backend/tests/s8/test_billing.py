"""S8 backend checks (contract sprint-08 §9): S8-B2..B14 against the real database."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from django.db import DatabaseError, transaction
from rest_framework.test import APIClient

from medilink.audit.models import AuditEntry
from medilink.billing import bills
from medilink.billing.models import (
    Bill,
    BillEvent,
    BillLine,
    Payment,
    Receipt,
)
from medilink.facilities.models import Settings
from medilink.tenancy.context import rls_context
from tests.conftest import error_code, login_staff
from tests.factories import FacilityFactory
from tests.masterdata.conftest import age_recent_auth
from tests.s2.conftest import client_for
from tests.s4.conftest import patient_account  # noqa: F401
from tests.s8.conftest import (
    AMOX,
    CONSULTATION,
    S,
    bill_of,
    card,
    check_in,
    pay,
    prescribe,
    rule,
    tariff,
    walk_in,
)

pytestmark = pytest.mark.django_db(transaction=False)


def _settings(facility: Any, **billing: Any) -> None:
    with rls_context(facility_id=facility.pk):
        row, _ = Settings.objects.get_or_create(facility=facility)
        row.billing = {**(row.billing or {}), **billing}
        row.save()


def _actions(facility: Any) -> list[str]:
    return list(AuditEntry.objects.filter(facility_id=facility.pk).values_list("action", flat=True))


def _fresh(client: APIClient, user: Any) -> APIClient:
    other = APIClient()
    login_staff(other, user)
    return other


# ---- S8-B3 opening -----------------------------------------------------------------------------


def test_bill_opens_on_check_in_once_with_the_consultation(
    clinic: Any,
    priced: dict[str, Any],
    desk: tuple[APIClient, Any],
    django_capture_on_commit_callbacks: Any,
) -> None:
    with django_capture_on_commit_callbacks(execute=True):
        visit = walk_in(clinic, desk, priced["service_id"])
    with rls_context(facility_id=clinic.pk):
        assert Bill.objects.filter(visit_id=visit["visit_id"]).count() == 1  # receiver on check-in
    first = bill_of(desk[0], visit["visit_id"]).json()
    again = bill_of(desk[0], visit["visit_id"]).json()
    assert first["id"] == again["id"]
    assert [(line["code"], line["total_rwf"]) for line in first["lines"]] == [
        ("CONSULT", CONSULTATION)
    ]
    assert first["status"] == "open" and first["totals"]["balance_rwf"] == CONSULTATION
    assert first["insurance"]["status"] == "none" and first["missing_prices"] == []
    assert first["ticket_number"] == visit["ticket"]["number"]
    assert "billing.bill.opened" in _actions(clinic)
    assert "billing.bill.viewed" in _actions(clinic)


def test_price_missing_without_a_tariff(
    clinic: Any, catalogue: dict[str, Any], desk: tuple[APIClient, Any]
) -> None:
    visit = walk_in(clinic, desk, catalogue["service"]["id"])
    body = bill_of(desk[0], visit["visit_id"]).json()
    assert body["lines"] == [] and body["status"] == "open"
    assert body["missing_prices"] == [{"kind": "service", "code": "", "name": ""}]


def test_receiver_failure_never_breaks_check_in(
    clinic: Any,
    priced: dict[str, Any],
    desk: tuple[APIClient, Any],
    monkeypatch: Any,
    django_capture_on_commit_callbacks: Any,
) -> None:
    def boom(*args: Any, **kwargs: Any) -> None:
        raise RuntimeError("down")

    monkeypatch.setattr(bills, "open_bill", boom)
    with django_capture_on_commit_callbacks(execute=True):
        visit = walk_in(clinic, desk, priced["service_id"])
    monkeypatch.undo()
    assert bill_of(desk[0], visit["visit_id"]).status_code == 200  # opened on first read


# ---- S8-B4 split -------------------------------------------------------------------------------


def test_split_coverage_exclusions_service_list_and_ceiling(
    clinic: Any, priced: dict[str, Any], desk: tuple[APIClient, Any], admin: tuple[APIClient, Any]
) -> None:
    rule(clinic, admin[1], "rama", bp=1500, excluded_tariff_codes=["DRESSING"])
    visit = walk_in(clinic, desk, priced["service_id"], insurer="rama")
    client = desk[0]
    bill = bill_of(client, visit["visit_id"]).json()
    assert bill["insurance"]["status"] == "unverified"
    assert bill["totals"]["patient_share_rwf"] == CONSULTATION  # self-pay until verified
    verified = client.post(
        f"{S}visits/{visit['visit_id']}/insurance-verifications/",
        {"insurance_profile_id": str(visit["profile"].pk), "result": "verified"},
        format="json",
    )
    assert verified.status_code == 201, verified.content
    bill = verified.json()
    assert bill["insurance"]["is_accepted"] and bill["insurance"]["patient_share_bp"] == 1500
    assert (bill["totals"]["insurer_share_rwf"], bill["totals"]["patient_share_rwf"]) == (4250, 750)
    added = client.post(
        f"{S}bills/{bill['id']}/lines/",
        {"version": bill["version"], "tariff_code": "DRESSING", "quantity": 2},
        format="json",
    )
    assert added.status_code == 201
    dressing = next(line for line in added.json()["lines"] if line["code"] == "DRESSING")
    assert dressing["is_covered"] is False and dressing["patient_share_rwf"] == 4000
    assert added.json()["totals"]["balance_rwf"] == 4750

    # service outside the rule's list: nothing covered
    other = rule(clinic, admin[1], "mmi", bp=0, applies_to_all_services=False, service_ids=[])
    visit2 = walk_in(clinic, desk, priced["service_id"], "Mugisha Eric", insurer="mmi")
    v2 = client.post(
        f"{S}visits/{visit2['visit_id']}/insurance-verifications/",
        {"insurance_profile_id": str(visit2["profile"].pk), "result": "verified"},
        format="json",
    ).json()
    assert v2["totals"]["insurer_share_rwf"] == 0 and other.pk

    # ceiling per visit: the insurer pays at most 3,000
    rule(clinic, admin[1], "mutuelle", bp=1000, ceiling_per_visit_rwf=3000)
    visit3 = walk_in(clinic, desk, priced["service_id"], "Uwase Aline", insurer="mutuelle")
    v3 = client.post(
        f"{S}visits/{visit3['visit_id']}/insurance-verifications/",
        {"insurance_profile_id": str(visit3["profile"].pk), "result": "verified"},
        format="json",
    ).json()
    assert (v3["totals"]["insurer_share_rwf"], v3["totals"]["patient_share_rwf"]) == (3000, 2000)


def test_rejection_moves_to_self_pay_and_referral_letter_is_checked(
    clinic: Any, priced: dict[str, Any], desk: tuple[APIClient, Any], admin: tuple[APIClient, Any]
) -> None:
    rule(clinic, admin[1], "rama", bp=1000, requires_referral=True)
    visit = walk_in(clinic, desk, priced["service_id"], insurer="rama")
    url = f"{S}visits/{visit['visit_id']}/insurance-verifications/"
    profile = str(visit["profile"].pk)
    client = desk[0]
    no_letter = client.post(
        url, {"insurance_profile_id": profile, "result": "verified"}, format="json"
    )
    assert no_letter.status_code == 422
    no_reason = client.post(
        url, {"insurance_profile_id": profile, "result": "rejected"}, format="json"
    )
    assert no_reason.status_code == 422
    vague = client.post(
        url,
        {"insurance_profile_id": profile, "result": "rejected", "reason_code": "other"},
        format="json",
    )
    assert vague.status_code == 422
    unknown = client.post(
        url, {"insurance_profile_id": str(uuid.uuid4()), "result": "verified"}, format="json"
    )
    assert unknown.status_code == 422
    rejected = client.post(
        url,
        {"insurance_profile_id": profile, "result": "rejected", "reason_code": "expired"},
        format="json",
    )
    assert rejected.status_code == 201
    assert rejected.json()["insurance"]["status"] == "rejected"
    assert rejected.json()["totals"]["patient_share_rwf"] == CONSULTATION
    visit["profile"].refresh_from_db()
    assert visit["profile"].status == "rejected"
    ok = client.post(
        url,
        {"insurance_profile_id": profile, "result": "verified", "referral_letter_seen": True},
        format="json",
    )
    assert ok.status_code == 201 and ok.json()["totals"]["patient_share_rwf"] == 500
    assert len(ok.json()["verifications"]) == 2
    assert "billing.insurance.rejected" in _actions(clinic)


def test_verification_after_payment_can_only_lower_the_share(
    clinic: Any,
    priced: dict[str, Any],
    cashier: tuple[APIClient, Any],
    admin: tuple[APIClient, Any],
) -> None:
    rule(clinic, admin[1], "rama", bp=1000)
    visit = walk_in(clinic, cashier, priced["service_id"], insurer="rama")
    url = f"{S}visits/{visit['visit_id']}/insurance-verifications/"
    profile = str(visit["profile"].pk)
    client = cashier[0]
    client.post(url, {"insurance_profile_id": profile, "result": "verified"}, format="json")
    bill = bill_of(client, visit["visit_id"]).json()
    assert pay(client, bill, 500).status_code == 201
    raise_share = client.post(
        url,
        {"insurance_profile_id": profile, "result": "rejected", "reason_code": "card_unreadable"},
        format="json",
    )
    assert raise_share.status_code == 422

    # paid in cash first, insurance verified later: money is owed back to the patient
    visit2 = walk_in(clinic, cashier, priced["service_id"], "Mugisha Eric", insurer="rama")
    bill2 = bill_of(client, visit2["visit_id"]).json()
    paid = pay(client, bill2, CONSULTATION).json()
    assert paid["status"] == "paid"
    lowered = client.post(
        f"{S}visits/{visit2['visit_id']}/insurance-verifications/",
        {"insurance_profile_id": str(visit2["profile"].pk), "result": "verified"},
        format="json",
    ).json()
    assert lowered["totals"]["owed_to_patient_rwf"] == 4500
    assert lowered["totals"]["refundable_rwf"] == 5000


# ---- S8-B5 lines -------------------------------------------------------------------------------


def test_lines_add_and_remove_before_payment_only(
    clinic: Any,
    priced: dict[str, Any],
    cashier: tuple[APIClient, Any],
    admin: tuple[APIClient, Any],
) -> None:
    tariff(clinic, admin[1], "AMOX500", 100, kind="medicine")
    visit = walk_in(clinic, cashier, priced["service_id"])
    client = cashier[0]
    bill = bill_of(client, visit["visit_id"]).json()
    unknown = client.post(
        f"{S}bills/{bill['id']}/lines/",
        {"version": bill["version"], "tariff_code": "NOPE", "quantity": 1},
        format="json",
    )
    assert unknown.status_code == 422
    medicine = client.post(
        f"{S}bills/{bill['id']}/lines/",
        {"version": bill["version"], "tariff_code": "AMOX500", "quantity": 1},
        format="json",
    )
    assert medicine.status_code == 422  # medicines come from the prescription
    stale = client.post(
        f"{S}bills/{bill['id']}/lines/",
        {"version": bill["version"] - 1, "tariff_code": "DRESSING", "quantity": 1},
        format="json",
    )
    assert stale.status_code == 409
    added = client.post(
        f"{S}bills/{bill['id']}/lines/",
        {"version": bill["version"], "tariff_code": "DRESSING", "quantity": 1},
        format="json",
    ).json()
    line = next(x for x in added["lines"] if x["code"] == "DRESSING")
    short = client.post(
        f"{S}bill-lines/{line['id']}/remove/",
        {"version": added["version"], "reason": "no"},
        format="json",
    )
    assert short.status_code == 400
    removed = client.post(
        f"{S}bill-lines/{line['id']}/remove/",
        {"version": added["version"], "reason": "Added by mistake"},
        format="json",
    ).json()
    assert removed["totals"]["total_rwf"] == CONSULTATION
    assert next(x for x in removed["lines"] if x["id"] == line["id"])["removed"] is True
    again = client.post(
        f"{S}bill-lines/{line['id']}/remove/",
        {"version": removed["version"], "reason": "Added by mistake"},
        format="json",
    )
    assert again.status_code == 422
    paid = pay(client, removed, 1000).json()
    consult = paid["lines"][0]
    locked = client.post(
        f"{S}bill-lines/{consult['id']}/remove/",
        {"version": paid["version"], "reason": "Wrong service"},
        format="json",
    )
    assert locked.status_code == 422
    with rls_context(facility_id=clinic.pk):
        with pytest.raises(DatabaseError), transaction.atomic():
            BillLine.objects.filter(pk=consult["id"]).update(unit_price_rwf=1)
        with pytest.raises(DatabaseError), transaction.atomic():
            BillLine.objects.filter(pk=consult["id"]).delete()


def test_medicine_lines_follow_the_prescription(
    clinic: Any,
    priced: dict[str, Any],
    cashier: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
    pharmacist: tuple[APIClient, Any],
    admin: tuple[APIClient, Any],
    drugs: dict[str, Any],
) -> None:
    tariff(clinic, admin[1], "AMOX500", 100, kind="medicine")
    visit = walk_in(clinic, cashier, priced["service_id"])
    _c, p = prescribe(
        doctor[0],
        visit["visit_id"],
        AMOX,
        {
            "drug_code": "PARA500",
            "dose": "2 tablets",
            "frequency_code": "bd",
            "route": "oral",
            "duration_days": 3,
        },
    )
    client = cashier[0]
    bill = bill_of(client, visit["visit_id"]).json()
    medicine = [x for x in bill["lines"] if x["is_medicine"]]
    assert [(x["name"], x["quantity"], x["total_rwf"]) for x in medicine] == [
        ("Amoxicillin 500 mg capsule", 21, 2100)
    ]
    assert bill["missing_prices"] == [
        {"kind": "medicine", "code": "PARA500", "name": "Paracetamol 500 mg tablet"}
    ]
    amox = next(i for i in p["items"] if i["drug_code"] == "AMOX500")
    doctor[0].post(
        f"{S}prescription-items/{amox['id']}/cancel/",
        {"version": p["version"], "reason": "Not needed any more"},
        format="json",
    )
    bill = bill_of(client, visit["visit_id"]).json()
    assert not [x for x in bill["lines"] if x["is_medicine"] and not x["removed"]]
    assert bill["totals"]["total_rwf"] == CONSULTATION


# ---- S8-B7 / B8 payments and receipts -----------------------------------------------------------


def test_payments_methods_references_shift_and_idempotency(
    clinic: Any, priced: dict[str, Any], desk: tuple[APIClient, Any]
) -> None:
    visit = walk_in(clinic, desk, priced["service_id"])
    client = desk[0]
    bill = bill_of(client, visit["visit_id"]).json()
    no_shift = pay(client, bill, 1000)
    assert no_shift.status_code == 422 and error_code(no_shift) == "shift_required"
    client.post(f"{S}cash-shifts/", {"opening_float_rwf": 0}, format="json")
    assert (
        client.post(f"{S}cash-shifts/", {"opening_float_rwf": 0}, format="json").status_code == 409
    )
    assert pay(client, bill, CONSULTATION + 1).status_code == 422  # no overpayment (D-5)
    assert pay(client, bill, 1000, method="mtn_momo").status_code == 422  # reference
    assert pay(client, {**bill, "version": bill["version"] - 1}, 1000).status_code == 409
    key = str(uuid.uuid4())
    first = pay(
        client,
        bill,
        2000,
        method="mtn_momo",
        reference="MP123",
        key=key,
        ebm_receipt_number="EBM-77",
    )
    assert first.status_code == 201
    repeat = pay(client, bill, 2000, method="mtn_momo", reference="MP123", key=key)
    assert repeat.status_code == 201 and len(repeat.json()["payments"]) == 1
    body = first.json()
    assert body["payments"][0]["ebm_receipt_number"] == "EBM-77"
    assert body["status"] == "partly_paid" and body["totals"]["balance_rwf"] == 3000
    done = pay(client, body, 3000, method="card", reference="POS-9").json()
    assert done["status"] == "paid" and done["totals"]["balance_rwf"] == 0
    assert pay(client, done, 1).status_code == 422
    numbers = [p["receipt"]["number"] for p in done["payments"]]
    year = numbers[0].split("-")[1]
    assert numbers == [f"RC-{year}-000001", f"RC-{year}-000002"]

    receipt = client.get(f"{S}receipts/{done['payments'][1]['receipt']['id']}/").json()
    assert receipt["amount_rwf"] == 3000 and receipt["balance_after_rwf"] == 0
    assert receipt["facility_name"] == clinic.name
    sent = client.post(f"{S}receipts/{receipt['id']}/send/")
    assert sent.status_code == 202
    actions = _actions(clinic)
    for action in ("billing.payment.recorded", "billing.receipt.issued", "billing.receipt.sent"):
        assert action in actions

    with rls_context(facility_id=clinic.pk):
        payment_id = done["payments"][0]["id"]
        with pytest.raises(DatabaseError), transaction.atomic():
            Payment.objects.filter(pk=payment_id).update(amount_rwf=1)
        with pytest.raises(DatabaseError), transaction.atomic():
            Receipt.objects.filter(payment_id=payment_id).update(number="RC-1")
        with pytest.raises(DatabaseError), transaction.atomic():
            Payment.objects.filter(pk=payment_id).delete()
        with pytest.raises(DatabaseError), transaction.atomic():
            BillEvent.objects.filter(bill_id=done["id"]).delete()


def test_receipt_prefix_setting_and_cash_without_reference(
    clinic: Any, priced: dict[str, Any], cashier: tuple[APIClient, Any]
) -> None:
    _settings(clinic, receipt_prefix="GZ")
    visit = walk_in(clinic, cashier, priced["service_id"])
    bill = bill_of(cashier[0], visit["visit_id"]).json()
    body = pay(cashier[0], bill, 1000).json()
    assert body["payments"][0]["receipt"]["number"].startswith("GZ-")
    with rls_context(facility_id=clinic.pk):
        _settings(clinic, receipt_prefix="bad prefix!")
        assert bills.receipt_prefix(clinic.pk) == "RC"


# ---- S8-B9 exemptions --------------------------------------------------------------------------


def test_exemptions_setting_reasons_and_waiver_approval(
    clinic: Any,
    priced: dict[str, Any],
    cashier: tuple[APIClient, Any],
    admin: tuple[APIClient, Any],
) -> None:
    visit = walk_in(clinic, cashier, priced["service_id"])
    client = cashier[0]
    bill = bill_of(client, visit["visit_id"]).json()
    url = f"{S}bills/{bill['id']}/exemptions/"
    off = client.post(
        url, {"version": bill["version"], "reason_code": "staff", "amount_rwf": 1000}, format="json"
    )
    assert off.status_code == 422
    _settings(clinic, allow_exemptions=True, waiver_approval_threshold_rwf=1000)
    vague = client.post(
        url, {"version": bill["version"], "reason_code": "other", "amount_rwf": 1000}, format="json"
    )
    assert vague.status_code == 422
    too_much = client.post(
        url, {"version": bill["version"], "reason_code": "staff", "amount_rwf": 9000}, format="json"
    )
    assert too_much.status_code == 422
    staff = client.post(
        url, {"version": bill["version"], "reason_code": "staff", "amount_rwf": 1000}, format="json"
    ).json()
    assert staff["totals"]["exempted_rwf"] == 1000 and staff["totals"]["balance_rwf"] == 4000
    small = client.post(
        url,
        {"version": staff["version"], "reason_code": "waiver", "amount_rwf": 500},
        format="json",
    ).json()
    assert small["totals"]["exempted_rwf"] == 1500
    big = client.post(
        url,
        {"version": small["version"], "reason_code": "waiver", "amount_rwf": 2000},
        format="json",
    ).json()
    pending = [e for e in big["exemptions"] if e["is_pending"]]
    assert len(pending) == 1 and big["totals"]["exempted_rwf"] == 1500
    request_ = big["approval_requests"][0]
    assert request_["kind"] == "waiver" and request_["status"] == "pending"
    approved = admin[0].post(
        f"{S}approval-requests/{request_['id']}/approve/",
        {"version": request_["version"]},
        format="json",
    )
    assert approved.status_code == 200, approved.content
    after = bill_of(client, visit["visit_id"]).json()
    assert after["totals"]["exempted_rwf"] == 3500 and after["totals"]["balance_rwf"] == 1500
    assert "billing.exemption.applied" in _actions(clinic)


def test_waiver_larger_than_a_changed_balance_is_refused(
    clinic: Any,
    priced: dict[str, Any],
    cashier: tuple[APIClient, Any],
    admin: tuple[APIClient, Any],
) -> None:
    _settings(clinic, allow_exemptions=True)
    visit = walk_in(clinic, cashier, priced["service_id"])
    client = cashier[0]
    bill = bill_of(client, visit["visit_id"]).json()
    waived = client.post(
        f"{S}bills/{bill['id']}/exemptions/",
        {"version": bill["version"], "reason_code": "waiver", "amount_rwf": 4000},
        format="json",
    ).json()
    pay(client, waived, 3000)
    request_ = waived["approval_requests"][0]
    refused = admin[0].post(
        f"{S}approval-requests/{request_['id']}/approve/",
        {"version": request_["version"]},
        format="json",
    )
    assert refused.status_code == 422


# ---- S8-B10 voids, refunds, separation of duties ------------------------------------------------


def test_void_refund_credit_note_and_payout(
    clinic: Any,
    priced: dict[str, Any],
    cashier: tuple[APIClient, Any],
    admin: tuple[APIClient, Any],
) -> None:
    visit = walk_in(clinic, cashier, priced["service_id"])
    client = cashier[0]
    bill = bill_of(client, visit["visit_id"]).json()
    paid = pay(client, bill, CONSULTATION).json()
    payment = paid["payments"][0]
    void = client.post(
        f"{S}payments/{payment['id']}/void-requests/",
        {"reason_text": "Recorded on the wrong patient"},
        format="json",
    )
    assert void.status_code == 201
    twice = client.post(
        f"{S}payments/{payment['id']}/void-requests/",
        {"reason_text": "Recorded on the wrong patient"},
        format="json",
    )
    assert twice.status_code == 409
    inbox = admin[0].get(f"{S}approval-requests/").json()
    assert inbox["count"] == 1 and inbox["results"][0]["kind"] == "void_payment"
    assert client.get(f"{S}approval-requests/").status_code == 403

    age_recent_auth(admin[0])
    stale_auth = admin[0].post(
        f"{S}approval-requests/{void.json()['id']}/approve/",
        {"version": void.json()["version"]},
        format="json",
    )
    assert stale_auth.status_code == 403 and error_code(stale_auth) == "step_up_required"
    approver = _fresh(admin[0], admin[1])
    approved = approver.post(
        f"{S}approval-requests/{void.json()['id']}/approve/",
        {"version": void.json()["version"], "note": "Checked"},
        format="json",
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved" and not approved.json()["is_self_approved"]
    voided = bill_of(client, visit["visit_id"]).json()
    assert voided["payments"][0]["status"] == "voided"
    assert voided["payments"][0]["receipt"]["status"] == "voided"
    assert voided["status"] == "open" and voided["totals"]["balance_rwf"] == CONSULTATION
    decided = approver.post(
        f"{S}approval-requests/{void.json()['id']}/reject/",
        {"version": approved.json()["version"], "note": "Too late now"},
        format="json",
    )
    assert decided.status_code == 422

    # paid but not seen: refund → credit note → payout
    paid = pay(client, voided, CONSULTATION).json()
    over = client.post(
        f"{S}bills/{paid['id']}/refund-requests/",
        {"amount_rwf": CONSULTATION + 1, "reason_text": "Left before consultation"},
        format="json",
    )
    assert over.status_code == 422
    refund = client.post(
        f"{S}bills/{paid['id']}/refund-requests/",
        {"amount_rwf": CONSULTATION, "reason_text": "Left before consultation"},
        format="json",
    ).json()
    assert refund["kind"] == "refund"
    pending_more = client.post(
        f"{S}bills/{paid['id']}/refund-requests/",
        {"amount_rwf": 1, "reason_text": "Left before consultation"},
        format="json",
    )
    assert pending_more.status_code == 422
    approver.post(
        f"{S}approval-requests/{refund['id']}/approve/",
        {"version": refund["version"]},
        format="json",
    )
    credited = bill_of(client, visit["visit_id"]).json()
    note = credited["credit_notes"][0]
    year = note["number"].split("-")[1]
    assert note["number"] == f"CN-{year}-000001" and note["amount_rwf"] == CONSULTATION
    assert (
        credited["status"] == "credited"
        and credited["totals"]["owed_to_patient_rwf"] == CONSULTATION
    )
    payout_url = f"{S}credit-notes/{note['id']}/payouts/"
    assert (
        client.post(
            payout_url, {"method": "mtn_momo", "amount_rwf": 1000}, format="json"
        ).status_code
        == 422
    )  # reference
    assert (
        client.post(
            payout_url, {"method": "cash", "amount_rwf": CONSULTATION + 1}, format="json"
        ).status_code
        == 422
    )
    key = str(uuid.uuid4())
    out = client.post(
        payout_url,
        {"method": "cash", "amount_rwf": CONSULTATION},
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
    )
    assert out.status_code == 201
    again = client.post(
        payout_url,
        {"method": "cash", "amount_rwf": CONSULTATION},
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
    )
    assert again.status_code == 201
    final = out.json()
    assert final["totals"]["refunded_rwf"] == CONSULTATION
    assert final["totals"]["owed_to_patient_rwf"] == 0 and final["totals"]["balance_rwf"] == 0
    assert final["credit_notes"][0]["paid_out_rwf"] == CONSULTATION
    shift = client.get(f"{S}cash-shifts/current/").json()
    assert (
        shift["expected_totals"]["cash"] == 10000
    )  # float + 5,000 + 5,000 - 5,000 voided - payout
    for action in (
        "billing.payment.voided",
        "billing.credit_note.issued",
        "billing.refund.paid_out",
    ):
        assert action in _actions(clinic)


def test_overpayment_refund_does_not_lower_the_amount_due(
    clinic: Any,
    priced: dict[str, Any],
    cashier: tuple[APIClient, Any],
    admin: tuple[APIClient, Any],
) -> None:
    rule(clinic, admin[1], "rama", bp=1000)
    visit = walk_in(clinic, cashier, priced["service_id"], insurer="rama")
    client = cashier[0]
    pay(client, bill_of(client, visit["visit_id"]).json(), CONSULTATION)
    client.post(
        f"{S}visits/{visit['visit_id']}/insurance-verifications/",
        {"insurance_profile_id": str(visit["profile"].pk), "result": "verified"},
        format="json",
    )
    bill = bill_of(client, visit["visit_id"]).json()
    refund = client.post(
        f"{S}bills/{bill['id']}/refund-requests/",
        {"amount_rwf": 4500, "reason_text": "Insurance verified after payment"},
        format="json",
    ).json()
    admin[0].post(
        f"{S}approval-requests/{refund['id']}/approve/",
        {"version": refund["version"]},
        format="json",
    )
    after = bill_of(client, visit["visit_id"]).json()
    assert after["totals"]["due_rwf"] == 500 and after["totals"]["credited_rwf"] == 0
    assert after["status"] == "paid"
    note = after["credit_notes"][0]
    client.post(
        f"{S}credit-notes/{note['id']}/payouts/",
        {"method": "cash", "amount_rwf": 4500},
        format="json",
    )
    final = bill_of(client, visit["visit_id"]).json()
    assert final["totals"]["balance_rwf"] == 0 and final["totals"]["owed_to_patient_rwf"] == 0


def test_separation_of_duties_and_one_person_clinic(
    clinic: Any, priced: dict[str, Any], admin: tuple[APIClient, Any], desk: tuple[APIClient, Any]
) -> None:
    # the admin is also the cashier, and another admin exists: self-approval refused
    other_admin = client_for(clinic, ("facility_admin",), "second-admin@example.test")
    client = admin[0]
    client.post(f"{S}cash-shifts/", {"opening_float_rwf": 0}, format="json")
    visit = walk_in(clinic, desk, priced["service_id"])
    paid = pay(client, bill_of(client, visit["visit_id"]).json(), 1000).json()
    void = client.post(
        f"{S}payments/{paid['payments'][0]['id']}/void-requests/",
        {"reason_text": "Wrong amount typed"},
        format="json",
    ).json()
    own = client.post(
        f"{S}approval-requests/{void['id']}/approve/", {"version": void["version"]}, format="json"
    )
    assert own.status_code == 422
    own_reject = client.post(
        f"{S}approval-requests/{void['id']}/reject/",
        {"version": void["version"], "note": "Changed my mind"},
        format="json",
    )
    assert own_reject.status_code == 422
    not_mine = desk[0].post(
        f"{S}approval-requests/{void['id']}/cancel/", {"version": void["version"]}, format="json"
    )
    assert not_mine.status_code == 422
    cancelled = client.post(
        f"{S}approval-requests/{void['id']}/cancel/", {"version": void["version"]}, format="json"
    )
    assert cancelled.status_code == 200 and cancelled.json()["status"] == "cancelled"
    with rls_context(facility_id=clinic.pk):
        from medilink.tenancy.models import FacilityMembership

        FacilityMembership.objects.filter(user=other_admin[1]).update(is_active=False)
    void2 = client.post(
        f"{S}payments/{paid['payments'][0]['id']}/void-requests/",
        {"reason_text": "Wrong amount typed"},
        format="json",
    ).json()
    self_ok = client.post(
        f"{S}approval-requests/{void2['id']}/approve/",
        {"version": void2["version"]},
        format="json",
    )
    assert self_ok.status_code == 200 and self_ok.json()["is_self_approved"] is True
    rejected_list = client.get(f"{S}approval-requests/?status=approved").json()
    assert rejected_list["results"][0]["is_self_approved"] is True


def test_reject_needs_a_note(
    clinic: Any,
    priced: dict[str, Any],
    cashier: tuple[APIClient, Any],
    admin: tuple[APIClient, Any],
) -> None:
    visit = walk_in(clinic, cashier, priced["service_id"])
    paid = pay(cashier[0], bill_of(cashier[0], visit["visit_id"]).json(), 1000).json()
    void = (
        cashier[0]
        .post(
            f"{S}payments/{paid['payments'][0]['id']}/void-requests/",
            {"reason_text": "Wrong amount typed"},
            format="json",
        )
        .json()
    )
    url = f"{S}approval-requests/{void['id']}/reject/"
    assert admin[0].post(url, {"version": void["version"]}, format="json").status_code == 422
    done = admin[0].post(
        url, {"version": void["version"], "note": "The amount was right"}, format="json"
    )
    assert done.status_code == 200 and done.json()["status"] == "rejected"


# ---- S8-B11 shifts -----------------------------------------------------------------------------


def test_shift_close_and_review(
    clinic: Any,
    priced: dict[str, Any],
    cashier: tuple[APIClient, Any],
    admin: tuple[APIClient, Any],
) -> None:
    client = cashier[0]
    visit = walk_in(clinic, cashier, priced["service_id"])
    bill = bill_of(client, visit["visit_id"]).json()
    bill = pay(client, bill, 3000).json()
    pay(client, bill, 2000, method="airtel_money", reference="AM-1")
    shift = client.get(f"{S}cash-shifts/current/").json()
    assert shift["expected_totals"] == {
        "cash": 13000,
        "mtn_momo": 0,
        "airtel_money": 2000,
        "card": 0,
    }
    assert shift["payment_count"] == 2
    close_url = f"{S}cash-shifts/{shift['id']}/close/"
    not_owner = admin[0].post(
        close_url,
        {"version": shift["version"], "counted_totals": {"cash": 13000}},
        format="json",
    )
    assert not_owner.status_code == 422
    no_note = client.post(
        close_url,
        {"version": shift["version"], "counted_totals": {"cash": 12500, "airtel_money": 2000}},
        format="json",
    )
    assert no_note.status_code == 422
    closed = client.post(
        close_url,
        {
            "version": shift["version"],
            "counted_totals": {"cash": 12500, "airtel_money": 2000},
            "note": "500 short, change given twice",
        },
        format="json",
    )
    assert closed.status_code == 200
    body = closed.json()
    assert body["status"] == "closed" and body["difference_rwf"] == -500
    assert client.get(f"{S}cash-shifts/current/").status_code == 404
    again = client.post(
        close_url, {"version": body["version"], "counted_totals": {}}, format="json"
    )
    assert again.status_code == 422
    assert (
        client.post(
            f"{S}cash-shifts/{body['id']}/review/", {"version": body["version"]}, format="json"
        ).status_code
        == 403
    )  # receptionists don't review
    reviewed = admin[0].post(
        f"{S}cash-shifts/{body['id']}/review/",
        {"version": body["version"], "note": "Accepted"},
        format="json",
    )
    assert reviewed.status_code == 200 and reviewed.json()["status"] == "reviewed"
    assert (
        admin[0]
        .post(
            f"{S}cash-shifts/{body['id']}/review/",
            {"version": reviewed.json()["version"]},
            format="json",
        )
        .status_code
        == 422
    )
    mine = client.get(f"{S}cash-shifts/").json()
    assert mine["count"] == 1
    assert admin[0].get(f"{S}cash-shifts/?status=reviewed").json()["count"] == 1
    for action in ("billing.shift.opened", "billing.shift.closed", "billing.shift.reviewed"):
        assert action in _actions(clinic)


def test_own_shift_review_only_in_a_one_person_clinic(clinic: Any, priced: Any, admin: Any) -> None:
    client = admin[0]
    shift = client.post(f"{S}cash-shifts/", {"opening_float_rwf": 0}, format="json").json()
    closed = client.post(
        f"{S}cash-shifts/{shift['id']}/close/",
        {"version": shift["version"], "counted_totals": {}},
        format="json",
    ).json()
    reviewed = client.post(
        f"{S}cash-shifts/{closed['id']}/review/", {"version": closed["version"]}, format="json"
    )
    assert reviewed.status_code == 200 and reviewed.json()["is_self_reviewed"] is True
    other = client_for(clinic, ("facility_admin",), "admin-two@example.test")[0]
    shift2 = client.post(f"{S}cash-shifts/", {"opening_float_rwf": 0}, format="json").json()
    closed2 = client.post(
        f"{S}cash-shifts/{shift2['id']}/close/",
        {"version": shift2["version"], "counted_totals": {}},
        format="json",
    ).json()
    own = client.post(
        f"{S}cash-shifts/{closed2['id']}/review/", {"version": closed2["version"]}, format="json"
    )
    assert own.status_code == 422
    assert (
        other.post(
            f"{S}cash-shifts/{closed2['id']}/review/",
            {"version": closed2["version"]},
            format="json",
        ).status_code
        == 200
    )


# ---- S8-B12 balances, S8-B13 pharmacy and cancel ------------------------------------------------


def test_balances_list_and_filters(
    clinic: Any, priced: dict[str, Any], cashier: tuple[APIClient, Any]
) -> None:
    client = cashier[0]
    visit = walk_in(clinic, cashier, priced["service_id"])
    bill = bill_of(client, visit["visit_id"]).json()
    pay(client, bill, 1000)
    other = walk_in(clinic, cashier, priced["service_id"], "Mugisha Eric")
    other_bill = bill_of(client, other["visit_id"]).json()
    pay(client, other_bill, CONSULTATION)
    balances = client.get(f"{S}billing/patients/{visit['record'].pk}/balances/").json()
    assert balances["total_balance_rwf"] == 4000 and len(balances["bills"]) == 1
    assert client.get(f"{S}billing/patients/{uuid.uuid4()}/balances/").status_code == 404
    rows = client.get(f"{S}bills/?has_balance=true").json()["results"]
    assert [r["id"] for r in rows] == [bill["id"]]
    assert client.get(f"{S}bills/?status=paid").json()["count"] == 1
    assert client.get(f"{S}bills/?has_balance=false").json()["count"] == 1
    assert client.get(f"{S}bills/?q=Mugisha").json()["results"][0]["id"] == other_bill["id"]
    assert client.get(f"{S}bills/?date=2020-01-01").json()["count"] == 0
    assert client.get(f"{S}bills/{bill['id']}/").json()["totals"]["balance_rwf"] == 4000


def test_payment_first_pharmacy_and_cancelled_visit(
    clinic: Any,
    priced: dict[str, Any],
    cashier: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
    admin: tuple[APIClient, Any],
    drugs: dict[str, Any],
    django_capture_on_commit_callbacks: Any,
) -> None:
    with rls_context(facility_id=clinic.pk):
        row, _ = Settings.objects.get_or_create(facility=clinic)
        row.billing = {"pay_before_dispensing": True}
        row.save()
    tariff(clinic, admin[1], "AMOX500", 100, kind="medicine")
    visit = walk_in(clinic, cashier, priced["service_id"])
    _c, p = prescribe(doctor[0], visit["visit_id"], AMOX)
    assert p["status"] == "awaiting_payment"
    client = cashier[0]
    bill = bill_of(client, visit["visit_id"]).json()
    assert bill["totals"]["balance_rwf"] == CONSULTATION + 2100
    pay(client, bill, CONSULTATION + 2100)
    p_after = doctor[0].get(f"{S}prescriptions/{p['id']}/").json()
    assert p_after["status"] == "ready_to_dispense"

    cancelled = walk_in(clinic, cashier, priced["service_id"], "Mugisha Eric")
    bill_c = bill_of(client, cancelled["visit_id"]).json()
    ticket = cancelled["ticket"]
    with django_capture_on_commit_callbacks(execute=True):
        response = client.post(
            f"{S}tickets/{ticket['id']}/cancel/",
            {"version": ticket["version"], "reason_code": "patient_request"},
            format="json",
        )
    assert response.status_code == 200, response.content
    voided = client.get(f"{S}bills/{bill_c['id']}/").json()
    assert voided["status"] == "voided" and voided["totals"]["total_rwf"] == 0
    assert pay(client, voided, 1).status_code == 422
    assert "billing.bill.voided" in _actions(clinic)


# ---- S8-B2 authorisation -----------------------------------------------------------------------


def test_doctors_pharmacists_and_other_facilities_have_no_billing_access(
    clinic: Any,
    priced: dict[str, Any],
    cashier: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
    pharmacist: tuple[APIClient, Any],
) -> None:
    visit = walk_in(clinic, cashier, priced["service_id"])
    bill = bill_of(cashier[0], visit["visit_id"]).json()
    for client in (doctor[0], pharmacist[0]):
        assert client.get(f"{S}bills/{bill['id']}/").status_code == 403
        assert client.get(f"{S}visits/{visit['visit_id']}/bill/").status_code == 403
        assert pay(client, bill, 100).status_code == 403
        assert client.get(f"{S}cash-shifts/").status_code == 403
    other = FacilityFactory(name="Other Clinic", slug="other-billing")
    outsider = client_for(other, ("receptionist",), "other-desk@example.test")[0]
    assert outsider.get(f"{S}bills/{bill['id']}/").status_code == 404
    assert outsider.get(f"{S}visits/{visit['visit_id']}/bill/").status_code == 404
    assert pay(outsider, bill, 100).status_code == 404
    assert outsider.get(f"{S}bills/").json()["count"] == 0
    receipt_id = pay(cashier[0], bill, 100).json()["payments"][0]["receipt"]["id"]
    assert outsider.get(f"{S}receipts/{receipt_id}/").status_code == 404
    assert outsider.post(
        f"{S}visits/{visit['visit_id']}/insurance-verifications/",
        {"insurance_profile_id": str(uuid.uuid4()), "result": "verified"},
        format="json",
    ).status_code in (403, 404)
    card(visit["record"].patient_id, cashier[1])


def test_receipt_reaches_the_patient_account(
    clinic: Any,
    priced: dict[str, Any],
    cashier: tuple[APIClient, Any],
    patient_account: tuple[Any, Any],  # noqa: F811
) -> None:
    from medilink.notifications.models import Notification

    user, record = patient_account
    response = check_in(cashier[0], record, priced["service_id"])
    bill = bill_of(cashier[0], response.json()["visit_id"]).json()
    receipt_id = pay(cashier[0], bill, 1000).json()["payments"][0]["receipt"]["id"]
    sent = Notification.objects.filter(
        recipient_user_id=user.pk, event_type="billing.receipt_issued"
    )
    assert sent.count() == 1
    assert sent.get().data["receipt_id"] == receipt_id
    cashier[0].post(f"{S}receipts/{receipt_id}/send/")
    assert sent.count() == 2
