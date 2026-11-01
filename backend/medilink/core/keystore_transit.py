"""Envelope encryption for field keys with OpenBao / Vault Transit (security 05 §4-5).

With MEDILINK_KEYSTORE=transit, MEDILINK_FIELD_KEYS and MEDILINK_BLIND_INDEX_KEYS hold *wrapped*
data keys (DEKs) instead of raw ones:

    MEDILINK_FIELD_KEYS="1:vault:v1:AbC…,2:vault:v1:XyZ…"

The key-encryption key (KEK) never leaves the key store: at first use each process asks Transit to
decrypt (unwrap) its DEKs and keeps them in memory only. Settings (environment):

    MEDILINK_TRANSIT_ADDR        https://bao.internal:8200 (http only for localhost)
    MEDILINK_TRANSIT_TOKEN       token with `update` on <mount>/decrypt/<key> (or ..._TOKEN_FILE)
    MEDILINK_TRANSIT_MOUNT       transit
    MEDILINK_TRANSIT_KEY         medilink-field-kek

Wrap a new 32-byte DEK once, offline, with the key store CLI:
    bao write -field=ciphertext transit/encrypt/medilink-field-kek \\
        plaintext=$(openssl rand -base64 32)

The `env` backend (raw keys in the environment) stays for development and CI.
"""

from __future__ import annotations

import base64
import json
import urllib.request
from collections.abc import Callable
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

import environ
from django.core.exceptions import ImproperlyConfigured

_env = environ.Env()
WRAPPED_PREFIX = "vault:"


class TransitError(RuntimeError):
    pass


def _config() -> tuple[str, str, str, str]:
    addr = _env("MEDILINK_TRANSIT_ADDR", default="").rstrip("/")
    token = _env("MEDILINK_TRANSIT_TOKEN", default="")
    token_file = _env("MEDILINK_TRANSIT_TOKEN_FILE", default="")
    if not token and token_file:
        token = Path(token_file).read_text(encoding="utf-8").strip()
    mount = _env("MEDILINK_TRANSIT_MOUNT", default="transit").strip("/")
    key = _env("MEDILINK_TRANSIT_KEY", default="medilink-field-kek")
    if not addr or not token:
        raise ImproperlyConfigured(
            "MEDILINK_KEYSTORE=transit needs MEDILINK_TRANSIT_ADDR and MEDILINK_TRANSIT_TOKEN."
        )
    parts = urlsplit(addr)
    if parts.scheme != "https" and parts.hostname not in ("localhost", "127.0.0.1"):
        raise ImproperlyConfigured("MEDILINK_TRANSIT_ADDR must use https.")
    return addr, token, mount, key


def transit_unwrap(ciphertext: str) -> bytes:
    """Decrypt one wrapped DEK with the Transit KEK."""
    addr, token, mount, key = _config()
    request = urllib.request.Request(  # noqa: S310 (scheme checked in _config)
        f"{addr}/v1/{mount}/decrypt/{key}",
        data=json.dumps({"ciphertext": ciphertext}).encode(),
        headers={"X-Vault-Token": token, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:  # noqa: S310
            payload = json.load(response)
        return base64.b64decode(payload["data"]["plaintext"])
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise TransitError("Could not unwrap a data key with the key store") from exc


def unwrap_key_list(raw: str, unwrap: Callable[[str], bytes] = transit_unwrap) -> str:
    """`"1:vault:v1:…,2:vault:v1:…"` -> `"1:<base64url>,2:<base64url>"` (the env format)."""
    out = []
    for part in (p.strip() for p in raw.split(",")):
        if not part:
            continue
        key_id, _, wrapped = part.partition(":")
        if not wrapped.startswith(WRAPPED_PREFIX):
            raise ImproperlyConfigured(
                f"Key {key_id!r} is not a wrapped key (expected '{WRAPPED_PREFIX}…') with transit."
            )
        plain = base64.urlsafe_b64encode(unwrap(wrapped)).decode("ascii")
        out.append(f"{key_id}:{plain}")
    return ",".join(out)


@lru_cache(maxsize=8)
def unwrapped(raw: str) -> str:
    """Cached per process: Transit is called once per wrapped key list."""
    return unwrap_key_list(raw) if raw else raw
