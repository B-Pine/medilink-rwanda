"""Celery application. JSON-only serialisation (no pickle), see security 06 §8.

Run a worker:  celery -A config worker -l info   (Windows: add --pool=solo)
"""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

app = Celery("medilink")
app.config_from_object("django.conf:settings", namespace="CELERY")
# Defence in depth: whatever the settings say, never accept anything but JSON.
app.conf.update(
    task_serializer="json",
    result_serializer="json",
    event_serializer="json",
    accept_content=["json"],
    result_accept_content=["json"],
)
app.autodiscover_tasks()
