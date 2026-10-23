from celery.schedules import crontab
from django.apps import AppConfig

BEAT_SCHEDULE = {
    "uploads.purge_files": {
        "task": "medilink.uploads.tasks.purge_files",
        "schedule": crontab(minute=17),  # hourly
    },
}


class UploadsConfig(AppConfig):
    name = "medilink.uploads"
    label = "uploads"
    verbose_name = "Uploads"

    def ready(self) -> None:
        from config.celery import app
        from medilink.uploads import checks  # noqa: F401  (registers deploy checks)

        app.conf.beat_schedule = {**(app.conf.beat_schedule or {}), **BEAT_SCHEDULE}
