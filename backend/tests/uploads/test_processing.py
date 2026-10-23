"""S1-B8 (content controls) and S1-B9 (scanner and storage interfaces) at the unit level."""

from __future__ import annotations

import io
import socket
import struct
import threading
from typing import Any

import pytest
from botocore.stub import ANY, Stubber
from django.core.management import call_command
from django.core.management.base import SystemCheckError
from django.test import override_settings

from medilink.uploads import sniff
from medilink.uploads.conf import upload_settings
from medilink.uploads.processing import UnsafeContent, check_pdf, process
from medilink.uploads.purposes import UploadPurpose
from medilink.uploads.scanner import EICAR, ClamdScanner, FakeScanner
from medilink.uploads.storage import S3CompatibleStorage
from tests.uploads.conftest import make_jpeg_with_gps, make_pdf, make_png

pytestmark = pytest.mark.acceptance("S1-B8")


@pytest.mark.parametrize(
    ("head", "expected"),
    [
        (b"%PDF-1.7\n", "application/pdf"),
        (b"\xff\xd8\xff\xe0\x00\x10JFIF", "image/jpeg"),
        (b"\x89PNG\r\n\x1a\n\x00\x00", "image/png"),
        (b"\x00\x00\x00\x18ftypheic\x00\x00", "image/heic"),
        (b"\x00\x00\x00\x18ftypmif1\x00\x00", "image/heif"),
        (b"<svg xmlns='http://www.w3.org/2000/svg'/>", None),
        (b"<!doctype html><html>", None),
        (b"PK\x03\x04\x14\x00", None),  # zip, docx
        (b"\x00\x00\x00\x18ftypmp42", None),  # mp4
        (b"GIF89a", None),
        (b"code,name\nA,B\n", None),  # CSV only where the purpose allows it
    ],
)
def test_sniffer(head: bytes, expected: str | None) -> None:
    assert sniff.sniff(head) == expected


def test_csv_sniffing() -> None:
    assert sniff.sniff(b"\xef\xbb\xbfcode,name\nA,B\n", allow_csv=True) == "text/csv"
    assert sniff.sniff("code,nom\nA,Kigali é\n".encode(), allow_csv=True) == "text/csv"
    assert sniff.sniff(b"a,b\x00c", allow_csv=True) is None
    assert sniff.sniff(b"\xff\xfe\x00a", allow_csv=True) is None
    assert sniff.sniff(b"<html>", allow_csv=True) is None


def test_jpeg_is_reencoded_without_exif_or_gps() -> None:
    from PIL import Image

    original = make_jpeg_with_gps()
    assert Image.open(io.BytesIO(original)).getexif().get(0x8825)
    result = process(io.BytesIO(original), "image/jpeg")
    image = Image.open(io.BytesIO(result.data))
    assert result.content_type == "image/jpeg"
    assert not image.getexif()
    assert "exif" not in image.info
    assert b"PhoneMaker" not in result.data


def test_png_metadata_dropped_and_large_images_shrunk() -> None:
    from PIL import Image, PngImagePlugin

    info = PngImagePlugin.PngInfo()
    info.add_text("Comment", "Location: Kimironko")
    result = process(io.BytesIO(make_png((3600, 100), pnginfo=info)), "image/png")
    image = Image.open(io.BytesIO(result.data))
    assert max(image.size) == 3000
    assert b"Kimironko" not in result.data


def test_decompression_bomb_refused() -> None:
    with (
        override_settings(UPLOADS={"max_image_pixels": 10_000}),
        pytest.raises(UnsafeContent) as exc,
    ):
        process(io.BytesIO(make_png((400, 400))), "image/png")
    assert exc.value.reason == "decompression_bomb"


def test_animated_png_refused() -> None:
    from PIL import Image

    frames = [Image.new("RGB", (10, 10), c) for c in ((255, 0, 0), (0, 255, 0))]
    out = io.BytesIO()
    frames[0].save(out, format="PNG", save_all=True, append_images=frames[1:])
    with pytest.raises(UnsafeContent) as exc:
        process(io.BytesIO(out.getvalue()), "image/png")
    assert exc.value.reason == "animated_image"


