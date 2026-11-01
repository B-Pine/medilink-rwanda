"""R1: pluggable KEK/DEK keystore backend (OpenBao/Vault Transit), security 05 §4-5."""

from __future__ import annotations

import base64
import io
import json
import os
from typing import Any
from unittest import mock

import pytest
from django.core.exceptions import ImproperlyConfigured

from medilink.core import keystore_transit
from medilink.patients.crypto import keystore

DEK_1, DEK_2, INDEX = os.urandom(32), os.urandom(32), os.urandom(32)
WRAPPED = {"vault:v1:one": DEK_1, "vault:v1:two": DEK_2, "vault:v1:idx": INDEX}


def test_unwrap_key_list_turns_wrapped_keys_into_the_env_format() -> None:
    raw = keystore_transit.unwrap_key_list("1:vault:v1:one, 2:vault:v1:two", WRAPPED.__getitem__)
    assert keystore.parse_keys(raw) == {1: DEK_1, 2: DEK_2}
    with pytest.raises(ImproperlyConfigured, match="not a wrapped key"):
        keystore_transit.unwrap_key_list("1:" + base64.b64encode(DEK_1).decode(), WRAPPED.get)


def _fake_urlopen(request: Any, timeout: float) -> Any:
    assert request.full_url == "https://bao.test/v1/transit/decrypt/medilink-field-kek"
    assert request.headers["X-vault-token"] == "s.token"
    plain = WRAPPED[json.loads(request.data)["ciphertext"]]
    body = json.dumps({"data": {"plaintext": base64.b64encode(plain).decode()}}).encode()
    response = io.BytesIO(body)
    response.__enter__ = lambda: response  # type: ignore[method-assign]
    response.__exit__ = lambda *a: None  # type: ignore[method-assign]
    return response


def test_get_keystore_with_transit_backend(monkeypatch: Any, settings: Any) -> None:
    monkeypatch.setenv("MEDILINK_KEYSTORE", "transit")
    monkeypatch.setenv("MEDILINK_TRANSIT_ADDR", "https://bao.test")
    monkeypatch.setenv("MEDILINK_TRANSIT_TOKEN", "s.token")
    settings.PATIENT_KEYS = {
        "field_keys": "1:vault:v1:one,2:vault:v1:two",
        "field_active": "2",
        "index_keys": "1:vault:v1:idx",
        "index_active": "",
    }
    keystore_transit.unwrapped.cache_clear()
    with mock.patch.object(keystore_transit.urllib.request, "urlopen", side_effect=_fake_urlopen):
        store = keystore.get_keystore()
        keystore.get_keystore()  # cached: Transit isn't asked again
    assert store.data_key(1) == DEK_1 and store.data_key(2) == DEK_2
    assert store.active_data_key_id() == 2 and store.index_key(1) == INDEX
    keystore_transit.unwrapped.cache_clear()


@pytest.mark.parametrize(
    ("addr", "token", "message"),
    [
        ("", "t", "MEDILINK_TRANSIT_ADDR"),
        ("http://bao.example", "t", "https"),
    ],
)
def test_transit_config_is_checked(monkeypatch: Any, addr: str, token: str, message: str) -> None:
    monkeypatch.setenv("MEDILINK_TRANSIT_ADDR", addr)
    monkeypatch.setenv("MEDILINK_TRANSIT_TOKEN", token)
    with pytest.raises(ImproperlyConfigured, match=message):
        keystore_transit.transit_unwrap("vault:v1:one")


def test_transit_failure_is_reported(monkeypatch: Any) -> None:
    monkeypatch.setenv("MEDILINK_TRANSIT_ADDR", "http://127.0.0.1:1")
    monkeypatch.setenv("MEDILINK_TRANSIT_TOKEN", "t")
    with pytest.raises(keystore_transit.TransitError):
        keystore_transit.transit_unwrap("vault:v1:one")


def test_unknown_backend_is_refused(monkeypatch: Any) -> None:
    monkeypatch.setenv("MEDILINK_KEYSTORE", "hsm")
    with pytest.raises(keystore.KeyStoreError):
        keystore.get_keystore()
