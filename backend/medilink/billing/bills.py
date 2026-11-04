"""Bills, payments, receipts, exemptions, approvals and shifts (contract sprint-08 §2.2).

Every money change runs in one transaction under a row lock on the bill, then `recompute()`
rebuilds the split and every total from the rows (nothing is added up from client values). Rows
that record money are append-only; corrections are new rows (void, credit note, payout).
"""

from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass
from typing import Any

from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from medilink.audit.services import record
from medilink.billing.models import (
    ApprovalKind,
    ApprovalRequest,
    ApprovalStatus,
    Bill,
    BillEvent,
    BillLine,
    BillStatus,
    CashShift,
    CreditNote,
    Exemption,
    ExemptionReason,
    InsuranceVerification,
    Payment,
    PaymentMethod,
    PaymentStatus,
    Receipt,
    ReceiptStatus,
    RefundPayout,
    ShiftStatus,
    TariffItem,
    TariffKind,
    VerificationResult,
)
from medilink.billing.services import current_q, insurer_rule, price
from medilink.core.exceptions import BusinessRuleViolation, Conflict
from medilink.documents.numbers import next_number
from medilink.facilities.models import Settings
from medilink.facilities.settings_schema import with_defaults
from medilink.patients.errors import FieldRule

STALE = _("This bill was changed meanwhile. It was reloaded: check it and try again.")
VOIDED = _("This bill is void.")
PAID_LOCK = _("Something was paid on this bill: correct it with a refund instead.")
TOO_MUCH = _("That is more than the balance.")
NEED_REFERENCE = _("Give the transaction reference.")
NEED_REASON = _("Give a reason.")
NEED_TEXT = _("Describe the reason.")
NO_EXEMPTIONS = _("This facility does not allow exemptions.")
UNKNOWN_TARIFF = _("Choose an item from the price list.")
NOT_A_LINE_KIND = _("Consultations and medicines are added automatically.")
UNKNOWN_PROFILE = _("Choose one of the patient's insurance cards.")
NEED_REFERRAL = _("This insurer needs a referral letter. Check it before verifying.")
LATER_RAISE = _("The patient already paid: a new verification can only lower their share.")
NOT_PENDING = _("This request was already decided.")
OWN_REQUEST = _("Someone else must approve a request you made.")
NOT_YOURS = _("Only the person who made the request can cancel it.")
ALREADY_VOIDED = _("This payment is already void.")
OVER_REFUND = _("That is more than what was paid and not yet refunded.")
OVER_PAYOUT = _("That is more than what is left to pay back on this credit note.")
BALANCE_CHANGED = _("The balance is now lower than this waiver. Reject it and apply a new one.")
SHIFT_OPEN = _("You already have an open shift.")
SHIFT_NOT_OPEN = _("This shift is not open.")
SHIFT_NOT_CLOSED = _("Close the shift before reviewing it.")
NOT_OWNER = _("Only the person who opened the shift can close it.")
OWN_SHIFT = _("Someone else must review your shift.")
NEED_NOTE = _("Explain the difference.")

MIN_REASON = 5
CREDIT_PREFIX = "CN"
DEFAULT_RECEIPT_PREFIX = "RC"
PREFIX_RE = re.compile(r"^[A-Z]{2,4}$")
METHODS = tuple(PaymentMethod.values)
REJECTION_REASONS = (
    "expired",
    "not_a_member",
    "not_accepted",
    "referral_missing",
    "card_unreadable",
    "other",
)
OPEN_STATUSES = (BillStatus.OPEN, BillStatus.PARTLY_PAID)


class ShiftRequired(BusinessRuleViolation):
    default_code = "shift_required"
    default_detail = _("Open a cash shift before recording money.")


class ApprovalNeeded(BusinessRuleViolation):
    default_code = "approval_required"
    default_detail = _("This needs approval by someone else.")


# ---- helpers ----------------------------------------------------------------------------------


def setting(facility_id: Any, name: str) -> Any:
    row = Settings.objects.filter(facility_id=facility_id).first()
    return with_defaults("billing", (row.billing if row else {}) or {})[name]


def receipt_prefix(facility_id: Any) -> str:
    value = str(setting(facility_id, "receipt_prefix") or "").strip().upper()
    return value if PREFIX_RE.match(value) else DEFAULT_RECEIPT_PREFIX


def _reason(text: str, field: str = "reason") -> str:
    text = (text or "").strip()
    if len(text) < MIN_REASON:
        raise FieldRule(field, NEED_REASON)
    return text[:300]


def _user(request: Any) -> Any:
    user = getattr(request, "user", None)
    return user if getattr(user, "is_authenticated", False) else None


def _audit(action: str, request: Any, bill: Bill, **metadata: Any) -> None:
    record(
        action,
        request=request,
        facility_id=bill.facility_id,
        object_type="billing.bill",
        object_id=bill.pk,
        metadata={"bill_id": str(bill.pk), **{k: _plain(v) for k, v in metadata.items()}},
    )


def _plain(value: Any) -> Any:
    return str(value) if not isinstance(value, (int, bool, str, type(None), list)) else value


def _locked(bill_id: Any, version: Any = None) -> Bill:
    bill = Bill.objects.select_for_update(of=("self",)).select_related("visit").get(pk=bill_id)
    if version is not None and version != bill.version:
        raise Conflict(STALE)
    return bill


def tariff_name(item: TariffItem) -> str:
    names = item.name_i18n or {}
    return str(names.get("en") or next(iter(names.values()), item.code))[:300]


