"""Import jobs (contract §5): validate (preview) and apply. Status machine guards re-runs."""

from __future__ import annotations

import logging

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from medilink.audit.services import record
from medilink.masterdata import imports
from medilink.masterdata.models import ImportStatus, MasterDataImport
from medilink.tenancy.context import rls_context
from medilink.uploads.models import ScanStatus
from medilink.uploads.services import attach
from medilink.uploads.storage import get_storage

logger = logging.getLogger(__name__)


@shared_task(ignore_result=True, time_limit=300, soft_time_limit=280)
def validate_import(import_id: str) -> None:
    with rls_context():
        job = MasterDataImport.objects.select_for_update().select_related("file").get(pk=import_id)
        if job.status != ImportStatus.VALIDATING:
            return
        if job.file.scan_status != ScanStatus.CLEAN:
            job.status = ImportStatus.FAILED if job.file.is_final else ImportStatus.VALIDATING
            job.summary = {"errors": 1} if job.file.is_final else job.summary
            job.plan = {
                "errors": [{"line": 0, "field": "file", "message": "The file was refused."}]
            }
            job.save(update_fields=["status", "summary", "plan"])
            return
        if not job.file.is_attached:  # the job owns its file from now on (purge skips it)
            attach(job.file, purpose=job.file.purpose, owner_id=job.pk, actor=job.created_by)
        with get_storage().open("documents", str(job.file.storage_key)) as stream:
            data = stream.read()
        try:
            plan = imports.build_plan(job.kind, data, job.mode)
        except imports.ImportFileError as exc:
            job.status = ImportStatus.INVALID
            job.plan = {"errors": [{"line": 1, "field": "", "message": str(exc)}], "changes": []}
            job.summary = {"errors": 1}
            job.save(update_fields=["status", "plan", "summary"])
            return
        job.plan = plan.as_json()
        job.summary = plan.summary
        job.status = ImportStatus.INVALID if plan.errors else ImportStatus.PREVIEWED
        job.save(update_fields=["plan", "summary", "status"])
        record(
            "masterdata.import.previewed",
            actor=job.created_by,
            object_type="masterdata.import",
            object_id=job.pk,
            metadata={"kind": job.kind, "status": job.status, "errors": len(plan.errors)},
        )


@shared_task(ignore_result=True, time_limit=600, soft_time_limit=580)
def apply_import(import_id: str) -> None:
    with rls_context():
        job = MasterDataImport.objects.select_for_update().get(pk=import_id)
        if job.status != ImportStatus.APPLYING:
            return
        try:
            with transaction.atomic():
                counts = imports.apply_plan(
                    job.kind, job.plan, actor=job.confirmed_by, import_ref=job
                )
        except Exception:
            logger.exception("Master data import failed", extra={"import_id": str(job.pk)})
            job.status = ImportStatus.FAILED
            job.save(update_fields=["status"])
            return
        job.status = ImportStatus.APPLIED
        job.applied_at = timezone.now()
        job.save(update_fields=["status", "applied_at"])
        record(
            "masterdata.import.applied",
            actor=job.confirmed_by,
            object_type="masterdata.import",
            object_id=job.pk,
            metadata={"kind": job.kind, **counts},
        )
