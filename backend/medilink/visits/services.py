"""Visit and queue services (contract sprint-04 §2.2). Callers run inside the facility's RLS
context; every ticket change writes one `TicketEvent` and one outbox event in the same
transaction."""

from __future__ import annotations

import datetime as dt
import hashlib
import math
import secrets
from dataclasses import dataclass
from typing import Any

from django.db import IntegrityError, connection, transaction
from django.db.models import Case, IntegerField, Q, QuerySet, Value, When
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from medilink.audit.services import record
from medilink.core.exceptions import BusinessRuleViolation, Conflict
from medilink.facilities.calendar import effective_calendar
from medilink.facilities.models import Service, ServicePoint, ServicePointService
from medilink.facilities.settings_schema import with_defaults
from medilink.patients.crypto.fields import encrypt
from medilink.patients.errors import FieldRule
from medilink.patients.models import FacilityPatient
from medilink.visits import outbox
from medilink.visits.models import (
    ACTIVE_STATES,
    OPEN_VISIT,
    RANK_EMERGENCY,
    RANK_NORMAL,
    RANK_PRIORITY,
    RANK_RETURN,
    DisplayLink,
    DutyState,
    DutyStatus,
    DutyStatusEvent,
    PriorityClass,
    Stage,
    Ticket,
    TicketEvent,
    TicketState,
    Visit,
    VisitSource,
    VisitStatus,
)

STALE = _("Someone else changed this ticket. The list was refreshed.")
NOT_ALLOWED = _("This ticket can't do that now.")
ALREADY_SERVING = _("Finish or release your current patient first.")
NOT_ON_DUTY = _("Set yourself on duty before calling patients.")
SERVICE_CLOSED = _("This service does not take walk-ins.")
NEED_REASON = _("Give a reason.")
WRONG_QUEUE = _("Both tickets must wait in the same queue.")
INACTIVE_RECORD = _("This patient record is not active here.")

REASON_CODES = ("clinical_urgency", "staff_error", "patient_request", "other")
LEAVE_CODES = ("patient_left", "patient_request", "duplicate", "other")
STAGE_ORDER = (Stage.RECEPTION, Stage.PAYMENT, Stage.CONSULTATION, Stage.PAYMENT, Stage.PHARMACY)


def today() -> dt.date:
    return timezone.localdate()


def queue_settings(facility_id: Any) -> dict[str, Any]:
    from medilink.facilities.models import Settings

    row = Settings.objects.filter(facility_id=facility_id).first()
    return with_defaults("queue", (row.queue if row else {}) or {})


def _visit_changed(visit: Visit) -> None:
    outbox.emit(
        outbox.VISIT_CHANGED, visit.facility_id, visit_id=visit.pk, patient_id=visit.patient_id
    )


def _queue_changed(ticket: Ticket) -> None:
    outbox.emit(
        outbox.QUEUE_CHANGED, ticket.facility_id, service_id=ticket.service_id, stage=ticket.stage
    )


@dataclass(frozen=True)
class Actor:
    user: Any
    membership: Any
    request: Any = None
    client_occurred_at: dt.datetime | None = None


def _event(
    ticket: Ticket,
    action: str,
    from_state: str,
    actor: Actor | None,
    *,
    reason_code: str = "",
    reason_text: str = "",
    **metadata: Any,
) -> TicketEvent:
    request_id = ""
    if actor and actor.request is not None:
        request_id = str(getattr(actor.request, "request_id", "") or "")[:40]
    return TicketEvent.objects.create(
        facility_id=ticket.facility_id,
        ticket=ticket,
        from_state=from_state,
        to_state=ticket.state,
        action=action,
        actor=actor.user if actor else None,
        actor_membership=actor.membership if actor else None,
        request_id=request_id,
        reason_code=reason_code,
        reason_text=reason_text[:300],
        occurred_at=timezone.now(),
        client_occurred_at=actor.client_occurred_at if actor else None,
        metadata={k: (str(v) if v is not None else None) for k, v in metadata.items()},
    )


