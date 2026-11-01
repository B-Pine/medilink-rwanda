from celery.schedules import crontab
from django.apps import AppConfig

BEAT_SCHEDULE = {
    "audit.export_audit_anchor": {
        "task": "medilink.audit.tasks.export_audit_anchor",
        "schedule": crontab(hour=23, minute=55),  # end of the Kigali day
    },
}


class AuditConfig(AppConfig):
    name = "medilink.audit"
    label = "audit"
    verbose_name = "Audit log"

    def ready(self) -> None:
        from config.celery import app

        app.conf.beat_schedule = {**(app.conf.beat_schedule or {}), **BEAT_SCHEDULE}
