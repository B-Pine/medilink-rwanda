"""manage.py patients_backfill_numbers: MediLink numbers for patients without one (contract §5).
Migration 0003 does the same; this command covers data loaded afterwards."""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand

from medilink.patients.identity import assign_medilink_number
from medilink.patients.models import Patient


class Command(BaseCommand):
    help = "Assign MediLink numbers to patients that have none."

    def handle(self, *args: Any, **options: Any) -> None:
        count = 0
        for patient in Patient.objects.filter(medilink_number__isnull=True).iterator():
            assign_medilink_number(patient)
            count += 1
        self.stdout.write(f"Assigned {count} MediLink numbers.")