def _next_sequence(facility_id: Any, service_id: Any, service_date: dt.date) -> int:
    """Gapless daily number per service: one upsert under the row lock (contract §2.1)."""
    from medilink.core.ids import uuid7

    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO visits_ticket_counter (id, facility_id, service_id, service_date,
                                               last_sequence)
            VALUES (%s, %s, %s, %s, 1)
            ON CONFLICT (facility_id, service_id, service_date)
            DO UPDATE SET last_sequence = visits_ticket_counter.last_sequence + 1
            RETURNING last_sequence
            """,
            [uuid7(), facility_id, service_id, service_date],
        )
        return int(cursor.fetchone()[0])


def _new_ticket(
    visit: Visit,
    service: Service,
    stage: str,
    *,
    rank: int,
    arrival_at: dt.datetime,
) -> Ticket:
    sequence = _next_sequence(visit.facility_id, service.pk, visit.service_date)
    return Ticket.objects.create(
        facility_id=visit.facility_id,
        visit=visit,
        service=service,
        stage=stage,
        service_date=visit.service_date,
        number=f"{service.ticket_prefix}-{sequence:03d}",
        sequence=sequence,
        state=TicketState.WAITING,
        priority_rank=rank,
        arrival_at=arrival_at,
    )


def active_ticket(visit: Visit) -> Ticket | None:
    return visit.tickets.filter(state__in=ACTIVE_STATES).order_by("-created_at").first()


# ---- check-in ----------------------------------------------------------------------------------


def check_in(
    *,
    facility_id: Any,
    facility_patient: FacilityPatient,
    service: Service,
    source: str,
    actor: Actor,
    priority_class: str | None = None,
    priority_reason_code: str | None = None,
    reason_text: str | None = None,
    insurance_profile_id: Any = None,
    key: Any = None,
    booking: Any = None,
) -> tuple[Visit, Ticket, bool]:
    """Walk-in, emergency or booked check-in (FR-QUE-03; S5 adds `booking`). Idempotent: an open
    visit of the same patient today, or the same key, returns the existing visit and ticket
    (`created = False`)."""
    if not facility_patient.is_active:
        raise FieldRule("facility_patient_id", INACTIVE_RECORD)
    emergency = source == VisitSource.EMERGENCY
    if booking is not None:
        _check_booking(booking, facility_patient, service)
    elif not service.is_active or (not emergency and not service.allows_walk_in):
        raise FieldRule("service_id", SERVICE_CLOSED)
    if emergency and not (priority_reason_code or reason_text):
        raise FieldRule("priority_reason_code", NEED_REASON)
    if priority_class and not priority_reason_code:
        raise FieldRule("priority_reason_code", NEED_REASON)
    day = today()

    existing = _existing_visit(facility_id, facility_patient.patient_id, day, key)
    if existing:
        if booking is not None:
            _attach_booking(existing, booking, actor)
        current = active_ticket(existing)
        if existing.status == VisitStatus.REMOTE_PENDING and current is not None:
            # A remote joiner checked in at reception counts as "I'm here" (S5)
            from medilink.visits.remote import arrived

            arrived(current, actor=actor)
            existing.refresh_from_db()
        return existing, active_ticket(existing) or existing.tickets.latest("created_at"), False

    now = timezone.now()
    rank = RANK_EMERGENCY if emergency else RANK_PRIORITY if priority_class else RANK_NORMAL
    settings_ = queue_settings(facility_id)
    stage = settings_["start_stage"]
    late = booking is not None and now > booking.starts_at + dt.timedelta(
        minutes=settings_["grace_after_minutes"]
    )
    if booking is not None:
        visit_source = BOOKING_SOURCE.get(booking.source, VisitSource.ONLINE_BOOKING)
    else:
        visit_source = VisitSource.EMERGENCY if emergency else VisitSource.WALK_IN
    try:
        with transaction.atomic():
            visit = Visit.objects.create(
                facility_id=facility_id,
                facility_patient=facility_patient,
                patient_id=facility_patient.patient_id,
                service_date=day,
                source=visit_source,
                booking_id=booking.pk if booking is not None else None,
                status=VisitStatus.ON_SITE,
                first_service=service,
                checked_in_at=now,
                checked_in_by=actor.user,
                is_emergency=emergency,
                priority_class=priority_class or None,
                priority_reason_code=priority_reason_code or None,
                insurance_profile_id=insurance_profile_id
                or (booking.insurance_profile_id if booking is not None else None),
                check_in_key=key,
            )
            if reason_text:
                visit.reason_encrypted = encrypt(
                    reason_text.strip()[:1000],
                    table="visits_visit",
                    column="reason_encrypted",
                    row_id=visit.pk,
                )
                visit.save(update_fields=["reason_encrypted"])
            ticket = _new_ticket(visit, service, stage, rank=rank, arrival_at=now)
            if booking is not None:
                # Late beyond the window: counts as a walk-in (contract sprint-05 §2.2)
                ticket.slot_starts_at = None if late else booking.starts_at
                ticket.assigned_membership_id = booking.membership_id
                ticket.save(update_fields=["slot_starts_at", "assigned_membership", "updated_at"])
                _copy_booking(visit, booking, actor)
    except IntegrityError:
        # A parallel check-in won the race: return its visit (S4-B4)
        existing = _existing_visit(facility_id, facility_patient.patient_id, day, key)
        if not existing:
            raise
        return existing, active_ticket(existing) or existing.tickets.latest("created_at"), False

    booked = {"booking_id": booking.pk, "late": late} if booking is not None else {}
    _event(ticket, "check_in", "", actor, reason_code=priority_reason_code or "", **booked)
    record(
        "visits.check_in",
        request=actor.request,
        facility_id=facility_id,
        object_type="visits.visit",
        object_id=visit.pk,
        metadata={
            "source": visit.source,
            "service_id": str(service.pk),
            "rank": rank,
            **{k: str(v) for k, v in booked.items()},
        },
    )
    _queue_changed(ticket)
    _visit_changed(visit)
    return visit, ticket, True


BOOKING_SOURCE = {
    "online": VisitSource.ONLINE_BOOKING,
    "phone": VisitSource.PHONE_BOOKING,
    "follow_up": VisitSource.FOLLOW_UP,
    "referral": VisitSource.REFERRAL,
    "rebooking": VisitSource.ONLINE_BOOKING,
}
NOT_TODAY = _("This booking is not for today.")
BOOKING_CLOSED = _("This booking was cancelled or already used.")


def _check_booking(booking: Any, facility_patient: FacilityPatient, service: Service) -> None:
    from medilink.scheduling.models import BookingStatus

    if booking.status not in (BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN):
        raise FieldRule("booking_id", BOOKING_CLOSED)
    if booking.service_date != today():
        raise FieldRule("booking_id", NOT_TODAY)
    if booking.patient_id != facility_patient.patient_id or booking.service_id != service.pk:
        raise FieldRule("booking_id", BOOKING_CLOSED)


def _copy_booking(visit: Visit, booking: Any, actor: Actor) -> None:
    """Symptoms and reason go with the patient into the visit; the booking becomes checked in."""
    from medilink.patients.crypto.fields import decrypt
    from medilink.scheduling.booking import Who, mark_checked_in
    from medilink.visits.models import ReasonSymptom

    ReasonSymptom.objects.bulk_create(
        [
            ReasonSymptom(
                facility_id=visit.facility_id,
                booking_id=booking.pk,
                visit=visit,
                patient_id=visit.patient_id,
                symptom_id=row.symptom_id,
                symptom_code=row.symptom_code,
                symptom_label=row.symptom_label,
                duration_days=row.duration_days,
                severity=row.severity,
                captured_at_stage=row.captured_at_stage,
            )
            for row in ReasonSymptom.objects.filter(booking_id=booking.pk, visit__isnull=True)
        ]
    )
    if booking.reason_encrypted and not visit.reason_encrypted:
        text = decrypt(
            bytes(booking.reason_encrypted),
            table="scheduling_booking",
            column="reason_encrypted",
            row_id=booking.pk,
        )
        visit.reason_encrypted = encrypt(
            text, table="visits_visit", column="reason_encrypted", row_id=visit.pk
        )
        visit.save(update_fields=["reason_encrypted"])
    if booking.status != "checked_in":
        mark_checked_in(booking, visit.pk, Who(user=actor.user, membership=actor.membership))


def _attach_booking(visit: Visit, booking: Any, actor: Actor) -> None:
    """The patient is already here today (walked in first): that visit uses the booking."""
    if booking.status == "checked_in" or visit.booking_id not in (None, booking.pk):
        return
    with transaction.atomic():
        if visit.booking_id is None:
            visit.booking_id = booking.pk
            visit.save(update_fields=["booking_id", "updated_at"])
        _copy_booking(visit, booking, actor)


def _existing_visit(facility_id: Any, patient_id: Any, day: dt.date, key: Any) -> Visit | None:
    q = Q(patient_id=patient_id, service_date=day, status__in=OPEN_VISIT)
    if key:
        q |= Q(check_in_key=key)
    return Visit.objects.filter(q, facility_id=facility_id).order_by("-created_at").first()


# ---- ordering ----------------------------------------------------------------------------------


def waiting(
    facility_id: Any,
    service_id: Any,
    stage: str,
    *,
    membership_id: Any = None,
    day: dt.date | None = None,
) -> QuerySet[Ticket]:
    """Waiting tickets of one queue in calling order (contract §2.2 Ordering). With a membership:
    only that doctor's assigned tickets and the pool, own tickets first at equal rank."""
    now = timezone.now()
    qs = Ticket.objects.filter(
        facility_id=facility_id,
        service_id=service_id,
        stage=stage,
        state=TicketState.WAITING,
        service_date=day or today(),
    ).exclude(step_out_until__gt=now)
    if membership_id:
        qs = qs.filter(
            Q(assigned_membership_id=membership_id) | Q(assigned_membership__isnull=True)
        ).annotate(
            own=Case(
                When(assigned_membership_id=membership_id, then=Value(0)),
                default=Value(1),
                output_field=IntegerField(),
            )
        )
        return qs.order_by("priority_rank", "own", "arrival_at", "sequence")
    return qs.order_by("priority_rank", "arrival_at", "sequence")


