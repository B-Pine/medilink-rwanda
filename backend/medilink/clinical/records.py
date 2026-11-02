"""S6b records (contract sprint-06 §2.2, §3.3): scanned documents and outside results (L2, R1),
structured back-entry (L3) and health attributes (blood group, pregnancy).

Uploads go through the S1 pipeline with the `clinical_document` purpose; reads go through the
audited download link of this module, never the generic upload read policy.
"""

from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from medilink.clinical.models import (
    BLOOD_GROUPS,
    PREGNANCY_VALUES,
    AttributeKind,
    ClinicalScan,
    Consultation,
    DocumentType,
    HealthAttribute,
    HistoryEntry,
    HistoryKind,
    ResultReview,
    ResultStatus,
)
from medilink.core.exceptions import BusinessRuleViolation, Conflict
from medilink.patients.audit import record_patient_event
from medilink.patients.crypto.fields import decrypt, encrypt
from medilink.patients.errors import FieldRule
from medilink.uploads.purposes import UploadPurpose, get_purpose, register

DOCUMENT_PURPOSE = "clinical_document"
FUTURE_DATE = _("This date is in the future.")
UNKNOWN_UPLOAD = _("Upload the file first, then attach it.")
NO_REVIEWER = _("No doctor can review this result yet: a doctor must upload it.")
ALREADY_REVIEWED = _("This result was already reviewed.")
NOT_ASSIGNED = _("This result is assigned to another doctor.")
STALE = _("This result was changed meanwhile. Reload and try again.")
BAD_VALUE = _("Choose a value from the list.")
NEED_DUE_DATE = _("Give the expected due date.")
NEED_CODE = _("Choose an ICD-10 code for a diagnosis.")


# ---- upload purpose ---------------------------------------------------------------------------


def _can_upload(principal: Any, fields: dict[str, Any]) -> bool:
    return principal.audience == "staff" and bool(
        {"documents.upload", "records.import_clinical"} & set(principal.permissions)
    )


def _can_read(principal: Any, file: Any) -> bool:
    """Reads only through the audited clinical download link (relationship rule)."""
    return False


def register_document_purpose() -> None:
    if get_purpose(DOCUMENT_PURPOSE) is not None:
        return
    register(
        UploadPurpose(
            code=DOCUMENT_PURPOSE,
            audiences=frozenset({"staff"}),
            owner_kind="patient",
            data_class="C3",
            content_types=frozenset(
                {"image/jpeg", "image/png", "image/heic", "image/heif", "application/pdf"}
            ),
            max_bytes=10 * 2**20,
            can_upload=_can_upload,
            can_read=_can_read,
            unattached_ttl_hours=24,
        )
    )


# ---- scans and results ------------------------------------------------------------------------


def _reviewer(record: Any, uploader: Any) -> Any:
    """The uploader when they are a clinician, else the doctor of the patient's latest
    consultation at the facility (contract §2.2 Results inbox)."""
    from medilink.tenancy.services import membership_permissions

    if "clinical.view" in membership_permissions(uploader):
        return uploader
    latest = (
        Consultation.objects.filter(facility_id=record.facility_id, patient_id=record.patient_id)
        .order_by("-started_at")
        .select_related("author_membership")
        .first()
    )
    if latest is None or not latest.author_membership.is_active:
        raise BusinessRuleViolation(NO_REVIEWER)
    return latest.author_membership


