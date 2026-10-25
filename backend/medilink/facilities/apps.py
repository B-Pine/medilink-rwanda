from typing import Any

from celery.schedules import crontab
from django.apps import AppConfig
from django.db.models.signals import post_migrate

BEAT_SCHEDULE = {
    "facilities.expire_invitations": {
        "task": "medilink.facilities.tasks.expire_invitations",
        "schedule": crontab(hour=0, minute=30),  # 02:30 Kigali
    },
}
FUNCTIONS = ("tenancy_find_invitation(bytea)", "scheduling_busy_ranges(uuid, uuid)")
APPEND_ONLY = ("facilities_config_change",)
IMAGES = frozenset({"image/jpeg", "image/png", "image/heic", "image/heif"})


class FacilitiesConfig(AppConfig):
    name = "medilink.facilities"
    label = "facilities"
    verbose_name = "Facility setup"

    def ready(self) -> None:
        from config.celery import app
        from medilink.facilities import checklist, db, staff
        from medilink.onboarding import golive
        from medilink.onboarding.services import application_approved
        from medilink.uploads.purposes import UploadPurpose, get_purpose, register

        post_migrate.connect(db.grant_execute(FUNCTIONS, APPEND_ONLY), sender=self, weak=False)
        app.conf.beat_schedule = {**(app.conf.beat_schedule or {}), **BEAT_SCHEDULE}
        application_approved.connect(staff.on_application_approved, dispatch_uid="s2-approval-hook")
        golive.register("setup.checklist_complete", checklist.checklist_complete)
        for code in ("facility_photo", "facility_branding"):
            if get_purpose(code) is None:
                register(
                    UploadPurpose(
                        code=code,
                        audiences=frozenset({"staff"}),
                        owner_kind="facility",
                        data_class="C0",
                        content_types=IMAGES,
                        max_bytes=5 * 2**20,
                        can_upload=_can_configure,
                        can_read=_is_member,
                        unattached_ttl_hours=24,
                    )
                )


def _can_configure(principal: Any, fields: dict[str, Any]) -> bool:
    return "facility.configure" in principal.permissions


def _is_member(principal: Any, file: Any) -> bool:
    return (
        principal.active_facility_id is not None
        and file.facility_id == principal.active_facility_id
    )
