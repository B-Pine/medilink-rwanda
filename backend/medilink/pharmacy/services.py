"""Prescribing and dispensing rules (contract sprint-07 §2.2). Every write runs in one transaction
under a row lock on the prescription; statuses are recomputed from the items after each change
and every change writes a `pharmacy_prescription_event`."""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Any

from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from medilink.audit.services import record
from medilink.clinical import alerts as clinical_alerts
from medilink.clinical.models import Consultation, ConsultationStatus
from medilink.core.exceptions import BusinessRuleViolation, Conflict
from medilink.documents import services as documents
from medilink.documents.models import VerificationRecord
from medilink.documents.numbers import next_number
from medilink.facilities.models import Settings
from medilink.facilities.settings_schema import with_defaults
from medilink.masterdata.models import Drug
from medilink.patients.crypto.fields import decrypt, encrypt
from medilink.patients.errors import FieldRule
from medilink.pharmacy import signals
from medilink.pharmacy.models import (
    OPEN_ITEM,
    PER_DAY,
    DispenseLine,
    DispenseOutcome,
    DispenseRecord,
    DrugAvailability,
    IdentityMethod,
    ItemStatus,
    Prescription,
    PrescriptionEvent,
    PrescriptionItem,
    PrescriptionQuery,
    PrescriptionStatus,
    QueryStatus,
)

STALE = _("This prescription was changed meanwhile. It was reloaded: check it and try again.")
NOT_AUTHOR = _("Only the consultation's author can write its prescription.")
NOT_DRAFT = _("The consultation is signed: cancel the item and add a new one instead.")
LOCKED = _("Issued items can't be edited. Cancel the item and add a new one.")
UNKNOWN_DRUG = _("Choose a drug from the catalogue, or type its name as free text.")
OVERRIDE_REQUIRED = _("Give a reason for prescribing despite the allergy before signing.")
ALREADY_DISPENSED = _("This was already dispensed, in part or in full, and can't be cancelled.")
NOT_OPEN = _("Nothing is left to dispense on this item.")
TOO_MUCH = _("That is more than what is left to dispense.")
NO_SUBSTITUTION = _("The doctor did not allow a substitute for this item.")
NOT_GENERIC = _("A substitute must have the same active ingredient and strength.")
NEED_REASON = _("Give a reason.")
CONTROLLED = _("Confirm the controlled medicine check before signing the dispensing.")
NOT_DISPENSABLE = _("This prescription can't be dispensed now.")
WRONG_CODE = _("That code doesn't match this prescription.")
OPEN_QUERY = _("This prescription already has an open question.")
NOT_SAME_CONSULTATION = _("Answer with an addendum on this prescription's consultation.")
QUERY_NOT_OPEN = _("This question is no longer open.")
QUERY_NOT_ANSWERED = _("Close the question once the doctor has answered it.")

MIN_REASON = 5


class AlertOverrideRequired(BusinessRuleViolation):
    default_code = "alert_override_required"
    default_detail = OVERRIDE_REQUIRED


PREFIX = "RX"


def _setting(facility_id: Any, section: str, name: str) -> Any:
    row = Settings.objects.filter(facility_id=facility_id).first()
    values = getattr(row, section, None) or {}
    return with_defaults(section, values)[name]


def _event(
    prescription: Prescription,
    *,
    to_status: str,
    from_status: str = "",
    item: PrescriptionItem | None = None,
    actor: Any = None,
    reason: str = "",
) -> None:
    PrescriptionEvent.objects.create(
        facility_id=prescription.facility_id,
        prescription=prescription,
        item=item,
        from_status=from_status,
        to_status=to_status,
        actor=actor,
        reason=reason[:300],
        occurred_at=timezone.now(),
    )


def _audit(action: str, request: Any, prescription: Prescription, **metadata: Any) -> None:
    record(
        action,
        request=request,
        facility_id=prescription.facility_id,
        object_type="pharmacy.prescription",
        object_id=prescription.pk,
        metadata={"prescription_id": str(prescription.pk), **metadata},
    )


