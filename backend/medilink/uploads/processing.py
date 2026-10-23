"""Content processing after a clean scan (contract §2.4).

- Images are decoded with a pixel limit, refused when animated, shrunk to a 3,000 px longest side
  and re-encoded (JPEG q85, PNG optimised) without EXIF, XMP or GPS. HEIC/HEIF become JPEG.
- PDFs are parsed with pypdf and refused when encrypted, scripted, carrying embedded files or
  launch actions, using XFA or rich media, or over 100 pages.
"""

from __future__ import annotations

import io
import warnings
from dataclasses import dataclass
from typing import BinaryIO

from medilink.uploads import sniff
from medilink.uploads.conf import upload_settings

_PDF_FORBIDDEN_NAMES = ("/JavaScript", "/JS", "/EmbeddedFiles", "/Launch", "/XFA", "/RichMedia")


class UnsafeContent(Exception):
    """The file is refused; `reason` is a short machine code stored on the row."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class Processed:
    data: bytes
    content_type: str


def process(stream: BinaryIO, content_type: str) -> Processed:
    if content_type in sniff.IMAGE_TYPES:
        return _process_image(stream, content_type)
    if content_type == sniff.PDF:
        data = stream.read()
        check_pdf(data)
        return Processed(data, content_type)
    if content_type == sniff.CSV:
        return Processed(stream.read(), content_type)
    raise UnsafeContent("unsupported_type")


def _process_image(stream: BinaryIO, content_type: str) -> Processed:
    from PIL import Image, UnidentifiedImageError

    conf = upload_settings()
    if content_type in (sniff.HEIC, sniff.HEIF):
        from pillow_heif import register_heif_opener

        register_heif_opener()
    previous_limit = Image.MAX_IMAGE_PIXELS
    Image.MAX_IMAGE_PIXELS = conf.max_image_pixels
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            image = Image.open(stream)
            if getattr(image, "is_animated", False) or getattr(image, "n_frames", 1) > 1:
                raise UnsafeContent("animated_image")
            image.load()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise UnsafeContent("decompression_bomb") from exc
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as exc:
        raise UnsafeContent("invalid_image") from exc
    finally:
        Image.MAX_IMAGE_PIXELS = previous_limit

    from PIL import ImageOps

    result: Image.Image = ImageOps.exif_transpose(image)  # keep the orientation, drop EXIF
    result.thumbnail((conf.max_image_side, conf.max_image_side))
    out = io.BytesIO()
    if content_type == sniff.PNG:
        # A fresh image carries no metadata chunks (tEXt, eXIf, iTXt).
        clean = Image.new(result.mode, result.size)
        clean.paste(result)
        clean.save(out, format="PNG", optimize=True)
        return Processed(out.getvalue(), sniff.PNG)
    if result.mode not in ("RGB", "L"):
        result = result.convert("RGB")
    clean = Image.new(result.mode, result.size)
    clean.paste(result)
    clean.save(out, format="JPEG", quality=85, optimize=True)
    return Processed(out.getvalue(), sniff.JPEG)


def check_pdf(data: bytes) -> None:
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    # A cheap byte scan first: names can hide in compressed object streams, so pypdf checks too.
    for name in _PDF_FORBIDDEN_NAMES:
        if (
            name.encode() + b" " in data
            or name.encode() + b"(" in data
            or name.encode() + b"<" in data
        ):
            raise UnsafeContent("unsafe_pdf")
    try:
        reader = PdfReader(io.BytesIO(data), strict=False)
        if reader.is_encrypted:
            raise UnsafeContent("encrypted_pdf")
        if len(reader.pages) > upload_settings().max_pdf_pages:
            raise UnsafeContent("too_many_pages")
        root = reader.trailer["/Root"]
        _walk(root, set(), depth=0)
    except UnsafeContent:
        raise
    except (PdfReadError, KeyError, ValueError, TypeError, RecursionError) as exc:
        raise UnsafeContent("invalid_pdf") from exc


def _walk(obj: object, seen: set[int], depth: int) -> None:
    """Depth-limited walk of the object graph looking for forbidden names."""
    from pypdf.generic import ArrayObject, DictionaryObject, IndirectObject

    if depth > 60:
        return
    if isinstance(obj, IndirectObject):
        key = obj.idnum * 100_000 + obj.generation
        if key in seen:
            return
        seen.add(key)
        obj = obj.get_object()
    if isinstance(obj, DictionaryObject):
        for name, value in obj.items():
            if name in _PDF_FORBIDDEN_NAMES or (
                name == "/S" and value in ("/JavaScript", "/Launch")
            ):
                raise UnsafeContent("unsafe_pdf")
            if name in ("/Parent", "/P"):
                continue  # back-references: already visited from above
            _walk(value, seen, depth + 1)
    elif isinstance(obj, ArrayObject):
        for item in obj:
            _walk(item, seen, depth + 1)
