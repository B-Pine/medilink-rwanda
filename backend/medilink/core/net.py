"""Client IP resolution that honours the configured number of trusted proxies only."""

from __future__ import annotations

from typing import Any

from django.conf import settings


def client_ip(request: Any) -> str | None:
    meta = getattr(request, "META", {})
    remote_addr = meta.get("REMOTE_ADDR") or None
    num_proxies = settings.REST_FRAMEWORK.get("NUM_PROXIES") or 0
    xff = meta.get("HTTP_X_FORWARDED_FOR")
    if num_proxies > 0 and xff:
        addresses = [a.strip() for a in xff.split(",") if a.strip()]
        if addresses:
            return addresses[-min(num_proxies, len(addresses))]
    return remote_addr


def user_agent(request: Any) -> str:
    return str(getattr(request, "META", {}).get("HTTP_USER_AGENT", ""))[:512]
