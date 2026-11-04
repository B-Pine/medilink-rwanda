"""W5 pharmacy stock (lite): batches with expiry per medicine and facility, first-expiry-first-out
deduction on dispense, adjustments with a reason, a low-stock threshold, and availability that
follows the stock.

Rules:
- A medicine follows its stock from its first receipt at the facility (it has a `StockItem`).
  Before that, its availability is the manual flag (`DrugAvailability`), as in S7a.
- Only batches that have not expired count: a batch is usable up to and including its expiry
  date. Expired batches stay on the card until removed with an "expired" adjustment.
- Stock never goes below zero. Dispensing more than the usable stock is blocked with the number
  left; the pharmacist gives that many as part, or corrects the count first (an audited
  adjustment). There is no "dispense anyway" override, so the count stays true.
- Every change writes an append-only `StockMovement` and runs under a row lock on the stock card,
  so two counters can't spend the same units.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

from django.db import transaction
from django.db.models import IntegerField, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from medilink.audit.services import record
from medilink.masterdata.models import Drug
from medilink.patients.errors import FieldRule
from medilink.pharmacy.models import (
    AdjustmentReason,
    DispenseLine,
    MovementKind,
    StockBatch,
    StockItem,
    StockMovement,
)

EXPIRING_DAYS = 60
MAX_QUANTITY = 100_000

ALREADY_EXPIRED = _("This batch has already expired. Don't put it on the shelf.")
NOT_ENOUGH = _(
    "Only %(left)s of %(name)s left in stock. Give that many as part, or correct the count first."
)
BELOW_ZERO = _("That would take the batch below zero. It has %(left)s.")
REMOVE_ONLY = _("Damaged or expired stock can only be taken off, not added.")
FOLLOWS_STOCK = _(
    "This medicine follows its stock count. Receive or adjust stock to change its availability."
)


class Level:
    IN_STOCK = "in_stock"
    LOW = "low"
    OUT = "out"


def today() -> dt.date:
    return timezone.localdate()


def drug_display(drug: Drug) -> str:
    return f"{drug.generic_name} {drug.strength} {drug.form}".strip()


def level(on_hand: int, threshold: int) -> str:
    if on_hand <= 0:
        return Level.OUT
    if on_hand < threshold:
        return Level.LOW
    return Level.IN_STOCK


def usable_sum(prefix: str = "batches__") -> Any:
    """Units in batches that have not expired, as an annotation on `StockItem`."""
    return Coalesce(
        Sum(
            f"{prefix}quantity_on_hand",
            filter=Q(**{f"{prefix}expiry_date__gte": today()}),
        ),
        Value(0),
        output_field=IntegerField(),
    )


def cards(facility_id: Any) -> Any:
    """Stock cards of the facility with `on_hand` (usable units) and `next_expiry`."""
    soonest = (
        StockBatch.objects.filter(
            stock_item=OuterRef("pk"), quantity_on_hand__gt=0, expiry_date__gte=today()
        )
        .order_by("expiry_date")
        .values("expiry_date")[:1]
    )
    expired = (
        StockBatch.objects.filter(
            stock_item=OuterRef("pk"), quantity_on_hand__gt=0, expiry_date__lt=today()
        )
        .values("stock_item")
        .annotate(total=Sum("quantity_on_hand"))
        .values("total")
    )
    return (
        StockItem.objects.filter(facility_id=facility_id)
        .select_related("drug")
        .annotate(
            on_hand=usable_sum(),
            next_expiry=Subquery(soonest),
            expired_on_hand=Coalesce(Subquery(expired), Value(0), output_field=IntegerField()),
        )
    )


def levels(facility_id: Any, codes: Iterable[str] | None = None) -> dict[str, str]:
    """Stock level by drug code, for the medicines that follow their stock."""
    rows = StockItem.objects.filter(facility_id=facility_id)
    if codes is not None:
        rows = rows.filter(drug__code__in=list(codes))
    pairs = rows.annotate(on_hand=usable_sum()).values_list(
        "drug__code", "on_hand", "low_stock_threshold"
    )
    return {code: level(on_hand, threshold) for code, on_hand, threshold in pairs}


def is_tracked(facility_id: Any, drug: Drug) -> bool:
    return StockItem.objects.filter(facility_id=facility_id, drug=drug).exists()


def card_data(card: StockItem) -> dict[str, Any]:
    on_hand = int(getattr(card, "on_hand", 0) or 0)
    return {
        "drug_code": card.drug.code,
        "display": drug_display(card.drug),
        "is_controlled": card.drug.is_controlled,
        "on_hand": on_hand,
        "expired_on_hand": int(getattr(card, "expired_on_hand", 0) or 0),
        "low_stock_threshold": card.low_stock_threshold,
        "stock_level": level(on_hand, card.low_stock_threshold),
        "next_expiry": getattr(card, "next_expiry", None),
        "updated_at": card.updated_at,
    }


def _audit(action: str, request: Any, card: StockItem, **metadata: Any) -> None:
    record(
        action,
        request=request,
        facility_id=card.facility_id,
        object_type="pharmacy.stock_item",
        object_id=card.pk,
        metadata={"drug_code": card.drug.code, **metadata},
    )


def _lock(**lookup: Any) -> StockItem:
    """The stock card, row-locked: every change to a medicine's stock queues behind it."""
    return StockItem.objects.select_for_update(of=("self",)).select_related("drug").get(**lookup)