def _locked(prescription_id: Any, version: Any = None) -> Prescription:
    prescription = (
        Prescription.objects.select_for_update(of=("self",))
        .select_related("patient", "consultation")
        .get(pk=prescription_id)
    )
    if version is not None and version != prescription.version:
        raise Conflict(STALE)
    return prescription


def _bump(prescription: Prescription) -> None:
    prescription.version += 1
    prescription.save(update_fields=["version", "status", "updated_at"])
    # S7b: the prescription document follows (new version, verification status)
    documents.source_changed("prescription", prescription.pk)


# ---- instructions ---------------------------------------------------------------------------


def set_instructions(item: PrescriptionItem, text: str) -> None:
    text = (text or "").strip()[:500]
    item.instructions_enc = (
        encrypt(text, table="pharmacy_prescription_item", column="instructions_enc", row_id=item.pk)
        if text
        else None
    )


def instructions(item: PrescriptionItem) -> str:
    if not item.instructions_enc:
        return ""
    return decrypt(
        bytes(item.instructions_enc),
        table="pharmacy_prescription_item",
        column="instructions_enc",
        row_id=item.pk,
    )


def query_message(query: PrescriptionQuery) -> str:
    return decrypt(
        bytes(query.message_enc),
        table="pharmacy_prescription_query",
        column="message_enc",
        row_id=query.pk,
    )


# ---- availability and alerts ------------------------------------------------------------------


def unavailable_codes(facility_id: Any, codes: list[str] | None = None) -> set[str]:
    rows = DrugAvailability.objects.filter(facility_id=facility_id, is_available=False)
    if codes is not None:
        rows = rows.filter(drug__code__in=codes)
    return set(rows.values_list("drug__code", flat=True))


@dataclass
class ItemInput:
    drug_code: str = ""
    free_text_drug: str = ""
    dose: str = ""
    frequency_code: str = ""
    route: str = ""
    duration_days: int | None = None
    quantity: int | None = None
    instructions: str = ""
    substitution_allowed: bool = True
    alert_overrides: list[dict[str, str]] | None = None


def default_quantity(dose: str, frequency_code: str, duration_days: int | None) -> int | None:
    """dose x times a day x days, when the dose starts with a whole number ("2 tablets")."""
    per_day = PER_DAY.get(frequency_code)
    if not per_day or not duration_days:
        return None
    head = (dose or "").strip().split(" ", 1)[0]
    if not head.isdigit():
        return None
    return int(head) * per_day * duration_days


def _drug(code: str) -> Drug:
    drug = Drug.objects.filter(code=code, is_active=True).first()
    if drug is None:
        raise FieldRule("drug_code", UNKNOWN_DRUG)
    return drug


def _apply(item: PrescriptionItem, data: ItemInput) -> None:
    if data.drug_code:
        drug = _drug(data.drug_code)
        item.drug = drug
        item.drug_code = drug.code
        item.drug_display = f"{drug.generic_name} {drug.strength} {drug.form}".strip()
        item.is_controlled = drug.is_controlled
        item.free_text_drug = ""
        item.is_off_catalogue = False
    elif data.free_text_drug.strip():
        item.drug = None
        item.drug_code = ""
        item.free_text_drug = data.free_text_drug.strip()[:120]
        item.drug_display = item.free_text_drug
        item.is_controlled = False
        item.is_off_catalogue = True
    else:
        raise FieldRule("drug_code", UNKNOWN_DRUG)
    item.dose = data.dose.strip()[:60]
    item.frequency_code = data.frequency_code
    item.route = data.route
    item.duration_days = data.duration_days
    quantity = data.quantity or default_quantity(item.dose, item.frequency_code, data.duration_days)
    if not quantity or quantity < 1:
        raise FieldRule("quantity", _("Give the quantity to dispense."))
    item.quantity = quantity
    item.substitution_allowed = data.substitution_allowed
    overrides = []
    for override in data.alert_overrides or []:
        reason = str(override.get("reason", "")).strip()
        kind = str(override.get("kind", ""))
        if kind in ("allergy", "duplicate", "dose") and reason:
            overrides.append({"kind": kind, "reason": reason[:300]})
    item.alert_overrides = overrides
    set_instructions(item, data.instructions)


