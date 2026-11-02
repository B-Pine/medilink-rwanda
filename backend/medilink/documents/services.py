"""Generated documents (contract sprint-07 §1, §2, S7b).

A document is created in the transaction that signs its source (the prescription on issue, a
letter or request with the consultation or on its own). Rendering runs after commit in the
`documents` worker queue: it builds the content from the signed data, and stores a new version
only when that content changed (the previous one is marked superseded). The verification record
holds the public projection and, encrypted, the details shown after a date-of-birth match.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import io
import json
import secrets
import uuid
import zipfile
from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.db import transaction
from django.dispatch import Signal
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from medilink.audit.services import record
from medilink.core.exceptions import BusinessRuleViolation
from medilink.documents.models import (
    PREFIXES,
    Document,
    DocumentKind,
    DocumentVersion,
    LabRequest,
    Referral,
    ShareLink,
    SickNote,
    VerificationRecord,
    VerificationStatus,
)
from medilink.documents.numbers import next_number
from medilink.documents.render import label, render_pdf
from medilink.patients.crypto.fields import blind_index, blind_indexes, decrypt, encrypt
from medilink.uploads.storage import Bucket

# S9b: kwargs document_id, facility_id; sent after commit (contract sprint-09 §11)
document_generated = Signal()

CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"  # no 0/O, 1/I/L
CODE_LENGTH = 10
LINK_TTL = 300  # seconds (contract D2: five minutes)
SHARE_DAYS = (1, 30)
ARCHIVE_LIMIT = 100
BUCKET: Bucket = "documents"
PDF = "application/pdf"


def new_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def normalise_code(code: str) -> str:
    return "".join(ch for ch in code.upper() if ch.isalnum())


def _dob_digest(dob: dt.date | None) -> bytes | None:
    return blind_index("dob", "verify", dob.isoformat())[1] if dob else None


def dob_matches(record: VerificationRecord, dob: dt.date) -> bool:
    stored = bytes(record.patient_dob_hmac or b"")
    if not stored:
        return False
    return any(
        hmac.compare_digest(stored, digest)
        for _key, digest in blind_indexes("dob", "verify", dob.isoformat())
    )


def client_hash(ip: str) -> bytes:
    return hmac.new(settings.SECRET_KEY.encode(), ip.encode(), hashlib.sha256).digest()


def _author(membership: Any) -> tuple[str, str]:
    user = membership.user
    profile = getattr(user, "clinician_profile", None)
    licence = f"{profile.council.upper()} {profile.licence_number}" if profile else ""
    return str(user.full_name), licence


def _language(patient: Any, facility_id: Any) -> str:
    from medilink.patients.models import PatientLink
    from medilink.pharmacy.services import _setting

    link = (
        PatientLink.objects.active()
        .filter(patient=patient, relationship="self")
        .select_related("account")
        .first()
    )
    preferred = getattr(link.account, "preferred_language", "") if link else ""
    if preferred in ("rw", "en", "fr"):
        return str(preferred)
    return str(_setting(facility_id, "documents", "label_language"))


def _audit(action: str, document: Document, request: Any = None, **metadata: Any) -> None:
    record(
        action,
        request=request,
        facility_id=document.facility_id,
        object_type="documents.document",
        object_id=document.pk,
        metadata={"document_id": str(document.pk), "kind": document.kind, **metadata},
    )


# ---- create (inside the signing transaction) ---------------------------------------------------


def create(
    kind: str,
    *,
    source_id: Any,
    consultation: Any,
    author_membership: Any,
    number: str | None = None,
    issued_at: dt.datetime | None = None,
    valid_until: dt.datetime | None = None,
    request: Any = None,
) -> Document:
    issued_at = issued_at or timezone.now()
    facility_id = consultation.facility_id
    document = Document.objects.create(
        facility_id=facility_id,
        kind=kind,
        number=number or next_number(facility_id, PREFIXES[DocumentKind(kind)]),
        patient_id=consultation.patient_id,
        facility_patient_id=consultation.facility_patient_id,
        visit_id=consultation.visit_id,
        consultation=consultation,
        source_id=source_id,
        author_membership=author_membership,
        language=_language(consultation.patient, facility_id),
        document_date=timezone.localdate(issued_at),
        released_at=issued_at,
    )
    name, licence = _author(author_membership)
    from medilink.tenancy.models import Facility

    VerificationRecord.objects.create(
        code=_unique_code(),
        document=document,
        kind=kind,
        number=document.number,
        issued_at=issued_at,
        facility_name=Facility.objects.get(pk=facility_id).name,
        author_name=name,
        author_licence=licence,
        valid_until=valid_until,
        patient_dob_hmac=_dob_digest(consultation.patient.date_of_birth),
    )
    _audit("documents.generated", document, request)
    schedule_render(document)
    ids = {"document_id": document.pk, "facility_id": facility_id}
    transaction.on_commit(lambda: document_generated.send(sender=Document, **ids))
    return document


def _unique_code() -> str:
    while True:
        code = new_code()
        if not VerificationRecord.objects.filter(code=code).exists():
            return code


def schedule_render(document: Document) -> None:
    from medilink.documents.tasks import render_document

    facility_id, document_id = str(document.facility_id), str(document.pk)
    transaction.on_commit(lambda: render_document.delay(facility_id, document_id))


def source_changed(kind: str, source_id: Any) -> None:
    """After a change of the source (S7a `_bump`): re-render, if it has a document."""
    document = Document.objects.filter(kind=kind, source_id=source_id).first()
    if document is not None:
        schedule_render(document)


def for_prescription(prescription: Any, *, request: Any = None) -> Document:
    """Prescription issued (S7a `issue()`): the document keeps the RX number."""
    return create(
        DocumentKind.PRESCRIPTION,
        source_id=prescription.pk,
        consultation=prescription.consultation,
        author_membership=prescription.prescriber_membership,
        number=prescription.number,
        issued_at=prescription.issued_at,
        valid_until=prescription.expires_at,
        request=request,
    )


SOURCES: dict[str, type[Referral] | type[LabRequest] | type[SickNote]] = {
    DocumentKind.REFERRAL: Referral,
    DocumentKind.LAB_REQUEST: LabRequest,
    DocumentKind.SICK_NOTE: SickNote,
}


def sign_source(row: Any, kind: str, *, request: Any = None) -> Document:
    """Sign a letter or request (with its consultation or on its own) and create its document."""
    row.signed_at = timezone.now()
    row.save(update_fields=["signed_at", "updated_at"])
    document = create(
        kind,
        source_id=row.pk,
        consultation=row.consultation,
        author_membership=row.author_membership,
        issued_at=row.signed_at,
        request=request,
    )
    row.document = document
    row.save(update_fields=["document", "updated_at"])
    record(
        "documents.source_signed",
        request=request,
        facility_id=row.facility_id,
        object_type=f"documents.{kind}",
        object_id=row.pk,
        metadata={"document_id": str(document.pk), "kind": kind},
    )
    return document


def sign_drafts(consultation: Any, *, request: Any = None) -> None:
    """`consultation_signed` receiver body: sign the consultation's draft letters and requests."""
    for kind, model in SOURCES.items():
        for row in model.objects.select_for_update().filter(
            consultation=consultation, signed_at__isnull=True
        ):
            sign_source(row, kind, request=request)