def _move(
    card: StockItem,
    batch: StockBatch,
    *,
    kind: str,
    quantity: int,
    membership: Any,
    reason: str = "",
    note: str = "",
    dispense_line: DispenseLine | None = None,
) -> StockMovement:
    return StockMovement.objects.create(
        facility_id=card.facility_id,
        stock_item=card,
        batch=batch,
        kind=kind,
        quantity=quantity,
        balance_after=batch.quantity_on_hand,
        reason=reason,
        note=note[:300],
        dispense_line=dispense_line,
        membership=membership,
        occurred_at=timezone.now(),
    )


# ---- receive ----------------------------------------------------------------------------------


@dataclass
class Receipt:
    batch_number: str
    expiry_date: dt.date
    quantity: int
    supplier: str = ""
    low_stock_threshold: int | None = None


def receive(
    facility_id: Any, drug: Drug, data: Receipt, *, membership: Any, request: Any
) -> StockItem:
    batch_number = data.batch_number.strip()[:40]
    if not batch_number:
        raise FieldRule("batch_number", _("Give the batch number."))
    if data.expiry_date < today():
        raise FieldRule("expiry_date", ALREADY_EXPIRED)
    if data.quantity < 1 or data.quantity > MAX_QUANTITY:
        raise FieldRule("quantity", _("Give the number of units received."))
    with transaction.atomic():
        StockItem.objects.get_or_create(facility_id=facility_id, drug=drug)
        card = _lock(facility_id=facility_id, drug=drug)
        batch = (
            StockBatch.objects.select_for_update()
            .filter(stock_item=card, batch_number=batch_number, expiry_date=data.expiry_date)
            .first()
        )
        if batch is None:
            batch = StockBatch(
                facility_id=facility_id,
                stock_item=card,
                batch_number=batch_number,
                expiry_date=data.expiry_date,
            )
        batch.quantity_on_hand += data.quantity
        if data.supplier.strip():
            batch.supplier = data.supplier.strip()[:120]
        batch.save()
        _move(
            card, batch, kind=MovementKind.RECEIVED, quantity=data.quantity, membership=membership
        )
        if data.low_stock_threshold is not None:
            card.low_stock_threshold = data.low_stock_threshold
        card.save(update_fields=["low_stock_threshold", "updated_at"])
        _audit(
            "pharmacy.stock.received",
            request,
            card,
            batch_id=str(batch.pk),
            quantity=data.quantity,
        )
    return card


# ---- adjust -----------------------------------------------------------------------------------


def adjust(
    batch_id: Any,
    *,
    quantity_change: int,
    reason: str,
    note: str = "",
    membership: Any,
    request: Any,
) -> StockItem:
    if reason not in AdjustmentReason.values:
        raise FieldRule("reason", _("Choose a reason."))
    if quantity_change == 0:
        raise FieldRule("quantity_change", _("Give the number of units to add or take off."))
    if reason in (AdjustmentReason.DAMAGED, AdjustmentReason.EXPIRED) and quantity_change > 0:
        raise FieldRule("quantity_change", REMOVE_ONLY)
    with transaction.atomic():
        found = StockBatch.objects.only("stock_item_id").get(pk=batch_id)
        card = _lock(pk=found.stock_item_id)
        batch = StockBatch.objects.select_for_update().get(pk=batch_id)
        after = batch.quantity_on_hand + quantity_change
        if after < 0:
            raise FieldRule("quantity_change", BELOW_ZERO % {"left": batch.quantity_on_hand})
        if after > MAX_QUANTITY:
            raise FieldRule("quantity_change", _("That is more than a batch can hold."))
        batch.quantity_on_hand = after
        batch.save(update_fields=["quantity_on_hand", "updated_at"])
        _move(
            card,
            batch,
            kind=MovementKind.ADJUSTED,
            quantity=quantity_change,
            reason=reason,
            note=note.strip(),
            membership=membership,
        )
        card.save(update_fields=["updated_at"])
        _audit(
            "pharmacy.stock.adjusted",
            request,
            card,
            batch_id=str(batch.pk),
            quantity_change=quantity_change,
            reason=reason,
        )
    return card


