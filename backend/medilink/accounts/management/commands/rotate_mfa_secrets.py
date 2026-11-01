"""Re-encrypt every TOTP secret under the active MFA_SECRET_KEYS key (and encrypt any plaintext).

Rotation: add the new key to MFA_SECRET_KEYS, set MFA_SECRET_ACTIVE_KEY_ID to it, deploy, run this
command, then remove the old key.
"""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand
from django.db import transaction
from django_otp.plugins.otp_totp.models import TOTPDevice

from medilink.accounts.totp_crypto import protect


class Command(BaseCommand):
    help = "Re-encrypt TOTP secrets under the active MFA secret key."

    def handle(self, *args: Any, **options: Any) -> None:
        changed = total = 0
        with transaction.atomic():
            for device in TOTPDevice.objects.select_for_update().only("pk", "user_id", "key"):
                total += 1
                new = protect(device.key, device.user_id)
                if new != device.key:
                    TOTPDevice.objects.filter(pk=device.pk).update(key=new)
                    changed += 1
        self.stdout.write(f"TOTP secrets: {changed} of {total} re-encrypted under the active key.")
