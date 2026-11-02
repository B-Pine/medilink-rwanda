"""Prediction log (FR-AI-07, contract PT §2.4): one row per answer, no account, IP or device."""

from __future__ import annotations

from typing import Any

from django.contrib.postgres.fields import ArrayField
from django.db import models

from medilink.core.models import UUIDModel


class AppendOnlyError(RuntimeError):
    pass


class TriageLog(UUIDModel):
    """De-identified (class C1), append-only, kept 2 years then aggregated."""

    symptoms = ArrayField(models.CharField(max_length=40))
    duration = models.CharField(max_length=8)
    age_group = models.CharField(max_length=8)
    pregnant = models.BooleanField(default=False)
    urgency = models.CharField(max_length=12)
    service_code = models.CharField(max_length=40)
    level_of_care = models.CharField(max_length=12)
    rule = models.CharField(max_length=8)
    rules_version = models.CharField(max_length=20)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "triage_log"
        indexes = [models.Index(fields=["created_at"], name="triage_log_created_idx")]

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            raise AppendOnlyError("Triage log rows are append-only.")
        super().save(*args, **kwargs)
