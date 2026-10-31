"""Bookings (contract sprint-05 §2.2): confirm a hold, cancel, reschedule, no-shows and strikes.
Callers run inside the booking's facility RLS context. Every status change writes one
`BookingEvent` and one outbox event in the same transaction."""

from __future__ import annotations

import datetime as dt
import secrets
from dataclasses import dataclass
from typing import Any

from django.db import IntegrityError, connection, transaction
from django.dispatch import Signal
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from medilink.audit.services import record
from medilink.billing.services import insurer_rule, price
from medilink.masterdata.models import Symptom
from medilink.patients.crypto.fields import encrypt
from medilink.patients.errors import FieldRule
from medilink.patients.models import Patient
from medilink.scheduling.errors import BookingConflict, BookingRule
from medilink.scheduling.models import (
    Booking,
    BookingEvent,
    BookingSource,
    BookingStatus,
    NoShowStrike,
    Slot,
    SlotHold,
)
from medilink.scheduling.slots import booking_settings
from medilink.visits import outbox
from medilink.visits.models import ReasonSymptom, SymptomStage

# Interfaces for S9 (messages) and S6 (follow-ups), contract §7. kwargs: booking_id, facility_id
booking_confirmed = Signal()
booking_cancelled = Signal()
booking_changed_by_facility = Signal()
no_show_recorded = Signal()

CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
STRIKE_WINDOW = dt.timedelta(days=90)
MAX_SYMPTOMS = 5
CANCEL_CODES = ("patient_request", "facility_request", "duplicate", "other")
REVERSE_CODES = ("patient_was_present", "facility_delay", "other")

HOLD_EXPIRED = _("We couldn't keep this time for you. Choose a time again.")
AGE_RULE = _("This service is not for this person's age.")
SEX_RULE = _("This service is not offered for this person.")
LIMIT_ACTIVE = _("You already have the most upcoming bookings allowed. Cancel one to book another.")
LIMIT_STRIKES = _(
    "Because of missed visits, you can have one upcoming booking at a time for now. Ask at "
    "reception if this is a mistake."
)
SAME_DAY = _("This person already has a booking for this service on that day.")
CANCEL_CLOSED = _("This booking can't be changed any more.")
STALE = _("Someone else changed this booking. Reload and try again.")
NEED_SYMPTOM = _("Choose at least one symptom.")
NEED_REASON = _("Give a reason.")


@dataclass(frozen=True)
class Who:
    """Who acts: a patient account (online) or a staff member (phone booking, reception)."""

    user: Any
    membership: Any = None
    request: Any = None

    @property
    def is_staff(self) -> bool:
        return self.membership is not None


@dataclass(frozen=True)
class Cost:
    fee_rwf: int | None
    patient_share_rwf: int | None
    insurer_code: str | None
    insurer_accepted: bool | None


def estimate(
    facility_id: Any, service_id: Any, on: dt.date, insurer_code: str | None = None
) -> Cost:
    """Fee from the tariff on the slot date; patient share from the insurer rule (FR-BIL-03)."""
    item = price(facility_id, service_id=service_id, on=on)
    fee = item.amount_rwf if item else None
    if not insurer_code:
        return Cost(fee, fee, None, None)
    rule = insurer_rule(facility_id, insurer_code, service_id=service_id, on=on)
    if rule is None:
        return Cost(fee, fee, insurer_code, False)
    share = None if fee is None else round(fee * rule.patient_share_bp / 10_000)
    if share is not None and rule.ceiling_per_visit_rwf is not None:
        share = max(share, fee - rule.ceiling_per_visit_rwf) if fee is not None else share
    return Cost(fee, share, insurer_code, True)


def _count(sql: str, params: list[Any]) -> int:
    if connection.vendor != "postgresql":
        return 0
    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        return int(cursor.fetchone()[0])


def active_count(patient_id: Any) -> int:
    """Future confirmed bookings across all facilities (SECURITY DEFINER, a number only)."""
    return _count("SELECT scheduling_active_booking_count(%s)", [patient_id])


