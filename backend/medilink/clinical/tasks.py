"""S6b jobs (contract sprint-06 §5): weekly break-glass review reminder (counts only, S9) and
daily purge of raw import rows past their rollback window."""

from __future__ import annotations

from celery import shared_task

from medilink.clinical import break_glass, imports
from medilink.tenancy.context import rls_context


@shared_task(name="medilink.clinical.tasks.break_glass_review_reminder", time_limit=120)
def break_glass_review_reminder() -> int:
    return break_glass.remind_reviews()


@shared_task(name="medilink.clinical.tasks.purge_import_rows", time_limit=600)
def purge_import_rows() -> int:
    total = 0
    for facility_id in imports.due_facilities():
        with rls_context(facility_id=facility_id):
            total += imports.purge(facility_id)
    return total
