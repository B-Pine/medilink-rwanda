from celery.schedules import crontab
from django.apps import AppConfig
from django.db.models.signals import post_migrate

BEAT_SCHEDULE = {
    "visits.end_of_day": {
        "task": "medilink.visits.tasks.end_of_day",
        "schedule": crontab(minute="*/15"),
    },
    "visits.expire_step_outs": {
        "task": "medilink.visits.tasks.expire_step_outs",
        "schedule": crontab(minute="*"),
    },
    "visits.publish_outbox": {
        "task": "medilink.visits.tasks.publish_outbox",
        "schedule": 30.0,
    },
}
FUNCTIONS = (
    "visits_open_facilities()",
    "visits_account_patients(uuid)",
    "visits_patient_active(uuid)",
    "visits_find_display_link(bytea)",
)
APPEND_ONLY = ("visits_ticket_event", "visits_duty_status_event", "visits_reorder_review")


class VisitsConfig(AppConfig):
    name = "medilink.visits"
    label = "visits"
    verbose_name = "Visits and queue"

    def ready(self) -> None:
        from config.celery import app
        from medilink.facilities import db
        from medilink.visits import settings_fields  # noqa: F401  (registers queue settings)

        post_migrate.connect(db.grant_execute(FUNCTIONS, APPEND_ONLY), sender=self, weak=False)
        app.conf.beat_schedule = {**(app.conf.beat_schedule or {}), **BEAT_SCHEDULE}
