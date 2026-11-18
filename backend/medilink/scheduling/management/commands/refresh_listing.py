"""`manage.py refresh_listing`: rebuild the public search listing of every live facility now
(cover photos, hours, waits), instead of waiting for the 10-minute background refresh."""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand

from medilink.scheduling.tasks import refresh_public_listing


class Command(BaseCommand):
    help = "Rebuild the public search listing of every live facility now."

    def handle(self, *args: Any, **options: Any) -> None:
        rows = refresh_public_listing()
        self.stdout.write(self.style.SUCCESS(f"Public listing rebuilt: {rows} rows."))