def strike_count(patient_id: Any) -> int:
    return _count(
        "SELECT scheduling_strike_count(%s, %s)", [patient_id, timezone.now() - STRIKE_WINDOW]
    )


def _age_months(born: dt.date | None, on: dt.date) -> int | None:
    if born is None:
        return None
    months = (on.year - born.year) * 12 + on.month - born.month
    return months - (1 if on.day < born.day else 0)


def _check_patient(patient: Patient, slot: Slot) -> None:
    service = slot.service
    months = _age_months(patient.date_of_birth, timezone.localtime(slot.starts_at).date())
    if months is not None and (
        (service.min_age_months is not None and months < service.min_age_months)
        or (service.max_age_months is not None and months > service.max_age_months)
    ):
        raise BookingRule(AGE_RULE, "age_rule")
    if service.sex_restriction and patient.sex and patient.sex != service.sex_restriction:
        raise BookingRule(SEX_RULE, "sex_rule")


def limits(facility_id: Any, patient_id: Any) -> dict[str, Any]:
    """Booking limits for this patient now (shown before booking and enforced at confirm)."""
    settings_ = booking_settings(facility_id)
    strikes = strike_count(patient_id)
    limited = strikes > settings_["no_show_strikes"]
    return {
        "max_active": 1 if limited else settings_["max_active"],
        "active": active_count(patient_id),
        "strikes": strikes,
        "warning": strikes >= settings_["no_show_strikes"],
        "limited": limited,
    }


def _new_code(facility_id: Any) -> str:
    for _attempt in range(10):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        if not Booking.objects.filter(facility_id=facility_id, booking_code=code).exists():
            return code
    raise RuntimeError("booking code space exhausted")


def _event(
    booking: Booking,
    from_status: str,
    who: Who | None,
    *,
    reason_code: str = "",
    reason_text: str = "",
) -> None:
    BookingEvent.objects.create(
        facility_id=booking.facility_id,
        booking=booking,
        from_status=from_status,
        to_status=booking.status,
        actor=who.user if who else None,
        reason_code=reason_code,
        reason_text=reason_text[:300],
        occurred_at=timezone.now(),
    )
    outbox.emit(
        outbox.BOOKING_CHANGED,
        booking.facility_id,
        booking_id=booking.pk,
        service_id=booking.service_id,
    )


def _symptoms(
    booking: Booking, symptoms: list[dict[str, Any]], language: str = "en"
) -> list[ReasonSymptom]:
    if not symptoms:
        raise FieldRule("symptoms", NEED_SYMPTOM)
    codes = [str(s["code"]) for s in symptoms[:MAX_SYMPTOMS]]
    found = {s.code: s for s in Symptom.objects.filter(code__in=codes, is_active=True)}
    if len(found) != len(set(codes)):
        raise FieldRule("symptoms", NEED_SYMPTOM)
    rows = []
    for item in symptoms[:MAX_SYMPTOMS]:
        symptom = found[str(item["code"])]
        names = symptom.name_i18n or {}
        rows.append(
            ReasonSymptom(
                facility_id=booking.facility_id,
                booking_id=booking.pk,
                patient_id=booking.patient_id,
                symptom=symptom,
                symptom_code=symptom.code,
                symptom_label=(names.get(language) or names.get("en") or symptom.code)[:200],
                duration_days=item.get("duration_days"),
                severity=str(item.get("severity") or "")[:10],
                captured_at_stage=SymptomStage.BOOKING,
            )
        )
    return ReasonSymptom.objects.bulk_create(rows)


def _hold_for(hold_id: Any, who: Who) -> SlotHold:
    owner = {"membership": who.membership} if who.is_staff else {"account": who.user}
    h = (
        SlotHold.objects.select_for_update()
        .select_related("slot__service")
        .filter(pk=hold_id, **owner)
        .first()
    )
    if h is None or h.released_at is not None or h.expires_at <= timezone.now():
        raise BookingRule(HOLD_EXPIRED, "hold_expired")
    return h


