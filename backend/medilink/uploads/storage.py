"""Object storage interface (contract §2.4).

- `LocalFileSystemStorage`: development and tests. Download links point at
  `GET /api/v1/files/{token}/`, signed with Django's TimestampSigner.
- `S3CompatibleStorage`: deployments (boto3, server-side encryption, presigned GET on
  UPLOADS_DOWNLOAD_BASE_URL). `check --deploy` refuses local storage.

Keys are random UUIDs; buckets are "quarantine" (before the scan) and "documents" (clean).
"""

from __future__ import annotations

import os
import shutil
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, BinaryIO, Literal, Protocol

from django.core import signing
from django.utils import timezone

from medilink.uploads.conf import UploadSettings, upload_settings

Bucket = Literal["quarantine", "documents"]
Disposition = Literal["inline", "attachment"]
BUCKETS: tuple[Bucket, ...] = ("quarantine", "documents")

LINK_SALT = "medilink.uploads.download"


@dataclass(frozen=True)
class DownloadLink:
    url: str
    expires_at: datetime
    disposition: Disposition


class ObjectStorage(Protocol):
    def put(self, bucket: Bucket, key: str, stream: BinaryIO, content_type: str) -> None: ...

    def open(self, bucket: Bucket, key: str) -> BinaryIO: ...

    def move(self, src: Bucket, dst: Bucket, key: str) -> None: ...

    def delete(self, bucket: Bucket, key: str) -> None: ...

    def exists(self, bucket: Bucket, key: str) -> bool: ...

    def signed_download_url(
        self,
        bucket: Bucket,
        key: str,
        filename: str,
        content_type: str,
        disposition: Disposition,
        ttl: int,
    ) -> DownloadLink: ...


def _check(bucket: str, key: str) -> None:
    if bucket not in BUCKETS:
        raise ValueError(f"Unknown bucket {bucket!r}")
    if not key or "/" in key or "\\" in key or key.startswith("."):
        raise ValueError("Invalid storage key")


def content_disposition(disposition: str, filename: str) -> str:
    """RFC 6266 header with an ASCII fallback and an RFC 5987 UTF-8 name."""
    from urllib.parse import quote

    ascii_name = filename.encode("ascii", "ignore").decode() or "file"
    ascii_name = ascii_name.replace('"', "").replace("\\", "")
    return f"{disposition}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"


class LocalFileSystemStorage:
    def __init__(self, root: str, download_base_url: str) -> None:
        self.root = Path(root)
        self.download_base_url = download_base_url.rstrip("/")

    def _path(self, bucket: Bucket, key: str) -> Path:
        _check(bucket, key)
        return self.root / bucket / key

    def put(self, bucket: Bucket, key: str, stream: BinaryIO, content_type: str) -> None:
        path = self._path(bucket, key)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as out:
            shutil.copyfileobj(stream, out)

    def open(self, bucket: Bucket, key: str) -> BinaryIO:
        return open(self._path(bucket, key), "rb")

    def move(self, src: Bucket, dst: Bucket, key: str) -> None:
        target = self._path(dst, key)
        target.parent.mkdir(parents=True, exist_ok=True)
        os.replace(self._path(src, key), target)

    def delete(self, bucket: Bucket, key: str) -> None:
        self._path(bucket, key).unlink(missing_ok=True)

    def exists(self, bucket: Bucket, key: str) -> bool:
        return self._path(bucket, key).is_file()

    def signed_download_url(
        self,
        bucket: Bucket,
        key: str,
        filename: str,
        content_type: str,
        disposition: Disposition,
        ttl: int,
    ) -> DownloadLink:
        _check(bucket, key)
        token = signing.TimestampSigner(salt=LINK_SALT).sign_object(
            {"b": bucket, "k": key, "f": filename, "c": content_type, "d": disposition, "t": ttl},
            compress=True,
        )
        return DownloadLink(
            url=f"{self.download_base_url}/{token}/",
            expires_at=timezone.now() + timedelta(seconds=ttl),
            disposition=disposition,
        )


