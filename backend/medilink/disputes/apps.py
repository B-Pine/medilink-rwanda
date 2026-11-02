from celery.schedules import crontab
from django.apps import AppConfig
from django.db.models.signals import post_migrate

# S10 part 2a job (contract sprint-10b §2.1 Deadlines)
BEAT_SCHEDULE = {
    "disputes.deadlines": {
        "task": "medilink.disputes.tasks.apply_deadlines",
        "schedule": crontab(minute="23"),
    },
}
FUNCTIONS = (
    "disputes_subject_facility(text, uuid, uuid)",
    "disputes_patient_disputes(uuid)",
    "disputes_platform_disputes()",
    "disputes_open_facilities()",
)
APPEND_ONLY = ("disputes_dispute_event", "disputes_message", "disputes_evidence")


class DisputesConfig(AppConfig):
    name = "medilink.disputes"
    label = "disputes"
    verbose_name = "Disputes"

    def ready(self) -> None:
        from config.celery import app
        from medilink.facilities import db

        post_migrate.connect(db.grant_execute(FUNCTIONS, APPEND_ONLY), sender=self, weak=False)
        app.conf.beat_schedule = {**(app.conf.beat_schedule or {}), **BEAT_SCHEDULE}
