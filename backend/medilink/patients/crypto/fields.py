"""AES-256-GCM field encryption and HMAC-SHA256 blind indexes (contract §2.4).

Stored format: 0x01 ‖ key id (uint16 BE) ‖ nonce (12) ‖ ciphertext ‖ tag (16).
Associated data binds a ciphertext to its table, column and row.
"""

from __future__ import annotations

import hmac
import os
import struct
from hashlib import sha256
from uuid import UUID

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from medilink.patients.crypto.keystore import get_keystore

FORMAT_V1 = 0x01
_HEADER = struct.Struct(">BH")
NONCE_BYTES = 12


class DecryptionError(ValueError):
    pass


def _aad(table: str, column: str, row_id: UUID) -> bytes:
    return b"medilink:v1:" + table.encode() + b":" + column.encode() + b":" + row_id.bytes


def encrypt(value: str, *, table: str, column: str, row_id: UUID) -> bytes:
    store = get_keystore()
    key_id = store.active_data_key_id()
    nonce = os.urandom(NONCE_BYTES)
    sealed = AESGCM(store.data_key(key_id)).encrypt(
        nonce, value.encode(), _aad(table, column, row_id)
    )
    return _HEADER.pack(FORMAT_V1, key_id) + nonce + sealed


def key_id_of(blob: bytes) -> int:
    if len(blob) < _HEADER.size + NONCE_BYTES + 16:
        raise DecryptionError("Ciphertext too short")
    version, key_id = _HEADER.unpack_from(blob)
    if version != FORMAT_V1:
        raise DecryptionError(f"Unknown ciphertext format {version}")
    return int(key_id)


def decrypt(blob: bytes, *, table: str, column: str, row_id: UUID) -> str:
    blob = bytes(blob)
    key_id = key_id_of(blob)
    nonce = blob[_HEADER.size : _HEADER.size + NONCE_BYTES]
    sealed = blob[_HEADER.size + NONCE_BYTES :]
    try:
        plain = AESGCM(get_keystore().data_key(key_id)).decrypt(
            nonce, sealed, _aad(table, column, row_id)
        )
    except InvalidTag as exc:
        raise DecryptionError("Ciphertext failed authentication") from exc
    return plain.decode()


def _digest(key: bytes, kind: str, country: str, normalized: str) -> bytes:
    return hmac.new(key, f"{kind}|{country}|{normalized}".encode(), sha256).digest()


def blind_index(kind: str, country: str, normalized: str) -> tuple[int, bytes]:
    store = get_keystore()
    key_id = store.active_index_key_id()
    return key_id, _digest(store.index_key(key_id), kind, country, normalized)


def blind_indexes(kind: str, country: str, normalized: str) -> list[tuple[int, bytes]]:
    """Digests under every configured index key (lookups during an index-key rotation)."""
    store = get_keystore()
    return [
        (key_id, _digest(store.index_key(key_id), kind, country, normalized))
        for key_id in store.index_key_ids()
    ]