def holds_permission(membership: Any, code: str) -> bool:
    from medilink.tenancy.services import membership_permissions

    return code in membership_permissions(membership)


def can_self_approve(membership: Any) -> bool:
    """One-person clinic: no other active member of the facility holds `billing.approve`."""
    from medilink.tenancy.models import FacilityMembership

    others = (
        FacilityMembership.objects.filter(facility_id=membership.facility_id, is_active=True)
        .exclude(pk=membership.pk)
        .prefetch_related("roles__permissions")
    )
    return not any(holds_permission(m, "billing.approve") for m in others)


# ---- opening, split and totals ----------------------------------------------------------------


def _profile_snapshot(bill: Bill, profile: Any, status: str) -> None:
    bill.insurance_profile = profile
    bill.insurance_status = status if profile is not None else "none"
    bill.insurer_code = profile.insurer_code if profile is not None else ""
    rule = (
        insurer_rule(bill.facility_id, profile.insurer_code, on=bill.visit.service_date)
        if profile is not None
        else None
    )
    bill.insurer_rule = rule
    bill.patient_share_bp = rule.patient_share_bp if rule else None
    bill.requires_referral = bool(rule and rule.requires_referral)


def open_bill(visit: Any, *, request: Any = None) -> Bill:
    """The visit's bill, created on first use (contract D-1): idempotent."""
    existing = Bill.objects.filter(visit_id=visit.pk).first()
    if existing is not None:
        return existing
    from medilink.patients.models import InsuranceProfile

    try:
        with transaction.atomic():
            bill = Bill(
                facility_id=visit.facility_id,
                visit=visit,
                patient_id=visit.patient_id,
                facility_patient_id=visit.facility_patient_id,
            )
            profile = (
                InsuranceProfile.objects.filter(
                    pk=visit.insurance_profile_id, patient_id=visit.patient_id, is_active=True
                ).first()
                if visit.insurance_profile_id
                else None
            )
            _profile_snapshot(bill, profile, "unverified")
            bill.save()
            item = price(
                visit.facility_id, service_id=visit.first_service_id, on=visit.service_date
            )
            if item is not None:
                _add_line(bill, item, quantity=1, membership=None)
            BillEvent.objects.create(
                facility_id=bill.facility_id,
                bill=bill,
                to_status=bill.status,
                actor=_user(request),
                occurred_at=timezone.now(),
            )
            if visit.status == "cancelled":
                _void(bill, request=request)
            recompute(bill)
            _audit("billing.bill.opened", request, bill, visit_id=visit.pk)
    except IntegrityError:  # opened in parallel: the other transaction's bill
        return Bill.objects.get(visit_id=visit.pk)
    return bill


def _add_line(
    bill: Bill,
    item: TariffItem,
    *,
    quantity: int,
    membership: Any,
    prescription_item: Any = None,
    name: str | None = None,
) -> BillLine:
    total = item.amount_rwf * quantity
    return BillLine.objects.create(
        facility_id=bill.facility_id,
        bill=bill,
        kind=item.kind,
        tariff_item=item,
        code=item.code,
        name=(name or tariff_name(item))[:300],
        unit_price_rwf=item.amount_rwf,
        quantity=quantity,
        total_rwf=total,
        patient_share_rwf=total,
        prescription_item=prescription_item,
        added_by_membership=membership,
    )


def _rule_applies(bill: Bill) -> bool:
    rule = bill.insurer_rule
    if rule is None or bill.insurance_status != VerificationResult.VERIFIED:
        return False
    if rule.applies_to_all_services:
        return True
    return str(bill.visit.first_service_id) in {str(x) for x in rule.service_ids}


def split(bill: Bill, lines: list[BillLine]) -> None:
    """Insurer and patient share per line (contract §2.2 Split), the S5 `cover()` rule per line
    and the ceiling per visit on the insurer total."""
    rule = bill.insurer_rule if _rule_applies(bill) else None
    excluded = set(rule.excluded_tariff_codes or []) if rule else set()
    covered: list[BillLine] = []
    for line in lines:
        if rule is not None and line.code not in excluded:
            patient = round(line.total_rwf * rule.patient_share_bp / 10_000)
            line.is_covered = True
            covered.append(line)
        else:
            patient = line.total_rwf
            line.is_covered = False
        line.patient_share_rwf = patient
        line.insurer_share_rwf = line.total_rwf - patient
    if rule is not None and rule.ceiling_per_visit_rwf is not None:
        excess = sum(line.insurer_share_rwf for line in covered) - rule.ceiling_per_visit_rwf
        for line in reversed(covered):
            if excess <= 0:
                break
            moved = min(excess, line.insurer_share_rwf)
            line.insurer_share_rwf -= moved
            line.patient_share_rwf += moved
            excess -= moved


def _sum(rows: Any, field: str = "amount_rwf") -> int:
    return int(rows.aggregate(total=Sum(field))["total"] or 0)


