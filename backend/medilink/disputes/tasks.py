"""S10 part 2a job (contract sprint-10b §2.1 Deadlines): per facility in its RLS context."""

from __future__ import annotations

from typing import Any

from celery import shared_task
from django.db import connection

from medilink.disputes import services
from medilink.tenancy.context import rls_context


def _facilities() -> list[Any]:
    """SECURITY DEFINER: facilities with disputes still open."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT DISTINCT facility_id FROM disputes_open_facilities()")
        return [row[0] for row in cursor.fetchall()]


@shared_task(name="medilink.disputes.tasks.apply_deadlines", time_limit=600)
def apply_deadlines() -> int:
    total = 0
    for facility_id in _facilities():
        with rls_context(facility_id=facility_id):
            total += sum(services.apply_deadlines(facility_id).values())
    return total