def alerts_for(prescription: Prescription) -> list[dict[str, Any]]:
    """S6 alert check on the open catalogue items, each alert with the item it concerns and
    whether that item carries an override for its kind."""
    items = [
        i
        for i in prescription.items.select_related("drug").all()
        if i.drug_id and i.status not in (ItemStatus.CANCELLED, ItemStatus.EXPIRED)
    ]
    if not items:
        return []
    found = clinical_alerts.check(
        prescription.patient, [(i.drug, i.quantity) for i in items if i.drug is not None]
    )
    by_code: dict[str, list[PrescriptionItem]] = {}
    for item in items:
        by_code.setdefault(item.drug_code, []).append(item)
    out: list[dict[str, Any]] = []
    for alert in found:
        for item in by_code.get(alert.drug_code, []):
            kinds = {o["kind"] for o in item.alert_overrides}
            out.append({**alert.as_dict(), "item_id": item.pk, "overridden": alert.kind in kinds})
    return out


# ---- drafting ---------------------------------------------------------------------------------


def _draft_prescription(consultation: Consultation) -> Prescription:
    existing = Prescription.objects.select_for_update().filter(consultation=consultation).first()
    if existing:
        return existing
    return Prescription.objects.create(
        facility_id=consultation.facility_id,
        visit_id=consultation.visit_id,
        consultation=consultation,
        patient_id=consultation.patient_id,
        facility_patient_id=consultation.facility_patient_id,
        prescriber_membership_id=consultation.author_membership_id,
    )


def add_item(
    consultation_id: Any,
    data: ItemInput,
    *,
    membership: Any,
    request: Any,
    replaces_item_id: Any = None,
) -> Prescription:
    with transaction.atomic():
        consultation = Consultation.objects.select_for_update().get(pk=consultation_id)
        if consultation.status == ConsultationStatus.ENTERED_IN_ERROR:
            raise BusinessRuleViolation(NOT_DRAFT)
        if consultation.status == ConsultationStatus.DRAFT:
            if consultation.author_membership_id != getattr(membership, "pk", None):
                raise BusinessRuleViolation(NOT_AUTHOR)
            prescription = _draft_prescription(consultation)
            status = ItemStatus.DRAFT
        else:
            issued = (
                Prescription.objects.select_for_update().filter(consultation=consultation).first()
            )
            if issued is None or issued.status in (
                PrescriptionStatus.DRAFT,
                PrescriptionStatus.CANCELLED,
                PrescriptionStatus.EXPIRED,
            ):
                raise BusinessRuleViolation(NOT_DRAFT)
            prescription = issued
            status = ItemStatus.ISSUED
        replaced = None
        if replaces_item_id:
            replaced = (
                PrescriptionItem.objects.select_for_update()
                .filter(pk=replaces_item_id, prescription=prescription)
                .first()
            )
            if replaced is None:
                raise FieldRule("replaces_item_id", _("Unknown item."))
        item = PrescriptionItem(
            facility_id=prescription.facility_id,
            prescription=prescription,
            status=status,
            sort_order=prescription.items.count(),
            replaces_item=replaced,
        )
        _apply(item, data)
        item.save()
        if (
            replaced is not None
            and replaced.status in OPEN_ITEM
            and not replaced.dispensed_quantity
        ):
            _cancel_item(
                prescription, replaced, reason=str(_("Replaced by a new item")), request=request
            )
        if status == ItemStatus.ISSUED:
            _event(prescription, item=item, to_status=item.status, actor=request.user)
            _audit("pharmacy.prescription.item_added_after_issue", request, prescription)
            prescription.status = summarise(prescription)
        _bump(prescription)
    return prescription


