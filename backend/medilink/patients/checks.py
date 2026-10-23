"""System checks for the field encryption keys (contract §2.4, S3-B6)."""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core.checks import CheckMessage, Error, Tags, Warning, register

from medilink.patients.crypto.keystore import KeyStoreError, get_keystore, keys_configured


@register(Tags.security)
def check_dev_keys(app_configs: Any = None, **kwargs: Any) -> list[CheckMessage]:
    if not keys_configured() and settings.DEBUG:
        return [
            Warning(
                "MEDILINK_FIELD_KEYS / MEDILINK_BLIND_INDEX_KEYS are not set: development keys "
                "are derived from SECRET_KEY. Never use this outside development.",
                id="patients.W001",
            )
        ]
    return []


@register(Tags.security, deploy=True)
def check_field_keys(app_configs: Any = None, **kwargs: Any) -> list[CheckMessage]:
    if not keys_configured():
        return [
            Error(
                "MEDILINK_FIELD_KEYS and MEDILINK_BLIND_INDEX_KEYS are required "
                "(patient identifiers "
                "are encrypted).",
                id="patients.E001",
            )
        ]
    try:
        get_keystore()
    except KeyStoreError as exc:
        return [Error(f"Patient field keys are invalid: {exc}", id="patients.E002")]
    return []