def _ratio(value: str) -> tuple[int, int]:
    booked, walk_in = (int(x) for x in value.split(":"))
    return max(booked, 1), max(walk_in, 1)


def _interleave_state(
    facility_id: Any, service_id: Any, stage: str, day: dt.date, ratio: str
) -> tuple[bool, int]:
    """Booked/walk-in interleave (S5, contract sprint-05 §2.2 Ordering, D-7): from today's last
    calls of normal-rank tickets at this queue, so no state is stored. Returns (next is booked,
    how many of that kind were already called in the current run)."""
    booked_run, walk_in_run = _ratio(ratio)
    recent = list(
        Ticket.objects.filter(
            facility_id=facility_id,
            service_id=service_id,
            stage=stage,
            service_date=day,
            called_at__isnull=False,
            priority_rank=RANK_NORMAL,
        )
        .order_by("-called_at")
        .values_list("slot_starts_at", flat=True)[: booked_run + walk_in_run]
    )
    if not recent:
        return True, 0
    last_booked = recent[0] is not None
    run = 0
    for slot_time in recent:
        if (slot_time is not None) != last_booked:
            break
        run += 1
    limit = booked_run if last_booked else walk_in_run
    if run < limit:
        return last_booked, run
    return not last_booked, 0


def is_eligible(ticket: Ticket, settings_: dict[str, Any], now: dt.datetime) -> bool:
    """Call next may pick it: remote joiners must have arrived; booked patients wait until their
    grace window opens (contract sprint-05 §2.2)."""
    if ticket.is_remote and ticket.remote_checked_in_at is None:
        return False
    if ticket.slot_starts_at is not None:
        opens = ticket.slot_starts_at - dt.timedelta(minutes=settings_["grace_before_minutes"])
        return now >= opens
    return True