def update_item(
    item_id: Any, data: ItemInput, *, version: Any, membership: Any, request: Any
) -> Prescription:
    with transaction.atomic():
        item = PrescriptionItem.objects.select_related("prescription").get(pk=item_id)
        prescription = _locked(item.prescription_id, version)
        if item.status != ItemStatus.DRAFT:
            raise BusinessRuleViolation(LOCKED)
        if prescription.prescriber_membership_id != getattr(membership, "pk", None):
            raise BusinessRuleViolation(NOT_AUTHOR)
        _apply(item, data)
        item.save()
        _bump(prescription)
    return prescription


def delete_item(item_id: Any, *, version: Any, membership: Any) -> Prescription:
    with transaction.atomic():
        item = PrescriptionItem.objects.get(pk=item_id)
        prescription = _locked(item.prescription_id, version)
        if item.status != ItemStatus.DRAFT:
            raise BusinessRuleViolation(LOCKED)
        if prescription.prescriber_membership_id != getattr(membership, "pk", None):
            raise BusinessRuleViolation(NOT_AUTHOR)
        item.delete()
        _bump(prescription)
    return prescription


# ---- issue on sign (D-1) ----------------------------------------------------------------------


def issue(consultation: Consultation, *, request: Any) -> Prescription | None:
    """Receiver body for `consultation_signed`: runs in the signing transaction."""
    prescription = (
        Prescription.objects.select_for_update().filter(consultation=consultation).first()
    )
    if prescription is None:
        return None
    items = list(prescription.items.all())
    if not items:
        prescription.delete()
        return None
    for alert in alerts_for(prescription):
        if alert["kind"] == "allergy" and not alert["overridden"]:
            raise AlertOverrideRequired()
    now = timezone.now()
    prescription.number = next_number(prescription.facility_id, PREFIX)
    prescription.issued_at = now
    days = int(_setting(prescription.facility_id, "documents", "prescription_valid_days"))
    prescription.expires_at = now + dt.timedelta(days=days)
    for item in items:
        item.status = ItemStatus.ISSUED
        item.save(update_fields=["status", "updated_at"])
    pay_first = bool(_setting(prescription.facility_id, "billing", "pay_before_dispensing"))
    prescription.status = (
        PrescriptionStatus.AWAITING_PAYMENT if pay_first else PrescriptionStatus.READY
    )
    prescription.version += 1
    prescription.save()
    _event(prescription, from_status="draft", to_status=prescription.status, actor=request.user)
    _audit(
        "pharmacy.prescription.issued",
        request,
        prescription,
        item_count=len(items),
        status=prescription.status,
    )
    documents.for_prescription(prescription, request=request)  # S7b: PDF with a QR code
    if prescription.status == PrescriptionStatus.READY:
        _signal_ready(prescription)
    return prescription


def _signal_ready(prescription: Prescription) -> None:
    """S9b: the patient and the pharmacy hear that it is ready (after commit)."""
    ids = {"prescription_id": prescription.pk, "facility_id": prescription.facility_id}
    transaction.on_commit(lambda: signals.prescription_ready.send(sender=Prescription, **ids))


def mark_covered(prescription_id: Any, *, request: Any = None) -> Prescription:
    """S8: the bill is paid or covered; `awaiting_payment` → `ready_to_dispense`."""
    with transaction.atomic():
        prescription = _locked(prescription_id)
        if prescription.status == PrescriptionStatus.AWAITING_PAYMENT:
            prescription.status = PrescriptionStatus.READY
            _event(
                prescription,
                from_status=PrescriptionStatus.AWAITING_PAYMENT,
                to_status=prescription.status,
            )
            _bump(prescription)
            _audit("pharmacy.prescription.covered", request, prescription)
            _signal_ready(prescription)
    return prescription


# ---- status summary ---------------------------------------------------------------------------


