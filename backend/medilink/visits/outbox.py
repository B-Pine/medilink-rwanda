"""Transactional outbox and notify-then-fetch publishing (contract sprint-04 §2.2 Real time).

`emit()` writes an `OutboxEvent` in the caller's transaction and publishes it after commit, so a
rolled-back change never reaches a socket. Messages carry IDs only; clients refetch.
"""

from __future__ import annotations

import datetime as dt
import logging
from typing import Any

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.utils import timezone

from medilink.visits.models import OutboxEvent

logger = logging.getLogger(__name__)

QUEUE_CHANGED = "queue.changed"
DUTY_CHANGED = "duty.changed"
VISIT_CHANGED = "visit.changed"
BOOKING_CHANGED = "booking.changed"  # S5: staff boards only (the Expected list), never displays


def queue_group(facility_id: Any) -> str:
    return f"queue.f{facility_id}"


def display_group(facility_id: Any) -> str:
    return f"display.f{facility_id}"


def visit_group(patient_id: Any) -> str:
    return f"visit.p{patient_id}"


def emit(topic: str, facility_id: Any, **payload: Any) -> OutboxEvent:
    event = OutboxEvent.objects.create(
        topic=topic,
        facility_id=facility_id,
        payload={k: (str(v) if v is not None else None) for k, v in payload.items()},
    )
    transaction.on_commit(lambda: publish(event.pk))
    return event


def _messages(event: OutboxEvent) -> list[tuple[str, dict[str, Any]]]:
    data = {"type": event.topic, **event.payload}
    out: list[tuple[str, dict[str, Any]]] = []
    if event.topic in (QUEUE_CHANGED, DUTY_CHANGED) and event.facility_id:
        out.append((queue_group(event.facility_id), data))
        out.append((display_group(event.facility_id), data))
    if event.topic == BOOKING_CHANGED and event.facility_id:
        out.append((queue_group(event.facility_id), data))
    if event.topic == VISIT_CHANGED and event.payload.get("patient_id"):
        out.append(
            (
                visit_group(event.payload["patient_id"]),
                {"type": event.topic, "visit_id": event.payload.get("visit_id")},
            )
        )
    return out


def publish(event_id: Any) -> bool:
    """Send one event to its groups and mark it published. Never raises (the change is committed;
    the republish job retries)."""
    try:
        with transaction.atomic():
            event = OutboxEvent.objects.select_for_update().filter(pk=event_id).first()
            if event is None or event.published_at is not None:
                return False
            event.attempts += 1
            layer = get_channel_layer()
            if layer is not None:
                for group, message in _messages(event):
                    async_to_sync(layer.group_send)(group, {"type": "relay", "message": message})
            event.published_at = timezone.now()
            event.save(update_fields=["attempts", "published_at"])
            return True
    except Exception:
        logger.warning("Outbox publish failed", exc_info=True)
        OutboxEvent.objects.filter(pk=event_id).update(attempts=1)
        return False


def republish(older_than_seconds: int = 10, limit: int = 500) -> int:
    cutoff = timezone.now() - dt.timedelta(seconds=older_than_seconds)
    ids = list(
        OutboxEvent.objects.filter(published_at__isnull=True, created_at__lt=cutoff)
        .order_by("created_at")
        .values_list("pk", flat=True)[:limit]
    )
    return sum(1 for pk in ids if publish(pk))