def calling_order(
    facility_id: Any,
    service_id: Any,
    stage: str,
    *,
    membership_id: Any = None,
    day: dt.date | None = None,
) -> list[Ticket]:
    """Waiting tickets in the order Call next takes them (S4 §2.2 extended by S5): emergency,
    return and priority first (S4 rules); then booked patients by slot time interleaved with
    walk-ins and remote joiners by arrival, at the facility's ratio. Booked patients early for
    their window go after the others until it opens."""
    day = day or today()
    settings_ = queue_settings(facility_id)
    now = timezone.now()
    tickets = list(
        waiting(
            facility_id, service_id, stage, membership_id=membership_id, day=day
        ).select_related("visit__patient", "service")
    )

    def own(t: Ticket) -> int:
        return 0 if membership_id and t.assigned_membership_id == membership_id else 1

    front = sorted(
        (t for t in tickets if t.priority_rank < RANK_NORMAL),
        key=lambda t: (t.priority_rank, own(t), t.arrival_at, t.sequence),
    )
    normal = [t for t in tickets if t.priority_rank >= RANK_NORMAL]
    booked = sorted(
        (t for t in normal if t.slot_starts_at is not None and is_eligible(t, settings_, now)),
        key=lambda t: (own(t), t.slot_starts_at, t.sequence),
    )
    early = sorted(
        (t for t in normal if t.slot_starts_at is not None and not is_eligible(t, settings_, now)),
        key=lambda t: (t.slot_starts_at, t.sequence),
    )
    others = sorted(
        (t for t in normal if t.slot_starts_at is None),
        key=lambda t: (own(t), t.arrival_at, t.sequence),
    )
    booked_run, walk_in_run = _ratio(settings_["booked_ratio"])
    take_booked, run = _interleave_state(
        facility_id, service_id, stage, day, settings_["booked_ratio"]
    )
    mixed: list[Ticket] = []
    while booked or others:
        if (take_booked and booked) or not others:
            mixed.append(booked.pop(0))
            if take_booked:
                run += 1
                if run >= booked_run:
                    take_booked, run = False, 0
        else:
            mixed.append(others.pop(0))
            if not take_booked:
                run += 1
                if run >= walk_in_run:
                    take_booked, run = True, 0
    return front + mixed + early


def position(ticket: Ticket) -> int:
    """People ahead of a waiting ticket in its queue (0 = next)."""
    if ticket.state != TicketState.WAITING:
        return 0
    order = calling_order(
        ticket.facility_id, ticket.service_id, ticket.stage, day=ticket.service_date
    )
    ids = [t.pk for t in order]
    return ids.index(ticket.pk) if ticket.pk in ids else len(ids)


# ---- call next and ticket actions --------------------------------------------------------------


def _serving(facility_id: Any, membership_id: Any) -> Ticket | None:
    return (
        Ticket.objects.filter(
            facility_id=facility_id,
            assigned_membership_id=membership_id,
            state__in=(TicketState.CALLED, TicketState.IN_SERVICE),
            service_date=today(),
        )
        .order_by("-called_at")
        .first()
    )


