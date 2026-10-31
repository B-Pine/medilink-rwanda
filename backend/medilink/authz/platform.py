"""`PlatformAdmin` (contract §2.5): staff session + `is_platform_admin` + client IP inside
PLATFORM_ALLOWED_NETWORKS (comma-separated CIDRs; empty allows all, and `check --deploy` warns)."""

from __future__ import annotations

import ipaddress
import logging
from functools import cache
from typing import Any

import environ
from django.conf import settings
from django.core.checks import CheckMessage, Tags, register
from django.core.checks import Warning as CheckWarning

from medilink.authz.permissions import IsPlatformAdmin
from medilink.core.net import client_ip

security_logger = logging.getLogger("medilink.security")
_env = environ.Env()

Network = ipaddress.IPv4Network | ipaddress.IPv6Network


def _configured() -> str:
    value = getattr(settings, "PLATFORM_ALLOWED_NETWORKS", None)
    if value is None:
        value = _env("PLATFORM_ALLOWED_NETWORKS", default="")
    return ",".join(value) if isinstance(value, list | tuple) else str(value)


@cache
def _parse(raw: str) -> tuple[Network, ...]:
    return tuple(ipaddress.ip_network(p.strip(), strict=False) for p in raw.split(",") if p.strip())


def allowed_networks() -> tuple[Network, ...]:
    return _parse(_configured())


def ip_allowed(ip: str | None) -> bool:
    networks = allowed_networks()
    if not networks:
        return True
    try:
        address = ipaddress.ip_address(ip or "")
    except ValueError:
        return False
    return any(address in network for network in networks)


class PlatformAdmin(IsPlatformAdmin):
    """Every /platform/ endpoint (step-up is added per action with RecentAuthRequired)."""

    def has_permission(self, request: Any, view: Any) -> bool:
        if not super().has_permission(request, view):
            return False
        ip = client_ip(getattr(request, "_request", request))
        if ip_allowed(ip):
            return True
        security_logger.warning(
            "Platform request refused by the network allowlist",
            extra={"extra_data": {"path": getattr(request, "path", ""), "ip": ip}},
        )
        return False


@register(Tags.security, deploy=True)
def check_platform_networks(app_configs: Any = None, **kwargs: Any) -> list[CheckMessage]:
    try:
        networks = allowed_networks()
    except ValueError as exc:
        return [CheckWarning(f"PLATFORM_ALLOWED_NETWORKS is invalid: {exc}", id="medilink.W101")]
    if not networks:
        return [
            CheckWarning(
                "PLATFORM_ALLOWED_NETWORKS is empty: the super admin console is reachable from "
                "any network.",
                id="medilink.W100",
            )
        ]
    return []
