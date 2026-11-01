"""TOTP secrets encrypted at rest (security 03 §3, security 05 §4, issue #12).

django-otp keeps the TOTP secret as hex in `otp_totp_totpdevice.key`. MediLink stores it as

    "enc1:" + base64url( 0x01 ‖ key id (uint16 BE) ‖ nonce (12) ‖ AES-256-GCM(secret) ‖ tag (16) )

with the device's user ID as associated data, so a ciphertext can't be moved to another account.
A 20-byte secret gives 73 characters, inside django-otp's 80-character column.

Keys: MFA_SECRET_KEYS = "1:<base64url 32 bytes>,2:…" and MFA_SECRET_ACTIVE_KEY_ID (default: the
highest id). Without keys, development (DEBUG) derives one from SECRET_KEY and `check --deploy`
fails (medilink.E110). Rotation: add a new key, make it active, run
`manage.py rotate_mfa_secrets`, then remove the old key.

`install()` (AccountsConfig.ready) teaches TOTPDevice to read encrypted keys (`bin_key`) and
encrypts plaintext keys on every save, so django-otp itself (including the OTP admin) keeps
working unchanged.
"""

from __future__ import annotations

import base64
import binascii
import os
import struct
from typing import Any
from uuid import UUID

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

PREFIX = "enc1:"
_HEADER = struct.Struct(">BH")
_VERSION = 0x01
_NONCE = 12


class SecretDecryptionError(ValueError):
    pass


def _parse(raw: str) -> dict[int, bytes]:
    keys: dict[int, bytes] = {}
    for part in (p.strip() for p in raw.split(",")):
        if not part:
            continue
        key_id, _, encoded = part.partition(":")
        try:
            keys[int(key_id)] = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        except (ValueError, binascii.Error) as exc:
            raise ImproperlyConfigured(f"MFA_SECRET_KEYS: malformed entry {key_id!r}") from exc
    for key_id, key in keys.items():
        if not 0 < key_id < 65536 or len(key) != 32:
            raise ImproperlyConfigured(
                f"MFA_SECRET_KEYS: key {key_id} must be 32 bytes, id 1-65535"
            )
    return keys


def keys_configured() -> bool:
    return bool(str(getattr(settings, "MFA_SECRET_KEYS", "")).strip())


def keyring() -> tuple[int, dict[int, bytes]]:
    """(active key id, {id: key})."""
    raw = str(getattr(settings, "MFA_SECRET_KEYS", "")).strip()
    if not raw:
        if not settings.DEBUG:
            raise ImproperlyConfigured("MFA_SECRET_KEYS is required (TOTP secret encryption).")
        hkdf = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"medilink-dev-mfa-key")
        return 1, {1: hkdf.derive(settings.SECRET_KEY.encode())}
    keys = _parse(raw)
    active = int(getattr(settings, "MFA_SECRET_ACTIVE_KEY_ID", "") or max(keys))
    if active not in keys:
        raise ImproperlyConfigured(f"MFA_SECRET_ACTIVE_KEY_ID {active} is not in MFA_SECRET_KEYS")
    return active, keys


def _aad(user_id: Any) -> bytes:
    return b"medilink:v1:otp_totp_totpdevice:key:" + UUID(str(user_id)).bytes


def is_encrypted(stored: str) -> bool:
    return stored.startswith(PREFIX)


def key_id_of(stored: str) -> int:
    blob = base64.urlsafe_b64decode(stored[len(PREFIX) :] + "==")
    return int(_HEADER.unpack_from(blob)[1])


def encrypt_secret(secret: bytes, user_id: Any) -> str:
    active, keys = keyring()
    nonce = os.urandom(_NONCE)
    sealed = AESGCM(keys[active]).encrypt(nonce, secret, _aad(user_id))
    blob = _HEADER.pack(_VERSION, active) + nonce + sealed
    return PREFIX + base64.urlsafe_b64encode(blob).decode("ascii").rstrip("=")


def decrypt_secret(stored: str, user_id: Any) -> bytes:
    try:
        blob = base64.urlsafe_b64decode(stored[len(PREFIX) :] + "==")
        version, key_id = _HEADER.unpack_from(blob)
    except (ValueError, binascii.Error, struct.error) as exc:
        raise SecretDecryptionError("Malformed TOTP secret") from exc
    if version != _VERSION:
        raise SecretDecryptionError(f"Unknown TOTP secret format {version}")
    _, keys = keyring()
    if key_id not in keys:
        raise SecretDecryptionError(f"Unknown MFA secret key id {key_id}")
    nonce, sealed = blob[_HEADER.size : _HEADER.size + _NONCE], blob[_HEADER.size + _NONCE :]
    try:
        return AESGCM(keys[key_id]).decrypt(nonce, sealed, _aad(user_id))
    except InvalidTag as exc:
        raise SecretDecryptionError("TOTP secret failed authentication") from exc


def stored_to_secret(stored: str, user_id: Any) -> bytes:
    """Encrypted or (legacy) hex value -> raw secret."""
    if is_encrypted(stored):
        return decrypt_secret(stored, user_id)
    return binascii.unhexlify(stored.encode())


def protect(stored: str, user_id: Any) -> str:
    """The value to store: encrypted under the active key (re-encrypts older keys)."""
    active, _ = keyring()
    if is_encrypted(stored) and key_id_of(stored) == active:
        return stored
    return encrypt_secret(stored_to_secret(stored, user_id), user_id)


def _bin_key(self: Any) -> bytes:
    return stored_to_secret(self.key, self.user_id)


def _encrypt_before_save(sender: Any, instance: Any, **kwargs: Any) -> None:
    if instance.key and not is_encrypted(instance.key):
        instance.key = encrypt_secret(
            stored_to_secret(instance.key, instance.user_id), instance.user_id
        )


def install() -> None:
    from django.db.models.signals import pre_save
    from django_otp.plugins.otp_totp.models import TOTPDevice

    TOTPDevice.bin_key = property(_bin_key)  # type: ignore[assignment,method-assign]
    pre_save.connect(_encrypt_before_save, sender=TOTPDevice, dispatch_uid="medilink-totp-encrypt")
