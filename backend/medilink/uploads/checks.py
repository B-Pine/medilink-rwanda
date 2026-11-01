"""Deploy checks for the upload pipeline (contract §2.4): no fake scanner, no local storage,
https download links and an explicit S3 region."""

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
    if conf.storage != "s3":
        messages.append(
            Error(
                "UPLOADS_STORAGE must be 's3' in deployments (local storage is for development).",
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
