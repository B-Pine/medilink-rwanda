"""Cloudinary storage for the upload pipeline (UPLOADS_STORAGE=cloudinary).

Credentials: the CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET trio (shared with the image
uploads in medilink.images) or CLOUDINARY_URL (cloudinary://<api_key>:<api_secret>@<cloud_name>);
optionally UPLOADS_CLOUDINARY_FOLDER (default "medilink"; files go under <folder>/<bucket>/).

- Every file is stored as a `raw` asset of delivery type `authenticated`: Cloudinary keeps the
  bytes exactly as the pipeline wrote them (images are already re-encoded without metadata), and
  nothing is reachable without a signature.
- Public id: `<folder>/<bucket>/<key>`; "moving" between the quarantine and documents buckets is a
  rename.
- Download links are Cloudinary's signed, expiring download URLs (`expires_at` = now + ttl), served
  as attachments, like the other backends.

Talks to the Upload and Admin APIs over HTTPS with the standard library (no SDK dependency).
Signatures: SHA-1 of the sorted parameters plus the API secret (Cloudinary's default algorithm).
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, BinaryIO

from django.core.exceptions import ImproperlyConfigured
from django.utils import timezone

from medilink.uploads.conf import UploadSettings
from medilink.uploads.storage import Bucket, Disposition, DownloadLink, _check

API_BASE = "https://api.cloudinary.com/v1_1"
RESOURCE_TYPE = "raw"
DELIVERY_TYPE = "authenticated"
TIMEOUT = 60


class CloudinaryError(Exception):
    pass


@dataclass(frozen=True)
class CloudinaryCredentials:
    cloud_name: str
    api_key: str
    api_secret: str


def parse_cloudinary_url(url: str) -> CloudinaryCredentials:
    parts = urllib.parse.urlsplit(url.strip())
    if parts.scheme != "cloudinary" or not (parts.username and parts.password and parts.hostname):
        raise ImproperlyConfigured(
            "CLOUDINARY_URL must look like cloudinary://<api_key>:<api_secret>@<cloud_name>."
        )
    return CloudinaryCredentials(
        cloud_name=parts.hostname,
        api_key=urllib.parse.unquote(parts.username),
        api_secret=urllib.parse.unquote(parts.password),
    )


def api_sign(params: dict[str, Any], api_secret: str) -> str:
    """Cloudinary request signature: the parameters sorted by name as `k=v` joined with `&`, then
    the API secret appended, SHA-1 hex digest. Empty values, `file`, `api_key`, `cloud_name` and
    `resource_type` are not signed."""
    skip = {"file", "api_key", "cloud_name", "resource_type", "signature"}
    signed = "&".join(
        f"{k}={params[k]}" for k in sorted(params) if k not in skip and params[k] not in ("", None)
    )
    return hashlib.sha1((signed + api_secret).encode(), usedforsecurity=False).hexdigest()


Transport = Callable[[urllib.request.Request], tuple[int, bytes]]


def _urlopen(request: urllib.request.Request) -> tuple[int, bytes]:
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:  # noqa: S310 (https)
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def _multipart(fields: dict[str, Any], file: bytes | None) -> tuple[bytes, str]:
    boundary = uuid.uuid4().hex
    out = io.BytesIO()
    for name, value in fields.items():
        out.write(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        out.write(f"{value}\r\n".encode())
    if file is not None:
        out.write(
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="blob"\r\n'
            "Content-Type: application/octet-stream\r\n\r\n".encode()
        )
        out.write(file)
        out.write(b"\r\n")
    out.write(f"--{boundary}--\r\n".encode())
    return out.getvalue(), f"multipart/form-data; boundary={boundary}"


def credentials(conf: UploadSettings) -> CloudinaryCredentials:
    """CLOUDINARY_URL when set, else the CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET trio
    (settings.CLOUDINARY, shared with the image uploads in medilink.images)."""
    if conf.cloudinary_url:
        return parse_cloudinary_url(conf.cloudinary_url)
    from django.conf import settings

    cfg = getattr(settings, "CLOUDINARY", {}) or {}
    if cfg.get("cloud_name") and cfg.get("api_key") and cfg.get("api_secret"):
        return CloudinaryCredentials(cfg["cloud_name"], cfg["api_key"], cfg["api_secret"])
    raise ImproperlyConfigured(
        "Cloudinary storage needs CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and "
        "CLOUDINARY_API_SECRET."
    )


class CloudinaryStorage:
    def __init__(self, conf: UploadSettings, transport: Transport | None = None) -> None:
        self.creds = credentials(conf)
        self.folder = conf.cloudinary_folder.strip("/")
        self.transport = transport or _urlopen

    # ---- helpers ---------------------------------------------------------------------------------

    def public_id(self, bucket: Bucket, key: str) -> str:
        _check(bucket, key)
        return "/".join(p for p in (self.folder, bucket, key) if p)

    def _signed(self, params: dict[str, Any]) -> dict[str, Any]:
        params = {k: v for k, v in params.items() if v not in ("", None)}
        params["timestamp"] = int(time.time())
        params["signature"] = api_sign(params, self.creds.api_secret)
        params["api_key"] = self.creds.api_key
        return params

    def _upload_api(self, action: str, params: dict[str, Any], file: bytes | None = None) -> Any:
        body, content_type = _multipart(self._signed(params), file)
        url = f"{API_BASE}/{self.creds.cloud_name}/{RESOURCE_TYPE}/{action}"
        request = urllib.request.Request(  # noqa: S310 (fixed https base)
            url, data=body, method="POST", headers={"Content-Type": content_type}
        )
        status, payload = self.transport(request)
        if status >= 400:
            raise CloudinaryError(f"Cloudinary {action} failed ({status}): {payload[:300]!r}")
        return json.loads(payload or b"{}")

    def _download_url(
        self, public_id: str, ttl: int, attachment: bool, expires_at: int | None = None
    ) -> str:
        params = self._signed(
            {
                "public_id": public_id,
                "type": DELIVERY_TYPE,
                "expires_at": expires_at or int(time.time()) + ttl,
                "attachment": "true" if attachment else "",
            }
        )
        query = urllib.parse.urlencode(params)
        return f"{API_BASE}/{self.creds.cloud_name}/{RESOURCE_TYPE}/download?{query}"

    # ---- ObjectStorage ---------------------------------------------------------------------------

    def put(self, bucket: Bucket, key: str, stream: BinaryIO, content_type: str) -> None:
        self._upload_api(
            "upload",
            {
                "public_id": self.public_id(bucket, key),
                "type": DELIVERY_TYPE,
                "overwrite": "true",
                "invalidate": "true",
            },
            stream.read(),
        )

    def open(self, bucket: Bucket, key: str) -> BinaryIO:
        request = urllib.request.Request(  # noqa: S310 (fixed https base)
            self._download_url(self.public_id(bucket, key), ttl=120, attachment=False)
        )
        status, payload = self.transport(request)
        if status >= 400:
            raise FileNotFoundError(f"{bucket}/{key}")
        return io.BytesIO(payload)

    def move(self, src: Bucket, dst: Bucket, key: str) -> None:
        self._upload_api(
            "rename",
            {
                "from_public_id": self.public_id(src, key),
                "to_public_id": self.public_id(dst, key),
                "type": DELIVERY_TYPE,
                "to_type": DELIVERY_TYPE,
                "overwrite": "true",
                "invalidate": "true",
            },
        )

    def delete(self, bucket: Bucket, key: str) -> None:
        self._upload_api(
            "destroy",
            {"public_id": self.public_id(bucket, key), "type": DELIVERY_TYPE, "invalidate": "true"},
        )

    def exists(self, bucket: Bucket, key: str) -> bool:
        public_id = urllib.parse.quote(self.public_id(bucket, key), safe="/")
        url = (
            f"{API_BASE}/{self.creds.cloud_name}/resources/{RESOURCE_TYPE}/{DELIVERY_TYPE}/"
            f"{public_id}"
        )
        token = base64.b64encode(f"{self.creds.api_key}:{self.creds.api_secret}".encode()).decode()
        request = urllib.request.Request(  # noqa: S310 (fixed https base)
            url, headers={"Authorization": f"Basic {token}"}
        )
        status, _ = self.transport(request)
        return status == 200

    def signed_download_url(
        self,
        bucket: Bucket,
        key: str,
        filename: str,
        content_type: str,
        disposition: Disposition,
        ttl: int,
    ) -> DownloadLink:
        expires = int(time.time()) + ttl
        url = self._download_url(
            self.public_id(bucket, key),
            ttl=ttl,
            attachment=disposition == "attachment",
            expires_at=expires,
        )
        return DownloadLink(
            url=url, expires_at=timezone.now() + timedelta(seconds=ttl), disposition=disposition
        )
