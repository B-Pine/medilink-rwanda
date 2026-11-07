"""Legacy patient register import (contract sprint-06 §2.2 Legacy import, FR-PAT-10).

Upload a CSV (S1 pipeline, purpose `patient_import`) → map columns → preview: per row,
validation errors and likely duplicates (S3 matching) → confirm creates patients and facility
records in one transaction → rollback within 7 days if no visit is attached to any of them.
Nothing is created before confirm and no patient is notified. Raw rows are encrypted and purged
after the rollback window.
"""

from __future__ import annotations

import csv
import datetime as dt
import io
import json
from typing import Any

from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from medilink.audit.services import record
from medilink.clinical.models import ImportBatch, ImportRow, ImportRowStatus, ImportStatus
from medilink.core.exceptions import BusinessRuleViolation, Conflict
from medilink.patients.crypto.fields import decrypt, encrypt
from medilink.patients.errors import FieldRule
from medilink.uploads import sniff
from medilink.uploads.purposes import UploadPurpose, get_purpose, register

IMPORT_PURPOSE = "patient_import"
MAX_ROWS = 5000
ROLLBACK_WINDOW = dt.timedelta(days=7)
FIELDS = ("full_name", "sex", "date_of_birth", "phone", "file_number", "national_id")
REQUIRED = ("full_name", "sex")
SEX = {
    "m": "male",
    "male": "male",
    "gabo": "male",
    "h": "male",
    "homme": "male",
    "f": "female",
    "female": "female",
    "gore": "female",
    "femme": "female",
}
DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y")
HINTS = {
    "full_name": ("name", "full name", "names", "amazina", "nom", "patient"),
    "sex": ("sex", "gender", "igitsina", "sexe"),
    "date_of_birth": ("dob", "date of birth", "birth date", "born", "itariki", "naissance"),
    "phone": ("phone", "telephone", "mobile", "tel", "telefone"),
    "file_number": ("file", "file number", "file no", "dossier", "number", "no"),
    "national_id": ("national id", "nid", "id number", "indangamuntu"),
}

STALE = _("This import was changed meanwhile. Reload and try again.")
WRONG_STATE = _("This import can't do that in its current state.")
NOT_CSV = _("Upload a CSV file with a header row.")
TOO_MANY = _("A file can hold at most 5,000 rows. Split it and import each part.")
EMPTY = _("The file has no rows under the header.")
BAD_MAPPING = _("Map each field to a column of the file, at least the name and the sex.")
WINDOW_PASSED = _("The 7-day rollback window has passed.")
HAS_VISITS = _("Some imported patients already have visits: the import can't be rolled back.")


class ImportFileError(Exception):
    pass


# ---- upload purpose ---------------------------------------------------------------------------


def _can_upload(principal: Any, fields: dict[str, Any]) -> bool:
    return principal.audience == "staff" and "records.import" in principal.permissions


def register_import_purpose() -> None:
    if get_purpose(IMPORT_PURPOSE) is not None:
        return
    register(
        UploadPurpose(
            code=IMPORT_PURPOSE,
            audiences=frozenset({"staff"}),
            owner_kind="facility",
            data_class="C3",
            content_types=frozenset({sniff.CSV}),
            max_bytes=5 * 2**20,
            can_upload=_can_upload,
            unattached_ttl_hours=24,
        )
    )


# ---- reading ----------------------------------------------------------------------------------


def parse_csv(data: bytes) -> tuple[list[str], list[list[str]]]:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = data.decode("latin-1")
    sample = text[:4096]
    try:
        dialect: Any = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    rows = [r for r in csv.reader(io.StringIO(text), dialect) if any(c.strip() for c in r)]
    if not rows or len(rows[0]) < 2:
        raise ImportFileError(str(NOT_CSV))
    headers = [h.strip()[:80] for h in rows[0]]
    body = rows[1:]
    if not body:
        raise ImportFileError(str(EMPTY))
    if len(body) > MAX_ROWS:
        raise ImportFileError(str(TOO_MANY))
    return headers, body