def summarise(prescription: Prescription) -> str:
    """The prescription status from its items (contract §2.1)."""
    if prescription.status in (
        PrescriptionStatus.DRAFT,
        PrescriptionStatus.CANCELLED,
        PrescriptionStatus.EXPIRED,
    ):
        return prescription.status
    items = [i for i in prescription.items.all() if i.status != ItemStatus.CANCELLED]
    if not items:
        return PrescriptionStatus.CANCELLED
    open_items = [i for i in items if i.status in OPEN_ITEM]
    if not open_items:
        if all(i.status == ItemStatus.DISPENSED for i in items):
            return PrescriptionStatus.DISPENSED
        return PrescriptionStatus.EXPIRED
    if any(i.dispensed_quantity for i in items):
        return PrescriptionStatus.PARTLY
    if all(i.status == ItemStatus.NOT_AVAILABLE for i in open_items):
        return PrescriptionStatus.NOT_AVAILABLE
    if prescription.status == PrescriptionStatus.AWAITING_PAYMENT:
        return PrescriptionStatus.AWAITING_PAYMENT
    return PrescriptionStatus.READY


# ---- cancel -----------------------------------------------------------------------------------


def _reason(reason: str) -> str:
    reason = (reason or "").strip()
    if len(reason) < MIN_REASON:
        raise FieldRule("reason", NEED_REASON)
    return reason[:300]


def _cancel_item(
    prescription: Prescription, item: PrescriptionItem, *, reason: str, request: Any
) -> None:
    before = item.status
    item.status = ItemStatus.CANCELLED
    item.cancelled_reason = str(reason)[:300]
    item.save(update_fields=["status", "cancelled_reason", "updated_at"])
    _event(
        prescription,
        item=item,
        from_status=before,
        to_status=item.status,
        actor=getattr(request, "user", None),
        reason=str(reason),
    )


def cancel_item(item_id: Any, *, version: Any, reason: str, request: Any) -> Prescription:
    reason = _reason(reason)
    with transaction.atomic():
        item = PrescriptionItem.objects.get(pk=item_id)
        prescription = _locked(item.prescription_id, version)
        if item.status == ItemStatus.DRAFT:
            raise BusinessRuleViolation(NOT_DRAFT)
        if item.dispensed_quantity or item.status not in OPEN_ITEM:
            raise BusinessRuleViolation(ALREADY_DISPENSED)
        _cancel_item(prescription, item, reason=reason, request=request)
        before = prescription.status
        prescription.status = summarise(prescription)
        if prescription.status != before:
            _event(prescription, from_status=before, to_status=prescription.status)
        _bump(prescription)
        _audit("pharmacy.prescription.item_cancelled", request, prescription, item_id=str(item.pk))
    return prescription


def cancel_prescription(
    prescription_id: Any, *, version: Any, reason: str, request: Any
) -> Prescription:
    reason = _reason(reason)
    with transaction.atomic():
        prescription = _locked(prescription_id, version)
        if prescription.status == PrescriptionStatus.DRAFT:
            raise BusinessRuleViolation(NOT_DRAFT)
        items = list(prescription.items.select_for_update())
        if any(i.dispensed_quantity for i in items) or prescription.status in (
            PrescriptionStatus.CANCELLED,
            PrescriptionStatus.EXPIRED,
            PrescriptionStatus.DISPENSED,
        ):
            raise BusinessRuleViolation(ALREADY_DISPENSED)
        for item in items:
            if item.status in OPEN_ITEM:
                _cancel_item(prescription, item, reason=reason, request=request)
        before = prescription.status
        prescription.status = PrescriptionStatus.CANCELLED
        prescription.cancelled_reason = reason
        prescription.version += 1
        prescription.save(update_fields=["status", "cancelled_reason", "version", "updated_at"])
        documents.source_changed("prescription", prescription.pk)  # S7b: verification status
        _event(
            prescription,
            from_status=before,
            to_status=prescription.status,
            actor=request.user,
            reason=reason,
        )
        _audit("pharmacy.prescription.cancelled", request, prescription)
    return prescription


# ---- dispense ---------------------------------------------------------------------------------


