"""Key store (contract §2.4). `env` backend reads:

    MEDILINK_FIELD_KEYS               "1:<base64url 32 bytes>,2:…"
    MEDILINK_FIELD_ACTIVE_KEY_ID      "1"
    MEDILINK_BLIND_INDEX_KEYS         "1:<base64url 32 bytes>"
    MEDILINK_BLIND_INDEX_ACTIVE_KEY_ID

Without keys and only with DEBUG, keys are derived from SECRET_KEY (HKDF-SHA256) and check
patients.W001 warns; without DEBUG, check patients.E001 fails. Tests override with
`override_settings(PATIENT_KEYS={...})`.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Protocol

import environ
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from django.conf import settings

_env = environ.Env()


class KeyStoreError(RuntimeError):
    pass


class KeyStore(Protocol):
    def active_data_key_id(self) -> int: ...

    def data_key(self, key_id: int) -> bytes: ...

    def data_key_ids(self) -> list[int]: ...

    def active_index_key_id(self) -> int: ...

    def index_key(self, key_id: int) -> bytes: ...

    def index_key_ids(self) -> list[int]: ...


@dataclass(frozen=True)
class StaticKeyStore:
    data_keys: dict[int, bytes]
    data_active: int
    index_keys: dict[int, bytes]
    index_active: int
    derived: bool = False

    def __post_init__(self) -> None:
        for name, keys, active in (
            ("field", self.data_keys, self.data_active),
            ("blind index", self.index_keys, self.index_active),
        ):
            if not keys:
                raise KeyStoreError(f"No {name} keys configured")
            if active not in keys:
                raise KeyStoreError(f"Active {name} key id {active} is not configured")
            for key_id, key in keys.items():
                if not 0 < key_id < 65536:
                    raise KeyStoreError(f"{name} key id {key_id} must fit in uint16")
                if len(key) != 32:
                    raise KeyStoreError(f"{name} key {key_id} must be 32 bytes")
        if set(self.data_keys.values()) & set(self.index_keys.values()):
            raise KeyStoreError("A blind index key may not equal a field encryption key")

    def active_data_key_id(self) -> int:
        return self.data_active

    def data_key(self, key_id: int) -> bytes:
        try:
            return self.data_keys[key_id]
        except KeyError:
            raise KeyStoreError(f"Unknown field key id {key_id}") from None

    def data_key_ids(self) -> list[int]:
        return sorted(self.data_keys)

    def active_index_key_id(self) -> int:
        return self.index_active

    def index_key(self, key_id: int) -> bytes:
        try:
            return self.index_keys[key_id]
        except KeyError:
            raise KeyStoreError(f"Unknown blind index key id {key_id}") from None

    def index_key_ids(self) -> list[int]:
        return sorted(self.index_keys)


def parse_keys(raw: str) -> dict[int, bytes]:
    """`"1:<b64url>,2:<b64url>"` -> {1: b"...", 2: b"..."}."""
    keys: dict[int, bytes] = {}
    for part in (p.strip() for p in raw.split(",")):
        if not part:
            continue
        key_id, _, encoded = part.partition(":")
        try:
            keys[int(key_id)] = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        except (ValueError, TypeError) as exc:
            raise KeyStoreError(f"Malformed key entry for id {key_id!r}") from exc
    return keys


def _derive(info: bytes) -> bytes:
    hkdf = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=info)
    return hkdf.derive(settings.SECRET_KEY.encode())


def _configured() -> dict[str, Any]:
    override = getattr(settings, "PATIENT_KEYS", None)
    if override:
        return dict(override)
    return {
        "field_keys": _env("MEDILINK_FIELD_KEYS", default=""),
        "field_active": _env("MEDILINK_FIELD_ACTIVE_KEY_ID", default=""),
        "index_keys": _env("MEDILINK_BLIND_INDEX_KEYS", default=""),
        "index_active": _env("MEDILINK_BLIND_INDEX_ACTIVE_KEY_ID", default=""),
    }


def keys_configured() -> bool:
    conf = _configured()
    return bool(conf["field_keys"] and conf["index_keys"])


@lru_cache(maxsize=8)
def _build(
    field_keys: str, field_active: str, index_keys: str, index_active: str, debug: bool
) -> StaticKeyStore:
    if not field_keys or not index_keys:
        if not debug:
            raise KeyStoreError("MEDILINK_FIELD_KEYS and MEDILINK_BLIND_INDEX_KEYS are required")
        return StaticKeyStore(
            data_keys={1: _derive(b"medilink-dev-field-key")},
            data_active=1,
            index_keys={1: _derive(b"medilink-dev-index-key")},
            index_active=1,
            derived=True,
        )
    data = parse_keys(field_keys)
    index = parse_keys(index_keys)
    return StaticKeyStore(
        data_keys=data,
        data_active=int(field_active or max(data)),
        index_keys=index,
        index_active=int(index_active or max(index)),
    )


def get_keystore() -> StaticKeyStore:
    backend = _env("MEDILINK_KEYSTORE", default="env")
    if backend != "env":
        raise KeyStoreError(f"Unknown MEDILINK_KEYSTORE {backend!r}")
    conf = _configured()
    return _build(
        str(conf["field_keys"]),
        str(conf["field_active"]),
        str(conf["index_keys"]),
        str(conf["index_active"]),
        bool(settings.DEBUG),
    )
