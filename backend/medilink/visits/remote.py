"""Remote queue join for today, "I'm here" with reception confirmation, and pass-over (contract
sprint-05 §2.2, FR-SCH-09, FR-QUE-07). Callers run inside the facility's RLS context."""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db import IntegrityError, transaction
from django.dispatch import Signal
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from medilink.audit.services import record
from medilink.facilities.calendar import KIGALI, effective_calendar
from medilink.facilities.models import Service
from medilink.patients.models import FacilityPatient
from medilink.scheduling.errors import BookingRule
from medilink.scheduling.slots import booking_settings
from medilink.visits.models import (
    RANK_NORMAL,
    Ticket,
    TicketState,
    Visit,
    VisitSource,
    VisitStatus,
)
from medilink.visits.services import (
    Actor,
    _close_visit_if_done,
    _event,
    _existing_visit,
    _new_ticket,
    _queue_changed,
    _save,
    _visit_changed,
    active_ticket,
    add_symptoms,
    calling_order,
    first_stage,
    mark_on_site,
    place_in_order,
    queue_settings,
    today,
)

# S9 warns the patient `queue.pass_over_warning_minutes` before each pass-over step.
# kwargs: ticket_id, visit_id, facility_id, final (True: the next step loses the ticket)
ticket_pass_over_warning = Signal()

REMOTE_CLOSED = _("Joining from home is closed for today at this service. Go to reception.")
FACILITY_CLOSED = _("This facility is closed today.")


def facility_record(facility_id: Any, patient_id: Any, user: Any) -> FacilityPatient:
    """The patient's record at this facility, created on first contact (online booking or remote
    join); reception confirms details at check-in."""
    record_ = FacilityPatient.objects.filter(facility_id=facility_id, patient_id=patient_id).first()
    if record_ is not None:
        return record_
    try:
        with transaction.atomic():
            return FacilityPatient.objects.create(
                facility_id=facility_id,
                patient_id=patient_id,
                first_visit_on=today(),
                registered_by=user,
            )
    except IntegrityError:
        return FacilityPatient.objects.get(facility_id=facility_id, patient_id=patient_id)


def _open_now(facility_id: Any, service: Service, now: dt.datetime) -> bool:
    local = now.astimezone(KIGALI)
    day = effective_calendar(facility_id, local.date(), local.date(), service_id=service.pk)
    return any(a <= local.time() < b for a, b in (day[0].open if day else []))


def join(
    *,
    facility_id: Any,
    service: Service,
    patient_id: Any,
    actor: Actor,
    key: Any = None,
    symptoms: list[dict[str, Any]] | None = None,
    language: str = "en",
) -> tuple[Visit, Ticket, bool]:
    """A place in today's walk-in queue from home: the ticket waits but is not called until
    reception confirms the patient is on site (FR-QUE-07; self check-in FR-QUE-18 is P2)."""
    now = timezone.now()
    cutoff = dt.time.fromisoformat(booking_settings(facility_id)["remote_join_cutoff"])
    if (
        not service.is_active
        or not service.allows_remote_join
        or now.astimezone(KIGALI).time() >= cutoff
    ):
        raise BookingRule(REMOTE_CLOSED, "remote_closed")
    if not _open_now(facility_id, service, now):
        raise BookingRule(FACILITY_CLOSED, "remote_closed")
    day = today()
    existing = _existing_visit(facility_id, patient_id, day, key)
    if existing:
        return existing, active_ticket(existing) or existing.tickets.latest("created_at"), False
    record_ = facility_record(facility_id, patient_id, actor.user)
    settings_ = queue_settings(facility_id)
    try:
        with transaction.atomic():
            visit = Visit.objects.create(
                facility_id=facility_id,
                facility_patient=record_,
                patient_id=patient_id,
                service_date=day,
                source=VisitSource.REMOTE_JOIN,
                status=VisitStatus.REMOTE_PENDING,
                first_service=service,
                check_in_key=key,
            )
            ticket = _new_ticket(
                visit, service, first_stage(settings_), rank=RANK_NORMAL, arrival_at=now
            )
            ticket.is_remote = True
            ticket.save(update_fields=["is_remote", "updated_at"])
            add_symptoms(visit, symptoms, language)
    except IntegrityError:
        existing = _existing_visit(facility_id, patient_id, day, key)
        if not existing:
            raise
        return existing, active_ticket(existing) or existing.tickets.latest("created_at"), False
    _event(ticket, "remote_join", "", actor)
    record(
        "visits.check_in",
        request=actor.request,
        facility_id=facility_id,
        object_type="visits.visit",
        object_id=visit.pk,
        metadata={"source": visit.source, "service_id": str(service.pk), "remote": "true"},
    )
    _queue_changed(ticket)
    _visit_changed(visit)
    return visit, ticket, True