@dataclass
class LineInput:
    item_id: Any
    outcome: str
    quantity: int | None = None
    substitute_drug_code: str = ""
    substitution_reason: str = ""


DISPENSABLE = (
    PrescriptionStatus.READY,
    PrescriptionStatus.PARTLY,
    PrescriptionStatus.NOT_AVAILABLE,
)


def dispense(
    prescription_id: Any,
    *,
    version: Any,
    identity_check_method: str,
    verification_code: str = "",
    controlled_confirmed: bool = False,
    lines: list[LineInput],
    membership: Any,
    request: Any,
) -> Prescription:
    if not lines:
        raise FieldRule("lines", _("Record at least one item."))
    with transaction.atomic():
        prescription = _locked(prescription_id, version)
        if prescription.status not in DISPENSABLE:
            raise BusinessRuleViolation(NOT_DISPENSABLE)
        if prescription.expires_at and prescription.expires_at <= timezone.now():
            raise BusinessRuleViolation(NOT_DISPENSABLE)
        # the verification code printed under the QR code (contract D-7); the prescription
        # number, printed beside it, is still accepted
        if identity_check_method == IdentityMethod.VERIFICATION_CODE:
            given = documents.normalise_code(verification_code or "")
            accepted = {documents.normalise_code(prescription.number or "")}
            accepted |= {
                documents.normalise_code(code)
                for code in VerificationRecord.objects.filter(
                    kind="prescription", document__source_id=prescription.pk
                ).values_list("code", flat=True)
            }
            if not given or given not in accepted:
                raise FieldRule("verification_code", WRONG_CODE)
        rows = prescription.items.select_for_update(of=("self",)).select_related("drug")
        items = {str(i.pk): i for i in rows}
        seen: set[str] = set()
        prepared: list[tuple[PrescriptionItem, LineInput, int, Drug | None]] = []
        for line in lines:
            key = str(line.item_id)
            item = items.get(key)
            if item is None or key in seen:
                raise FieldRule("lines", _("Unknown or repeated item."))
            seen.add(key)
            if item.status not in OPEN_ITEM:
                raise FieldRule("lines", NOT_OPEN)
            remaining = item.quantity - item.dispensed_quantity
            substitute = None
            if line.outcome == DispenseOutcome.NOT_AVAILABLE:
                quantity = 0
            elif line.outcome == DispenseOutcome.FULL:
                quantity = remaining
            elif line.outcome in (DispenseOutcome.PARTIAL, DispenseOutcome.SUBSTITUTED):
                quantity = line.quantity if line.quantity is not None else remaining
                if quantity < 1 or quantity > remaining:
                    raise FieldRule("lines", TOO_MUCH)
                if line.outcome == DispenseOutcome.PARTIAL and quantity == remaining:
                    line.outcome = DispenseOutcome.FULL
            else:
                raise FieldRule("lines", _("Unknown outcome."))
            if line.outcome == DispenseOutcome.SUBSTITUTED:
                if not item.substitution_allowed:
                    raise FieldRule("lines", NO_SUBSTITUTION)
                substitute = Drug.objects.filter(
                    code=line.substitute_drug_code, is_active=True
                ).first()
                if (
                    substitute is None
                    or item.drug is None
                    or substitute.pk == item.drug_id
                    or substitute.generic_name.strip().lower()
                    != item.drug.generic_name.strip().lower()
                    or substitute.strength.strip().lower() != item.drug.strength.strip().lower()
                ):
                    raise FieldRule("lines", NOT_GENERIC)
                if len(line.substitution_reason.strip()) < MIN_REASON:
                    raise FieldRule("lines", NEED_REASON)
            prepared.append((item, line, quantity, substitute))
        if (
            any(
                (item.is_controlled or (sub is not None and sub.is_controlled))
                and line.outcome != DispenseOutcome.NOT_AVAILABLE
                for item, line, _q, sub in prepared
            )
            and not controlled_confirmed
        ):
            raise FieldRule("controlled_confirmed", CONTROLLED)
        record_row = DispenseRecord.objects.create(
            facility_id=prescription.facility_id,
            prescription=prescription,
            pharmacist_membership=membership,
            identity_check_method=identity_check_method,
            controlled_confirmed=controlled_confirmed,
            signed_at=timezone.now(),
        )
        for item, line, quantity, substitute in prepared:
            DispenseLine.objects.create(
                facility_id=prescription.facility_id,
                dispense_record=record_row,
                prescription_item=item,
                outcome=line.outcome,
                quantity=quantity,
                substitute_drug=substitute,
                substitute_display=(
                    f"{substitute.generic_name} {substitute.strength} {substitute.form}".strip()
                    if substitute
                    else ""
                ),
                substitution_reason=line.substitution_reason.strip()[:300] if substitute else "",
            )
            before = item.status
            item.dispensed_quantity += quantity
            if line.outcome == DispenseOutcome.NOT_AVAILABLE:
                item.status = (
                    ItemStatus.NOT_AVAILABLE if not item.dispensed_quantity else ItemStatus.PARTLY
                )
            elif item.dispensed_quantity >= item.quantity:
                item.status = ItemStatus.DISPENSED
            else:
                item.status = ItemStatus.PARTLY
            item.save(update_fields=["dispensed_quantity", "status", "updated_at"])
            if item.status != before:
                _event(
                    prescription,
                    item=item,
                    from_status=before,
                    to_status=item.status,
                    actor=request.user,
                )
        before = prescription.status
        prescription.status = summarise(prescription)
        if prescription.status != before:
            _event(prescription, from_status=before, to_status=prescription.status)
        _bump(prescription)
        _audit(
            "pharmacy.dispensed",
            request,
            prescription,
            dispense_record_id=str(record_row.pk),
            line_count=len(prepared),
            outcomes=sorted({line.outcome for _i, line, _q, _s in prepared}),
            controlled=controlled_confirmed,
        )
        ids = {
            "prescription_id": prescription.pk,
            "record_id": record_row.pk,
            "facility_id": prescription.facility_id,
        }
        transaction.on_commit(
            lambda: signals.prescription_dispensed.send(sender=Prescription, **ids)
        )
    return prescription


