"""Upload pipeline settings (contract §2.4), read from UPLOADS_* and CLAMD_* environment variables.

Tests override them with `override_settings(UPLOADS={...})`; keys given there win over the
environment, so config/settings/base.py needs no edit outside the S1 block.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import environ
from django.conf import settings

_env = environ.Env()


@dataclass(frozen=True)
class UploadSettings:
    max_bytes: int
    scanner: str  # "fake" | "clamd"
    storage: str  # "local" | "s3"
    local_root: str
    link_ttl_seconds: int
    download_base_url: str
    s3_endpoint_url: str
    s3_region: str
    s3_access_key_id: str
    s3_secret_access_key: str
    s3_quarantine_bucket: str
    s3_documents_bucket: str
    clamd_host: str
    clamd_port: int
    clamd_timeout: float
    max_image_pixels: int
    max_image_side: int
    max_pdf_pages: int


def _defaults() -> dict[str, Any]:
    base_dir = getattr(settings, "BASE_DIR", ".")
    return {
        "max_bytes": _env.int("UPLOADS_MAX_BYTES", default=10 * 2**20),
        "scanner": _env("UPLOADS_SCANNER", default="fake"),
        "storage": _env("UPLOADS_STORAGE", default="local"),
        "local_root": _env("UPLOADS_LOCAL_ROOT", default=f"{base_dir}/var/uploads"),
        "link_ttl_seconds": _env.int("UPLOADS_LINK_TTL_SECONDS", default=300),
        "download_base_url": _env(
            "UPLOADS_DOWNLOAD_BASE_URL", default="http://localhost:8000/api/v1/files"
        ),
        "s3_endpoint_url": _env("UPLOADS_S3_ENDPOINT_URL", default=""),
        "s3_region": _env("UPLOADS_S3_REGION", default="af-south-1"),
        "s3_access_key_id": _env("UPLOADS_S3_ACCESS_KEY_ID", default=""),
        "s3_secret_access_key": _env("UPLOADS_S3_SECRET_ACCESS_KEY", default=""),
        "s3_quarantine_bucket": _env("UPLOADS_S3_QUARANTINE_BUCKET", default="medilink-quarantine"),
        "s3_documents_bucket": _env("UPLOADS_S3_DOCUMENTS_BUCKET", default="medilink-documents"),
        "clamd_host": _env("CLAMD_HOST", default="127.0.0.1"),
        "clamd_port": _env.int("CLAMD_PORT", default=3310),
        "clamd_timeout": _env.float("CLAMD_TIMEOUT", default=30.0),
        "max_image_pixels": 40_000_000,
        "max_image_side": 3000,
        "max_pdf_pages": 100,
    }


def upload_settings() -> UploadSettings:
    values = _defaults()
    values.update(getattr(settings, "UPLOADS", {}) or {})
    return UploadSettings(**values)