def claim_arrival(ticket: Ticket, *, actor: Actor) -> Ticket:
    """The patient's "I'm here" from the tracker (contract sprint-05 B9) records the claim only.
    The ticket is not called, and pass-over still applies, until reception confirms it."""
    with transaction.atomic():
        locked = Ticket.objects.select_for_update().select_related("visit").get(pk=ticket.pk)
        if (
            not locked.is_remote
            or locked.remote_arrival_claimed_at is not None
            or locked.remote_arrival_confirmed_at is not None
        ):
            return locked
        locked.remote_arrival_claimed_at = timezone.now()
        _save(locked, "remote_arrival_claimed_at")
        _event(locked, "arrival_claimed", locked.state, actor)
        _queue_changed(locked)
        _visit_changed(locked.visit)
    return locked


def confirm_arrival(ticket: Ticket, *, actor: Actor) -> Ticket:
    """Reception sees the remote joiner on site (R10, or a check-in of the same patient): the
    visit becomes `on_site` and the ticket can be called."""
    with transaction.atomic():
        locked = Ticket.objects.select_for_update().select_related("visit").get(pk=ticket.pk)
        if not locked.is_remote or locked.remote_arrival_confirmed_at is not None:
            return locked
        mark_on_site(locked, actor, timezone.now())
        _event(locked, "confirm_arrival", locked.state, actor)
        _queue_changed(locked)
        _visit_changed(locked.visit)
    return locked


def _warn(ticket: Ticket, facility_id: Any, *, final: bool) -> None:
    ticket.pass_over_warned_at = timezone.now()
    _save(ticket, "pass_over_warned_at")
    _event(ticket, "pass_over_warning", ticket.state, None, final=final)
    ids = (ticket.pk, ticket.visit_id, facility_id)
    transaction.on_commit(
        lambda i=ids: ticket_pass_over_warning.send(  # type: ignore[misc]
            sender=Ticket, ticket_id=i[0], visit_id=i[1], facility_id=i[2], final=final
        )
    )


def pass_over(facility_id: Any) -> int:
    """Remote tickets not confirmed on site that come within `pass_over_places` of the front are
    warned first; `pass_over_warning_minutes` later they move back by that many places, and after
    `pass_over_limit` moves they lose the ticket (FR-QUE-07). Returns tickets warned, moved or
    closed."""
    settings_ = queue_settings(facility_id)
    places, limit = settings_["pass_over_places"], settings_["pass_over_limit"]
    notice = dt.timedelta(minutes=settings_["pass_over_warning_minutes"])
    changed = 0
    day = today()
    queues = (
        Ticket.objects.filter(
            facility_id=facility_id,
            service_date=day,
            state=TicketState.WAITING,
            is_remote=True,
            remote_arrival_confirmed_at__isnull=True,
        )
        .values_list("service_id", "stage")
        .distinct()
    )
    for service_id, stage in list(queues):
        with transaction.atomic():
            order = calling_order(facility_id, service_id, stage, day=day)
            for index, candidate in enumerate(order[:places]):
                if not candidate.is_remote or candidate.remote_arrival_confirmed_at is not None:
                    continue
                ticket = (
                    Ticket.objects.select_for_update().select_related("visit").get(pk=candidate.pk)
                )
                if (
                    ticket.state != TicketState.WAITING
                    or ticket.remote_arrival_confirmed_at is not None
                ):
                    continue
                final = ticket.pass_over_count >= limit
                now = timezone.now()
                if ticket.pass_over_warned_at is None:
                    _warn(ticket, facility_id, final=final)
                elif now < ticket.pass_over_warned_at + notice:
                    continue
                elif final:
                    before = ticket.state
                    ticket.state = TicketState.LEFT_WITHOUT_SERVICE
                    ticket.ended_at = now
                    _save(ticket, "state", "ended_at")
                    _event(ticket, "pass_over_expired", before, None)
                    _close_visit_if_done(ticket.visit, VisitStatus.LEFT_WITHOUT_SERVICE)
                else:
                    others = [t for t in order if t.pk != ticket.pk]
                    if not place_in_order(ticket, others, index + places):
                        continue
                    ticket.pass_over_count += 1
                    ticket.pass_over_warned_at = None
                    _save(ticket, "order_at", "pass_over_count", "pass_over_warned_at")
                    _event(ticket, "pass_over", ticket.state, None, count=ticket.pass_over_count)
                _queue_changed(ticket)
                _visit_changed(ticket.visit)
                changed += 1
                break  # one step per queue per run: positions change after a move
    return changed
