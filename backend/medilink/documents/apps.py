from celery.schedules import crontab
from django.apps import AppConfig
from django.db.models.signals import post_migrate

# S7b job (contract sprint-07 §5)
BEAT_SCHEDULE = {
    "documents.purge_share_links": {
        "task": "medilink.documents.tasks.purge_share_links",
        "schedule": crontab(hour="3", minute="17"),
    },
}
FUNCTIONS = ("documents_patient_documents(uuid)", "documents_share_target(bytea)")
APPEND_ONLY = ("documents_verification_log",)


class DocumentsConfig(AppConfig):
    name = "medilink.documents"
    label = "documents"
    verbose_name = "Documents"

    def ready(self) -> None:
        from config.celery import app
        from medilink.documents import receivers  # noqa: F401
        from medilink.facilities import db

        post_migrate.connect(db.grant_execute(FUNCTIONS, APPEND_ONLY), sender=self, weak=False)
        app.conf.beat_schedule = {**(app.conf.beat_schedule or {}), **BEAT_SCHEDULE}