def recompute(bill: Bill, *, request: Any = None) -> Bill:
    """Rebuild lines' split and every total of a locked bill; record a status change."""
    if bill.status != BillStatus.VOIDED:
        sync_medicine_lines(bill)
    lines = list(bill.lines.filter(removed_at__isnull=True))
    split(bill, lines)
    for line in lines:
        line.save(
            update_fields=["is_covered", "patient_share_rwf", "insurer_share_rwf", "updated_at"]
        )
    bill.total_rwf = sum(line.total_rwf for line in lines)
    bill.insurer_share_rwf = sum(line.insurer_share_rwf for line in lines)
    bill.patient_share_rwf = sum(line.patient_share_rwf for line in lines)
    bill.exempted_rwf = _sum(bill.exemptions.filter(applied_at__isnull=False))
    bill.credited_rwf = _sum(bill.credit_notes.all(), "reduces_due_rwf")
    bill.paid_rwf = _sum(bill.payments.filter(status=PaymentStatus.RECORDED))
    bill.refunded_rwf = _sum(RefundPayout.objects.filter(credit_note__bill=bill))
    due = max(bill.patient_share_rwf - bill.exempted_rwf - bill.credited_rwf, 0)
    net_paid = bill.paid_rwf - bill.refunded_rwf
    bill.balance_rwf = max(due - net_paid, 0)
    before = bill.status
    if before != BillStatus.VOIDED:
        if bill.credited_rwf and due == 0:
            bill.status = BillStatus.CREDITED
        elif bill.balance_rwf == 0 and bill.total_rwf > 0:
            bill.status = BillStatus.PAID
        elif net_paid > 0:
            bill.status = BillStatus.PARTLY_PAID
        else:
            bill.status = BillStatus.OPEN
    bill.version += 1
    bill.save()
    if bill.status != before:
        BillEvent.objects.create(
            facility_id=bill.facility_id,
            bill=bill,
            from_status=before,
            to_status=bill.status,
            actor=_user(request),
            occurred_at=timezone.now(),
        )
    if bill.balance_rwf == 0 and bill.status != BillStatus.VOIDED:
        _release_prescriptions(bill, request)
    return bill


def due(bill: Bill) -> int:
    return max(bill.patient_share_rwf - bill.exempted_rwf - bill.credited_rwf, 0)


def owed_to_patient(bill: Bill) -> int:
    return max(bill.paid_rwf - bill.refunded_rwf - due(bill), 0)


def _release_prescriptions(bill: Bill, request: Any) -> None:
    """Payment-first pharmacy (S7 D-6): nothing left to pay → the pharmacy can dispense."""
    from medilink.pharmacy.models import Prescription, PrescriptionStatus
    from medilink.pharmacy.services import mark_covered

    waiting = Prescription.objects.filter(
        visit_id=bill.visit_id, status=PrescriptionStatus.AWAITING_PAYMENT
    ).values_list("pk", flat=True)
    for pk in list(waiting):
        mark_covered(pk, request=request)


def medicine_price(facility_id: Any, drug_code: str) -> TariffItem | None:
    """Contract D-3: the tariff item of kind `medicine` whose code is the drug code."""
    return (
        TariffItem.objects.filter(
            current_q(timezone.localdate()),
            facility_id=facility_id,
            kind=TariffKind.MEDICINE,
            code=drug_code,
        )
        .order_by("-valid_from")
        .first()
    )


def _billable(item: Any) -> bool:
    from medilink.pharmacy.models import ItemStatus

    if not item.drug_code:
        return False
    if item.status in (ItemStatus.ISSUED, ItemStatus.PARTLY, ItemStatus.DISPENSED):
        return True
    return bool(item.dispensed_quantity) and item.status in (
        ItemStatus.NOT_AVAILABLE,
        ItemStatus.EXPIRED,
    )


def sync_medicine_lines(bill: Bill) -> None:
    """One line per billable prescription item; lines of items no longer billable go while
    nothing is paid (contract §2.2 Lines)."""
    from medilink.pharmacy.models import PrescriptionItem, PrescriptionStatus

    items = PrescriptionItem.objects.filter(prescription__visit_id=bill.visit_id).exclude(
        prescription__status=PrescriptionStatus.DRAFT
    )
    active = {
        line.prescription_item_id: line
        for line in bill.lines.filter(prescription_item__isnull=False, removed_at__isnull=True)
    }
    paid = bill.payments.filter(status=PaymentStatus.RECORDED).exists()
    for item in items:
        line = active.get(item.pk)
        if _billable(item):
            if line is None:
                tariff = medicine_price(bill.facility_id, item.drug_code)
                if tariff is not None:
                    _add_line(
                        bill,
                        tariff,
                        quantity=item.quantity,
                        membership=None,
                        prescription_item=item,
                        name=item.drug_display,
                    )
        elif line is not None and not paid:
            line.removed_at = timezone.now()
            line.removed_reason = "prescription_changed"
            line.save(update_fields=["removed_at", "removed_reason", "updated_at"])


def missing_prices(bill: Bill) -> list[dict[str, Any]]:
    """Billable items without a tariff price, and the consultation without one (shown)."""
    from medilink.pharmacy.models import PrescriptionItem, PrescriptionStatus

    out: list[dict[str, Any]] = []
    if not bill.lines.filter(kind=TariffKind.SERVICE).exists() and (
        price(bill.facility_id, service_id=bill.visit.first_service_id, on=bill.visit.service_date)
        is None
    ):
        out.append({"kind": "service", "code": "", "name": ""})
    billed = set(
        bill.lines.filter(prescription_item__isnull=False).values_list(
            "prescription_item_id", flat=True
        )
    )
    for item in PrescriptionItem.objects.filter(prescription__visit_id=bill.visit_id).exclude(
        prescription__status=PrescriptionStatus.DRAFT
    ):
        if _billable(item) and item.pk not in billed:
            out.append({"kind": "medicine", "code": item.drug_code, "name": item.drug_display})
    return out


