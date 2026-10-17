"""Identifier helpers: UUIDv7 primary keys and ULID-style request IDs."""

from __future__ import annotations

import os
import re
import time
import uuid

_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{8,64}$")


def uuid7() -> uuid.UUID:
    """Time-ordered UUID (RFC 9562 v7). Uses the stdlib on Python 3.14+."""
    native = getattr(uuid, "uuid7", None)
    if native is not None:
        return native()
    ms = time.time_ns() // 1_000_000
    rand = int.from_bytes(os.urandom(10), "big")
    value = (ms & ((1 << 48) - 1)) << 80 | rand
    value = (value & ~(0xF << 76)) | (0x7 << 76)  # version 7
    value = (value & ~(0x3 << 62)) | (0x2 << 62)  # RFC 4122 variant
    return uuid.UUID(int=value)


def new_request_id() -> str:
    """26-character ULID (Crockford base32): 48-bit ms timestamp + 80 random bits."""
    value = (time.time_ns() // 1_000_000) << 80 | int.from_bytes(os.urandom(10), "big")
    chars = []
    for _ in range(26):
        chars.append(_CROCKFORD[value & 0x1F])
        value >>= 5
    return "".join(reversed(chars))


def is_valid_request_id(value: str | None) -> bool:
    return bool(value) and REQUEST_ID_RE.fullmatch(value or "") is not None
