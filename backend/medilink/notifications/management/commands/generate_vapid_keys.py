"""Print a VAPID key pair for .env (contract sprint-09 §3.2)."""

from __future__ import annotations

import base64
from typing import Any

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.core.management.base import BaseCommand


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


class Command(BaseCommand):
    help = "Print a new VAPID key pair (P-256) for WEB_PUSH_VAPID_PUBLIC_KEY / PRIVATE_KEY."

    def handle(self, *args: Any, **options: Any) -> None:
        key = ec.generate_private_key(ec.SECP256R1())
        private = key.private_numbers().private_value.to_bytes(32, "big")
        public = key.public_key().public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
        )
        self.stdout.write(f"WEB_PUSH_VAPID_PUBLIC_KEY={_b64(public)}")
        self.stdout.write(f"WEB_PUSH_VAPID_PRIVATE_KEY={_b64(private)}")
