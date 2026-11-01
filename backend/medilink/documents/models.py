"""Documents (contract sprint-07 §2.1). S7a creates the app with the number counter only (D-2);
S7b adds documents, versions and verification."""

from __future__ import annotations

from django.db import models

from medilink.core.models import TimeStampedModel


class NumberCounter(TimeStampedModel):
    """Last document number per facility, prefix and year (`RX-2026-000123`). One row is locked
    while a number is taken, so numbers have no gaps: a rolled-back transaction gives it back."""

    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    prefix = models.CharField(max_length=4)
    year = models.PositiveSmallIntegerField()
    last_value = models.PositiveBigIntegerField(default=0)

    class Meta:
        db_table = "documents_number_counter"
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "prefix", "year"], name="documents_counter_unique"
            ),
            models.CheckConstraint(
                condition=models.Q(prefix__regex=r"^[A-Z]{2,4}$"), name="documents_counter_prefix"
            ),
        ]