def call_next(
    *,
    facility_id: Any,
    service_id: Any,
    stage: str,
    actor: Actor,
    service_point_id: Any = None,
) -> Ticket | None:
    """Atomic Call next (FR-QUE-08): `FOR UPDATE SKIP LOCKED` on the first candidate."""
    membership_id = actor.membership.pk if actor.membership else None
    if stage == Stage.CONSULTATION:
        duty = DutyStatus.objects.filter(
            facility_id=facility_id, membership_id=membership_id
        ).first()
        if duty is None or duty.state != DutyState.ON_DUTY:
            raise BusinessRuleViolation(NOT_ON_DUTY)
        service_point_id = service_point_id or duty.service_point_id
    with transaction.atomic():
        current = _serving(facility_id, membership_id)
        if current is not None:
            raise Conflict(ALREADY_SERVING)
        settings_ = queue_settings(facility_id)
        now = timezone.now()
        ticket = None
        for candidate in calling_order(facility_id, service_id, stage, membership_id=membership_id):
            if not is_eligible(candidate, settings_, now):
                continue
            ticket = (
                Ticket.objects.select_for_update(skip_locked=True, of=("self",))
                .filter(pk=candidate.pk, state=TicketState.WAITING)
                .select_related("visit")
                .first()
            )
            if ticket is not None:
                break
        if ticket is None:
            return None
        ticket.state = TicketState.CALLED
        ticket.called_at = timezone.now()
        ticket.assigned_membership_id = membership_id
        ticket.service_point_id = service_point_id
        ticket.version += 1
        ticket.save(
            update_fields=[
                "state",
                "called_at",
                "assigned_membership",
                "service_point",
                "version",
                "updated_at",
            ]
        )
        _event(ticket, "call", TicketState.WAITING, actor, service_point_id=service_point_id)
        _queue_changed(ticket)
        _visit_changed(ticket.visit)
    return ticket


def _locked(ticket_id: Any, version: Any) -> Ticket:
    ticket = Ticket.objects.select_for_update().select_related("visit", "service").get(pk=ticket_id)
    if version != ticket.version:
        raise Conflict(STALE)
    return ticket


def _save(ticket: Ticket, *fields: str) -> None:
    ticket.version += 1
    ticket.save(update_fields=[*fields, "version", "updated_at"])


def _require(ticket: Ticket, *states: str) -> None:
    if ticket.state not in states:
        raise BusinessRuleViolation(NOT_ALLOWED)


def _close_visit_if_done(visit: Visit, status: str) -> None:
    if not visit.tickets.filter(state__in=ACTIVE_STATES).exists():
        visit.status = status
        visit.completed_at = timezone.now()
        visit.save(update_fields=["status", "completed_at", "updated_at"])


def _place_after(ticket: Ticket, places: int) -> None:
    """Re-insert a ticket `places` positions back from the front of its queue (no response)."""
    ahead = list(
        waiting(ticket.facility_id, ticket.service_id, ticket.stage).exclude(pk=ticket.pk)[:places]
    )
    if ahead:
        anchor = ahead[-1]
        ticket.priority_rank = max(ticket.priority_rank, anchor.priority_rank)
        ticket.arrival_at = anchor.arrival_at + dt.timedelta(microseconds=1)


