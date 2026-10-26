"""S4 periodic jobs (contract §5). Each facility runs in its own RLS context."""

from typing import Any

from celery import shared_task
from django.db import connection

from medilink.tenancy.context import rls_context
from medilink.visits import outbox, services


def _open_facilities() -> list[Any]:
    """Facilities with open tickets (SECURITY DEFINER: the job has no facility context yet)."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT facility_id FROM visits_open_facilities()")
        return [row[0] for row in cursor.fetchall()]


@shared_task(name="medilink.visits.tasks.end_of_day")
def end_of_day() -> int:
    closed = 0
    for facility_id in _open_facilities():
        with rls_context(facility_id=facility_id):
            closed += services.end_of_day(facility_id)
    return closed


@shared_task(name="medilink.visits.tasks.expire_step_outs")
def expire_step_outs() -> int:
    total = 0
    for facility_id in _open_facilities():
        with rls_context(facility_id=facility_id):
            total += services.expire_step_outs(facility_id)
    return total


@shared_task(name="medilink.visits.tasks.publish_outbox")
def publish_outbox() -> int:
    return outbox.republish()
