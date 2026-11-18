"""Deploy checks for the upload pipeline (contract §2.4): no fake scanner, no local storage,
https download links and an explicit S3 region, or Cloudinary credentials."""

from __future__ import annotations

from typing import Any

from django.core.checks import CheckMessage, Error, Tags, register

from medilink.uploads.conf import upload_settings


@register(Tags.security, deploy=True)
def check_deploy_uploads(app_configs: Any = None, **kwargs: Any) -> list[CheckMessage]:
    conf = upload_settings()
    messages: list[CheckMessage] = []
    if conf.scanner != "clamd":
        messages.append(
            Error(
                "UPLOADS_SCANNER must be 'clamd' in deployments (the fake scanner finds nothing).",
                id="medilink.uploads.E001",
            )
        )
    if conf.storage == "cloudinary":
        from django.conf import settings

        cfg = getattr(settings, "CLOUDINARY", {}) or {}
        trio = all(cfg.get(k) for k in ("cloud_name", "api_key", "api_secret"))
        if not conf.cloudinary_url and not trio:
            messages.append(
                Error(
                    "Cloudinary storage needs CLOUDINARY_URL or the CLOUDINARY_* credentials.",
                    id="medilink.uploads.E005",
                )
            )
    elif conf.storage != "s3":
        messages.append(
            Error(
                "UPLOADS_STORAGE must be 's3' or 'cloudinary' in deployments (local storage is "
                "for development).",
                id="medilink.uploads.E002",
            )
        )
    else:
        if not conf.download_base_url.startswith("https://"):
            messages.append(
                Error("UPLOADS_DOWNLOAD_BASE_URL must use https.", id="medilink.uploads.E003")
            )
        if not conf.s3_region:
            messages.append(
                Error(
                    "UPLOADS_S3_REGION is required with S3 storage (no default region: data "
                    "residency is a deployment decision).",
                    id="medilink.uploads.E004",
                )
            )
    return messages