def book(
    *,
    hold_id: Any,
    patient: Patient,
    who: Who,
    symptoms: list[dict[str, Any]],
    reason_text: str = "",
    insurance_profile: Any = None,
    facility_patient: Any = None,
    contact_phone: str | None = None,
    source: str = BookingSource.ONLINE,
    key: Any = None,
    language: str = "en",
    replaces: Booking | None = None,
) -> tuple[Booking, bool]:
    """Turn a hold into a confirmed booking (contract §2.2 Confirm). Idempotent with `key`:
    the same key returns the same booking (`created = False`)."""
    if key:
        existing = Booking.objects.filter(idempotency_key=key).first()
        if existing is not None:
            return existing, False
    try:
        with transaction.atomic():
            h = _hold_for(hold_id, who)
            slot = Slot.objects.select_for_update().select_related("service").get(pk=h.slot_id)
            _check_patient(patient, slot)
            now_limits = limits(slot.facility_id, patient.pk)
            active = now_limits["active"] - (1 if replaces is not None else 0)
            if active >= now_limits["max_active"]:
                raise BookingRule(
                    LIMIT_STRIKES if now_limits["limited"] else LIMIT_ACTIVE,
                    "limit_strikes" if now_limits["limited"] else "limit_active",
                )
            day = timezone.localtime(slot.starts_at).date()
            insurer = insurance_profile.insurer_code if insurance_profile is not None else None
            cost = estimate(slot.facility_id, slot.service_id, day, insurer)
            if replaces is not None:
                # Supersede first: a move within the same day must not hit the one-per-day rule
                _close(replaces, BookingStatus.SUPERSEDED, who, reason_code="rescheduled")
            booking = Booking.objects.create(
                facility_id=slot.facility_id,
                patient=patient,
                facility_patient=facility_patient,
                account=None if who.is_staff else who.user,
                booked_by_membership=who.membership,
                source=source,
                slot=slot,
                service_id=slot.service_id,
                membership_id=slot.membership_id,
                starts_at=slot.starts_at,
                service_date=day,
                status=BookingStatus.CONFIRMED,
                booking_code=_new_code(slot.facility_id),
                idempotency_key=key,
                contact_phone_e164=contact_phone or None,
                insurance_profile_id=insurance_profile.pk
                if insurance_profile is not None
                else None,
                insurer_code=cost.insurer_code,
                insurer_accepted=cost.insurer_accepted,
                estimated_fee_rwf=cost.fee_rwf,
                estimated_patient_share_rwf=cost.patient_share_rwf,
            )
            if reason_text.strip():
                booking.reason_encrypted = encrypt(
                    reason_text.strip()[:500],
                    table="scheduling_booking",
                    column="reason_encrypted",
                    row_id=booking.pk,
                )
                booking.save(update_fields=["reason_encrypted"])
            _symptoms(booking, symptoms, language)
            slot.held_count -= 1
            slot.booked_count += 1
            slot.save(update_fields=["held_count", "booked_count", "updated_at"])
            h.released_at = timezone.now()
            h.booking_id = booking.pk
            h.save(update_fields=["released_at", "booking_id", "updated_at"])
            if replaces is not None:
                replaces.rescheduled_to_id = booking.pk
                replaces.save(update_fields=["rescheduled_to_id"])
            _event(booking, "", who)
    except IntegrityError as error:
        if key:
            existing = Booking.objects.filter(idempotency_key=key).first()
            if existing is not None:
                return existing, False
        if "scheduling_bk_one_per_day" in str(error):
            raise BookingRule(SAME_DAY, "same_day_service") from error
        raise
    record(
        "scheduling.booking.reschedule" if replaces is not None else "scheduling.booking.create",
        request=who.request,
        facility_id=booking.facility_id,
        object_type="scheduling.booking",
        object_id=booking.pk,
        metadata={"source": booking.source, "service_id": str(booking.service_id)},
    )
    booking_id, facility_id = booking.pk, booking.facility_id
    transaction.on_commit(
        lambda: booking_confirmed.send(
            sender=Booking, booking_id=booking_id, facility_id=facility_id
        )
    )
    return booking, True


