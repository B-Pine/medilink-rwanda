"""S7a periodic job (contract sprint-07 §5): expire prescriptions, per facility in its RLS
context."""

from __future__ import annotations

from typing import Any

from celery import shared_task
from django.db import connection

from medilink.pharmacy import services
from medilink.tenancy.context import rls_context


def _facilities_with_open_prescriptions() -> list[Any]:
    """SECURITY DEFINER: facilities with prescriptions past expiry still open (no context yet)."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT facility_id FROM pharmacy_expiry_facilities()")
        return [row[0] for row in cursor.fetchall()]


@shared_task(name="medilink.pharmacy.tasks.expire_prescriptions", time_limit=600)
def expire_prescriptions() -> int:
    total = 0
    for facility_id in _facilities_with_open_prescriptions():
        with rls_context(facility_id=facility_id):
            total += services.expire(facility_id)
    return total
