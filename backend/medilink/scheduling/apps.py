from celery.schedules import crontab
from django.apps import AppConfig
from django.db.models.signals import post_migrate

# S5 jobs (contract sprint-05 §5)
BEAT_SCHEDULE = {
    "scheduling.generate_slots": {
        "task": "medilink.scheduling.tasks.generate_slots",
        "schedule": crontab(hour="1", minute="0"),
    },
    "scheduling.expire_holds": {
        "task": "medilink.scheduling.tasks.expire_holds",
        "schedule": crontab(minute="*"),
    },
    "scheduling.mark_no_shows": {
        "task": "medilink.scheduling.tasks.mark_no_shows",
        "schedule": crontab(minute="*/5"),
    },
    "scheduling.pass_over": {
        "task": "medilink.scheduling.tasks.pass_over",
        "schedule": crontab(minute="*"),
    },
    "scheduling.refresh_public_listing": {
        "task": "medilink.scheduling.tasks.refresh_public_listing",
        "schedule": crontab(minute="*/10"),
    },
    "scheduling.purge": {
        "task": "medilink.scheduling.tasks.purge",
        "schedule": crontab(hour="3", minute="30"),
    },
}
FUNCTIONS = (
    "scheduling_active_booking_count(uuid)",
    "scheduling_strike_count(uuid, timestamptz)",
    "scheduling_patient_bookings(uuid, boolean)",
    "scheduling_booking_facilities()",
    "scheduling_slot_facility(uuid)",
    "scheduling_hold_facility(uuid, uuid)",
)
APPEND_ONLY = ("scheduling_booking_event",)


class SchedulingConfig(AppConfig):
    name = "medilink.scheduling"
    label = "scheduling"
    verbose_name = "Scheduling"

    def ready(self) -> None:
        from config.celery import app
        from medilink.facilities import db
        from medilink.scheduling import (
            settings_fields,  # noqa: F401  (registers S5 settings)
            signals,  # noqa: F401  (listing and slot refresh)
        )

        post_migrate.connect(db.grant_execute(FUNCTIONS, APPEND_ONLY), sender=self, weak=False)
        app.conf.beat_schedule = {**(app.conf.beat_schedule or {}), **BEAT_SCHEDULE}
