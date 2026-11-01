from celery.schedules import crontab
from django.apps import AppConfig
from django.db.models.signals import post_migrate

# S7a job (contract sprint-07 §5)
BEAT_SCHEDULE = {
    "pharmacy.expire_prescriptions": {
        "task": "medilink.pharmacy.tasks.expire_prescriptions",
        "schedule": crontab(minute="7"),
    },
}
FUNCTIONS = ("pharmacy_patient_prescriptions(uuid)", "pharmacy_expiry_facilities()")
APPEND_ONLY = ("pharmacy_prescription_event", "pharmacy_dispense_record", "pharmacy_dispense_line")


class PharmacyConfig(AppConfig):
    name = "medilink.pharmacy"
    label = "pharmacy"
    verbose_name = "Pharmacy"

    def ready(self) -> None:
        from config.celery import app
        from medilink.facilities import db
        from medilink.pharmacy import receivers, settings_fields  # noqa: F401

        post_migrate.connect(db.grant_execute(FUNCTIONS, APPEND_ONLY), sender=self, weak=False)
        app.conf.beat_schedule = {**(app.conf.beat_schedule or {}), **BEAT_SCHEDULE}