def add_scan(
    record: Any,
    *,
    upload_id: Any,
    document_type: str,
    document_date: Any,
    description: str,
    membership: Any,
    request: Any,
) -> ClinicalScan:
    from medilink.uploads.models import UploadedFile
    from medilink.uploads.services import NotClean, UploadRejected, attach

    if document_date > timezone.localdate():
        raise FieldRule("document_date", FUTURE_DATE)
    with transaction.atomic():
        upload = UploadedFile.objects.select_for_update().filter(pk=upload_id).first()
        if upload is None:
            raise FieldRule("upload_id", UNKNOWN_UPLOAD)
        reviewer = (
            _reviewer(record, membership) if document_type == DocumentType.OUTSIDE_RESULT else None
        )
        scan = ClinicalScan(
            facility_id=record.facility_id,
            patient_id=record.patient_id,
            facility_patient=record,
            upload=upload,
            document_type=document_type,
            document_date=document_date,
            description=(description or "").strip()[:200],
            uploaded_by_membership=membership,
        )
        try:
            attach(
                upload,
                purpose=DOCUMENT_PURPOSE,
                owner_id=scan.pk,
                facility_id=record.facility_id,
                patient_id=record.patient_id,
                actor=request.user,
            )
        except (UploadRejected, NotClean):
            raise FieldRule("upload_id", UNKNOWN_UPLOAD) from None
        scan.save()
        if reviewer is not None:
            ResultReview.objects.create(
                facility_id=record.facility_id,
                scan=scan,
                patient_id=record.patient_id,
                facility_patient=record,
                assigned_membership=reviewer,
            )
        record_patient_event(
            "clinical.scan.added",
            request=request,
            patient=record.patient,
            object_type="clinical.scan",
            object_id=scan.pk,
            metadata={"document_type": document_type},
        )
    return scan


def review_comment(review: ResultReview) -> str:
    if not review.comment_enc:
        return ""
    return decrypt(
        bytes(review.comment_enc),
        table="clinical_result_review",
        column="comment_enc",
        row_id=review.pk,
    )


def review_result(
    review_id: Any, *, version: Any, comment: str, membership: Any, request: Any
) -> ResultReview:
    with transaction.atomic():
        review = (
            ResultReview.objects.select_for_update().select_related("patient").get(pk=review_id)
        )
        if version != review.version:
            raise Conflict(STALE)
        if review.status != ResultStatus.PENDING:
            raise BusinessRuleViolation(ALREADY_REVIEWED)
        if review.assigned_membership_id != membership.pk:
            raise BusinessRuleViolation(NOT_ASSIGNED)
        comment = (comment or "").strip()[:1000]
        review.comment_enc = (
            encrypt(comment, table="clinical_result_review", column="comment_enc", row_id=review.pk)
            if comment
            else None
        )
        review.status = ResultStatus.REVIEWED
        review.reviewed_by_membership = membership
        review.reviewed_at = timezone.now()
        review.version += 1
        review.save()
        record_patient_event(
            "clinical.result.reviewed",
            request=request,
            patient=review.patient,
            object_type="clinical.result_review",
            object_id=review.pk,
        )
    return review


def scan_link(scan: ClinicalScan, *, request: Any) -> Any:
    from medilink.uploads.services import download_link

    link = download_link(scan.upload, request=request, actor=request.user, disposition="attachment")
    record_patient_event(
        "clinical.scan.downloaded",
        request=request,
        patient=scan.patient,
        object_type="clinical.scan",
        object_id=scan.pk,
    )
    return link


# ---- back-entry -------------------------------------------------------------------------------


def history_note(entry: HistoryEntry) -> str:
    if not entry.note_enc:
        return ""
    return decrypt(
        bytes(entry.note_enc), table="clinical_history_entry", column="note_enc", row_id=entry.pk
    )