def act(
    ticket_id: Any,
    action: str,
    *,
    version: Any,
    actor: Actor,
    data: dict[str, Any] | None = None,
) -> Ticket:
    """One ticket action (contract §3.1 Q5). Raises 409 on a stale version, 422 on an illegal
    transition."""
    data = data or {}
    with transaction.atomic():
        ticket = _locked(ticket_id, version)
        before = ticket.state
        settings_ = queue_settings(ticket.facility_id)
        visit = ticket.visit
        now = timezone.now()
        extra: dict[str, Any] = {}
        reason_code = str(data.get("reason_code") or "")
        reason_text = str(data.get("reason_text") or "")
        result = ticket

        if action == "recall":
            _require(ticket, TicketState.CALLED)
            ticket.called_at = now
            _save(ticket, "called_at")
        elif action == "start":
            _require(ticket, TicketState.CALLED)
            ticket.state = TicketState.IN_SERVICE
            ticket.started_at = now
            _save(ticket, "state", "started_at")
        elif action == "no-response":
            _require(ticket, TicketState.CALLED)
            ticket.no_response_count += 1
            if ticket.no_response_count > settings_["no_response_limit"]:
                ticket.state = TicketState.LEFT_WITHOUT_SERVICE
                ticket.ended_at = now
                _save(ticket, "state", "no_response_count", "ended_at")
                _close_visit_if_done(visit, VisitStatus.LEFT_WITHOUT_SERVICE)
            else:
                ticket.state = TicketState.WAITING
                ticket.called_at = None
                ticket.assigned_membership = None
                _place_after(ticket, settings_["no_response_places"])
                _save(
                    ticket,
                    "state",
                    "called_at",
                    "assigned_membership",
                    "no_response_count",
                    "priority_rank",
                    "arrival_at",
                )
        elif action == "hold":
            _require(ticket, TicketState.IN_SERVICE)
            ticket.state = TicketState.ON_HOLD
            _save(ticket, "state")
        elif action == "return":
            _require(ticket, TicketState.ON_HOLD)
            ticket.state = TicketState.WAITING
            if settings_["return_priority"]:
                ticket.priority_rank = min(ticket.priority_rank, RANK_RETURN)
            _save(ticket, "state", "priority_rank")
        elif action == "complete":
            _require(ticket, TicketState.IN_SERVICE)
            ticket.state = TicketState.COMPLETED
            ticket.ended_at = now
            _save(ticket, "state", "ended_at")
            _close_visit_if_done(visit, VisitStatus.COMPLETED)
        elif action == "next-stage":
            _require(ticket, TicketState.IN_SERVICE, TicketState.WAITING)
            stage = str(data.get("stage") or "")
            if stage not in Stage.values or stage == ticket.stage:
                raise FieldRule("stage", NOT_ALLOWED)
            ticket.state = TicketState.MOVED_TO_NEXT_STAGE
            ticket.ended_at = now
            _save(ticket, "state", "ended_at")
            result = _new_ticket(
                visit,
                ticket.service,
                stage,
                rank=ticket.priority_rank,
                arrival_at=visit.checked_in_at or now,
            )
            extra["next_ticket_id"] = result.pk
        elif action == "transfer":
            _require(ticket, TicketState.WAITING)
            target_service = Service.objects.filter(
                pk=str(data.get("service_id") or ""), facility_id=ticket.facility_id, is_active=True
            ).first()
            if target_service is None or target_service.pk == ticket.service_id:
                raise FieldRule("service_id", NOT_ALLOWED)
            ticket.state = TicketState.TRANSFERRED
            ticket.ended_at = now
            _save(ticket, "state", "ended_at")
            result = _new_ticket(
                visit,
                target_service,
                ticket.stage,
                rank=ticket.priority_rank,
                arrival_at=ticket.arrival_at,
            )
            extra["to_service_id"] = target_service.pk
            extra["next_ticket_id"] = result.pk
        elif action in ("cancel", "left"):
            allowed = (
                (TicketState.WAITING,)
                if action == "cancel"
                else (
                    TicketState.WAITING,
                    TicketState.CALLED,
                    TicketState.NO_RESPONSE,
                    TicketState.ON_HOLD,
                )
            )
            _require(ticket, *allowed)
            if reason_code not in LEAVE_CODES:
                raise FieldRule("reason_code", NEED_REASON)
            ticket.state = (
                TicketState.CANCELLED if action == "cancel" else TicketState.LEFT_WITHOUT_SERVICE
            )
            ticket.ended_at = now
            _save(ticket, "state", "ended_at")
            _close_visit_if_done(
                visit,
                VisitStatus.CANCELLED if action == "cancel" else VisitStatus.LEFT_WITHOUT_SERVICE,
            )
        elif action == "step-out":
            _require(ticket, TicketState.WAITING)
            minutes = int(data.get("minutes") or 0)
            if not 1 <= minutes <= settings_["step_out_max_minutes"]:
                raise FieldRule("minutes", NOT_ALLOWED)
            ticket.step_out_until = now + dt.timedelta(minutes=minutes)
            _save(ticket, "step_out_until")
            extra["minutes"] = minutes
        elif action == "priority":
            _require(ticket, TicketState.WAITING)
            klass = data.get("priority_class")
            if klass:
                if klass not in PriorityClass.values:
                    raise FieldRule("priority_class", NOT_ALLOWED)
                if not reason_code:
                    raise FieldRule("reason_code", NEED_REASON)
                visit.priority_class, visit.priority_reason_code = klass, reason_code
                ticket.priority_rank = min(ticket.priority_rank, RANK_PRIORITY)
            else:
                visit.priority_class = visit.priority_reason_code = None
                if ticket.priority_rank == RANK_PRIORITY:
                    ticket.priority_rank = RANK_NORMAL
            visit.save(update_fields=["priority_class", "priority_reason_code", "updated_at"])
            _save(ticket, "priority_rank")
            extra["priority_class"] = klass
        elif action == "reorder":
            _require(ticket, TicketState.WAITING)
            if reason_code not in REASON_CODES or (
                reason_code == "other" and not reason_text.strip()
            ):
                raise FieldRule("reason_code", NEED_REASON)
            target = Ticket.objects.filter(pk=str(data.get("before_ticket_id") or "")).first()
            if (
                target is None
                or target.pk == ticket.pk
                or target.state != TicketState.WAITING
                or (target.service_id, target.stage, target.service_date)
                != (ticket.service_id, ticket.stage, ticket.service_date)
            ):
                raise FieldRule("before_ticket_id", WRONG_QUEUE)
            old_position = position(ticket)
            ticket.priority_rank = target.priority_rank
            ticket.arrival_at = target.arrival_at - dt.timedelta(microseconds=1)
            _save(ticket, "priority_rank", "arrival_at")
            extra["old_position"] = old_position
            extra["new_position"] = position(ticket)
            record(
                "visits.ticket.reorder",
                request=actor.request,
                facility_id=ticket.facility_id,
                object_type="visits.ticket",
                object_id=ticket.pk,
                metadata={"reason_code": reason_code, **{k: str(v) for k, v in extra.items()}},
            )
        else:
            raise BusinessRuleViolation(NOT_ALLOWED)

        _event(
            ticket,
            action.replace("-", "_"),
            before,
            actor,
            reason_code=reason_code,
            reason_text=reason_text,
            **extra,
        )
        if action in ("priority", "transfer"):
            record(
                f"visits.ticket.{action}",
                request=actor.request,
                facility_id=ticket.facility_id,
                object_type="visits.ticket",
                object_id=ticket.pk,
                metadata={k: str(v) for k, v in extra.items()},
            )
        _queue_changed(ticket)
        if result is not ticket:
            _event(result, "opened", "", actor, from_ticket_id=ticket.pk)
            _queue_changed(result)
        _visit_changed(visit)
    return result


