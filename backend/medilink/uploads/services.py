"""Upload pipeline services (contract §2.4, §3.6). Frozen for /api/v1: additions only.

receive(...)        checks, quarantine, enqueue scan
attach(...)         once; clean; same uploader
download_link(...)  clean only; audited
soft_delete(...)    owner-deleted non-clinical files
upload_scanned      Signal(file_id, status), sent after every scan result
"""

from __future__ import annotations

import hashlib
import io
import logging
import re
import unicodedata
import uuid
from typing import Any, BinaryIO, cast

from django.core.files.uploadedfile import UploadedFile as DjangoUploadedFile
from django.db import IntegrityError, transaction
from django.dispatch import Signal
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from medilink.audit.services import record
from medilink.uploads import sniff
from medilink.uploads.conf import upload_settings
from medilink.uploads.models import ScanStatus, StorageBucket, UploadedFile
from medilink.uploads.processing import UnsafeContent, process
from medilink.uploads.purposes import UploadPurpose, get_purpose
from medilink.uploads.scanner import get_scanner
from medilink.uploads.storage import Disposition, DownloadLink, get_storage

logger = logging.getLogger(__name__)
security_logger = logging.getLogger("medilink.security")

upload_scanned = Signal()  # kwargs: file_id, status

MESSAGES = {
    "purpose": _("This kind of upload isn't accepted here."),
    "type": _("This file type isn't accepted. Upload a PDF, JPEG, PNG or HEIC file."),
    "csv": _("Upload a UTF-8 CSV file."),
    "size": _("This file is too large."),
    "empty": _("The file is empty."),
    "attach": _("This upload can't be used here."),
}


class UploadRejected(Exception):
    """A client error on one field (mapped to 400 validation_error)."""

    def __init__(self, field: str, message: Any) -> None:
        super().__init__(str(message))
        self.field = field
        self.message = message


class NotClean(Exception):
    """The file has no clean status (yet): no download, no attachment (422)."""


_FILENAME_UNSAFE = re.compile(r"[^\w.\- ()]+", re.UNICODE)


def sanitise_filename(name: str) -> str:
    base = re.split(r"[\\/]", name or "")[-1]
    base = unicodedata.normalize("NFC", base)
    base = "".join(ch for ch in base if unicodedata.category(ch)[0] != "C")
    base = _FILENAME_UNSAFE.sub("_", base).strip(" .")
    return base[:200] or "file"


def _limit_for(purpose: UploadPurpose) -> int:
    return min(purpose.max_bytes, upload_settings().max_bytes)


