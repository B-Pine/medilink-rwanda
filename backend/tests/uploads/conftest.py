"""Upload test fixtures: local storage in a temporary directory, the fake scanner, and a
test-only purpose usable by staff and patients (contract §3.4: S1 registers no patient purpose)."""

from __future__ import annotations

import io
from collections.abc import Iterator
from typing import Any

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

from medilink.uploads.purposes import UploadPurpose, register, unregister

TEST_PURPOSE = "test_document"
TEST_CSV_PURPOSE = "test_csv"

READERS: set[Any] = set()  # user IDs that `can_read` allows once attached


@pytest.fixture(autouse=True)
def upload_settings(tmp_path: Any) -> Iterator[Any]:
    with override_settings(
        UPLOADS={
            "storage": "local",
            "scanner": "fake",
            "local_root": str(tmp_path / "objects"),
            "download_base_url": "http://testserver/api/v1/files",
        }
    ):
        yield tmp_path / "objects"


@pytest.fixture(autouse=True)
def test_purposes() -> Iterator[None]:
    READERS.clear()
    register(
        UploadPurpose(
            code=TEST_PURPOSE,
            audiences=frozenset({"staff", "patient"}),
            owner_kind="patient",
            data_class="C2",
            can_upload=lambda principal, fields: fields.get("deny") != "yes",
            can_read=lambda principal, file: principal.user.pk in READERS,
        )
    )
    register(
        UploadPurpose(
            code=TEST_CSV_PURPOSE,
            audiences=frozenset({"staff"}),
            owner_kind="platform",
            data_class="C0",
            content_types=frozenset({"text/csv"}),
            max_bytes=5 * 2**20,
            can_upload=lambda principal, fields: True,
        )
    )
    yield
    unregister(TEST_PURPOSE)
    unregister(TEST_CSV_PURPOSE)


def make_png(size: tuple[int, int] = (40, 30), **save_kwargs: Any) -> bytes:
    from PIL import Image

    out = io.BytesIO()
    Image.new("RGB", size, (200, 30, 30)).save(out, format="PNG", **save_kwargs)
    return out.getvalue()


def make_jpeg_with_gps(size: tuple[int, int] = (64, 48)) -> bytes:
    from PIL import Image

    image = Image.new("RGB", size, (10, 120, 200))
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"  # Make
    exif[0x8825] = {1: "S", 2: (1.0, 57.0, 0.0), 3: "E", 4: (30.0, 3.0, 0.0)}
    out = io.BytesIO()
    image.save(out, format="JPEG", exif=exif)
    return out.getvalue()


def make_pdf(*, javascript: bool = False, attachment: bool = False, encrypt: bool = False) -> bytes:
    from pypdf import PdfWriter

    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    if javascript:
        writer.add_js("app.alert('x');")
    if attachment:
        writer.add_attachment("note.txt", b"hello")
    if encrypt:
        writer.encrypt("secret-password")
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def upload_file(name: str, data: bytes, content_type: str = "application/octet-stream") -> Any:
    return SimpleUploadedFile(name, data, content_type=content_type)