# ---- duty status -------------------------------------------------------------------------------


def set_duty(
    *,
    facility_id: Any,
    membership: Any,
    state: str,
    service_point_id: Any = None,
    until_at: dt.datetime | None = None,
) -> DutyStatus:
    if state not in DutyState.values:
        raise FieldRule("state", NOT_ALLOWED)
    if (
        service_point_id
        and not ServicePoint.objects.filter(
            pk=service_point_id, facility_id=facility_id, is_active=True
        ).exists()
    ):
        raise FieldRule("service_point_id", NOT_ALLOWED)
    with transaction.atomic():
        row, _created = DutyStatus.objects.select_for_update().get_or_create(
            facility_id=facility_id, membership=membership
        )
        before = row.state
        row.state = state
        row.service_point_id = (
            service_point_id if state == DutyState.ON_DUTY else row.service_point_id
        )
        row.until_at = until_at if state == DutyState.BREAK else None
        row.save()
        if before != state:
            DutyStatusEvent.objects.create(
                facility_id=facility_id,
                membership=membership,
                from_state=before,
                to_state=state,
                occurred_at=timezone.now(),
            )
        outbox.emit(outbox.DUTY_CHANGED, facility_id, membership_id=membership.pk)
    return row


def serving_point_services(facility_id: Any, service_point_id: Any) -> list[Any]:
    return list(
        ServicePointService.objects.filter(
            facility_id=facility_id, service_point_id=service_point_id
        ).values_list("service_id", flat=True)
    )


# ---- estimate ----------------------------------------------------------------------------------


@dataclass(frozen=True)
class Estimate:
    ahead: int
    minimum: int | None
    maximum: int | None
    status: str | None  # "break", "emergency", "none_on_duty"
    until: dt.datetime | None = None


def _round5(value: float, up: bool) -> int:
    return int((math.ceil if up else math.floor)(value / 5) * 5)


def average_minutes(ticket: Ticket) -> float:
    done = Ticket.objects.filter(
        facility_id=ticket.facility_id,
        service_id=ticket.service_id,
        stage=ticket.stage,
        service_date=ticket.service_date,
        started_at__isnull=False,
        ended_at__isnull=False,
    ).values_list("started_at", "ended_at")[:200]
    durations = [(end - start).total_seconds() / 60 for start, end in done if start and end]
    if len(durations) >= 3:
        return max(sum(durations) / len(durations), 1.0)
    return float(ticket.service.duration_minutes or 15)


def doctors_for(facility_id: Any, service_id: Any) -> QuerySet[DutyStatus]:
    points = ServicePointService.objects.filter(facility_id=facility_id, service_id=service_id)
    return DutyStatus.objects.filter(facility_id=facility_id).filter(
        Q(service_point__isnull=True) | Q(service_point_id__in=points.values("service_point_id"))
    )