# ---- text of the free-text fields (encrypted, as S7a D-3) --------------------------------------


def set_reason(row: Referral | LabRequest, text: str) -> None:
    row.reason_enc = encrypt(text, table=row._meta.db_table, column="reason_enc", row_id=row.pk)


def reason(row: Referral | LabRequest) -> str:
    if not row.reason_enc:
        return ""
    return decrypt(
        bytes(row.reason_enc), table=row._meta.db_table, column="reason_enc", row_id=row.pk
    )


# ---- render (after commit, in the documents queue) ---------------------------------------------


def _date(value: dt.date | dt.datetime | None) -> str:
    if value is None:
        return ""
    if isinstance(value, dt.datetime):
        value = timezone.localtime(value).date()
    return value.strftime("%d/%m/%Y")


WORDS: dict[str, dict[str, str]] = {
    "en": {
        "items": "Medicines",
        "quantity": "Quantity {n}",
        "no_substitution": "Do not substitute.",
        "to": "To",
        "specialty": "Specialty",
        "urgency": "Urgency",
        "reason": "Reason",
        "tests": "Tests",
        "rest": "Unfit for work or school from {start} to {end} inclusive.",
        "diagnosis": "Diagnosis",
        "routine": "Routine",
        "urgent": "Urgent",
        "emergency": "Emergency",
    },
    "fr": {
        "items": "Médicaments",
        "quantity": "Quantité {n}",
        "no_substitution": "Ne pas substituer.",
        "to": "Pour",
        "specialty": "Spécialité",
        "urgency": "Urgence",
        "reason": "Motif",
        "tests": "Examens",
        "rest": "Inapte au travail ou à l'école du {start} au {end} inclus.",
        "diagnosis": "Diagnostic",
        "routine": "Normale",
        "urgent": "Urgente",
        "emergency": "Extrême urgence",
    },
    "rw": {
        "items": "Imiti",
        "quantity": "Ingano {n}",
        "no_substitution": "Ntihindurwe undi muti.",
        "to": "Kuri",
        "specialty": "Ubuhanga",
        "urgency": "Byihutirwa",
        "reason": "Impamvu",
        "tests": "Ibizamini",
        "rest": "Ntashobora gukora cyangwa kujya ku ishuri kuva {start} kugeza {end}.",
        "diagnosis": "Indwara",
        "routine": "Bisanzwe",
        "urgent": "Byihutirwa",
        "emergency": "Byihutirwa cyane",
    },
}


