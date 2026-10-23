from typing import Any

from celery.schedules import crontab
from django.apps import AppConfig
from django.db.models.signals import post_migrate

BEAT_SCHEDULE = {
    "onboarding.send_licence_reminders": {
        "task": "medilink.onboarding.tasks.send_licence_reminders",
        "schedule": crontab(hour=5, minute=0),  # 07:00 Kigali
    },
    "onboarding.expire_stale_drafts": {
        "task": "medilink.onboarding.tasks.expire_stale_drafts",
        "schedule": crontab(hour=1, minute=0),
    },
}


class OnboardingConfig(AppConfig):
    name = "medilink.onboarding"
    label = "onboarding"
    verbose_name = "Facility onboarding"

    def ready(self) -> None:
        from config.celery import app
        from medilink.accounts import security_checks  # noqa: F401  (registers the check)
        from medilink.onboarding import golive
        from medilink.uploads.purposes import UploadPurpose, register
        from medilink.uploads.services import upload_scanned

        post_migrate.connect(_revoke_event_writes, sender=self)
        app.conf.beat_schedule = {**(app.conf.beat_schedule or {}), **BEAT_SCHEDULE}
        # Applicants and super admins upload through the onboarding endpoints, which check access
        # themselves; the generic /staff|patient/uploads/ endpoints never accept this purpose.
        register(
            UploadPurpose(
                code="facility_application_document",
                audiences=frozenset({"public", "platform"}),
                owner_kind="application",
                data_class="C2",
                max_bytes=10 * 2**20,
                unattached_ttl_hours=24 * 90,  # attached once clean; drafts live up to 90 days
            )
        )
        upload_scanned.connect(_document_scanned, dispatch_uid="onboarding-document-scanned")
        golive.register("licence.moh_operating_valid", golive.moh_operating_licence_valid)


def _document_scanned(sender: Any, file_id: Any, status: str, **kwargs: Any) -> None:
    from medilink.onboarding.services import attach_scanned_document
    from medilink.tenancy.context import rls_context

    with rls_context():
        attach_scanned_document(file_id)


def _revoke_event_writes(sender: Any = None, using: str = "default", **kwargs: Any) -> None:
    """Events are never changed by the runtime role. Facility status events are never deleted;
    application events go only with their application (stale draft purge, contract §5)."""
    from medilink.masterdata.db import revoke

    revoke(
        (),
        ("onboarding_facility_status_event",),
        using=using,
        no_update=("onboarding_application_event",),
    )