def refresh(bill_id: Any, *, request: Any = None) -> Bill:
    """Bring a bill up to date (medicine lines, rule) before a read."""
    with transaction.atomic():
        bill = _locked(bill_id)
        if bill.status != BillStatus.VOIDED:
            recompute(bill, request=request)
    return bill


# ---- lines ------------------------------------------------------------------------------------


def add_line(
    bill_id: Any, *, version: Any, tariff_code: str, quantity: int, membership: Any, request: Any
) -> Bill:
    with transaction.atomic():
        bill = _locked(bill_id, version)
        if bill.status == BillStatus.VOIDED:
            raise BusinessRuleViolation(VOIDED)
        item = (
            TariffItem.objects.filter(
                current_q(timezone.localdate()), facility_id=bill.facility_id, code=tariff_code
            )
            .order_by("-valid_from")
            .first()
        )
        if item is None:
            raise FieldRule("tariff_code", UNKNOWN_TARIFF)
        if item.kind not in (TariffKind.PROCEDURE, TariffKind.OTHER):
            raise FieldRule("tariff_code", NOT_A_LINE_KIND)
        line = _add_line(bill, item, quantity=quantity, membership=membership)
        recompute(bill, request=request)
        _audit("billing.bill.line_added", request, bill, line_id=line.pk, tariff_code=item.code)
    return bill


def remove_line(line_id: Any, *, version: Any, reason: str, membership: Any, request: Any) -> Bill:
    reason = _reason(reason)
    with transaction.atomic():
        line = BillLine.objects.get(pk=line_id)
        bill = _locked(line.bill_id, version)
        if bill.status == BillStatus.VOIDED or line.removed_at is not None:
            raise BusinessRuleViolation(VOIDED)
        if bill.payments.filter(status=PaymentStatus.RECORDED).exists():
            raise BusinessRuleViolation(PAID_LOCK)
        line.removed_at = timezone.now()
        line.removed_by_membership = membership
        line.removed_reason = reason
        line.save(
            update_fields=["removed_at", "removed_by_membership", "removed_reason", "updated_at"]
        )
        recompute(bill, request=request)
        _audit("billing.bill.line_removed", request, bill, line_id=line.pk)
    return bill


def lab_price(facility_id: Any, test_code: str) -> TariffItem | None:
    """#201: the tariff item of kind `procedure` or `other` whose code is the lab test code (as
    medicines, contract D-3)."""
    return (
        TariffItem.objects.filter(
            current_q(timezone.localdate()),
            facility_id=facility_id,
            kind__in=(TariffKind.PROCEDURE, TariffKind.OTHER),
            code=test_code,
        )
        .order_by("-valid_from")
        .first()
    )


def add_lab_line(
    visit: Any, *, test_code: str, test_name: str, membership: Any, request: Any = None
) -> Any:
    """#201: a line on the visit's bill for one ordered lab test. Returns the line id, or None
    when the test has no price (the cashier adds it from the price list) or the bill is void."""
    item = lab_price(visit.facility_id, test_code)
    if item is None:
        return None
    opened = open_bill(visit, request=request)
    with transaction.atomic():
        bill = _locked(opened.pk)
        if bill.status == BillStatus.VOIDED:
            return None
        line = _add_line(bill, item, quantity=1, membership=membership, name=test_name)
        recompute(bill, request=request)
        _audit("billing.bill.line_added", request, bill, line_id=line.pk, tariff_code=item.code)
    return line.pk


def remove_lab_line(line_id: Any, *, membership: Any, request: Any = None) -> bool:
    """#201: take a cancelled test off the bill while nothing is paid (a refund otherwise)."""
    line = BillLine.objects.filter(pk=line_id, removed_at__isnull=True).first()
    if line is None:
        return False
    with transaction.atomic():
        bill = _locked(line.bill_id)
        if bill.payments.filter(status=PaymentStatus.RECORDED).exists():
            return False
        line.removed_at = timezone.now()
        line.removed_by_membership = membership
        line.removed_reason = "lab_order_cancelled"
        line.save(
            update_fields=["removed_at", "removed_by_membership", "removed_reason", "updated_at"]
        )
        recompute(bill, request=request)
        _audit("billing.bill.line_removed", request, bill, line_id=line.pk)
    return True


# ---- insurance verification -------------------------------------------------------------------