def _w(lang: str, key: str, **values: Any) -> str:
    text = WORDS.get(lang, WORDS["en"])[key]
    return text.format(**values) if values else text


def _prescription_sections(document: Document, lang: str) -> list[dict[str, Any]]:
    from medilink.pharmacy import labels as rx_labels
    from medilink.pharmacy import services as rx
    from medilink.pharmacy.models import ItemStatus, Prescription

    prescription = Prescription.objects.prefetch_related("items").get(pk=document.source_id)
    frequency = rx_labels.FREQUENCY.get(lang, rx_labels.FREQUENCY["en"])
    route = rx_labels.ROUTE.get(lang, rx_labels.ROUTE["en"])
    lines = []
    items = [i for i in prescription.items.all() if i.status != ItemStatus.CANCELLED]
    for n, item in enumerate(items, start=1):
        parts = [item.dose, frequency.get(item.frequency_code, ""), route.get(item.route, "")]
        if item.duration_days:
            parts.append(
                rx_labels.DAYS[lang if lang in rx_labels.DAYS else "en"].format(
                    n=item.duration_days
                )
            )
        text = f"{n}. {item.drug_display}: " + ", ".join(p for p in parts if p) + ". "
        text += _w(lang, "quantity", n=item.quantity) + "."
        extra = rx.instructions(item)
        if extra:
            text += f" {extra}"
        if not item.substitution_allowed:
            text += " " + _w(lang, "no_substitution")
        lines.append(text)
    return [{"heading": _w(lang, "items"), "lines": lines}]


def _source_sections(document: Document, lang: str) -> list[dict[str, Any]]:
    row = SOURCES[document.kind].objects.get(pk=document.source_id)
    if isinstance(row, Referral):
        return [
            {
                "heading": "",
                "lines": [
                    f"{_w(lang, 'to')}: {row.to_facility_name}",
                    f"{_w(lang, 'specialty')}: {row.specialty}",
                    f"{_w(lang, 'urgency')}: {_w(lang, row.urgency)}",
                ],
            },
            {"heading": _w(lang, "reason"), "lines": [reason(row)]},
        ]
    if isinstance(row, LabRequest):
        tests = [f"{t.get('code', '')} {t.get('name', '')}".strip() for t in row.tests]
        return [
            {"heading": _w(lang, "tests"), "lines": [f"• {t}" for t in tests]},
            {"heading": _w(lang, "reason"), "lines": [reason(row)]},
        ]
    lines = [_w(lang, "rest", start=_date(row.rest_from), end=_date(row.rest_to))]
    sections = [{"heading": "", "lines": lines}]
    if row.show_diagnosis:
        primary = row.consultation.diagnoses.filter(rank="primary").first()
        if primary is not None and not primary.is_sensitive:
            sections.append({"heading": _w(lang, "diagnosis"), "lines": [primary.display]})
    return sections


