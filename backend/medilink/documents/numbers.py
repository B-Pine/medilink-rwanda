"""Gapless document numbers (contract sprint-07 §2.1, interface for S7b and S8 receipts)."""

from __future__ import annotations

from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone

from medilink.documents.models import NumberCounter


def next_number(facility_id: Any, prefix: str, *, year: int | None = None) -> str:
    """`{prefix}-{year}-{000123}`. Call inside the caller's transaction: the counter row stays
    locked until it commits, and a rollback returns the number."""
    if not transaction.get_connection().in_atomic_block:
        raise RuntimeError("next_number() must run inside the caller's transaction")
    year = year or timezone.localdate().year
    counter = (
        NumberCounter.objects.select_for_update()
        .filter(facility_id=facility_id, prefix=prefix, year=year)
        .first()
    )
    if counter is None:
        try:
            with transaction.atomic():
                counter = NumberCounter.objects.create(
                    facility_id=facility_id, prefix=prefix, year=year
                )
        except IntegrityError:  # a parallel first number: lock the row it created
            counter = NumberCounter.objects.select_for_update().get(
                facility_id=facility_id, prefix=prefix, year=year
            )
    counter.last_value += 1
    counter.save(update_fields=["last_value", "updated_at"])
    return f"{prefix}-{year}-{counter.last_value:06d}"
