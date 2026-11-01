"""Disruptions (contract sprint-05 §2.2 Disruption, FR-SCH-14): staff mark who or what is
unavailable and when; the affected confirmed bookings and today's remote tickets become items; staff
move or cancel them one by one or all at once; patients answer the offer, or it is accepted for
them after `booking.disruption_reply_hours`. Never a strike or a late cancellation.

Callers run inside the facility's RLS context. Notifications are S9's: this module only sends the
`disruption_applied` and `booking_changed_by_facility` signals after commit (D-12)."""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Any, cast

from django.db import IntegrityError, transaction
from django.db.models import F
from django.dispatch import Signal
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import APIException

from medilink.audit.services import record
from medilink.facilities.calendar import KIGALI
from medilink.facilities.models import Service
from medilink.patients.errors import FieldRule
from medilink.scheduling import booking as bookings
from medilink.scheduling.errors import BookingRule
from medilink.scheduling.models import (
    Booking,
    BookingStatus,
    Disruption,
    DisruptionAction,
    DisruptionItem,
    DisruptionKind,
    DisruptionStatus,
    PatientResponse,
    Slot,
    SlotStatus,
)
from medilink.scheduling.slots import booking_settings
from medilink.tenancy.models import FacilityMembership
from medilink.visits import services as queue
from medilink.visits.models import Ticket, TicketState

# S9 hook (D-12). kwargs: disruption_id, facility_id, item_ids (the items applied in this call)
disruption_applied = Signal()

AUTO_ACCEPT_AFTER = dt.timedelta(days=1)
MAX_ITEMS = 500

BAD_WINDOW = _("The end must be after the start, and in the future.")
NEED_DOCTOR = _("Choose the doctor who is absent.")
UNKNOWN = _("Choose a doctor or service of this facility.")
NO_OFFER = _("There is no change to answer for this booking.")
RESOLVED = _("This disruption is already resolved.")