def estimate(ticket: Ticket) -> Estimate:
    ahead = position(ticket)
    duties = list(doctors_for(ticket.facility_id, ticket.service_id).exclude(state=DutyState.OFF))
    on_duty = [d for d in duties if d.state == DutyState.ON_DUTY]
    if ticket.stage == Stage.CONSULTATION and not on_duty:
        if any(d.state == DutyState.EMERGENCY for d in duties):
            return Estimate(ahead, None, None, "emergency")
        breaks = [d.until_at for d in duties if d.state == DutyState.BREAK and d.until_at]
        if breaks:
            return Estimate(ahead, None, None, "break", min(breaks))
        return Estimate(ahead, None, None, "none_on_duty")
    minutes = ahead * average_minutes(ticket) / max(len(on_duty), 1)
    return Estimate(
        ahead,
        _round5(minutes * 0.8, up=False),
        max(_round5(minutes * 1.25, up=True), 5),
        "emergency" if any(d.state == DutyState.EMERGENCY for d in duties) else None,
    )


def remember_estimate(ticket: Ticket, value: Estimate) -> None:
    """Store what was shown (estimate accuracy reports, contract §2.2)."""
    if value.minimum is None:
        return
    Ticket.objects.filter(pk=ticket.pk).update(
        estimate_min_minutes=value.minimum,
        estimate_max_minutes=value.maximum,
        estimate_shown_at=timezone.now(),
    )


# ---- end of day and step-outs ------------------------------------------------------------------


def end_of_day(facility_id: Any, now: dt.datetime | None = None) -> int:
    """Close the day's queue when past closing time + buffer (FR-QUE-15). Returns tickets closed."""
    now = now or timezone.now()
    local = timezone.localtime(now)
    day = local.date()
    calendar = effective_calendar(facility_id, day, day)
    ranges = calendar[0].open if calendar else []
    buffer = dt.timedelta(minutes=queue_settings(facility_id)["end_of_day_minutes"])
    if ranges:
        closing = timezone.make_aware(
            dt.datetime.combine(day, max(r[1] for r in ranges)), timezone.get_current_timezone()
        )
        if now < closing + buffer:
            return 0
    closable = (
        TicketState.WAITING,
        TicketState.CALLED,
        TicketState.NO_RESPONSE,
        TicketState.ON_HOLD,
    )
    closed = 0
    with transaction.atomic():
        tickets = list(
            Ticket.objects.select_for_update()
            .filter(facility_id=facility_id, service_date__lte=day, state__in=closable)
            .select_related("visit")
        )
        for ticket in tickets:
            before = ticket.state
            ticket.state = TicketState.LEFT_WITHOUT_SERVICE
            ticket.ended_at = now
            _save(ticket, "state", "ended_at")
            _event(ticket, "end_of_day", before, None)
            _close_visit_if_done(ticket.visit, VisitStatus.LEFT_WITHOUT_SERVICE)
            closed += 1
        if closed:
            record(
                "visits.end_of_day",
                facility_id=facility_id,
                object_type="tenancy.facility",
                object_id=facility_id,
                metadata={"closed": closed},
            )
            outbox.emit(outbox.QUEUE_CHANGED, facility_id, service_id=None, stage=None)
    return closed


def expire_step_outs(facility_id: Any) -> int:
    now = timezone.now()
    with transaction.atomic():
        tickets = list(
            Ticket.objects.select_for_update().filter(
                facility_id=facility_id, state=TicketState.WAITING, step_out_until__lte=now
            )
        )
        for ticket in tickets:
            ticket.step_out_until = None
            _save(ticket, "step_out_until")
            _event(ticket, "step_out_expired", TicketState.WAITING, None)
            _queue_changed(ticket)
    return len(tickets)


# ---- display links -----------------------------------------------------------------------------


def hash_token(token: str) -> bytes:
    return hashlib.sha256(token.encode("utf-8")).digest()


def create_display_link(
    *, facility_id: Any, label: str, service_ids: list[Any], actor: Any, request: Any
) -> tuple[DisplayLink, str]:
    valid = set(
        Service.objects.filter(facility_id=facility_id, pk__in=service_ids).values_list(
            "pk", flat=True
        )
    )
    if not service_ids or len(valid) != len(set(service_ids)):
        raise FieldRule("service_ids", NOT_ALLOWED)
    token = secrets.token_urlsafe(32)
    link = DisplayLink.objects.create(
        facility_id=facility_id,
        label=label.strip()[:80],
        service_ids=list(valid),
        token_hash=hash_token(token),
        created_by=actor,
    )
    record(
        "visits.display_link.create",
        request=request,
        facility_id=facility_id,
        object_type="visits.display_link",
        object_id=link.pk,
    )
    return link, token


def revoke_display_link(link: DisplayLink, *, request: Any) -> DisplayLink:
    if link.revoked_at is None:
        link.revoked_at = timezone.now()
        link.save(update_fields=["revoked_at", "updated_at"])
        record(
            "visits.display_link.revoke",
            request=request,
            facility_id=link.facility_id,
            object_type="visits.display_link",
            object_id=link.pk,
        )
    return link