def suggest_mapping(headers: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    lowered = {h.lower().strip(): h for h in headers}
    for field, hints in HINTS.items():
        for hint in hints:
            if hint in lowered and lowered[hint] not in out.values():
                out[field] = lowered[hint]
                break
    return out


def _raw(row: ImportRow) -> dict[str, str]:
    if not row.raw_enc:
        return {}
    return dict(
        json.loads(
            decrypt(
                bytes(row.raw_enc), table="patients_import_row", column="raw_enc", row_id=row.pk
            )
        )
    )


def _audit(action: str, request: Any, batch: ImportBatch, **metadata: Any) -> None:
    record(
        action,
        request=request,
        facility_id=batch.facility_id,
        object_type="patients.import_batch",
        object_id=batch.pk,
        metadata={"batch_id": str(batch.pk), **metadata},
    )


def create_batch(*, upload_id: Any, membership: Any, request: Any) -> ImportBatch:
    from medilink.uploads.models import UploadedFile
    from medilink.uploads.services import NotClean, UploadRejected, attach
    from medilink.uploads.storage import get_storage

    upload = UploadedFile.objects.filter(pk=upload_id).first()
    if upload is None:
        raise FieldRule("upload_id", NOT_CSV)
    with get_storage().open("documents", str(upload.storage_key)) as stream:
        data = stream.read()
    try:
        headers, body = parse_csv(data)
    except ImportFileError as exc:
        raise FieldRule("upload_id", str(exc)) from None
    with transaction.atomic():
        batch = ImportBatch(
            facility_id=membership.facility_id,
            upload=upload,
            headers=headers,
            column_mapping=suggest_mapping(headers),
            row_count=len(body),
            created_by_membership=membership,
        )
        try:
            attach(
                upload,
                purpose=IMPORT_PURPOSE,
                owner_id=batch.pk,
                facility_id=membership.facility_id,
                actor=request.user,
            )
        except (UploadRejected, NotClean):
            raise FieldRule("upload_id", NOT_CSV) from None
        batch.save()
        for number, cells in enumerate(body, start=2):
            row = ImportRow(facility_id=batch.facility_id, batch=batch, row_number=number)
            raw = {
                headers[i]: (cells[i] if i < len(cells) else "").strip()
                for i in range(len(headers))
            }
            row.raw_enc = encrypt(
                json.dumps(raw), table="patients_import_row", column="raw_enc", row_id=row.pk
            )
            row.save()
        _audit("patients.import.uploaded", request, batch, row_count=batch.row_count)
    return batch


def _locked(batch_id: Any, version: Any) -> ImportBatch:
    batch = ImportBatch.objects.select_for_update().get(pk=batch_id)
    if version != batch.version:
        raise Conflict(STALE)
    return batch


# ---- validation and preview -------------------------------------------------------------------


def _date(value: str) -> dt.date | None:
    for fmt in DATE_FORMATS:
        try:
            return dt.datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def normalize_row(
    raw: dict[str, str], mapping: dict[str, str]
) -> tuple[dict[str, Any], list[dict[str, str]], str]:
    """(normalized without national ID, errors, national ID or "")."""
    from medilink.patients.normalize import InvalidValue, normalize_file_number, normalize_phone

    def cell(field: str) -> str:
        column = mapping.get(field)
        return (raw.get(column, "") if column else "").strip()

    errors: list[dict[str, str]] = []
    name = " ".join(cell("full_name").split())[:200]
    if len(name) < 2:
        errors.append({"field": "full_name", "code": "required"})
    sex = SEX.get(cell("sex").lower())
    if sex is None:
        errors.append({"field": "sex", "code": "invalid"})
    dob: dt.date | None = None
    if cell("date_of_birth"):
        dob = _date(cell("date_of_birth"))
        if dob is None:
            errors.append({"field": "date_of_birth", "code": "invalid"})
        elif dob > timezone.localdate() or dob.year < 1900:
            errors.append({"field": "date_of_birth", "code": "out_of_range"})
            dob = None
    phone = None
    if cell("phone"):
        try:
            phone = normalize_phone(cell("phone"))
        except InvalidValue:
            errors.append({"field": "phone", "code": "invalid"})
    national_id = cell("national_id")
    if national_id and not (
        national_id.replace(" ", "").isdigit() and len(national_id.replace(" ", "")) == 16
    ):
        errors.append({"field": "national_id", "code": "invalid"})
        national_id = ""
    normalized = {
        "full_name": name,
        "sex": sex,
        "date_of_birth": dob.isoformat() if dob else None,
        "phone_e164": phone,
        "file_number": normalize_file_number(cell("file_number")),
        "has_national_id": bool(national_id),
    }
    return normalized, errors, national_id.replace(" ", "")


def set_mapping(
    batch_id: Any, *, version: Any, mapping: dict[str, str], request: Any
) -> ImportBatch:
    """Validate every row against the mapping and look for likely duplicates (preview)."""
    from medilink.patients.matching import find_matches
    from medilink.patients.models import FacilityPatient

    with transaction.atomic():
        batch = _locked(batch_id, version)
        if batch.status not in (ImportStatus.UPLOADED, ImportStatus.PREVIEWED):
            raise BusinessRuleViolation(WRONG_STATE)
        clean = {k: v for k, v in mapping.items() if k in FIELDS and v}
        if any(f not in clean for f in REQUIRED) or any(
            v not in batch.headers for v in clean.values()
        ):
            raise FieldRule("mapping", BAD_MAPPING)
        existing_files = set(
            FacilityPatient.objects.filter(
                facility_id=batch.facility_id, file_number__isnull=False
            ).values_list("file_number", flat=True)
        )
        seen_files: set[str] = set()
        counts = {"valid": 0, "error": 0, "duplicate": 0}
        for row in batch.rows.select_for_update():
            normalized, errors, national_id = normalize_row(_raw(row), clean)
            file_number = normalized["file_number"]
            if file_number and (file_number in existing_files or file_number in seen_files):
                errors.append({"field": "file_number", "code": "taken"})
            if file_number:
                seen_files.add(file_number)
            row.matched_patient = None
            if errors:
                row.status = ImportRowStatus.ERROR
            else:
                matches = find_matches(
                    facility_id=batch.facility_id,
                    full_name=normalized["full_name"],
                    sex=normalized["sex"],
                    date_of_birth=dt.date.fromisoformat(normalized["date_of_birth"])
                    if normalized["date_of_birth"]
                    else None,
                    phone_e164=normalized["phone_e164"],
                    identifier=(
                        {"kind": "national_id", "issuing_country": "RW", "value": national_id}
                        if national_id
                        else None
                    ),
                )
                strong = [m for m, _fp in matches.here if m.level in ("exact_identifier", "strong")]
                exact_elsewhere = matches.external is not None
                if strong or exact_elsewhere:
                    row.status = ImportRowStatus.DUPLICATE
                    row.matched_patient = strong[0].patient if strong else matches.external.patient  # type: ignore[union-attr]
                else:
                    row.status = ImportRowStatus.VALID
            row.normalized = normalized
            row.errors = errors
            row.save(
                update_fields=["normalized", "errors", "status", "matched_patient", "updated_at"]
            )
            counts[row.status] += 1
        batch.column_mapping = clean
        batch.valid_count = counts["valid"]
        batch.error_count = counts["error"]
        batch.duplicate_count = counts["duplicate"]
        batch.status = ImportStatus.PREVIEWED
        batch.version += 1
        batch.save()
        _audit("patients.import.previewed", request, batch, **counts)
    return batch


# ---- confirm and rollback ---------------------------------------------------------------------


def confirm(batch_id: Any, *, version: Any, membership: Any, request: Any) -> ImportBatch:
    """Create a patient and a facility record per valid row, in one transaction."""
    from medilink.patients import identity
    from medilink.patients.models import CreatedVia, FacilityPatient, Patient

    with transaction.atomic():
        batch = _locked(batch_id, version)
        if batch.status != ImportStatus.PREVIEWED:
            raise BusinessRuleViolation(WRONG_STATE)
        created = 0
        today = timezone.localdate()
        for row in batch.rows.select_for_update().filter(status=ImportRowStatus.VALID):
            data = row.normalized
            patient = Patient.objects.create(
                full_name=data["full_name"],
                sex=data["sex"],
                date_of_birth=dt.date.fromisoformat(data["date_of_birth"])
                if data["date_of_birth"]
                else None,
                phone_e164=data["phone_e164"],
                # contract D-16: imported from the facility's own register
                created_via=CreatedVia.WALK_IN,
            )
            identity.assign_medilink_number(patient)
            fp = FacilityPatient.objects.create(
                facility_id=batch.facility_id,
                patient=patient,
                file_number=data["file_number"],
                first_visit_on=today,
                registered_by=request.user,
            )
            if data.get("has_national_id"):
                _n, _e, national_id = normalize_row(_raw(row), batch.column_mapping)
                if national_id:
                    try:
                        identity.add_identifier(
                            patient,
                            kind="national_id",
                            country="RW",
                            value=national_id,
                            actor=request.user,
                        )
                    except identity.IdentifierTaken:
                        raise Conflict(_("Two rows or patients share a national ID.")) from None
            row.status = ImportRowStatus.CREATED
            row.created_facility_patient = fp
            row.save(update_fields=["status", "created_facility_patient", "updated_at"])
            created += 1
        now = timezone.now()
        batch.status = ImportStatus.CONFIRMED
        batch.created_count = created
        batch.confirmed_by_membership = membership
        batch.confirmed_at = now
        batch.rollback_until = now + ROLLBACK_WINDOW
        batch.version += 1
        batch.save()
        _audit("patients.import.confirmed", request, batch, created_count=created)
    return batch


def rollback(batch_id: Any, *, version: Any, request: Any) -> ImportBatch:
    from medilink.patients.models import FacilityPatient
    from medilink.visits.models import Visit

    with transaction.atomic():
        batch = _locked(batch_id, version)
        if batch.status != ImportStatus.CONFIRMED:
            raise BusinessRuleViolation(WRONG_STATE)
        if batch.rollback_until is None or timezone.now() > batch.rollback_until:
            raise BusinessRuleViolation(WINDOW_PASSED)
        rows = list(batch.rows.select_for_update().filter(status=ImportRowStatus.CREATED))
        records = [r.created_facility_patient_id for r in rows if r.created_facility_patient_id]
        if Visit.objects.filter(facility_patient_id__in=records).exists():
            raise BusinessRuleViolation(HAS_VISITS)
        FacilityPatient.objects.filter(pk__in=records).update(is_active=False)
        for row in rows:
            row.status = ImportRowStatus.ROLLED_BACK
            row.save(update_fields=["status", "updated_at"])
        batch.status = ImportStatus.ROLLED_BACK
        batch.rolled_back_at = timezone.now()
        batch.version += 1
        batch.save()
        _audit("patients.import.rolled_back", request, batch, count=len(rows))
    return batch


def due_facilities() -> list[Any]:
    """SECURITY DEFINER: facilities with import batches to purge (no tenant context yet)."""
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute("SELECT facility_id FROM patients_import_purge_facilities()")
        return [row[0] for row in cursor.fetchall()]


def purge(facility_id: Any, now: dt.datetime | None = None) -> int:
    """Raw rows of batches past their rollback window (or never confirmed after 7 days) lose
    their raw data and names; status and error codes stay for the audit trail."""
    from django.db.models import Q

    now = now or timezone.now()
    stale = now - ROLLBACK_WINDOW
    due = ImportBatch.objects.filter(facility_id=facility_id, purged_at__isnull=True).filter(
        Q(rollback_until__lt=now)
        | Q(confirmed_at__isnull=True, created_at__lt=stale)
        | Q(status=ImportStatus.ROLLED_BACK, rolled_back_at__lt=stale)
    )
    count = 0
    for batch in due:
        with transaction.atomic():
            batch.rows.update(raw_enc=None, normalized={})
            batch.purged_at = now
            batch.save(update_fields=["purged_at", "updated_at"])
            count += 1
    return count
