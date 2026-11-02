"""S7b jobs (contract sprint-07 §5): render on the isolated `documents` queue, purge share links."""

from __future__ import annotations

from typing import Any

from celery import shared_task

from medilink.documents import services
from medilink.tenancy.context import rls_context


@shared_task(name="medilink.documents.tasks.render_document", queue="documents", time_limit=120)
def render_document(facility_id: str, document_id: str) -> Any:
    with rls_context(facility_id=facility_id):
        version = services.render(document_id)
    return str(version.pk) if version else None


@shared_task(name="medilink.documents.tasks.purge_share_links", time_limit=300)
def purge_share_links() -> int:
    return services.purge_share_links()
