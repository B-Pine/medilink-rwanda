"""`manage.py cloudinary_check`: is image upload set up? Credentials, API, signed preset."""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandError

from medilink.images import services


class Command(BaseCommand):
    help = "Check the Cloudinary settings used for photo uploads (never prints the secret)."

    def handle(self, *args: Any, **options: Any) -> None:
        results = services.diagnose()
        for name, ok, detail in results:
            self.stdout.write(f"{'OK  ' if ok else 'FAIL'} {name}: {detail}")
        if not all(ok for _, ok, _ in results):
            raise CommandError("Cloudinary is not ready for photo uploads.")
        self.stdout.write(self.style.SUCCESS("Cloudinary is ready for photo uploads."))
