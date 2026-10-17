"""Structured logging with request IDs and personal-data scrubbing (security 08 §1).

Technical logs must never contain request bodies, names, emails, phone numbers, national IDs,
tokens, passwords or OTPs. Code logs internal IDs only; this filter is the safety net.
"""

from __future__ import annotations

import contextvars
import json
import logging
import re
from datetime import UTC, datetime
from typing import Any

request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")

REDACTED = "[redacted]"
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# Phone numbers (+250 7xx xxx xxx, 07xxxxxxxx) and national IDs (16 digits): 9-16 digits,
# optionally space-separated, not part of a word, UUID or date.
_LONG_DIGITS_RE = re.compile(r"(?<![\w.:-])\+?\d(?: ?\d){8,15}(?![\w.:-])")
_SECRET_KV_RE = re.compile(
    r"(?i)\b(password|passwd|secret|token|otp|code|recovery_code|csrfmiddlewaretoken|sessionid|"
    r"api[_-]?key|authorization)\b([\"']?\s*[=:]\s*)(\"[^\"]*\"|'[^']*'|[^\s,&;]+)"
)
_SENSITIVE_KEYS = frozenset(
    {
        "password",
        "new_password",
        "token",
        "secret",
        "code",
        "recovery_code",
        "otp",
        "email",
        "full_name",
        "phone",
        "national_id",
        "authorization",
        "cookie",
    }
)


def redact_text(text: str) -> str:
    text = _SECRET_KV_RE.sub(lambda m: f"{m.group(1)}{m.group(2)}{REDACTED}", text)
    text = _EMAIL_RE.sub(REDACTED, text)
    return _LONG_DIGITS_RE.sub(REDACTED, text)


def _redact_value(value: Any) -> Any:
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, dict):
        return {
            k: (REDACTED if str(k).lower() in _SENSITIVE_KEYS else _redact_value(v))
            for k, v in value.items()
        }
    if isinstance(value, list | tuple):
        return type(value)(_redact_value(v) for v in value)
    return value


class RequestIDFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = request_id_var.get()
        return True


class RedactPersonalDataFilter(logging.Filter):
    """Scrubs emails, long digit sequences and secret-looking key/value pairs."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:  # malformed format args: keep the template only
            message = str(record.msg)
        record.msg = redact_text(message).replace("\r", "\\r").replace("\n", "\\n")
        record.args = None
        if isinstance(getattr(record, "extra_data", None), dict):
            record.extra_data = _redact_value(record.extra_data)
        return True


class TextFormatter(logging.Formatter):
    """Human-readable lines for development; tracebacks are scrubbed too."""

    def __init__(self) -> None:
        super().__init__("%(asctime)s %(levelname)s [%(request_id)s] %(name)s: %(message)s")

    def format(self, record: logging.LogRecord) -> str:
        if not hasattr(record, "request_id"):
            record.request_id = request_id_var.get()
        return redact_text(super().format(record))


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, tz=UTC).isoformat().replace("+00:00", "Z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
        extra = getattr(record, "extra_data", None)
        if isinstance(extra, dict):
            payload["data"] = extra
        if record.exc_info:
            payload["exc_type"] = record.exc_info[0].__name__ if record.exc_info[0] else None
            payload["exc"] = redact_text(self.formatException(record.exc_info))
        return json.dumps(payload, default=str, ensure_ascii=False)