# ---- queries ----------------------------------------------------------------------------------


def raise_query(
    prescription_id: Any, *, message: str, membership: Any, request: Any
) -> PrescriptionQuery:
    message = (message or "").strip()
    if not message:
        raise FieldRule("message", NEED_REASON)
    with transaction.atomic():
        prescription = _locked(prescription_id)
        if prescription.status in (
            PrescriptionStatus.DRAFT,
            PrescriptionStatus.CANCELLED,
            PrescriptionStatus.EXPIRED,
        ):
            raise BusinessRuleViolation(NOT_DISPENSABLE)
        if prescription.queries.filter(status=QueryStatus.OPEN).exists():
            raise Conflict(OPEN_QUERY)
        query = PrescriptionQuery(
            facility_id=prescription.facility_id,
            prescription=prescription,
            raised_by_membership=membership,
            message_enc=b"",
        )
        query.message_enc = encrypt(
            message[:1000],
            table="pharmacy_prescription_query",
            column="message_enc",
            row_id=query.pk,
        )
        query.save()
        _audit("pharmacy.query.raised", request, prescription, query_id=str(query.pk))
        ids = {
            "query_id": query.pk,
            "prescription_id": prescription.pk,
            "facility_id": prescription.facility_id,
        }
        transaction.on_commit(lambda: signals.query_raised.send(sender=PrescriptionQuery, **ids))
    return query


