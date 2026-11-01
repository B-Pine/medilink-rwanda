"""Run every periodic notification task once (dev, tests, end-to-end checks)."""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand

from medilink.notifications import tasks


class Command(BaseCommand):
    help = "Run dispatch_due and unread_fallback once."

    def handle(self, *args: Any, **options: Any) -> None:
        sent = tasks.dispatch_due()
        fallback = tasks.unread_fallback()
        self.stdout.write(f"dispatch_due: {sent}; unread_fallback: {fallback}")
