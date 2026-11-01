"""Send `system.test` to one account (contract sprint-09 §3.1); refused unless DEBUG or
NOTIFICATIONS_ALLOW_TEST_SEND."""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from medilink.accounts.models import User
from medilink.core.ids import uuid7
from medilink.notifications import conf
from medilink.notifications.recipients import Recipients
from medilink.notifications.service import notify


class Command(BaseCommand):
    help = "Send the system.test notification to the account with this email."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("email")

    def handle(self, *args: Any, **options: Any) -> None:
        if not conf.allow_test_send():
            raise CommandError("Refused: needs DEBUG or NOTIFICATIONS_ALLOW_TEST_SEND=true.")
        user = User.objects.filter(email__iexact=options["email"], is_active=True).first()
        if user is None:
            raise CommandError("No active account with this email.")
        with transaction.atomic():
            result = notify("system.test", Recipients.users(user.pk), {"test_id": uuid7()})
        self.stdout.write(f"Created {len(result.created)} notification(s).")