def test_corrupt_image_refused() -> None:
    with pytest.raises(UnsafeContent):
        process(io.BytesIO(b"\x89PNG\r\n\x1a\nnot really"), "image/png")


def test_heic_converted_to_jpeg() -> None:
    from PIL import Image
    from pillow_heif import register_heif_opener

    register_heif_opener()
    out = io.BytesIO()
    try:
        Image.new("RGB", (32, 32), (0, 128, 0)).save(out, format="HEIF")
    except (KeyError, OSError, ValueError):
        pytest.skip("HEIF encoder not available in this build")
    assert sniff.sniff(out.getvalue()[:64]) in ("image/heic", "image/heif")
    result = process(io.BytesIO(out.getvalue()), sniff.sniff(out.getvalue()[:64]) or "")
    assert result.content_type == "image/jpeg"


def test_plain_pdf_accepted() -> None:
    check_pdf(make_pdf())


@pytest.mark.parametrize(
    ("kwargs", "reason"),
    [
        ({"javascript": True}, "unsafe_pdf"),
        ({"attachment": True}, "unsafe_pdf"),
        ({"encrypt": True}, "encrypted_pdf"),
    ],
)
def test_unsafe_pdfs_refused(kwargs: dict[str, bool], reason: str) -> None:
    with pytest.raises(UnsafeContent) as exc:
        check_pdf(make_pdf(**kwargs))
    assert exc.value.reason == reason


def test_pdf_page_limit() -> None:
    from pypdf import PdfWriter

    writer = PdfWriter()
    for _ in range(3):
        writer.add_blank_page(width=10, height=10)
    out = io.BytesIO()
    writer.write(out)
    with override_settings(UPLOADS={"max_pdf_pages": 2}), pytest.raises(UnsafeContent) as exc:
        check_pdf(out.getvalue())
    assert exc.value.reason == "too_many_pages"


def test_broken_pdf_refused() -> None:
    with pytest.raises(UnsafeContent):
        check_pdf(b"%PDF-1.7\nthis is not a pdf")


def test_purpose_validation() -> None:
    with pytest.raises(ValueError, match="audiences"):
        UploadPurpose(
            code="x", audiences=frozenset({"nobody"}), owner_kind="patient", data_class="C1"
        )
    with pytest.raises(ValueError, match="CSV"):
        UploadPurpose(
            code="x",
            audiences=frozenset({"staff"}),
            owner_kind="platform",
            data_class="C0",
            content_types=frozenset({"text/csv", "application/pdf"}),
        )
    with pytest.raises(ValueError, match="code"):
        UploadPurpose(
            code="Bad-Code", audiences=frozenset({"staff"}), owner_kind="patient", data_class="C1"
        )


# ---- S1-B9: interfaces ---------------------------------------------------------------------


@pytest.mark.acceptance("S1-B9")
def test_fake_scanner_finds_eicar_across_chunks() -> None:
    padding = b"x" * (64 * 1024 - 10)
    assert FakeScanner().scan(io.BytesIO(padding + EICAR)).verdict == "infected"
    assert FakeScanner().scan(io.BytesIO(b"hello")).verdict == "clean"


class _FakeClamd:
    """A one-shot TCP server speaking enough of the clamd INSTREAM protocol."""

    def __init__(self, reply: bytes) -> None:
        self.reply = reply
        self.received = b""
        self.server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server.bind(("127.0.0.1", 0))
        self.server.listen(1)
        self.port = self.server.getsockname()[1]
        self.thread = threading.Thread(target=self._serve, daemon=True)
        self.thread.start()

    def _serve(self) -> None:
        conn, _ = self.server.accept()
        with conn:
            command = b""
            while not command.endswith(b"\x00"):
                command += conn.recv(1)
            assert command == b"zINSTREAM\x00"
            while True:
                size = struct.unpack("!L", _recv_exact(conn, 4))[0]
                if size == 0:
                    break
                self.received += _recv_exact(conn, size)
            conn.sendall(self.reply + b"\x00")
        self.server.close()


def _recv_exact(conn: socket.socket, size: int) -> bytes:
    data = b""
    while len(data) < size:
        data += conn.recv(size - len(data))
    return data


