"""System checks (contract sprint-09 §3.1, §3.2).

E001 event without a default template for each channel and language (self variant); E002 placeholder
kind not allowed for a channel; E003 duplicate event type; E004 denylisted term in a template;
W001 push disabled (no VAPID keys); E010 (deploy) no keys, or an IP / bare `*` in the allowlist.
"""

from __future__ import annotations

import ipaddress
from typing import Any

from django.core import checks

from medilink.notifications import conf, registry, templates

LANGUAGES = ("rw", "en", "fr")


def check_registry(app_configs: Any = None, **_: Any) -> list[checks.CheckMessage]:
    errors: list[checks.CheckMessage] = []
    for event_type in registry.duplicates():
        errors.append(checks.Error(f"Duplicate event type {event_type}.", id="notifications.E003"))
    for definition in registry.all_events():
        for channel in definition.all_channels:
            for language in LANGUAGES:
                text = definition.templates.get((channel, language, "self"))
                if text is None:
                    errors.append(
                        checks.Error(
                            f"{definition.type}: no default {channel} template in {language}.",
                            id="notifications.E001",
                        )
                    )
                    continue
                try:
                    templates.validate(definition, channel, text.subject, text.body)
                except templates.TemplateError as exc:
                    code = "E004" if "Clinical" in exc.message else "E002"
                    errors.append(
                        checks.Error(
                            f"{definition.type} ({channel}, {language}): {exc.message}",
                            id=f"notifications.{code}",
                        )
                    )
    return errors


def check_push(app_configs: Any = None, **_: Any) -> list[checks.CheckMessage]:
    if conf.push_enabled():
        return []
    return [
        checks.Warning(
            "Web push is disabled: WEB_PUSH_VAPID_PUBLIC_KEY / PRIVATE_KEY are not set "
            "(manage.py generate_vapid_keys).",
            id="notifications.W001",
        )
    ]


def check_deploy(app_configs: Any = None, **_: Any) -> list[checks.CheckMessage]:
    errors: list[checks.CheckMessage] = []
    if not conf.push_enabled():
        errors.append(checks.Error("Web push needs VAPID keys.", id="notifications.E010"))
    for entry in conf.allowed_hosts():
        bare = entry.lstrip("*.")
        try:
            ipaddress.ip_address(bare.strip("[]"))
            is_ip = True
        except ValueError:
            is_ip = False
        if entry in ("*", "*.") or is_ip or not bare:
            errors.append(
                checks.Error(
                    f"Invalid WEB_PUSH_ALLOWED_HOSTS entry {entry!r}.", id="notifications.E010"
                )
            )
    return errors


def register() -> None:
    checks.register(check_registry, "notifications")
    checks.register(check_push, "notifications")
    checks.register(check_deploy, "notifications", deploy=True)
