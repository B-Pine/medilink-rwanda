"""Project-specific system checks. `check --deploy` runs the deploy ones in CI (B13)."""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core.checks import CheckMessage, Error, Tags, Warning, register


@register(Tags.security)
def check_session_audiences(app_configs: Any = None, **kwargs: Any) -> list[CheckMessage]:
    messages: list[CheckMessage] = []
    names = [cfg["COOKIE_NAME"] for cfg in settings.SESSION_AUDIENCES.values()]
    if len(set(names)) != len(names):
        messages.append(
            Error("Each session audience needs its own cookie name.", id="medilink.E001")
        )
    if getattr(settings, "CORS_ALLOW_ALL_ORIGINS", False):
        messages.append(Error("CORS_ALLOW_ALL_ORIGINS must stay False.", id="medilink.E002"))
    return messages


@register(Tags.security, deploy=True)
def check_deploy_cookies(app_configs: Any = None, **kwargs: Any) -> list[CheckMessage]:
    messages: list[CheckMessage] = []
    for audience, cfg in settings.SESSION_AUDIENCES.items():
        if not cfg["COOKIE_NAME"].startswith("__Host-"):
            messages.append(
                Warning(
                    f"The {audience} session cookie should use the __Host- prefix in production.",
                    id="medilink.W001",
                )
            )
    if not settings.CSRF_COOKIE_NAME.startswith("__Host-"):
        messages.append(
            Warning(
                "CSRF_COOKIE_NAME should use the __Host- prefix in production.", id="medilink.W002"
            )
        )
    if not settings.SECURE_CSP:
        messages.append(Warning("SECURE_CSP must be configured.", id="medilink.W003"))
    if settings.CELERY_TASK_ALWAYS_EAGER:
        messages.append(
            Warning("CELERY_TASK_ALWAYS_EAGER must be off in production.", id="medilink.W004")
        )
    return messages