def _close(booking: Booking, status: str, who: Who | None, *, reason_code: str = "") -> None:
    """Leave `confirmed`: free the place on the slot (under its lock) and record the event."""
    before = booking.status
    booking.status = status
    booking.version += 1
    fields = ["status", "version", "updated_at"]
    if status in (BookingStatus.CANCELLED, BookingStatus.LATE_CANCELLED):
        booking.cancelled_at = timezone.now()
        booking.cancel_reason_code = reason_code or None
        fields += ["cancelled_at", "cancel_reason_code"]
    booking.save(update_fields=fields)
    if booking.slot_id and status != BookingStatus.CHECKED_IN:
        slot = Slot.objects.select_for_update().filter(pk=booking.slot_id).first()
        if slot is not None and slot.booked_count > 0 and status != BookingStatus.NO_SHOW:
            slot.booked_count -= 1
            slot.save(update_fields=["booked_count", "updated_at"])
    _event(booking, before, who, reason_code=reason_code)


def locked(booking_id: Any, version: Any) -> Booking:
    booking = Booking.objects.select_for_update().get(pk=booking_id)
    if version is not None and version != booking.version:
        raise BookingConflict(STALE, "stale")
    return booking


def cancel_deadline(booking: Booking) -> dt.datetime:
    hours = booking_settings(booking.facility_id)["cancel_until_hours"]
    return booking.starts_at - dt.timedelta(hours=hours)


def cancel(booking_id: Any, *, version: Any, who: Who, reason_code: str = "") -> Booking:
    with transaction.atomic():
        booking = locked(booking_id, version)
        if booking.status != BookingStatus.CONFIRMED:
            raise BookingRule(CANCEL_CLOSED, "cancel_closed")
        if who.is_staff:
            if reason_code not in CANCEL_CODES:
                raise FieldRule("reason_code", NEED_REASON)
            status = BookingStatus.CANCELLED
        else:
            reason_code = "patient_request"
            late = timezone.now() > cancel_deadline(booking)
            status = BookingStatus.LATE_CANCELLED if late else BookingStatus.CANCELLED
        _close(booking, status, who, reason_code=reason_code)
    record(
        "scheduling.booking.cancel",
        request=who.request,
        facility_id=booking.facility_id,
        object_type="scheduling.booking",
        object_id=booking.pk,
        metadata={"status": booking.status, "reason_code": reason_code},
    )
    booking_id_, facility_id = booking.pk, booking.facility_id
    transaction.on_commit(
        lambda: booking_cancelled.send(
            sender=Booking, booking_id=booking_id_, facility_id=facility_id
        )
    )
    return booking


def reschedule(
    booking_id: Any, *, version: Any, hold_id: Any, who: Who, language: str = "en"
) -> Booking:
    """Book the held time and supersede the old booking in one transaction (contract §2.2)."""
    with transaction.atomic():
        old = locked(booking_id, version)
        if old.status != BookingStatus.CONFIRMED:
            raise BookingRule(CANCEL_CLOSED, "cancel_closed")
        if not who.is_staff and timezone.now() > cancel_deadline(old):
            raise BookingRule(CANCEL_CLOSED, "cancel_closed")
        symptoms = [
            {"code": s.symptom_code, "duration_days": s.duration_days, "severity": s.severity}
            for s in ReasonSymptom.objects.filter(booking_id=old.pk)
        ]
        patient = Patient.objects.get(pk=old.patient_id)
        insurance = None
        if old.insurance_profile_id:
            from medilink.patients.models import InsuranceProfile

            insurance = InsuranceProfile.objects.filter(pk=old.insurance_profile_id).first()
        new, _created = book(
            hold_id=hold_id,
            patient=patient,
            who=who,
            symptoms=symptoms,
            insurance_profile=insurance,
            facility_patient=old.facility_patient,
            contact_phone=old.contact_phone_e164,
            source=old.source,
            language=language,
            replaces=old,
        )
        if old.reason_encrypted:
            from medilink.patients.crypto.fields import decrypt

            text = decrypt(
                bytes(old.reason_encrypted),
                table="scheduling_booking",
                column="reason_encrypted",
                row_id=old.pk,
            )
            new.reason_encrypted = encrypt(
                text, table="scheduling_booking", column="reason_encrypted", row_id=new.pk
            )
            new.save(update_fields=["reason_encrypted"])
    return new