def content_of(document: Document, record_: VerificationRecord) -> dict[str, Any]:
    from medilink.facilities.models import Profile

    lang = document.language
    patient = document.patient
    profile = Profile.objects.filter(facility_id=document.facility_id).first()
    if document.kind == DocumentKind.PRESCRIPTION:
        sections = _prescription_sections(document, lang)
    else:
        sections = _source_sections(document, lang)
    verify_url = f"{settings.PATIENT_APP_URL.rstrip('/')}/verify"
    return {
        "kind": document.kind,
        "language": lang,
        "title": label(lang, document.kind),
        "number": document.number,
        "date": _date(record_.issued_at),
        "valid_until": _date(record_.valid_until),
        "facility": {
            "name": record_.facility_name,
            "address": profile.address if profile else "",
            "phone": profile.phone if profile else "",
        },
        "patient": {"name": str(patient.full_name), "born": _date(patient.date_of_birth)},
        "sections": sections,
        "author": {"name": record_.author_name, "licence": record_.author_licence},
        "verify": {
            "code": record_.code,
            "url": verify_url.split("://", 1)[-1],
            "link": f"{verify_url}/{record_.code}",
        },
    }


def _status(document: Document) -> str:
    if document.kind != DocumentKind.PRESCRIPTION:
        return VerificationStatus.ACTIVE
    from medilink.pharmacy.models import Prescription, PrescriptionStatus

    status = Prescription.objects.values_list("status", flat=True).get(pk=document.source_id)
    statuses: dict[str, str] = {
        PrescriptionStatus.DISPENSED: VerificationStatus.DISPENSED,
        PrescriptionStatus.CANCELLED: VerificationStatus.CANCELLED,
        PrescriptionStatus.EXPIRED: VerificationStatus.EXPIRED,
    }
    return statuses.get(str(status), VerificationStatus.ACTIVE)


FROZEN = (VerificationStatus.CANCELLED, VerificationStatus.EXPIRED)


def render(document_id: Any) -> DocumentVersion | None:
    """Render the current content; store a version only when it changed. Always refreshes the
    verification status and details. Runs in the document's facility RLS context."""
    from medilink.uploads.storage import get_storage

    with transaction.atomic():
        document = (
            Document.objects.select_for_update(of=("self",))
            .select_related("patient", "consultation")
            .get(pk=document_id)
        )
        record_ = VerificationRecord.objects.select_for_update().get(document=document)
        record_.status = _status(document)
        latest = document.versions.first()
        if latest is not None and record_.status in FROZEN:
            # cancelled or expired: the last version stays as printed; only the status changes
            record_.save(update_fields=["status", "updated_at"])
            return None
        content = content_of(document, record_)
        source_hash = hashlib.sha256(
            json.dumps(content, sort_keys=True, ensure_ascii=False).encode()
        ).digest()
        details = {
            "patient_name": content["patient"]["name"],
            "valid_until": content["valid_until"],
            "sections": content["sections"],
        }
        record_.details_enc = encrypt(
            json.dumps(details, ensure_ascii=False),
            table="documents_verification_record",
            column="details_enc",
            row_id=record_.pk,
        )
        if latest is not None and bytes(latest.source_hash) == source_hash:
            record_.save(update_fields=["status", "details_enc", "updated_at"])
            return None
        version_no = (latest.version_no + 1) if latest else 1
        pdf = render_pdf({**content, "version_no": version_no})
        key = f"gen-{uuid.uuid4()}"  # flat keys only (uploads storage); the row holds the rest
        get_storage().put(BUCKET, key, io.BytesIO(pdf), PDF)
        now = timezone.now()
        if latest is not None:
            latest.superseded_at = now
            latest.save(update_fields=["superseded_at"])
            _audit("documents.superseded", document, version_no=latest.version_no)
        version = DocumentVersion.objects.create(
            facility_id=document.facility_id,
            document=document,
            version_no=version_no,
            storage_key=key,
            size_bytes=len(pdf),
            sha256=hashlib.sha256(pdf).digest(),
            source_hash=source_hash,
        )
        record_.version_no = version_no
        record_.save(update_fields=["status", "details_enc", "version_no", "updated_at"])
    return version


