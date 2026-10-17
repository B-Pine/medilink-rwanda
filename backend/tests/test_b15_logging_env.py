"""B15: no personal data or secrets in logs; .env.example complete; no secrets committed."""

from __future__ import annotations

import json
import logging
import re
import sys
from pathlib import Path

import pytest

from medilink.core.logging import (
    REDACTED,
    JSONFormatter,
    RedactPersonalDataFilter,
    RequestIDFilter,
    TextFormatter,
    redact_text,
)

pytestmark = pytest.mark.acceptance("B15")

BACKEND = Path(__file__).resolve().parent.parent


def _record(msg: str, *args: object, exc: bool = False) -> logging.LogRecord:
    exc_info = None
    if exc:
        try:
            raise ValueError("lookup failed for jeanne@example.test")
        except ValueError:
            exc_info = sys.exc_info()
    return logging.LogRecord("medilink.test", logging.ERROR, __file__, 1, msg, args, exc_info)


@pytest.mark.parametrize(
    ("raw", "leak"),
    [
        ("login for jeanne@example.test failed", "jeanne@example.test"),
        ("phone +250 788 123 456 called", "788 123 456"),
        ("phone 0788123456 called", "0788123456"),
        ("national id 1199080012345678 seen", "1199080012345678"),
        ("password=hunter2-secret", "hunter2-secret"),
        ("token: abcdef123456", "abcdef123456"),
        ('{"code": "123456"}', "123456"),
    ],
)
def test_b15_personal_data_is_redacted(raw: str, leak: str) -> None:
    assert leak not in redact_text(raw)
    assert REDACTED in redact_text(raw)


def test_b15_ids_and_dates_are_kept() -> None:
    text = "user 01a14a5e-0302-73b9-a8fb-a356b293d706 at 2026-10-17T07:42:00Z status 401"
    assert redact_text(text) == text


def test_b15_filters_and_formatters_scrub_messages_args_and_tracebacks() -> None:
    record = _record("reset for %s\nINJECTED", "jeanne@example.test", exc=True)
    RequestIDFilter().filter(record)
    RedactPersonalDataFilter().filter(record)
    assert "jeanne" not in record.getMessage()
    assert "\n" not in record.getMessage()  # log injection
    payload = json.loads(JSONFormatter().format(record))
    assert payload["level"] == "ERROR" and payload["request_id"] == "-"
    assert "jeanne" not in payload["exc"] and payload["exc_type"] == "ValueError"
    text_record = _record("plain", exc=True)
    assert "jeanne" not in TextFormatter().format(text_record)


def test_b15_extra_data_is_scrubbed() -> None:
    record = _record("event")
    record.extra_data = {
        "email": "x@y.rw",
        "count": 3,
        "nested": {"password": "p", "note": "call 0788123456"},
    }
    RedactPersonalDataFilter().filter(record)
    assert record.extra_data == {
        "email": REDACTED,
        "count": 3,
        "nested": {"password": REDACTED, "note": f"call {REDACTED}"},
    }
    assert json.loads(JSONFormatter().format(record))["data"]["count"] == 3


def test_b15_logging_config_applies_redaction() -> None:
    from django.conf import settings

    handler = settings.LOGGING["handlers"]["console"]
    assert handler["filters"] == ["request_id", "redact"]


def _env_vars_used_in_settings() -> set[str]:
    names: set[str] = set()
    pattern = re.compile(r"""env(?:\.\w+)?\(\s*["']([A-Z0-9_]+)["']""")
    for path in (BACKEND / "config" / "settings").glob("*.py"):
        names.update(pattern.findall(path.read_text(encoding="utf-8")))
    return names


def test_b15_env_example_lists_every_setting() -> None:
    example = (BACKEND / ".env.example").read_text(encoding="utf-8")
    documented = set(re.findall(r"^#?\s*([A-Z0-9_]+)=", example, flags=re.MULTILINE))
    used = _env_vars_used_in_settings()
    assert used, "no env() calls found"
    missing = sorted(used - documented)
    assert not missing, f".env.example is missing: {missing}"


def test_b15_env_example_has_no_real_secrets() -> None:
    example = (BACKEND / ".env.example").read_text(encoding="utf-8")
    assert re.search(r"^DJANGO_SECRET_KEY=\S", example, flags=re.MULTILINE) is None
    for line in example.splitlines():
        if line.startswith("#"):
            continue
        if "PASSWORD" in line or "://" in line:
            assert "dev_only" in line or "@" not in line or "medilink.test" in line, line


def test_b15_no_private_keys_or_cloud_keys_in_backend_sources() -> None:
    patterns = [
        re.compile(p)
        for p in (
            r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
            r"AKIA[0-9A-Z]{16}",
            r"sk_live_[0-9a-zA-Z]{20,}",
        )
    ]
    offenders = []
    for path in BACKEND.rglob("*"):
        if not path.is_file() or any(
            part in {".venv", "__pycache__", ".git", "staticfiles"} for part in path.parts
        ):
            continue
        if path.suffix not in {
            ".py",
            ".txt",
            ".yml",
            ".yaml",
            ".toml",
            ".md",
            ".sh",
            ".example",
            ".cfg",
            ".ini",
            ".json",
        }:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if any(p.search(text) for p in patterns) and path.name != Path(__file__).name:
            offenders.append(str(path))
    assert not offenders
