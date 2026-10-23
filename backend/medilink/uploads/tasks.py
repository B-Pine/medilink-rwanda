"""Upload jobs (contract §5). Tasks take IDs only (security 06 §8).

`uploads_file` has forced RLS, so every task sets the tenant context of the row it touches:
rows without a facility are visible with an empty facility context (policy `unowned_rows`).
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from celery import shared_task
from django.utils import timezone

from medilink.tenancy.context import rls_context
from medilink.tenancy.models import Facility
from medilink.uploads.models import ScanStatus, UploadedFile
from medilink.uploads.purposes import get_purpose
from medilink.uploads.services import ScanError, mark_failed, scan
from medilink.uploads.storage import get_storage

logger = logging.getLogger(__name__)

SCAN_MAX_RETRIES = 5
FINAL_FILE_RETENTION = timedelta(days=7)  # infected, rejected, failed
SOFT_DELETED_RETENTION = timedelta(days=30)


@shared_task(
    bind=True,
    ignore_result=True,
    time_limit=120,
    soft_time_limit=110,
    max_retries=SCAN_MAX_RETRIES,
)
def scan_file(self: Any, file_id: str, facility_id: str | None = None) -> None:
    with rls_context(facility_id=facility_id):
        file = UploadedFile.objects.select_for_update().filter(pk=file_id).first()
        if file is None or file.scan_status != ScanStatus.PENDING:
            return
        try:
            scan(file)
        except ScanError:
            if self.request.retries >= SCAN_MAX_RETRIES:
                mark_failed(file)
                return
            countdown = min(10 * 2**self.request.retries, 300)  # 10 s ... 5 min
            raise self.retry(countdown=countdown) from None


def _purge_queryset(now: Any) -> list[UploadedFile]:
    bad = [ScanStatus.INFECTED, ScanStatus.REJECTED, ScanStatus.FAILED]
    candidates: dict[Any, UploadedFile] = {}
    unattached = UploadedFile.objects.filter(
        attached_at__isnull=True, deleted_at__isnull=True
    ).exclude(scan_status__in=bad)
    for file in unattached.iterator():
        spec = get_purpose(file.purpose)
        ttl_hours = spec.unattached_ttl_hours if spec else 24
        if file.created_at < now - timedelta(hours=ttl_hours):
            candidates[file.pk] = file
    for file in UploadedFile.objects.filter(
        scan_status__in=bad, created_at__lt=now - FINAL_FILE_RETENTION
    ):
        candidates[file.pk] = file
    for file in UploadedFile.objects.filter(deleted_at__lt=now - SOFT_DELETED_RETENTION):
        candidates[file.pk] = file
    return list(candidates.values())


def _purge_in_context() -> int:
    storage = get_storage()
    count = 0
    for file in _purge_queryset(timezone.now()):
        storage.delete("quarantine", str(file.storage_key))
        storage.delete("documents", str(file.storage_key))
        UploadedFile.objects.filter(pk=file.pk).delete()
        count += 1
    return count


@shared_task(ignore_result=True, time_limit=600, soft_time_limit=580)
def purge_files() -> int:
    """Delete objects and rows past their retention: unattached files after the purpose's TTL,
    infected/rejected/failed files after 7 days, soft-deleted files after 30 days."""
    with rls_context():
        total = _purge_in_context()
    for facility_id in Facility.objects.values_list("pk", flat=True):
        with rls_context(facility_id=facility_id):
            total += _purge_in_context()
    logger.info("Purged %s upload(s)", total)
    return total