def read_local_token(token: str) -> dict[str, Any] | None:
    """Payload of a local download token, or None when tampered with or expired."""
    signer = signing.TimestampSigner(salt=LINK_SALT)
    try:
        payload = signer.unsign_object(token)
        signer.unsign_object(token, max_age=int(payload.get("t", 0)))
    except (signing.BadSignature, ValueError, TypeError):
        return None
    if not isinstance(payload, dict):
        return None
    return payload


class S3CompatibleStorage:
    def __init__(self, conf: UploadSettings, client: Any = None, signing_client: Any = None):
        self.buckets: dict[str, str] = {
            "quarantine": conf.s3_quarantine_bucket,
            "documents": conf.s3_documents_bucket,
        }
        if client is None or signing_client is None:
            import boto3
            from botocore.config import Config

            kwargs: dict[str, Any] = {
                "region_name": conf.s3_region,
                "aws_access_key_id": conf.s3_access_key_id or None,
                "aws_secret_access_key": conf.s3_secret_access_key or None,
                "config": Config(signature_version="s3v4", s3={"addressing_style": "path"}),
            }
            client = client or boto3.client(
                "s3", endpoint_url=conf.s3_endpoint_url or None, **kwargs
            )
            # Presigned links are issued for the public files origin (UPLOADS_DOWNLOAD_BASE_URL).
            signing_client = signing_client or boto3.client(
                "s3", endpoint_url=conf.download_base_url or None, **kwargs
            )
        self.client = client
        self.signing_client = signing_client

    def _bucket(self, bucket: Bucket, key: str) -> str:
        _check(bucket, key)
        return self.buckets[bucket]

    def put(self, bucket: Bucket, key: str, stream: BinaryIO, content_type: str) -> None:
        self.client.put_object(
            Bucket=self._bucket(bucket, key),
            Key=key,
            Body=stream.read(),
            ContentType=content_type,
            ServerSideEncryption="AES256",
        )

    def open(self, bucket: Bucket, key: str) -> BinaryIO:
        body: BinaryIO = self.client.get_object(Bucket=self._bucket(bucket, key), Key=key)["Body"]
        return body

    def move(self, src: Bucket, dst: Bucket, key: str) -> None:
        self.client.copy_object(
            Bucket=self._bucket(dst, key),
            Key=key,
            CopySource={"Bucket": self._bucket(src, key), "Key": key},
            ServerSideEncryption="AES256",
        )
        self.delete(src, key)

    def delete(self, bucket: Bucket, key: str) -> None:
        self.client.delete_object(Bucket=self._bucket(bucket, key), Key=key)

    def exists(self, bucket: Bucket, key: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            self.client.head_object(Bucket=self._bucket(bucket, key), Key=key)
        except ClientError:
            return False
        return True

    def signed_download_url(
        self,
        bucket: Bucket,
        key: str,
        filename: str,
        content_type: str,
        disposition: Disposition,
        ttl: int,
    ) -> DownloadLink:
        url = self.signing_client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": self._bucket(bucket, key),
                "Key": key,
                "ResponseContentDisposition": content_disposition(disposition, filename),
                "ResponseContentType": content_type,
                "ResponseCacheControl": "private, no-store",
            },
            ExpiresIn=ttl,
        )
        return DownloadLink(
            url=url, expires_at=timezone.now() + timedelta(seconds=ttl), disposition=disposition
        )


def get_storage() -> ObjectStorage:
    conf = upload_settings()
    if conf.storage == "local":
        return LocalFileSystemStorage(conf.local_root, conf.download_base_url)
    if conf.storage == "s3":
        return S3CompatibleStorage(conf)
    raise ValueError(f"Unknown UPLOADS_STORAGE {conf.storage!r}")
