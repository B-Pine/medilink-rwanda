"""Cloudinary storage (UPLOADS_STORAGE=cloudinary): signatures, calls and links, with a fake
transport (no network)."""

from __future__ import annotations

import io
import urllib.parse
import urllib.request
from dataclasses import replace

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.test import override_settings

from medilink.uploads.cloudinary import CloudinaryStorage, api_sign, parse_cloudinary_url
from medilink.uploads.conf import upload_settings
from medilink.uploads.storage import get_storage

URL = "cloudinary://123456:s3cr%2Ft@demo-cloud"
KEY = "0b8f4c56-8f1e-4a55-9c55-4f0c5a6f1e01"


class FakeCloudinary:
    """Records requests and keeps raw assets by public id, like the real API."""

    def __init__(self) -> None:
        self.assets: dict[str, bytes] = {}
        self.calls: list[tuple[str, str]] = []

    def __call__(self, request: urllib.request.Request) -> tuple[int, bytes]:
        url = urllib.parse.urlsplit(request.full_url)
        action = url.path.rsplit("/", 1)[-1]
        self.calls.append((request.get_method(), url.path))
        if request.get_method() == "POST":
            fields = _fields(request.data or b"")
            assert fields["api_key"] == "123456"
            signature = fields.pop("signature")
            assert signature == api_sign(fields, "s3cr/t")
            assert fields["type"] == "authenticated"
            if action == "upload":
                self.assets[fields["public_id"]] = fields["file"].encode("latin-1")
            elif action == "rename":
                self.assets[fields["to_public_id"]] = self.assets.pop(fields["from_public_id"])
            elif action == "destroy":
                self.assets.pop(fields["public_id"], None)
            return 200, b"{}"
        if action == "download":
            query = dict(urllib.parse.parse_qsl(url.query))
            signature = query.pop("signature")
            assert signature == api_sign(query, "s3cr/t")
            data = self.assets.get(query["public_id"])
            return (200, data) if data is not None else (404, b"")
        assert request.get_header("Authorization", "").startswith("Basic ")
        public_id = url.path.split("/resources/raw/authenticated/", 1)[1]
        return (200, b"{}") if public_id in self.assets else (404, b"")


def _fields(body: bytes) -> dict[str, str]:
    text = body.decode("latin-1")
    boundary = text.split("\r\n", 1)[0]
    out: dict[str, str] = {}
    for part in text.split(boundary)[1:-1]:
        head, _, value = part.strip("\r\n").partition("\r\n\r\n")
        name = head.split('name="', 1)[1].split('"', 1)[0]
        out[name] = value
    return out


def _storage(fake: FakeCloudinary) -> CloudinaryStorage:
    conf = replace(upload_settings(), storage="cloudinary", cloudinary_url=URL)
    return CloudinaryStorage(conf, transport=fake)


def test_signature_matches_cloudinary_documentation() -> None:
    params = {
        "eager": "w_400,h_300,c_pad|w_260,h_200,c_crop",
        "public_id": "sample_image",
        "timestamp": 1315060510,
        "api_key": "ignored",
        "file": "ignored",
    }
    assert api_sign(params, "abcd") == "bfd09f95f331f558cbd1320e67aa8d488770583e"


def test_parse_url() -> None:
    creds = parse_cloudinary_url(URL)
    assert (creds.cloud_name, creds.api_key, creds.api_secret) == ("demo-cloud", "123456", "s3cr/t")
    with pytest.raises(ImproperlyConfigured):
        parse_cloudinary_url("https://example.com")


def test_put_move_open_exists_delete() -> None:
    fake = FakeCloudinary()
    storage = _storage(fake)
    storage.put("quarantine", KEY, io.BytesIO(b"\x89PNG data"), "image/png")
    assert storage.exists("quarantine", KEY)
    storage.move("quarantine", "documents", KEY)
    assert not storage.exists("quarantine", KEY)
    assert storage.exists("documents", KEY)
    assert storage.open("documents", KEY).read() == b"\x89PNG data"
    assert list(fake.assets) == [f"medilink/documents/{KEY}"]
    storage.delete("documents", KEY)
    assert not storage.exists("documents", KEY)
    with pytest.raises(FileNotFoundError):
        storage.open("documents", KEY)
    assert ("POST", "/v1_1/demo-cloud/raw/upload") in fake.calls


def test_download_link_is_signed_expiring_and_an_attachment() -> None:
    fake = FakeCloudinary()
    storage = _storage(fake)
    storage.put("documents", KEY, io.BytesIO(b"pdf"), "application/pdf")
    link = storage.signed_download_url(
        "documents", KEY, "licence.pdf", "application/pdf", "attachment", 300
    )
    assert link.url.startswith("https://api.cloudinary.com/v1_1/demo-cloud/raw/download?")
    query = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(link.url).query))
    assert query["attachment"] == "true" and query["type"] == "authenticated"
    assert int(query["expires_at"]) > int(query["timestamp"])
    assert "s3cr" not in link.url  # the secret never leaves the server
    assert fake(urllib.request.Request(link.url)) == (200, b"pdf")  # noqa: S310


def test_storage_setting_selects_cloudinary() -> None:
    with override_settings(UPLOADS={"storage": "cloudinary", "cloudinary_url": URL}):
        assert isinstance(get_storage(), CloudinaryStorage)
    with (
        override_settings(
            UPLOADS={"storage": "cloudinary", "cloudinary_url": ""},
            CLOUDINARY={"cloud_name": "", "api_key": "", "api_secret": ""},
        ),
        pytest.raises(ImproperlyConfigured),
    ):
        get_storage()
    trio = {"cloud_name": "c", "api_key": "k", "api_secret": "s"}
    with override_settings(
        UPLOADS={"storage": "cloudinary", "cloudinary_url": ""}, CLOUDINARY=trio
    ):
        storage = get_storage()
        assert isinstance(storage, CloudinaryStorage) and storage.creds.cloud_name == "c"


def test_deploy_check_accepts_cloudinary_with_credentials() -> None:
    from medilink.uploads.checks import check_deploy_uploads

    base = {"storage": "cloudinary", "scanner": "clamd"}
    with override_settings(UPLOADS={**base, "cloudinary_url": URL}):
        assert check_deploy_uploads() == []
    with override_settings(UPLOADS={**base, "cloudinary_url": ""}, CLOUDINARY={}):
        assert [m.id for m in check_deploy_uploads()] == ["medilink.uploads.E005"]