def set_threshold(
    facility_id: Any, drug: Drug, *, threshold: int, request: Any
) -> StockItem | None:
    with transaction.atomic():
        try:
            card = _lock(facility_id=facility_id, drug=drug)
        except StockItem.DoesNotExist:
            return None
        if card.low_stock_threshold != threshold:
            before = card.low_stock_threshold
            card.low_stock_threshold = threshold
            card.save(update_fields=["low_stock_threshold", "updated_at"])
            _audit(
                "pharmacy.stock.threshold_changed",
                request,
                card,
                threshold_before=before,
                threshold=threshold,
            )
    return card


# ---- dispense (called inside services.dispense, under the prescription lock) -------------------


def lock_for_dispense(facility_id: Any, drugs: Iterable[Drug]) -> dict[Any, StockItem]:
    """Lock the stock cards of the medicines about to be given, in a fixed order (no deadlock
    between two counters); medicines without a card are not tracked and are skipped."""
    ids = sorted({d.pk for d in drugs}, key=str)
    if not ids:
        return {}
    rows = (
        StockItem.objects.select_for_update(of=("self",))
        .select_related("drug")
        .filter(facility_id=facility_id, drug_id__in=ids)
        .order_by("pk")
    )
    return {row.drug_id: row for row in rows}


def deduct(card: StockItem, quantity: int, *, line: DispenseLine, membership: Any) -> None:
    """Take `quantity` units off the usable batches, earliest expiry first. Blocks (422) when
    there is not enough: nothing of the dispensing is saved (same transaction)."""
    batches = list(
        StockBatch.objects.select_for_update()
        .filter(stock_item=card, quantity_on_hand__gt=0, expiry_date__gte=today())
        .order_by("expiry_date", "created_at")
    )
    left = sum(b.quantity_on_hand for b in batches)
    if left < quantity:
        raise FieldRule("lines", NOT_ENOUGH % {"left": left, "name": drug_display(card.drug)})
    need = quantity
    for batch in batches:
        if need == 0:
            break
        take = min(need, batch.quantity_on_hand)
        batch.quantity_on_hand -= take
        batch.save(update_fields=["quantity_on_hand", "updated_at"])
        _move(
            card,
            batch,
            kind=MovementKind.DISPENSED,
            quantity=-take,
            dispense_line=line,
            membership=membership,
        )
        need -= take
    card.save(update_fields=["updated_at"])


# ---- reads ------------------------------------------------------------------------------------


def expiring(facility_id: Any, days: int = EXPIRING_DAYS) -> Any:
    """Batches with units left that expire within `days` days, already expired ones first."""
    until = today() + dt.timedelta(days=days)
    return (
        StockBatch.objects.filter(
            facility_id=facility_id, quantity_on_hand__gt=0, expiry_date__lte=until
        )
        .select_related("stock_item__drug")
        .order_by("expiry_date", "batch_number")
    )


def batch_data(batch: StockBatch) -> dict[str, Any]:
    drug = batch.stock_item.drug
    return {
        "id": batch.pk,
        "drug_code": drug.code,
        "display": drug_display(drug),
        "batch_number": batch.batch_number,
        "expiry_date": batch.expiry_date,
        "quantity_on_hand": batch.quantity_on_hand,
        "supplier": batch.supplier,
        "is_expired": batch.expiry_date < today(),
        "received_at": batch.created_at,
    }


def movement_data(row: StockMovement) -> dict[str, Any]:
    drug = row.stock_item.drug
    return {
        "id": row.pk,
        "drug_code": drug.code,
        "display": drug_display(drug),
        "batch_id": row.batch_id,
        "batch_number": row.batch.batch_number,
        "kind": row.kind,
        "quantity": row.quantity,
        "balance_after": row.balance_after,
        "reason": row.reason,
        "note": row.note,
        "prescription_id": (
            row.dispense_line.dispense_record.prescription_id if row.dispense_line else None
        ),
        "by_name": str(row.membership.user.full_name),
        "occurred_at": row.occurred_at,
    }


def movements(facility_id: Any) -> Any:
    return StockMovement.objects.filter(facility_id=facility_id).select_related(
        "stock_item__drug", "batch", "membership__user", "dispense_line__dispense_record"
    )


def counts(facility_id: Any) -> dict[str, int]:
    """For Pharmacist Today: medicines low on stock and batches expiring soon."""
    low = sum(1 for value in levels(facility_id).values() if value == Level.LOW)
    return {"low_stock": low, "expiring_soon": expiring(facility_id).count()}