@pytest.mark.acceptance("S1-B9")
@pytest.mark.parametrize(
    ("reply", "verdict", "signature"),
    [
        (b"stream: OK", "clean", ""),
        (b"stream: Eicar-Signature FOUND", "infected", "Eicar-Signature"),
        (b"INSTREAM size limit exceeded. ERROR", "error", ""),
    ],
)
def test_clamd_scanner_against_fake_socket(reply: bytes, verdict: str, signature: str) -> None:
    server = _FakeClamd(reply)
    result = ClamdScanner("127.0.0.1", server.port, timeout=5).scan(io.BytesIO(b"abc" * 30000))
    server.thread.join(5)
    assert result.verdict == verdict
    assert result.signature == signature or verdict == "error"
    assert server.received == b"abc" * 30000


@pytest.mark.acceptance("S1-B9")
def test_clamd_unreachable_is_an_error() -> None:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    assert ClamdScanner("127.0.0.1", port, timeout=1).scan(io.BytesIO(b"x")).verdict == "error"


@pytest.mark.acceptance("S1-B9")
def test_s3_storage_with_stubber() -> None:
    import boto3

    conf = upload_settings()
    client = boto3.client(
        "s3", region_name="af-south-1", aws_access_key_id="k", aws_secret_access_key="s"
    )
    signer = boto3.client(
        "s3",
        region_name="af-south-1",
        endpoint_url="https://files.medilink.rw",
        aws_access_key_id="k",
        aws_secret_access_key="s",
    )
    storage = S3CompatibleStorage(conf, client=client, signing_client=signer)
    key = "0b8f4c56-8f1e-4a55-9c55-4f0c5a6f1e01"
    with Stubber(client) as stub:
        stub.add_response(
            "put_object",
            {},
            {
                "Bucket": conf.s3_quarantine_bucket,
                "Key": key,
                "Body": b"data",
                "ContentType": "application/pdf",
                "ServerSideEncryption": "AES256",
            },
        )
        stub.add_response(
            "copy_object",
            {},
            {
                "Bucket": conf.s3_documents_bucket,
                "Key": key,
                "CopySource": {"Bucket": conf.s3_quarantine_bucket, "Key": key},
                "ServerSideEncryption": "AES256",
            },
        )
        stub.add_response("delete_object", {}, {"Bucket": conf.s3_quarantine_bucket, "Key": key})
        stub.add_response("head_object", {}, {"Bucket": conf.s3_documents_bucket, "Key": key})
        stub.add_response("get_object", {"Body": io.BytesIO(b"data")}, {"Bucket": ANY, "Key": key})
        storage.put("quarantine", key, io.BytesIO(b"data"), "application/pdf")
        storage.move("quarantine", "documents", key)
        assert storage.exists("documents", key)
        assert storage.open("documents", key).read() == b"data"
        stub.assert_no_pending_responses()
    link = storage.signed_download_url(
        "documents", key, "licence é.pdf", "application/pdf", "inline", 300
    )
    assert link.url.startswith("https://files.medilink.rw/")
    assert "X-Amz-Expires=300" in link.url
    assert "response-content-disposition=inline" in link.url
    with pytest.raises(ValueError, match="key"):
        storage.put("documents", "../etc/passwd", io.BytesIO(b""), "text/plain")


@pytest.mark.acceptance("S1-B9")
def test_deploy_check_refuses_fake_scanner_and_local_storage(settings: Any) -> None:
    with pytest.raises(SystemCheckError) as exc:
        call_command("check", "--deploy", "--fail-level", "ERROR", tags=["security"])
    assert "medilink.uploads.E001" in str(exc.value)
    assert "medilink.uploads.E002" in str(exc.value)


def test_deploy_check_clean_with_clamd_and_s3() -> None:
    from medilink.uploads.checks import check_deploy_uploads

    with override_settings(
        UPLOADS={
            "scanner": "clamd",
            "storage": "s3",
            "download_base_url": "https://files.medilink.rw",
        }
    ):
        assert check_deploy_uploads() == []
    with override_settings(
        UPLOADS={"scanner": "clamd", "storage": "s3", "download_base_url": "http://files"}
    ):
        assert [m.id for m in check_deploy_uploads()] == ["medilink.uploads.E003"]