# ---- no-shows ------------------------------------------------------------------------------------


def mark_no_shows(facility_id: Any, now: dt.datetime | None = None) -> int:
    """Confirmed bookings past `slot + grace_after` without check-in become no-shows with a
    strike (FR-SCH-13)."""
    from medilink.visits.services import queue_settings

    now = now or timezone.now()
    grace = dt.timedelta(minutes=queue_settings(facility_id)["grace_after_minutes"])
    marked = 0
    with transaction.atomic():
        late = list(
            Booking.objects.select_for_update().filter(
                facility_id=facility_id,
                status=BookingStatus.CONFIRMED,
                starts_at__lt=now - grace,
            )
        )
        for booking in late:
            _close(booking, BookingStatus.NO_SHOW, None, reason_code="no_show")
            NoShowStrike.objects.create(
                facility_id=facility_id,
                patient_id=booking.patient_id,
                booking=booking,
                occurred_at=now,
            )
            booking_id, fid = booking.pk, facility_id
            transaction.on_commit(
                lambda b=booking_id, f=fid: no_show_recorded.send(  # type: ignore[misc]
                    sender=Booking, booking_id=b, facility_id=f
                )
            )
            marked += 1
    return marked


def reverse_no_show(
    booking_id: Any, *, version: Any, who: Who, reason_code: str, reason_text: str = ""
) -> Booking:
    if reason_code not in REVERSE_CODES or (reason_code == "other" and not reason_text.strip()):
        raise FieldRule("reason_code", NEED_REASON)
    with transaction.atomic():
        booking = locked(booking_id, version)
        if booking.status != BookingStatus.NO_SHOW:
            raise BookingRule(CANCEL_CLOSED, "not_allowed")
        strike = NoShowStrike.objects.select_for_update().filter(booking=booking).first()
        if strike is not None and strike.reversed_at is None:
            strike.reversed_at = timezone.now()
            strike.reversed_by = who.user
            strike.reversal_reason = f"{reason_code}: {reason_text.strip()}"[:300]
            strike.save(
                update_fields=["reversed_at", "reversed_by", "reversal_reason", "updated_at"]
            )
        before = booking.status
        booking.status = BookingStatus.CANCELLED
        booking.cancelled_at = timezone.now()
        booking.cancel_reason_code = "no_show_reversed"
        booking.version += 1
        booking.save(
            update_fields=["status", "cancelled_at", "cancel_reason_code", "version", "updated_at"]
        )
        _event(booking, before, who, reason_code=reason_code, reason_text=reason_text)
    record(
        "scheduling.booking.no_show_reverse",
        request=who.request,
        facility_id=booking.facility_id,
        object_type="scheduling.booking",
        object_id=booking.pk,
        metadata={"reason_code": reason_code},
    )
    return booking


def mark_checked_in(booking: Booking, visit_id: Any, who: Who) -> None:
    """Called by the S4 check-in inside its transaction (contract §2.2 Check-in (booked))."""
    before = booking.status
    booking.status = BookingStatus.CHECKED_IN
    booking.visit_id = visit_id
    booking.version += 1
    booking.save(update_fields=["status", "visit_id", "version", "updated_at"])
    _event(booking, before, who)