def verify_insurance(
    visit: Any,
    *,
    insurance_profile_id: Any,
    result: str,
    reason_code: str = "",
    reason_text: str = "",
    referral_letter_seen: bool | None = None,
    membership: Any,
    request: Any,
) -> Bill:
    from medilink.patients import insurance as patient_insurance
    from medilink.patients.models import InsuranceProfile

    profile = InsuranceProfile.objects.filter(
        pk=insurance_profile_id, patient_id=visit.patient_id, is_active=True
    ).first()
    if profile is None:
        raise FieldRule("insurance_profile_id", UNKNOWN_PROFILE)
    reason_text = (reason_text or "").strip()[:300]
    if result == VerificationResult.REJECTED:
        if reason_code not in REJECTION_REASONS:
            raise FieldRule("reason_code", NEED_REASON)
        if reason_code == "other" and len(reason_text) < MIN_REASON:
            raise FieldRule("reason_text", NEED_TEXT)
    opened = open_bill(visit, request=request)
    with transaction.atomic():
        bill = _locked(opened.pk)
        if bill.status == BillStatus.VOIDED:
            raise BusinessRuleViolation(VOIDED)
        before_share = bill.patient_share_rwf
        _profile_snapshot(bill, profile, result)
        if (
            result == VerificationResult.VERIFIED
            and bill.requires_referral
            and not referral_letter_seen
        ):
            raise FieldRule("referral_letter_seen", NEED_REFERRAL)
        lines = list(bill.lines.filter(removed_at__isnull=True))
        split(bill, lines)
        after_share = sum(line.patient_share_rwf for line in lines)
        if bill.paid_rwf and after_share > before_share:
            raise BusinessRuleViolation(LATER_RAISE)
        InsuranceVerification.objects.create(
            facility_id=bill.facility_id,
            visit_id=visit.pk,
            bill=bill,
            insurance_profile=profile,
            result=result,
            reason_code=reason_code if result == VerificationResult.REJECTED else "",
            reason_text=reason_text,
            referral_letter_seen=referral_letter_seen,
            verified_by_membership=membership,
            verified_at=timezone.now(),
        )
        if str(visit.insurance_profile_id or "") != str(profile.pk):
            visit.insurance_profile_id = profile.pk
            visit.save(update_fields=["insurance_profile_id", "updated_at"])
        patient_insurance.verify(
            profile,
            outcome=result,
            valid_until=None,
            reason=reason_text or reason_code,
            actor=_user(request),
            facility_id=bill.facility_id,
        )
        recompute(bill, request=request)
        action = (
            "billing.insurance.verified"
            if result == VerificationResult.VERIFIED
            else "billing.insurance.rejected"
        )
        _audit(action, request, bill, insurance_profile_id=profile.pk, reason_code=reason_code)
    return bill


# ---- shifts -----------------------------------------------------------------------------------


def open_shift_for(membership: Any) -> CashShift | None:
    return CashShift.objects.filter(
        facility_id=membership.facility_id, membership=membership, status=ShiftStatus.OPEN
    ).first()


def _require_shift(membership: Any) -> CashShift:
    shift = open_shift_for(membership)
    if shift is None:
        raise ShiftRequired()
    return shift


def expected_totals(shift: CashShift) -> dict[str, int]:
    totals = dict.fromkeys(METHODS, 0)
    for method, amount in shift.payments.filter(status=PaymentStatus.RECORDED).values_list(
        "method", "amount_rwf"
    ):
        totals[method] += amount
    for method, amount in shift.payouts.values_list("method", "amount_rwf"):
        totals[method] -= amount
    totals[PaymentMethod.CASH] += shift.opening_float_rwf
    return totals


def open_shift(*, membership: Any, opening_float_rwf: int, request: Any) -> CashShift:
    with transaction.atomic():
        if open_shift_for(membership) is not None:
            raise Conflict(SHIFT_OPEN)
        try:
            with transaction.atomic():
                shift = CashShift.objects.create(
                    facility_id=membership.facility_id,
                    membership=membership,
                    opened_at=timezone.now(),
                    opening_float_rwf=opening_float_rwf,
                )
        except IntegrityError:
            raise Conflict(SHIFT_OPEN) from None
        _shift_audit("billing.shift.opened", request, shift, opening_float_rwf=opening_float_rwf)
    return shift


def _shift_audit(action: str, request: Any, shift: CashShift, **metadata: Any) -> None:
    record(
        action,
        request=request,
        facility_id=shift.facility_id,
        object_type="billing.cash_shift",
        object_id=shift.pk,
        metadata={"shift_id": str(shift.pk), **metadata},
    )


def _locked_shift(shift_id: Any, version: Any) -> CashShift:
    shift = CashShift.objects.select_for_update().get(pk=shift_id)
    if version != shift.version:
        raise Conflict(STALE)
    return shift


def close_shift(
    shift_id: Any,
    *,
    version: Any,
    counted: dict[str, int],
    note: str,
    membership: Any,
    request: Any,
) -> CashShift:
    with transaction.atomic():
        shift = _locked_shift(shift_id, version)
        if shift.status != ShiftStatus.OPEN:
            raise BusinessRuleViolation(SHIFT_NOT_OPEN)
        if shift.membership_id != membership.pk:
            raise BusinessRuleViolation(NOT_OWNER)
        expected = expected_totals(shift)
        counted_totals = {m: int(counted.get(m, 0)) for m in METHODS}
        difference = sum(counted_totals.values()) - sum(expected.values())
        note = (note or "").strip()[:500]
        if difference != 0 and len(note) < MIN_REASON:
            raise FieldRule("note", NEED_NOTE)
        shift.status = ShiftStatus.CLOSED
        shift.closed_at = timezone.now()
        shift.expected_totals = expected
        shift.counted_totals = counted_totals
        shift.difference_rwf = difference
        shift.note = note
        shift.version += 1
        shift.save()
        _shift_audit("billing.shift.closed", request, shift, difference_rwf=difference)
    return shift


def review_shift(
    shift_id: Any, *, version: Any, note: str, membership: Any, request: Any
) -> CashShift:
    with transaction.atomic():
        shift = _locked_shift(shift_id, version)
        if shift.status != ShiftStatus.CLOSED:
            raise BusinessRuleViolation(SHIFT_NOT_CLOSED)
        is_self = shift.membership_id == membership.pk
        if is_self and not can_self_approve(membership):
            raise BusinessRuleViolation(OWN_SHIFT)
        shift.status = ShiftStatus.REVIEWED
        shift.reviewed_by_membership = membership
        shift.reviewed_at = timezone.now()
        shift.review_note = (note or "").strip()[:500]
        shift.is_self_reviewed = is_self
        shift.version += 1
        shift.save()
        _shift_audit("billing.shift.reviewed", request, shift, is_self_reviewed=is_self)
    return shift