def receive(
    *,
    actor: Any,
    audience: str,
    purpose: str,
    django_file: DjangoUploadedFile,
    idempotency_key: str | None = None,
    idempotency_scope: str | None = None,
    facility_id: Any = None,
    patient_id: Any = None,
    request: Any = None,
) -> UploadedFile:
    """Check, store in quarantine and enqueue the scan. Returns the `pending` row (or the
    original row when the idempotency key was already used in this scope)."""
    spec = get_purpose(purpose)
    if spec is None or audience not in spec.audiences:
        raise UploadRejected("purpose", MESSAGES["purpose"])
    scope = idempotency_scope or (f"user:{actor.pk}" if actor is not None else "")
    if not scope:
        raise ValueError("Anonymous uploads need an idempotency scope (application:<id>)")
    key = (idempotency_key or "")[:200]
    if key:
        existing = UploadedFile.objects.filter(idempotency_scope=scope, idempotency_key=key).first()
        if existing is not None:
            if existing.purpose != purpose:
                raise UploadRejected("purpose", MESSAGES["purpose"])
            return existing

    size = django_file.size or 0
    if size <= 0:
        raise UploadRejected("file", MESSAGES["empty"])
    if size > _limit_for(spec):
        raise UploadRejected("file", MESSAGES["size"])
    django_file.seek(0)
    head = django_file.read(sniff.SNIFF_BYTES)
    allow_csv = sniff.CSV in spec.content_types
    content_type = sniff.sniff(head, allow_csv=allow_csv)
    if content_type is None or content_type not in spec.content_types:
        raise UploadRejected("file", MESSAGES["csv" if allow_csv else "type"])

    django_file.seek(0)
    digest = hashlib.sha256()
    for chunk in django_file.chunks():
        digest.update(chunk)
        if allow_csv and b"\x00" in chunk:
            raise UploadRejected("file", MESSAGES["csv"])
    storage_key = uuid.uuid4()
    django_file.seek(0)
    get_storage().put("quarantine", str(storage_key), cast(BinaryIO, django_file), content_type)

    row = UploadedFile(
        purpose=purpose,
        owner_kind=spec.owner_kind,
        facility_id=facility_id,
        patient_id=patient_id,
        data_class=spec.data_class,
        storage_bucket=StorageBucket.QUARANTINE,
        storage_key=storage_key,
        original_sha256=digest.hexdigest(),
        size_bytes=size,
        content_type=content_type,
        original_filename=sanitise_filename(getattr(django_file, "name", "") or ""),
        uploaded_by=actor,
        uploaded_via=audience,
        idempotency_scope=scope,
        idempotency_key=key,
    )
    try:
        with transaction.atomic():
            row.save()
    except IntegrityError:
        get_storage().delete("quarantine", str(storage_key))
        existing = UploadedFile.objects.filter(idempotency_scope=scope, idempotency_key=key).first()
        if existing is None:
            raise
        return existing

    record(
        "upload.created",
        request=request,
        actor=actor,
        facility_id=facility_id,
        object_type="upload",
        object_id=row.pk,
        metadata={"purpose": purpose, "content_type": content_type, "size_bytes": size},
    )
    from medilink.uploads.tasks import scan_file

    file_id, row_facility = str(row.pk), str(facility_id) if facility_id else None
    transaction.on_commit(lambda: scan_file.delay(file_id, row_facility))
    return row


def scan(file: UploadedFile) -> UploadedFile:
    """Scan and process one `pending` file (called by the scan task). Final states are kept."""
    if file.scan_status != ScanStatus.PENDING:
        return file
    storage = get_storage()
    key = str(file.storage_key)
    with storage.open("quarantine", key) as stream:
        data = stream.read()
    spec = get_purpose(file.purpose)
    allow_csv = spec is not None and sniff.CSV in spec.content_types
    if sniff.sniff(data[: sniff.SNIFF_BYTES], allow_csv=allow_csv) != file.content_type:
        return _reject(file, "type_mismatch")

    verdict = get_scanner().scan(io.BytesIO(data))
    file.scanner_version = verdict.engine_version[:100]
    if verdict.verdict == "error":
        raise ScanError(verdict.signature)
    if verdict.verdict == "infected":
        storage.delete("quarantine", key)
        file.scan_status = ScanStatus.INFECTED
        file.rejection_reason = "infected"
        file.scanned_at = timezone.now()
        file.save(
            update_fields=["scan_status", "rejection_reason", "scanned_at", "scanner_version"]
        )
        security_logger.error(
            "Infected upload quarantined and deleted",
            extra={"upload_id": str(file.pk), "purpose": file.purpose, "alert": "high"},
        )
        record(
            "upload.rejected",
            actor=None,
            facility_id=file.facility_id,
            object_type="upload",
            object_id=file.pk,
            metadata={"reason": "infected", "purpose": file.purpose},
        )
        _announce(file)
        return file

    try:
        processed = process(io.BytesIO(data), file.content_type)
    except UnsafeContent as exc:
        return _reject(file, exc.reason)
    storage.put("documents", key, io.BytesIO(processed.data), processed.content_type)
    storage.delete("quarantine", key)
    file.storage_bucket = StorageBucket.DOCUMENTS
    file.sha256 = hashlib.sha256(processed.data).hexdigest()
    file.size_bytes = len(processed.data)
    file.content_type = processed.content_type
    if processed.content_type == sniff.JPEG and not file.original_filename.lower().endswith(
        (".jpg", ".jpeg")
    ):
        file.original_filename = sanitise_filename(
            file.original_filename.rsplit(".", 1)[0] + ".jpg"
        )
    file.scan_status = ScanStatus.CLEAN
    file.scanned_at = timezone.now()
    file.save()
    _announce(file)
    return file


