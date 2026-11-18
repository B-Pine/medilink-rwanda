"""`manage.py refresh_listing`: create the coming weeks' appointment times and rebuild the public
search listing of every live facility now (next free time, cover photos, logos, hours, waits),
instead of waiting for the background jobs. Runs on every Railway deploy."""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand

from medilink.scheduling.tasks import generate_slots, refresh_public_listing


class Command(BaseCommand):
    help = "Rebuild the public search listing of every live facility now."

    def handle(self, *args: Any, **options: Any) -> None:
        created = generate_slots()
        rows = refresh_public_listing()
        self.stdout.write(
            self.style.SUCCESS(
                f"Appointment times added: {created}. Public listing rebuilt: {rows} rows."
            )
        )
