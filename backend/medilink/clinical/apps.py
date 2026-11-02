from celery.schedules import crontab
from django.apps import AppConfig
from django.db.models.signals import post_migrate

FUNCTIONS = ("clinical_patient_records(uuid)", "patients_import_purge_facilities()")
APPEND_ONLY = (
    "clinical_addendum",
    "authz_access_reason",
    "clinical_history_entry",
    "clinical_scan",
    "patients_health_attribute",
)
# S6b job (contract sprint-06 §5)
BEAT_SCHEDULE = {
    "clinical.break_glass_review_reminder": {
        "task": "medilink.clinical.tasks.break_glass_review_reminder",
        "schedule": crontab(day_of_week="1", hour="8", minute="13"),  # Monday, Kigali time
    },
    "clinical.purge_import_rows": {
        "task": "medilink.clinical.tasks.purge_import_rows",
        "schedule": crontab(hour="3", minute="17"),
    },
}


class ClinicalConfig(AppConfig):
    name = "medilink.clinical"
    label = "clinical"
    verbose_name = "Clinical record"

    def ready(self) -> None:
        from config.celery import app
        from medilink.clinical import signals  # noqa: F401  (completion guard, contract D-6)
        from medilink.clinical.imports import register_import_purpose
        from medilink.clinical.records import register_document_purpose
        from medilink.facilities import db

        post_migrate.connect(db.grant_execute(FUNCTIONS, APPEND_ONLY), sender=self, weak=False)
        register_document_purpose()
        register_import_purpose()
        app.conf.beat_schedule = {**(app.conf.beat_schedule or {}), **BEAT_SCHEDULE}