# ---- payments and receipts --------------------------------------------------------------------


@dataclass
class PaymentInput:
    method: str
    amount_rwf: int
    reference: str = ""
    ebm_receipt_number: str = ""


def _check_reference(method: str, reference: str) -> str:
    reference = (reference or "").strip()[:60]
    if method != PaymentMethod.CASH and not reference:
        raise FieldRule("reference", NEED_REFERENCE)
    return reference


def record_payment(
    bill_id: Any,
    *,
    version: Any,
    data: PaymentInput,
    membership: Any,
    request: Any,
    idempotency_key: Any = None,
) -> Bill:
    if idempotency_key:
        existing = Payment.objects.filter(
            facility_id=membership.facility_id, idempotency_key=idempotency_key
        ).first()
        if existing is not None:
            return Bill.objects.get(pk=existing.bill_id)
    reference = _check_reference(data.method, data.reference)
    with transaction.atomic():
        bill = _locked(bill_id, version)
        if bill.status == BillStatus.VOIDED:
            raise BusinessRuleViolation(VOIDED)
        shift = _require_shift(membership)
        recompute(bill, request=request)
        if data.amount_rwf > bill.balance_rwf:
            raise FieldRule("amount_rwf", TOO_MUCH)
        now = timezone.now()
        payment = Payment.objects.create(
            facility_id=bill.facility_id,
            bill=bill,
            shift=shift,
            method=data.method,
            amount_rwf=data.amount_rwf,
            reference=reference,
            ebm_receipt_number=(data.ebm_receipt_number or "").strip()[:40],
            received_by_membership=membership,
            received_at=now,
            idempotency_key=idempotency_key,
        )
        receipt = Receipt.objects.create(
            facility_id=bill.facility_id,
            payment=payment,
            number=next_number(bill.facility_id, receipt_prefix(bill.facility_id)),
            issued_at=now,
        )
        recompute(bill, request=request)
        _audit(
            "billing.payment.recorded",
            request,
            bill,
            payment_id=payment.pk,
            method=payment.method,
            amount_rwf=payment.amount_rwf,
        )
        _audit("billing.receipt.issued", request, bill, receipt_id=receipt.pk)
        send_receipt(receipt)
    return bill


def send_receipt(receipt: Receipt, *, resend: bool = False, request: Any = None) -> None:
    from medilink.billing.notification_events import RECEIPT_ISSUED
    from medilink.notifications.recipients import Recipients
    from medilink.notifications.service import notify
    from medilink.tenancy.models import Facility

    bill = receipt.payment.bill
    facility = Facility.objects.get(pk=receipt.facility_id)
    patient = bill.patient
    with transaction.atomic():
        notify(
            RECEIPT_ISSUED,
            Recipients.patient(bill.patient_id),
            {
                "facility_name": facility.name,
                "person_name": str(patient.preferred_name or patient.full_name),
                "receipt_id": receipt.pk,
                "bill_id": bill.pk,
            },
            facility_id=receipt.facility_id,
            patient_id=bill.patient_id,
            dedupe_key=(
                f"{RECEIPT_ISSUED}:{receipt.pk}:{timezone.now().isoformat()}" if resend else None
            ),
        )
        if resend:
            _audit("billing.receipt.sent", request, bill, receipt_id=receipt.pk)


# ---- exemptions -------------------------------------------------------------------------------


def apply_exemption(
    bill_id: Any,
    *,
    version: Any,
    reason_code: str,
    reason_text: str,
    amount_rwf: int,
    membership: Any,
    request: Any,
) -> Bill:
    if reason_code not in ExemptionReason.values:
        raise FieldRule("reason_code", NEED_REASON)
    reason_text = (reason_text or "").strip()[:300]
    if reason_code == ExemptionReason.OTHER and len(reason_text) < MIN_REASON:
        raise FieldRule("reason_text", NEED_TEXT)
    with transaction.atomic():
        bill = _locked(bill_id, version)
        if not setting(bill.facility_id, "allow_exemptions"):
            raise BusinessRuleViolation(NO_EXEMPTIONS)
        if bill.status == BillStatus.VOIDED:
            raise BusinessRuleViolation(VOIDED)
        recompute(bill, request=request)
        if amount_rwf > bill.balance_rwf:
            raise FieldRule("amount_rwf", TOO_MUCH)
        exemption = Exemption.objects.create(
            facility_id=bill.facility_id,
            bill=bill,
            reason_code=reason_code,
            reason_text=reason_text,
            amount_rwf=amount_rwf,
            applied_by_membership=membership,
        )
        threshold = int(setting(bill.facility_id, "waiver_approval_threshold_rwf"))
        if reason_code == ExemptionReason.WAIVER and amount_rwf > threshold:
            approval = ApprovalRequest.objects.create(
                facility_id=bill.facility_id,
                kind=ApprovalKind.WAIVER,
                bill=bill,
                exemption=exemption,
                amount_rwf=amount_rwf,
                reason_code=reason_code,
                reason_text=reason_text,
                requested_by_membership=membership,
            )
            exemption.approval_request = approval
            exemption.save(update_fields=["approval_request", "updated_at"])
            _approval_audit("billing.approval.requested", request, approval)
        else:
            exemption.applied_at = timezone.now()
            exemption.save(update_fields=["applied_at", "updated_at"])
            _audit(
                "billing.exemption.applied",
                request,
                bill,
                exemption_id=exemption.pk,
                reason_code=reason_code,
                amount_rwf=amount_rwf,
            )
        recompute(bill, request=request)
    return bill