class ScanError(Exception):
    """The scanner couldn't give a verdict; the task retries, then marks the file `failed`."""


def mark_failed(file: UploadedFile) -> UploadedFile:
    if file.scan_status != ScanStatus.PENDING:
        return file
    file.scan_status = ScanStatus.FAILED
    file.rejection_reason = "scan_failed"
    file.scanned_at = timezone.now()
    file.save(update_fields=["scan_status", "rejection_reason", "scanned_at", "scanner_version"])
    security_logger.error("Upload scan failed after retries", extra={"upload_id": str(file.pk)})
    _announce(file)
    return file


def _reject(file: UploadedFile, reason: str) -> UploadedFile:
    get_storage().delete("quarantine", str(file.storage_key))
    file.scan_status = ScanStatus.REJECTED
    file.rejection_reason = reason[:64]
    file.scanned_at = timezone.now()
    file.save(update_fields=["scan_status", "rejection_reason", "scanned_at", "scanner_version"])
    security_logger.warning("Upload rejected", extra={"upload_id": str(file.pk), "reason": reason})
    record(
        "upload.rejected",
        actor=None,
        facility_id=file.facility_id,
        object_type="upload",
        object_id=file.pk,
        metadata={"reason": reason, "purpose": file.purpose},
    )
    _announce(file)
    return file


def _announce(file: UploadedFile) -> None:
    file_id, status = file.pk, file.scan_status
    transaction.on_commit(
        lambda: upload_scanned.send(sender=UploadedFile, file_id=file_id, status=status)
    )


def attach(
    file: UploadedFile,
    *,
    purpose: str,
    owner_id: Any,
    facility_id: Any = None,
    patient_id: Any = None,
    actor: Any,
) -> UploadedFile:
    """Bind a clean, unattached upload of `purpose` (uploaded by `actor`) to its owner. Once."""
    if (
        file.purpose != purpose
        or file.is_attached
        or file.deleted_at is not None
        or (actor is not None and file.uploaded_by_id != actor.pk)
    ):
        raise UploadRejected("upload_id", MESSAGES["attach"])
    if file.scan_status != ScanStatus.CLEAN:
        raise NotClean()
    file.owner_id = owner_id
    if facility_id is not None:
        file.facility_id = facility_id
    if patient_id is not None:
        file.patient_id = patient_id
    file.attached_at = timezone.now()
    file.save(update_fields=["owner_id", "facility_id", "patient_id", "attached_at"])
    return file


def download_link(
    file: UploadedFile,
    *,
    principal: Any = None,
    disposition: Disposition = "inline",
    request: Any = None,
    actor: Any = None,
) -> DownloadLink:
    """A 5-minute signed link to a clean file. The caller checks the read policy first."""
    if file.scan_status != ScanStatus.CLEAN or file.deleted_at is not None:
        raise NotClean()
    if disposition not in ("inline", "attachment"):
        raise UploadRejected("disposition", MESSAGES["purpose"])
    conf = upload_settings()
    link = get_storage().signed_download_url(
        "documents",
        str(file.storage_key),
        file.original_filename,
        file.content_type,
        disposition,
        conf.link_ttl_seconds,
    )
    if actor is None and principal is not None and getattr(principal, "is_authenticated", False):
        actor = principal.user
    record(
        "upload.download_link_issued",
        request=request,
        actor=actor,
        facility_id=file.facility_id,
        object_type="upload",
        object_id=file.pk,
        metadata={"purpose": file.purpose, "disposition": disposition},
    )
    return link


def soft_delete(file: UploadedFile, *, actor: Any) -> None:
    """Mark a non-clinical file deleted; the purge job removes the object after 30 days."""
    if file.deleted_at is None:
        file.deleted_at = timezone.now()
        file.save(update_fields=["deleted_at"])
