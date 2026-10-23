from typing import Any

from django.apps import AppConfig
from django.db.models.signals import post_migrate


class MasterDataConfig(AppConfig):
    name = "medilink.masterdata"
    label = "masterdata"
    verbose_name = "Master data"

    def ready(self) -> None:
        from medilink.authz import platform  # noqa: F401  (registers its deploy check)
        from medilink.masterdata.db import revoke_master_data_writes
        from medilink.masterdata.services import connect_guard
        from medilink.uploads.purposes import UploadPurpose, register
        from medilink.uploads.services import upload_scanned

        connect_guard()
        # Runs after core's grant receiver (core comes first in INSTALLED_APPS).
        post_migrate.connect(revoke_master_data_writes, sender=self)
        register(
            UploadPurpose(
                code="masterdata_import",
                audiences=frozenset({"platform"}),
                owner_kind="platform",
                data_class="C1",
                content_types=frozenset({"text/csv"}),
                max_bytes=5 * 2**20,
                can_upload=_is_platform_admin,
                can_read=_is_platform_admin,
                unattached_ttl_hours=24,
            )
        )
        upload_scanned.connect(_import_file_scanned, dispatch_uid="masterdata-import-scanned")


def _is_platform_admin(principal: Any, *args: Any) -> bool:
    return bool(principal and principal.user and principal.user.is_platform_admin)


def _import_file_scanned(sender: Any, file_id: Any, status: str, **kwargs: Any) -> None:
    from medilink.masterdata.models import ImportStatus, MasterDataImport
    from medilink.masterdata.tasks import validate_import
    from medilink.tenancy.context import rls_context

    with rls_context():
        jobs = list(
            MasterDataImport.objects.filter(
                file_id=file_id, status=ImportStatus.VALIDATING
            ).values_list("pk", flat=True)
        )
    for job_id in jobs:
        validate_import.delay(str(job_id))
