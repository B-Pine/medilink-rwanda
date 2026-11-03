"""Chat-completions client for the AI assistant (issue #159).

Test phase only: NVIDIA's hosted API (OpenAI-compatible, `integrate.api.nvidia.com`). Production
must keep health data in Rwanda: point `NVIDIA_API_BASE` at a self-hosted NIM in a Rwandan data
centre (same API) before real patients use it (Law 058/2021; decision 2026-11-03).

Only the person's symptom text goes out: no account, name, identifier, IP or device. The key stays
on the server.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from django.conf import settings


class LLMError(RuntimeError):
    """The model could not be reached or answered something unusable."""


def enabled() -> bool:
    return bool(settings.ASSISTANT_ENABLED and settings.NVIDIA_API_KEY)


def model_name() -> str:
    return str(settings.NVIDIA_MODEL)


def chat(
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.2,
    max_tokens: int = 400,
    json_mode: bool = False,
) -> str:
    """One completion; raises LLMError on any failure (the caller falls back politely)."""
    if not enabled():
        raise LLMError("The assistant is not configured.")
    body: dict[str, Any] = {
        "model": model_name(),
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    request = urllib.request.Request(  # noqa: S310 (fixed https endpoint from settings)
        f"{str(settings.NVIDIA_API_BASE).rstrip('/')}/chat/completions",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {settings.NVIDIA_API_KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(  # noqa: S310
            request, timeout=settings.NVIDIA_TIMEOUT_SECONDS
        ) as response:
            payload = json.load(response)
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        raise LLMError(f"Model request failed: {type(error).__name__}") from error
    try:
        return str(payload["choices"][0]["message"]["content"]).strip()
    except (KeyError, IndexError, TypeError) as error:
        raise LLMError("Model answered in an unexpected shape.") from error


def chat_json(messages: list[dict[str, str]], **kwargs: Any) -> dict[str, Any]:
    """A completion parsed as one JSON object (the first {...} block, models sometimes add text)."""
    text = chat(messages, json_mode=True, **kwargs)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise LLMError("Model did not answer with JSON.")
    try:
        value = json.loads(text[start : end + 1])
    except json.JSONDecodeError as error:
        raise LLMError("Model answered with invalid JSON.") from error
    if not isinstance(value, dict):
        raise LLMError("Model answered with JSON that is not an object.")
    return value