# ---- approvals: voids, refunds, waivers -------------------------------------------------------


def _approval_audit(action: str, request: Any, approval: ApprovalRequest, **metadata: Any) -> None:
    record(
        action,
        request=request,
        facility_id=approval.facility_id,
        object_type="billing.approval_request",
        object_id=approval.pk,
        metadata={
            "approval_request_id": str(approval.pk),
            "bill_id": str(approval.bill_id),
            "kind": approval.kind,
            "amount_rwf": approval.amount_rwf,
            **metadata,
        },
    )


def request_void(
    payment_id: Any, *, reason_code: str, reason_text: str, membership: Any, request: Any
) -> ApprovalRequest:
    reason_text = _reason(reason_text, "reason_text")
    with transaction.atomic():
        payment = Payment.objects.select_for_update().get(pk=payment_id)
        _locked(payment.bill_id)
        if payment.status != PaymentStatus.RECORDED:
            raise BusinessRuleViolation(ALREADY_VOIDED)
        if ApprovalRequest.objects.filter(payment=payment, status=ApprovalStatus.PENDING).exists():
            raise Conflict(_("A void of this payment is already waiting for approval."))
        approval = ApprovalRequest.objects.create(
            facility_id=payment.facility_id,
            kind=ApprovalKind.VOID_PAYMENT,
            bill_id=payment.bill_id,
            payment=payment,
            amount_rwf=payment.amount_rwf,
            reason_code=(reason_code or "other")[:40],
            reason_text=reason_text,
            requested_by_membership=membership,
        )
        _approval_audit("billing.approval.requested", request, approval)
    return approval


def _pending_refunds(bill: Bill) -> int:
    return _sum(
        bill.approval_requests.filter(kind=ApprovalKind.REFUND, status=ApprovalStatus.PENDING)
    )


def _unpaid_credit(bill: Bill) -> int:
    return _sum(bill.credit_notes.all()) - bill.refunded_rwf


def refundable(bill: Bill) -> int:
    """Paid and not yet returned, minus credit notes not yet paid out and pending refunds."""
    net_paid = bill.paid_rwf - bill.refunded_rwf
    return max(net_paid - _unpaid_credit(bill) - _pending_refunds(bill), 0)


def request_refund(
    bill_id: Any,
    *,
    amount_rwf: int,
    reason_code: str,
    reason_text: str,
    membership: Any,
    request: Any,
) -> ApprovalRequest:
    reason_text = _reason(reason_text, "reason_text")
    with transaction.atomic():
        bill = _locked(bill_id)
        if amount_rwf > refundable(bill):
            raise FieldRule("amount_rwf", OVER_REFUND)
        approval = ApprovalRequest.objects.create(
            facility_id=bill.facility_id,
            kind=ApprovalKind.REFUND,
            bill=bill,
            amount_rwf=amount_rwf,
            reason_code=(reason_code or "other")[:40],
            reason_text=reason_text,
            requested_by_membership=membership,
        )
        _approval_audit("billing.approval.requested", request, approval)
    return approval


def _locked_approval(approval_id: Any, version: Any) -> ApprovalRequest:
    approval = ApprovalRequest.objects.select_for_update().get(pk=approval_id)
    if version != approval.version:
        raise Conflict(STALE)
    if approval.status != ApprovalStatus.PENDING:
        raise BusinessRuleViolation(NOT_PENDING)
    return approval


def _decide(approval: ApprovalRequest, status: str, membership: Any, note: str) -> None:
    approval.status = status
    approval.decided_by_membership = membership
    approval.decided_at = timezone.now()
    approval.decision_note = (note or "").strip()[:300]
    approval.version += 1
    approval.save()