def add_history_entry(
    record: Any,
    *,
    kind: str,
    code: str,
    display: str,
    note: str,
    occurred_on: Any,
    source_scan_id: Any,
    membership: Any,
    request: Any,
) -> HistoryEntry:
    """A historical entry; a back-entered allergy also becomes an unverified S3 allergy so the
    prescribing alerts see it."""
    from medilink.masterdata.models import DiagnosisCode
    from medilink.patients.models import Allergy, AllergyCategory, HealthSource, Verification

    if occurred_on is not None and occurred_on > timezone.localdate():
        raise FieldRule("occurred_on", FUTURE_DATE)
    code = (code or "").strip().upper()
    display = (display or "").strip()[:200]
    if kind == HistoryKind.DIAGNOSIS:
        found = DiagnosisCode.objects.filter(code=code, is_active=True).first()
        if found is None:
            raise FieldRule("code", NEED_CODE)
        display = display or str((found.title_i18n or {}).get("en") or code)
    if not display:
        raise FieldRule("display", BAD_VALUE)
    scan = None
    if source_scan_id:
        scan = ClinicalScan.objects.filter(pk=source_scan_id, facility_patient=record).first()
        if scan is None:
            raise FieldRule("source_scan_id", UNKNOWN_UPLOAD)
    with transaction.atomic():
        entry = HistoryEntry(
            facility_id=record.facility_id,
            patient_id=record.patient_id,
            facility_patient=record,
            kind=kind,
            code=code if kind == HistoryKind.DIAGNOSIS else "",
            display=display,
            occurred_on=occurred_on,
            source_scan=scan,
            entered_by_membership=membership,
        )
        note = (note or "").strip()[:1000]
        entry.note_enc = (
            encrypt(note, table="clinical_history_entry", column="note_enc", row_id=entry.pk)
            if note
            else None
        )
        entry.save()
        if kind == HistoryKind.ALLERGY:
            Allergy.objects.create(
                patient_id=record.patient_id,
                source=HealthSource.CLINICIAN,
                verification_status=Verification.UNVERIFIED,
                recorded_by=request.user,
                category=AllergyCategory.OTHER,
                substance_text=display[:120],
            )
        record_patient_event(
            "clinical.history_entry.added",
            request=request,
            patient=record.patient,
            object_type="clinical.history_entry",
            object_id=entry.pk,
            metadata={"kind": kind},
        )
    return entry


# ---- health attributes ------------------------------------------------------------------------


def current_attributes(patient_id: Any) -> dict[str, HealthAttribute | None]:
    out: dict[str, HealthAttribute | None] = {}
    for kind in AttributeKind.values:
        out[kind] = (
            HealthAttribute.objects.filter(patient_id=patient_id, kind=kind)
            .order_by("-recorded_at", "-created_at")
            .first()
        )
    return out


def attributes_data(patient_id: Any) -> dict[str, Any]:
    current = current_attributes(patient_id)
    blood = current[AttributeKind.BLOOD_GROUP]
    pregnancy = current[AttributeKind.PREGNANCY]
    today = timezone.localdate()
    is_pregnant = bool(
        pregnancy
        and pregnancy.value == "pregnant"
        and (pregnancy.due_date is None or pregnancy.due_date >= today)
    )
    return {
        "blood_group": blood.value if blood else None,
        "pregnancy": (
            {
                "status": pregnancy.value,
                "due_date": pregnancy.due_date,
                "recorded_at": pregnancy.recorded_at,
                "is_active": is_pregnant,
            }
            if pregnancy
            else None
        ),
    }


def record_attribute(
    record: Any, *, kind: str, value: str, due_date: Any, membership: Any, request: Any
) -> HealthAttribute:
    allowed = BLOOD_GROUPS if kind == AttributeKind.BLOOD_GROUP else PREGNANCY_VALUES
    if value not in allowed:
        raise FieldRule("value", BAD_VALUE)
    if kind == AttributeKind.PREGNANCY and value == "pregnant" and due_date is None:
        raise FieldRule("due_date", NEED_DUE_DATE)
    with transaction.atomic():
        row = HealthAttribute.objects.create(
            patient_id=record.patient_id,
            kind=kind,
            value=value,
            due_date=due_date if kind == AttributeKind.PREGNANCY and value == "pregnant" else None,
            recorded_by_membership=membership,
            recorded_at=timezone.now(),
        )
        record_patient_event(
            "clinical.health_attribute.recorded",
            request=request,
            patient=record.patient,
            object_type="patients.health_attribute",
            object_id=row.pk,
            metadata={"kind": kind},
        )
    return row
