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


class AssistantLog(UUIDModel):
    """One row per finished assistant conversation (answer or emergency), issue #159.

    De-identified like TriageLog: symptom names and the outcome only. The person's own words are
    never stored, and there is no account, IP or device.
    """

    present = ArrayField(models.CharField(max_length=80))
    absent = ArrayField(models.CharField(max_length=80), default=list)
    questions = models.PositiveSmallIntegerField(default=0)
    outcome = models.CharField(max_length=12)  # "answer" | "emergency"
    condition = models.CharField(max_length=120, blank=True)
    named = models.BooleanField(default=False)
    probability = models.FloatField(null=True, blank=True)
    service_code = models.CharField(max_length=40, blank=True)
    urgency = models.CharField(max_length=12, blank=True)
    language = models.CharField(max_length=4)
    matcher_version = models.CharField(max_length=20)
    llm_model = models.CharField(max_length=80)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "triage_assistant_log"
        indexes = [models.Index(fields=["created_at"], name="assistant_log_created_idx")]

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            raise AppendOnlyError("Assistant log rows are append-only.")
        super().save(*args, **kwargs)