def approve(
    approval_id: Any, *, version: Any, note: str, membership: Any, request: Any
) -> ApprovalRequest:
    with transaction.atomic():
        approval = _locked_approval(approval_id, version)
        bill = _locked(approval.bill_id)
        is_self = approval.requested_by_membership_id == membership.pk
        if is_self:
            if not can_self_approve(membership):
                raise BusinessRuleViolation(OWN_REQUEST)
            approval.is_self_approved = True
        now = timezone.now()
        if approval.kind == ApprovalKind.VOID_PAYMENT:
            payment = Payment.objects.select_for_update().get(pk=str(approval.payment_id))
            if payment.status != PaymentStatus.RECORDED:
                raise BusinessRuleViolation(ALREADY_VOIDED)
            payment.status = PaymentStatus.VOIDED
            payment.voided_at = now
            payment.void_request = approval
            payment.save(update_fields=["status", "voided_at", "void_request", "updated_at"])
            Receipt.objects.filter(payment=payment).update(
                status=ReceiptStatus.VOIDED, voided_at=now, updated_at=now
            )
            _audit("billing.payment.voided", request, bill, payment_id=payment.pk)
        elif approval.kind == ApprovalKind.REFUND:
            recompute(bill, request=request)
            amount = approval.amount_rwf or 0
            others = _pending_refunds(bill) - amount  # this request is still pending
            available = bill.paid_rwf - bill.refunded_rwf - _unpaid_credit(bill) - others
            if amount > available:  # a payment was voided meanwhile
                raise BusinessRuleViolation(OVER_REFUND)
            overpaid = max(owed_to_patient(bill) - _unpaid_credit(bill), 0)
            credit = CreditNote.objects.create(
                facility_id=bill.facility_id,
                bill=bill,
                approval_request=approval,
                number=next_number(bill.facility_id, CREDIT_PREFIX),
                amount_rwf=amount,
                reduces_due_rwf=amount - min(amount, overpaid),
                reason=approval.reason_text,
                issued_at=now,
            )
            _audit(
                "billing.credit_note.issued",
                request,
                bill,
                credit_note_id=credit.pk,
                amount_rwf=credit.amount_rwf,
            )
        else:  # waiver
            exemption = Exemption.objects.select_for_update().get(pk=str(approval.exemption_id))
            recompute(bill, request=request)
            if exemption.amount_rwf > bill.balance_rwf:
                raise BusinessRuleViolation(BALANCE_CHANGED)
            exemption.applied_at = now
            exemption.save(update_fields=["applied_at", "updated_at"])
            _audit(
                "billing.exemption.applied",
                request,
                bill,
                exemption_id=exemption.pk,
                reason_code=exemption.reason_code,
                amount_rwf=exemption.amount_rwf,
            )
        _decide(approval, ApprovalStatus.APPROVED, membership, note)
        recompute(bill, request=request)
        _approval_audit(
            "billing.approval.approved",
            request,
            approval,
            is_self_approved=approval.is_self_approved,
        )
    return approval


def reject(
    approval_id: Any, *, version: Any, note: str, membership: Any, request: Any
) -> ApprovalRequest:
    note = _reason(note, "note")
    with transaction.atomic():
        approval = _locked_approval(approval_id, version)
        if approval.requested_by_membership_id == membership.pk and not can_self_approve(
            membership
        ):
            raise BusinessRuleViolation(OWN_REQUEST)
        _decide(approval, ApprovalStatus.REJECTED, membership, note)
        _approval_audit("billing.approval.rejected", request, approval)
    return approval


def cancel_request(
    approval_id: Any, *, version: Any, membership: Any, request: Any
) -> ApprovalRequest:
    with transaction.atomic():
        approval = _locked_approval(approval_id, version)
        if approval.requested_by_membership_id != membership.pk:
            raise BusinessRuleViolation(NOT_YOURS)
        approval.status = ApprovalStatus.CANCELLED
        approval.version += 1
        approval.save(update_fields=["status", "version", "updated_at"])
        _approval_audit("billing.approval.cancelled", request, approval)
    return approval


def record_payout(
    credit_note_id: Any,
    *,
    data: PaymentInput,
    membership: Any,
    request: Any,
    idempotency_key: Any = None,
) -> Bill:
    if idempotency_key:
        existing = RefundPayout.objects.filter(
            facility_id=membership.facility_id, idempotency_key=idempotency_key
        ).first()
        if existing is not None:
            return Bill.objects.get(pk=existing.credit_note.bill_id)
    reference = _check_reference(data.method, data.reference)
    with transaction.atomic():
        credit = CreditNote.objects.get(pk=credit_note_id)
        bill = _locked(credit.bill_id)
        left = credit.amount_rwf - _sum(credit.payouts.all())
        if data.amount_rwf > left:
            raise FieldRule("amount_rwf", OVER_PAYOUT)
        shift = open_shift_for(membership)
        if data.method == PaymentMethod.CASH and shift is None:
            raise ShiftRequired()
        payout = RefundPayout.objects.create(
            facility_id=bill.facility_id,
            credit_note=credit,
            method=data.method,
            reference=reference,
            amount_rwf=data.amount_rwf,
            paid_by_membership=membership,
            paid_at=timezone.now(),
            shift=shift,
            idempotency_key=idempotency_key,
        )
        recompute(bill, request=request)
        _audit(
            "billing.refund.paid_out",
            request,
            bill,
            payout_id=payout.pk,
            method=payout.method,
            amount_rwf=payout.amount_rwf,
        )
    return bill


# ---- visit cancelled --------------------------------------------------------------------------


def _void(bill: Bill, *, request: Any) -> None:
    now = timezone.now()
    for line in bill.lines.filter(removed_at__isnull=True):
        line.removed_at = now
        line.removed_reason = "visit_cancelled"
        line.save(update_fields=["removed_at", "removed_reason", "updated_at"])
    before = bill.status
    bill.status = BillStatus.VOIDED
    BillEvent.objects.create(
        facility_id=bill.facility_id,
        bill=bill,
        from_status=before,
        to_status=BillStatus.VOIDED,
        actor=_user(request),
        reason="visit_cancelled",
        occurred_at=now,
    )
    _audit("billing.bill.voided", request, bill)


def on_visit_cancelled(visit: Any, *, request: Any = None) -> None:
    bill = Bill.objects.filter(visit_id=visit.pk).first()
    if bill is None:
        return
    with transaction.atomic():
        bill = _locked(bill.pk)
        if bill.status == BillStatus.VOIDED or bill.payments.exists():
            return
        _void(bill, request=request)
        recompute(bill, request=request)


def is_today(value: dt.datetime | None) -> bool:
    return value is not None and timezone.localdate(value) == timezone.localdate()