def answer_query(query_id: Any, *, addendum_id: Any, request: Any) -> PrescriptionQuery:
    from medilink.clinical.models import Addendum

    with transaction.atomic():
        query = (
            PrescriptionQuery.objects.select_for_update()
            .select_related("prescription")
            .get(pk=query_id)
        )
        if query.status != QueryStatus.OPEN:
            raise BusinessRuleViolation(QUERY_NOT_OPEN)
        addendum = Addendum.objects.filter(
            pk=addendum_id, consultation_id=query.prescription.consultation_id
        ).first()
        if addendum is None:
            raise FieldRule("addendum_id", NOT_SAME_CONSULTATION)
        query.status = QueryStatus.ANSWERED
        query.answered_by_addendum = addendum
        query.answered_at = timezone.now()
        query.save(update_fields=["status", "answered_by_addendum", "answered_at", "updated_at"])
        _audit("pharmacy.query.answered", request, query.prescription, query_id=str(query.pk))
    return query


def close_query(query_id: Any, *, request: Any) -> PrescriptionQuery:
    with transaction.atomic():
        query = (
            PrescriptionQuery.objects.select_for_update()
            .select_related("prescription")
            .get(pk=query_id)
        )
        if query.status != QueryStatus.ANSWERED:
            raise BusinessRuleViolation(QUERY_NOT_ANSWERED)
        query.status = QueryStatus.CLOSED
        query.closed_at = timezone.now()
        query.save(update_fields=["status", "closed_at", "updated_at"])
        _audit("pharmacy.query.closed", request, query.prescription, query_id=str(query.pk))
    return query


# ---- availability -----------------------------------------------------------------------------


def set_availability(
    facility_id: Any, drug: Drug, *, is_available: bool, membership: Any, request: Any
) -> DrugAvailability:
    with transaction.atomic():
        row, _created = DrugAvailability.objects.select_for_update().get_or_create(
            facility_id=facility_id,
            drug=drug,
            defaults={"is_available": is_available, "updated_by_membership": membership},
        )
        if row.is_available != is_available or _created:
            row.is_available = is_available
            row.updated_by_membership = membership
            row.save(update_fields=["is_available", "updated_by_membership", "updated_at"])
        record(
            "pharmacy.availability.changed",
            request=request,
            facility_id=facility_id,
            object_type="masterdata.drug",
            object_id=drug.pk,
            metadata={"drug_code": drug.code, "is_available": is_available},
        )
    return row


# ---- expiry -----------------------------------------------------------------------------------


def expire(facility_id: Any, *, now: dt.datetime | None = None) -> int:
    """Items still waiting past `expires_at` become `expired`; returns prescriptions changed."""
    now = now or timezone.now()
    changed = 0
    due = Prescription.objects.filter(
        facility_id=facility_id,
        expires_at__lte=now,
        status__in=[
            PrescriptionStatus.ISSUED,
            PrescriptionStatus.AWAITING_PAYMENT,
            PrescriptionStatus.READY,
            PrescriptionStatus.PARTLY,
            PrescriptionStatus.NOT_AVAILABLE,
        ],
    ).values_list("pk", flat=True)
    for pk in list(due):
        with transaction.atomic():
            prescription = _locked(pk)
            for item in prescription.items.select_for_update():
                if item.status in (ItemStatus.ISSUED, ItemStatus.NOT_AVAILABLE):
                    before = item.status
                    item.status = ItemStatus.EXPIRED
                    item.save(update_fields=["status", "updated_at"])
                    _event(prescription, item=item, from_status=before, to_status=item.status)
            before = prescription.status
            # partly dispensed items keep what was given; nothing more can be dispensed
            for item in prescription.items.select_for_update():
                if item.status == ItemStatus.PARTLY:
                    item.status = ItemStatus.EXPIRED
                    item.save(update_fields=["status", "updated_at"])
                    _event(
                        prescription,
                        item=item,
                        from_status=ItemStatus.PARTLY,
                        to_status=item.status,
                    )
            prescription.status = summarise(prescription)
            if prescription.status != before:
                _event(prescription, from_status=before, to_status=prescription.status)
                _bump(prescription)
                changed += 1
    if changed:
        record(
            "pharmacy.prescription.expired",
            facility_id=facility_id,
            object_type="pharmacy.prescription",
            metadata={"count": changed},
        )
    return changed