def details(record_: VerificationRecord) -> dict[str, Any]:
    if not record_.details_enc:
        return {"patient_name": "", "valid_until": "", "sections": []}
    return dict(
        json.loads(
            decrypt(
                bytes(record_.details_enc),
                table="documents_verification_record",
                column="details_enc",
                row_id=record_.pk,
            )
        )
    )


# ---- files: links, print, archive ---------------------------------------------------------------


def current_version(document: Document) -> DocumentVersion:
    version = document.versions.filter(superseded_at__isnull=True).first()
    if version is None:
        raise BusinessRuleViolation(NOT_READY)
    return version


NOT_READY = _("This document is still being prepared. Try again in a moment.")


def filename(document: Document) -> str:
    return f"{document.number}.pdf"


def download_link(document: Document) -> Any:
    from medilink.uploads.storage import get_storage

    version = current_version(document)
    return get_storage().signed_download_url(
        BUCKET, version.storage_key, filename(document), PDF, "attachment", LINK_TTL
    )


def archive(files: list[tuple[str, str]]) -> Any:
    """A ZIP of (filename, storage key) pairs, the current versions, stored under an `arch-` key
    and returned as a 5-minute link (contract D4, D-12). The bucket expires `arch-` objects."""
    from medilink.uploads.storage import get_storage

    storage = get_storage()
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, key in files[:ARCHIVE_LIMIT]:
            with storage.open(BUCKET, key) as stream:
                zf.writestr(name, stream.read())
    key = f"arch-{uuid.uuid4()}"
    buffer.seek(0)
    storage.put(BUCKET, key, buffer, "application/zip")
    return storage.signed_download_url(
        BUCKET, key, "medilink-documents.zip", "application/zip", "attachment", LINK_TTL
    )


# ---- share links ---------------------------------------------------------------------------------


def token_hash(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()


@dataclass(frozen=True)
class NewShareLink:
    link: ShareLink
    token: str


def share(document: Document, *, account: Any, days: int, request: Any = None) -> NewShareLink:
    token = secrets.token_urlsafe(32)
    link = ShareLink.objects.create(
        document=document,
        created_by_account=account,
        token_hash=token_hash(token),
        expires_at=timezone.now() + dt.timedelta(days=days),
    )
    _audit("documents.shared", document, request, link_id=str(link.pk), days=days)
    return NewShareLink(link, token)


def revoke_share(link: ShareLink, document: Document, *, request: Any = None) -> None:
    if link.revoked_at is None:
        link.revoked_at = timezone.now()
        link.save(update_fields=["revoked_at", "updated_at"])
        _audit("documents.share_revoked", document, request, link_id=str(link.pk))


def purge_share_links(*, now: dt.datetime | None = None) -> int:
    """R-TMP: links 30 days past expiry or revocation are deleted (contract §5)."""
    cutoff = (now or timezone.now()) - dt.timedelta(days=30)
    expired = ShareLink.objects.filter(expires_at__lt=cutoff)
    revoked = ShareLink.objects.filter(revoked_at__lt=cutoff)
    count = expired.count() + revoked.exclude(expires_at__lt=cutoff).count()
    expired.delete()
    revoked.delete()
    return count