class Problem(Exception):
    """Why one item could not be applied; reported per item, the others go ahead."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class Step:
    item_id: Any
    action: str
    membership_id: Any = None


# ---- create ------------------------------------------------------------------------------------


def _blocked_slots(d: Disruption) -> Any:
    qs = Slot.objects.filter(
        facility_id=d.facility_id,
        starts_at__gte=d.starts_at,
        starts_at__lt=d.ends_at,
        status=SlotStatus.OPEN,
    )
    if d.service_id:
        qs = qs.filter(service_id=d.service_id)
    if d.membership_id:
        qs = qs.filter(membership_id=d.membership_id)
    return qs


def _unresolved_bookings(facility_id: Any) -> set[Any]:
    return set(
        DisruptionItem.objects.filter(
            facility_id=facility_id, booking__isnull=False, resolved_at__isnull=True
        ).values_list("booking_id", flat=True)
    )


def _collect(d: Disruption) -> int:
    """Items for the confirmed bookings and today's waiting remote tickets in scope (once: a
    booking already waiting in another open disruption is left there)."""
    taken = _unresolved_bookings(d.facility_id)
    qs = Booking.objects.filter(
        facility_id=d.facility_id,
        status=BookingStatus.CONFIRMED,
        starts_at__gte=d.starts_at,
        starts_at__lt=d.ends_at,
    )
    if d.service_id:
        qs = qs.filter(service_id=d.service_id)
    if d.membership_id:
        qs = qs.filter(membership_id=d.membership_id)
    rows = [
        DisruptionItem(facility_id=d.facility_id, disruption=d, booking=b)
        for b in qs.order_by("starts_at")[:MAX_ITEMS]
        if b.pk not in taken
    ]
    now = timezone.now()
    today = timezone.localdate()
    end_of_today = dt.datetime.combine(today + dt.timedelta(days=1), dt.time.min, KIGALI)
    if d.starts_at < end_of_today and d.ends_at > now:
        tickets = Ticket.objects.filter(
            facility_id=d.facility_id,
            service_date=today,
            is_remote=True,
            state=TicketState.WAITING,
        )
        if d.service_id:
            tickets = tickets.filter(service_id=d.service_id)
        if d.membership_id:
            tickets = tickets.filter(assigned_membership_id=d.membership_id)
        busy = set(
            DisruptionItem.objects.filter(
                facility_id=d.facility_id, ticket__isnull=False, resolved_at__isnull=True
            ).values_list("ticket_id", flat=True)
        )
        rows += [
            DisruptionItem(facility_id=d.facility_id, disruption=d, ticket=t)
            for t in tickets.order_by("arrival_at")
            if t.pk not in busy
        ]
    DisruptionItem.objects.bulk_create(rows)
    return len(rows)


def create(
    *,
    facility_id: Any,
    kind: str,
    starts_at: dt.datetime,
    ends_at: dt.datetime,
    reason: str,
    who: bookings.Who | None,
    membership_id: Any = None,
    service_id: Any = None,
) -> Disruption:
    """Record the disruption, close its open slots and list what it affects (contract R7)."""
    if starts_at >= ends_at or ends_at <= timezone.now():
        raise FieldRule("ends_at", BAD_WINDOW)
    if kind == DisruptionKind.DOCTOR_ABSENT and not membership_id:
        raise FieldRule("membership_id", NEED_DOCTOR)
    if (
        membership_id
        and not FacilityMembership.objects.filter(
            pk=membership_id, facility_id=facility_id, is_active=True
        ).exists()
    ):
        raise FieldRule("membership_id", UNKNOWN)
    if service_id and not Service.objects.filter(pk=service_id, facility_id=facility_id).exists():
        raise FieldRule("service_id", UNKNOWN)
    with transaction.atomic():
        d = Disruption.objects.create(
            facility_id=facility_id,
            kind=kind,
            membership_id=membership_id or None,
            service_id=service_id or None,
            starts_at=starts_at,
            ends_at=ends_at,
            reason=reason.strip()[:300],
            created_by=who.user if who else None,
        )
        closed = _blocked_slots(d).update(status=SlotStatus.CLOSED, updated_at=timezone.now())
        count = _collect(d)
        if count == 0:
            _resolve(d, who)
    record(
        "scheduling.disruption.create",
        request=who.request if who else None,
        facility_id=facility_id,
        object_type="scheduling.disruption",
        object_id=d.pk,
        metadata={"kind": kind, "items": count, "slots_closed": closed},
    )
    return d


def open_for_closed_slots(facility_id: Any, slots: list[Slot]) -> Disruption | None:
    """Slot generation closed booked slots that no longer fit the schedule (contract §2.2 Slot
    generation): one `schedule_change` disruption lists their bookings for staff to move."""
    if not slots:
        return None
    taken = _unresolved_bookings(facility_id)
    affected = [
        b
        for b in Booking.objects.filter(
            facility_id=facility_id,
            status=BookingStatus.CONFIRMED,
            slot_id__in=[s.pk for s in slots],
        )
        if b.pk not in taken
    ]
    if not affected:
        return None
    with transaction.atomic():
        d = Disruption.objects.create(
            facility_id=facility_id,
            kind=DisruptionKind.SCHEDULE_CHANGE,
            starts_at=min(b.starts_at for b in affected),
            ends_at=max(b.starts_at for b in affected) + dt.timedelta(minutes=1),
            reason="schedule_change",
        )
        DisruptionItem.objects.bulk_create(
            [DisruptionItem(facility_id=facility_id, disruption=d, booking=b) for b in affected]
        )
    record(
        "scheduling.disruption.create",
        facility_id=facility_id,
        object_type="scheduling.disruption",
        object_id=d.pk,
        metadata={"kind": d.kind, "items": len(affected), "source": "slot_generation"},
    )
    return d


# ---- apply -------------------------------------------------------------------------------------


def _with_places(qs: Any) -> Any:
    return qs.filter(
        status=SlotStatus.OPEN, booked_count__lt=F("bookable_capacity") - F("held_count")
    )


def _target_slot(booking: Booking, d: Disruption, action: str, membership_id: Any) -> Slot:
    base = _with_places(
        Slot.objects.filter(facility_id=booking.facility_id, service_id=booking.service_id)
    )
    if action == DisruptionAction.MOVE_DOCTOR:
        # Same time, same service, another doctor (FR-SCH-14)
        qs = base.filter(starts_at=booking.starts_at).exclude(membership_id=booking.membership_id)
        if membership_id:
            qs = qs.filter(membership_id=membership_id)
        candidates = list(qs.order_by(F("membership_id").asc(nulls_last=True))[:5])
    else:
        after = max(d.ends_at, timezone.now())
        candidates = list(
            base.filter(starts_at__gte=after).order_by("starts_at", "membership_id")[:5]
        )
    for candidate in candidates:
        slot = Slot.objects.select_for_update().get(pk=candidate.pk)
        if slot.status == SlotStatus.OPEN and slot.open_places >= 1:
            return slot
    raise Problem("no_slot")


def _doctor_name(membership_id: Any) -> str | None:
    if not membership_id:
        return None
    m = FacilityMembership.objects.filter(pk=membership_id).select_related("user").first()
    return m.user.full_name if m else None


def offer(booking: Booking, item: DisruptionItem, d: Disruption) -> dict[str, Any]:
    """The `pending_change` shown to the patient: codes, times and the doctor's name only, never
    the staff note (the reason)."""
    now = timezone.now()
    hours = booking_settings(booking.facility_id)["disruption_reply_hours"]
    return {
        "item_id": str(item.pk),
        "disruption_kind": d.kind,
        "action": item.action,
        "previous_starts_at": item.previous_starts_at.isoformat()
        if item.previous_starts_at
        else None,
        "previous_doctor": _doctor_name(item.previous_membership_id),
        "reply_by": (now + dt.timedelta(hours=hours)).isoformat(),
        # Close to the visit the patient must answer (reception calls); further out, silence
        # counts as yes after the reply window
        "auto_accept": booking.starts_at - now > AUTO_ACCEPT_AFTER,
    }


def _move(booking: Booking, slot: Slot, item: DisruptionItem, d: Disruption, who: Any) -> None:
    """Move the booking in place (same ID and code, D-10) and free its old place."""
    if booking.slot_id:
        old = Slot.objects.select_for_update().filter(pk=booking.slot_id).first()
        if old is not None and old.booked_count > 0:
            old.booked_count -= 1
            old.save(update_fields=["booked_count", "updated_at"])
    slot.booked_count += 1
    slot.save(update_fields=["booked_count", "updated_at"])
    item.previous_starts_at = booking.starts_at
    item.previous_membership_id = booking.membership_id
    booking.slot = slot
    booking.membership_id = slot.membership_id
    booking.starts_at = slot.starts_at
    booking.service_date = timezone.localtime(slot.starts_at).date()
    booking.pending_change = offer(booking, item, d)
    booking.version += 1
    try:
        with transaction.atomic():
            booking.save(
                update_fields=[
                    "slot",
                    "membership",
                    "starts_at",
                    "service_date",
                    "pending_change",
                    "version",
                    "updated_at",
                ]
            )
    except IntegrityError as error:
        raise Problem("same_day_service") from error
    bookings._event(booking, BookingStatus.CONFIRMED, who, reason_code="disruption_move")


def _apply_booking(item: DisruptionItem, step: Step, d: Disruption, who: Any) -> None:
    booking = Booking.objects.select_for_update().get(pk=cast(Any, item.booking_id))
    if booking.status != BookingStatus.CONFIRMED:
        raise Problem("booking_closed")
    now = timezone.now()
    item.action = step.action
    item.applied_at = now
    if step.action == DisruptionAction.CANCEL:
        bookings._close(booking, BookingStatus.CANCELLED, who, reason_code="facility_disruption")
        item.patient_response = PatientResponse.CANCELLED
        item.resolved_at = now
    else:
        slot = _target_slot(booking, d, step.action, step.membership_id)
        _move(booking, slot, item, d, who)
    item.version += 1
    item.save()


def _apply_ticket(item: DisruptionItem, step: Step, who: Any) -> None:
    ticket = Ticket.objects.select_for_update().get(pk=cast(Any, item.ticket_id))
    if ticket.state != TicketState.WAITING:
        raise Problem("ticket_closed")
    actor = queue.Actor(user=who.user, membership=who.membership, request=who.request)
    if step.action == DisruptionAction.MOVE_DOCTOR:
        if (
            step.membership_id
            and not FacilityMembership.objects.filter(
                pk=step.membership_id, facility_id=ticket.facility_id, is_active=True
            ).exists()
        ):
            raise Problem("no_slot")
        before = ticket.state
        # Another doctor, or the shared queue of the service when none is chosen
        ticket.assigned_membership_id = step.membership_id or None
        queue._save(ticket, "assigned_membership")
        queue._event(ticket, "reassign", before, actor, reason_code="disruption")
        queue._queue_changed(ticket)
        item.patient_response = PatientResponse.ACCEPTED
    elif step.action == DisruptionAction.CANCEL:
        try:
            queue.act(
                ticket.pk,
                "cancel",
                version=ticket.version,
                actor=actor,
                data={"reason_code": "other", "reason_text": "facility_disruption"},
            )
        except APIException as error:
            raise Problem("ticket_closed") from error
        item.patient_response = PatientResponse.CANCELLED
    else:
        raise Problem("not_for_ticket")
    now = timezone.now()
    item.action = step.action
    item.applied_at = item.resolved_at = now
    item.version += 1
    item.save()


def apply(
    disruption_id: Any,
    *,
    who: bookings.Who,
    steps: list[Step] | None = None,
    all_action: str | None = None,
    membership_id: Any = None,
) -> tuple[Disruption, dict[str, str]]:
    """Apply actions per item (`steps`) or one action to every item not yet applied. Returns the
    disruption and the items that could not be applied, with a reason code (`no_slot`,
    `same_day_service`, `not_for_ticket`, `booking_closed`, `ticket_closed`, `already_applied`,
    `not_found`)."""
    problems: dict[str, str] = {}
    applied: list[Any] = []
    moved: list[Any] = []
    with transaction.atomic():
        d = Disruption.objects.select_for_update().get(pk=disruption_id)
        if d.status == DisruptionStatus.RESOLVED:
            raise BookingRule(RESOLVED, "resolved")
        if steps is None:
            pending = d.items.filter(action__isnull=True, resolved_at__isnull=True)
            steps = [
                Step(i.pk, str(all_action), membership_id) for i in pending.order_by("created_at")
            ]
        for step in steps:
            item = (
                DisruptionItem.objects.select_for_update()
                .filter(pk=step.item_id, disruption=d)
                .first()
            )
            if item is None:
                problems[str(step.item_id)] = "not_found"
                continue
            if item.action or item.resolved_at:
                problems[str(item.pk)] = "already_applied"
                continue
            try:
                with transaction.atomic():
                    if item.booking_id:
                        _apply_booking(item, step, d, who)
                        moved.append(item.booking_id)
                    else:
                        _apply_ticket(item, step, who)
            except Problem as problem:
                problems[str(item.pk)] = problem.code
                continue
            applied.append(item.pk)
        _maybe_resolve(d, who)
    if applied:
        record(
            "scheduling.disruption.apply",
            request=who.request,
            facility_id=d.facility_id,
            object_type="scheduling.disruption",
            object_id=d.pk,
            metadata={"applied": len(applied), "problems": len(problems)},
        )
        ids, facility_id = list(applied), d.facility_id
        transaction.on_commit(
            lambda: disruption_applied.send(
                sender=Disruption, disruption_id=d.pk, facility_id=facility_id, item_ids=ids
            )
        )
        for booking_id in moved:
            transaction.on_commit(
                lambda b=booking_id: bookings.booking_changed_by_facility.send(  # type: ignore[misc]
                    sender=Booking, booking_id=b, facility_id=facility_id
                )
            )
    return d, problems


# ---- answers and resolution --------------------------------------------------------------------


def _resolve(d: Disruption, who: Any) -> None:
    d.status = DisruptionStatus.RESOLVED
    d.resolved_at = timezone.now()
    d.version += 1
    d.save(update_fields=["status", "resolved_at", "version", "updated_at"])
    record(
        "scheduling.disruption.resolve",
        request=who.request if who else None,
        facility_id=d.facility_id,
        object_type="scheduling.disruption",
        object_id=d.pk,
        metadata={"items": d.items.count()},
    )


def _maybe_resolve(d: Disruption, who: Any) -> None:
    if d.status == DisruptionStatus.OPEN and not d.items.filter(resolved_at__isnull=True).exists():
        _resolve(d, who)


def settle_booking(
    booking: Booking, response: str, who: Any = None, new_booking: Booking | None = None
) -> bool:
    """Close the open disruption items of a booking when it is answered, cancelled, rescheduled,
    checked in or missed, from whichever screen. Clears the offer. True when there was one."""
    items = list(
        DisruptionItem.objects.select_for_update()
        .filter(booking_id=booking.pk, resolved_at__isnull=True)
        .select_related("disruption")
    )
    if booking.pending_change is not None:
        booking.pending_change = None
        Booking.objects.filter(pk=booking.pk).update(pending_change=None)
    now = timezone.now()
    for item in items:
        item.patient_response = response
        item.resolved_at = now
        item.new_booking = new_booking
        item.version += 1
        item.save(
            update_fields=[
                "patient_response",
                "resolved_at",
                "new_booking",
                "version",
                "updated_at",
            ]
        )
        _maybe_resolve(item.disruption, who)
    return bool(items)


def accept(booking_id: Any, *, version: Any, who: Any) -> Booking:
    """The patient (or the auto-accept job, `who=None`) keeps the moved time."""
    with transaction.atomic():
        booking = bookings.locked(booking_id, version)
        if booking.status != BookingStatus.CONFIRMED or not booking.pending_change:
            raise BookingRule(NO_OFFER, "no_offer")
        booking.version += 1
        booking.save(update_fields=["version", "updated_at"])
        settle_booking(booking, PatientResponse.ACCEPTED, who)
        booking.pending_change = None
        bookings._event(booking, BookingStatus.CONFIRMED, who, reason_code="offer_accepted")
    return booking


def require_offer(booking: Booking) -> None:
    if booking.status != BookingStatus.CONFIRMED or not booking.pending_change:
        raise BookingRule(NO_OFFER, "no_offer")


def auto_accept(facility_id: Any, now: dt.datetime | None = None) -> int:
    """Every 15 minutes (contract §5): offers past their reply time are accepted when the visit
    is more than a day away at the time of the offer. Items whose booking ended some other way
    were already settled by `settle_booking`."""
    now = now or timezone.now()
    due = []
    for b in Booking.objects.filter(
        facility_id=facility_id, status=BookingStatus.CONFIRMED, pending_change__isnull=False
    ):
        change = b.pending_change or {}
        reply_by = change.get("reply_by")
        if change.get("auto_accept") and reply_by and dt.datetime.fromisoformat(reply_by) <= now:
            due.append(b)
    for b in due:
        accept(b.pk, version=None, who=None)
    return len(due)
