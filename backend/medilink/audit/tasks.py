"""Audit Celery tasks."""

from __future__ import annotations

from celery import shared_task

from medilink.audit.anchor import export_anchor


@shared_task(ignore_result=True, time_limit=60, soft_time_limit=45)
def export_audit_anchor() -> None:
    """Daily: export the hash-chain head to the configured sink (AUDIT_ANCHOR_SINK)."""
    export_anchor()
