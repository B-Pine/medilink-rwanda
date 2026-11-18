"""Deploy check: Cloudinary credentials come together (or not at all)."""

from __future__ import annotations

from typing import Any

from django.core.checks import CheckMessage, Error, Tags, register

from medilink.images import services


@register(Tags.security, deploy=True)
def check_deploy_cloudinary(app_configs: Any = None, **kwargs: Any) -> list[CheckMessage]:
    cfg = services.config()
    given = [bool(cfg.get(k)) for k in ("cloud_name", "api_key", "api_secret")]
    if any(given) and not all(given):
        return [
            Error(
                "Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET together.",
                id="medilink.images.E001",
            )
        ]
    return []
