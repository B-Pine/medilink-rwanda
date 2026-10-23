"""Content-type sniffing from magic bytes (contract §2.4). No libmagic: a short, auditable list.

The file extension and the browser's Content-Type are never trusted.
"""

from __future__ import annotations

PDF = "application/pdf"
JPEG = "image/jpeg"
PNG = "image/png"
HEIC = "image/heic"
HEIF = "image/heif"
CSV = "text/csv"

IMAGE_TYPES = frozenset({JPEG, PNG, HEIC, HEIF})
DOCUMENT_TYPES = frozenset({PDF, JPEG, PNG, HEIC, HEIF})

SNIFF_BYTES = 4096

_HEIC_BRANDS = frozenset({b"heic", b"heix", b"hevc", b"hevx", b"heim", b"heis"})
_HEIF_BRANDS = frozenset({b"mif1", b"msf1"})


def sniff(head: bytes, *, allow_csv: bool = False) -> str | None:
    """Return the sniffed MIME type of `head` (the first bytes of a file), or None if refused."""
    if head.startswith(b"%PDF-"):
        return PDF
    if head.startswith(b"\xff\xd8\xff"):
        return JPEG
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return PNG
    if len(head) >= 12 and head[4:8] == b"ftyp":
        brand = head[8:12]
        if brand in _HEIC_BRANDS:
            return HEIC
        if brand in _HEIF_BRANDS:
            return HEIF
        return None
    if allow_csv and _looks_like_csv(head):
        return CSV
    return None


def _looks_like_csv(head: bytes) -> bool:
    """UTF-8 text without NUL bytes that isn't markup. Full validation happens at import."""
    if not head or b"\x00" in head:
        return False
    sample = head.lstrip(b"\xef\xbb\xbf")  # UTF-8 BOM
    try:
        text = sample.decode("utf-8")
    except UnicodeDecodeError:
        # The head may cut a multi-byte character in two: retry without the last 3 bytes.
        try:
            text = sample[:-3].decode("utf-8")
        except UnicodeDecodeError:
            return False
    stripped = text.lstrip().lower()
    return not stripped.startswith(("<", "{", "["))
