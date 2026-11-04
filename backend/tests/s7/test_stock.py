"""W5 pharmacy stock (lite): receive, FEFO deduction on dispense, adjustments, low stock,
availability that follows the stock, expiring soon (upgrade 13 §3, FR-PHA-06)."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.db import DatabaseError, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from medilink.audit.models import AuditEntry
from medilink.pharmacy.models import DispenseRecord, StockBatch, StockItem, StockMovement
from medilink.tenancy.context import rls_context
from tests.s7.conftest import AMOX, S, dispense, prescribe

pytestmark = pytest.mark.django_db(transaction=False)

ST = f"{S}pharmacy/stock/"


def _in(days: int) -> str:
    return (timezone.localdate() + dt.timedelta(days=days)).isoformat()


def receive(client: APIClient, **data: Any) -> Any:
    body = {
        "drug_code": "AMOX500",
        "batch_number": "B-1",
        "expiry_date": _in(200),
        "quantity": 30,
        **data,
    }
    return client.post(f"{ST}receive/", body, format="json")


def _actions(facility: Any) -> list[str]:
    return list(AuditEntry.objects.filter(facility_id=facility.pk).values_list("action", flat=True))


def test_receive_adds_to_the_card_and_doctors_see_the_level(
    clinic: Any,
    pharmacist: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
    drugs: dict[str, Any],
) -> None:
    client = pharmacist[0]
    first = receive(client, supplier="CAMERWA", low_stock_threshold=40)
    assert first.status_code == 201, first.content
    card = first.json()
    assert card["on_hand"] == 30 and card["stock_level"] == "low"
    assert card["batches"][0]["supplier"] == "CAMERWA"
    assert card["movements"][0]["kind"] == "received" and card["movements"][0]["quantity"] == 30

    again = receive(client, quantity=20).json()  # same batch and expiry: added to it
    assert again["on_hand"] == 50 and len(again["batches"]) == 1
    assert again["stock_level"] == "in_stock"

    expired = receive(client, batch_number="OLD", expiry_date=_in(-1))
    assert expired.status_code == 422
    assert receive(client, drug_code="NOPE").status_code == 404

    found = doctor[0].get(f"{S}drugs/?q=amox").json()
    amox = next(d for d in found if d["code"] == "AMOX500")
    assert amox["available_here"] is True and amox["stock_level"] == "in_stock"
    para = next(d for d in doctor[0].get(f"{S}drugs/?q=para").json() if d["code"] == "PARA500")
    assert para["stock_level"] is None  # not tracked: manual flag, as before
    assert "pharmacy.stock.received" in _actions(clinic)


def test_dispense_takes_the_earliest_expiry_first(
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    pharmacist: tuple[APIClient, Any],
    drugs: dict[str, Any],
) -> None:
    client = pharmacist[0]
    receive(client, batch_number="LATE", expiry_date=_in(300), quantity=50)
    receive(client, batch_number="SOON", expiry_date=_in(40), quantity=15)
    _c, p = prescribe(doctor[0], visit["visit_id"])  # AMOX: 1 capsule tds 7 days = 21
    assert p["items"][0]["stock_level"] == "in_stock"
    given = dispense(client, p, {"item_id": p["items"][0]["id"], "outcome": "full"})
    assert given.status_code == 201, given.content

    card = client.get(f"{ST}AMOX500/").json()
    left = {b["batch_number"]: b["quantity_on_hand"] for b in card["batches"]}
    assert left == {"LATE": 44}  # SOON emptied first (15), then 6 from LATE
    dispensed = [m for m in card["movements"] if m["kind"] == "dispensed"]
    assert sorted(m["quantity"] for m in dispensed) == [-15, -6]
    assert {m["prescription_id"] for m in dispensed} == {p["id"]}
    assert card["on_hand"] == 44


def test_not_enough_stock_blocks_the_whole_dispensing(
    clinic: Any,
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    pharmacist: tuple[APIClient, Any],
    drugs: dict[str, Any],
) -> None:
    client = pharmacist[0]
    receive(client, quantity=10)
    _c, p = prescribe(doctor[0], visit["visit_id"])
    item = p["items"][0]["id"]
    blocked = dispense(client, p, {"item_id": item, "outcome": "full"})
    assert blocked.status_code == 422
    assert "Only 10" in str(blocked.json())
    with rls_context(facility_id=clinic.pk):
        assert not DispenseRecord.objects.filter(prescription_id=p["id"]).exists()
    assert client.get(f"{ST}AMOX500/").json()["on_hand"] == 10  # nothing taken
    part = dispense(client, p, {"item_id": item, "outcome": "partial", "quantity": 10})
    assert part.status_code == 201, part.content
    card = client.get(f"{ST}AMOX500/").json()
    assert card["on_hand"] == 0 and card["stock_level"] == "out"


def test_out_of_stock_follows_the_count(
    clinic: Any,
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    pharmacist: tuple[APIClient, Any],
    drugs: dict[str, Any],
) -> None:
    client = pharmacist[0]
    batch = receive(client, quantity=5).json()["batches"][0]
    taken = client.post(
        f"{ST}batches/{batch['id']}/adjust/",
        {"quantity_change": -5, "reason": "damaged", "note": "Water damage"},
        format="json",
    )
    assert taken.status_code == 200, taken.content
    amox = next(d for d in doctor[0].get(f"{S}drugs/?q=amox").json() if d["code"] == "AMOX500")
    assert amox["available_here"] is False and amox["stock_level"] == "out"
    row = next(
        r
        for r in client.get(f"{S}pharmacy/availability/?q=amox").json()["results"]
        if r["drug_code"] == "AMOX500"
    )
    assert row["is_available"] is False and row["follows_stock"] is True
    off = client.get(f"{S}pharmacy/availability/?available=false").json()["results"]
    assert "AMOX500" in {r["drug_code"] for r in off}
    # the manual switch no longer applies to a medicine with stock
    manual = client.put(f"{S}pharmacy/availability/AMOX500/", {"is_available": True}, format="json")
    assert manual.status_code == 422
    assert client.get(f"{S}pharmacy/my-day/").json()["out_of_stock"] >= 1
    # untracked medicines are dispensed as before, without a count
    _c, p = prescribe(doctor[0], visit["visit_id"], {**AMOX, "drug_code": "PARA500"})
    given = dispense(client, p, {"item_id": p["items"][0]["id"], "outcome": "full"})
    assert given.status_code == 201, given.content
    with rls_context(facility_id=clinic.pk):
        assert StockItem.objects.filter(drug__code="AMOX500").exists()
        assert not StockItem.objects.filter(drug__code="PARA500").exists()


def test_adjustments_need_a_reason_and_never_go_below_zero(
    clinic: Any, pharmacist: tuple[APIClient, Any], drugs: dict[str, Any]
) -> None:
    client = pharmacist[0]
    batch = receive(client, quantity=8).json()["batches"][0]
    url = f"{ST}batches/{batch['id']}/adjust/"
    assert (
        client.post(url, {"quantity_change": 2, "reason": "damaged"}, format="json").status_code
        == 422
    )
    assert (
        client.post(
            url, {"quantity_change": -9, "reason": "count_correction"}, format="json"
        ).status_code
        == 422
    )
    assert client.post(url, {"quantity_change": 3}, format="json").status_code == 400
    up = client.post(url, {"quantity_change": 3, "reason": "count_correction"}, format="json")
    assert up.status_code == 200 and up.json()["on_hand"] == 11
    moved = client.get(f"{ST}movements/?kind=adjusted").json()["results"]
    assert moved[0]["reason"] == "count_correction" and moved[0]["balance_after"] == 11
    assert "pharmacy.stock.adjusted" in _actions(clinic)
    # the ledger is append-only and batches never go negative, even below the API
    with rls_context(facility_id=clinic.pk):
        with pytest.raises(DatabaseError), transaction.atomic():
            StockMovement.objects.filter(batch_id=batch["id"]).update(quantity=1)
        with pytest.raises(DatabaseError), transaction.atomic():
            StockBatch.objects.filter(pk=batch["id"]).update(quantity_on_hand=-1)


def test_threshold_low_list_and_expiring_soon(
    clinic: Any, pharmacist: tuple[APIClient, Any], drugs: dict[str, Any]
) -> None:
    client = pharmacist[0]
    receive(client, quantity=12, expiry_date=_in(30))
    receive(client, drug_code="PARA500", quantity=100, expiry_date=_in(365))
    set_low = client.put(f"{ST}AMOX500/", {"low_stock_threshold": 20}, format="json")
    assert set_low.status_code == 200 and set_low.json()["stock_level"] == "low"
    assert client.put(f"{ST}METF500/", {"low_stock_threshold": 5}, format="json").status_code == 404
    low = client.get(f"{ST}?level=low").json()["results"]
    assert [r["drug_code"] for r in low] == ["AMOX500"]
    assert {r["drug_code"] for r in client.get(f"{ST}?q=para").json()["results"]} == {"PARA500"}

    # an expired batch: listed first, not counted, never dispensed
    with rls_context(facility_id=clinic.pk):
        card = StockItem.objects.get(facility_id=clinic.pk, drug__code="AMOX500")
        StockBatch.objects.create(
            facility_id=clinic.pk,
            stock_item=card,
            batch_number="GONE",
            expiry_date=timezone.localdate() - dt.timedelta(days=3),
            quantity_on_hand=4,
        )
    soon = client.get(f"{ST}expiring/").json()
    assert [b["batch_number"] for b in soon] == ["GONE", "B-1"]
    assert soon[0]["is_expired"] is True
    detail = client.get(f"{ST}AMOX500/").json()
    assert detail["on_hand"] == 12 and detail["expired_on_hand"] == 4
    day = client.get(f"{S}pharmacy/my-day/").json()
    assert day["low_stock"] == 1 and day["expiring_soon"] == 2
    assert "pharmacy.stock.threshold_changed" in _actions(clinic)


def test_who_may_see_and_change_stock(
    pharmacist: tuple[APIClient, Any],
    admin: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
    desk: tuple[APIClient, Any],
    drugs: dict[str, Any],
) -> None:
    assert receive(admin[0]).status_code == 201  # facility admin manages stock
    assert receive(doctor[0]).status_code == 403
    assert doctor[0].get(ST).status_code == 403
    assert desk[0].get(f"{ST}expiring/").status_code == 403
    assert pharmacist[0].get(ST).json()["count"] == 1
