"""S6b job (contract sprint-06 §5): weekly break-glass review reminder (counts only, S9)."""

from __future__ import annotations

from celery import shared_task

from medilink.clinical import break_glass


@shared_task(name="medilink.clinical.tasks.break_glass_review_reminder", time_limit=120)
def break_glass_review_reminder() -> int:
    return break_glass.remind_reviews()
