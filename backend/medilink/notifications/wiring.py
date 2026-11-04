"""Wave 6 part A: domain signals to `notify()` (contract sprint-09 §11).

Every signal here is sent after the domain change commits, with IDs only. Each receiver loads
what it needs in the facility's RLS context and calls `notify()` inside it. A receiver never
raises: the change already happened, so a failure is logged and the notice is lost (the delivery
log shows what was sent).
"""

from __future__ import annotations

import functools
import logging
from collections.abc import Callable
from typing import Any

from django.utils import timezone

from medilink.notifications import wiring_events as ev
from medilink.notifications.recipients import Recipients, RecipientSpec
from medilink.notifications.service import notify
from medilink.tenancy.context import rls_context

logger = logging.getLogger(__name__)

NEXT_AHEAD = 3  # "you are next (N ahead)": analysis 09 §4 default; a facility setting later
# W7: "almost your turn" goes to a ticket with ALMOST_FROM..NEXT_AHEAD people ahead, once per ticket
# (the dedupe key), so a ticket that jumps past position 3 in one move still hears it. "1 people"
# reads badly in all three languages, and the call itself is one step away then.
ALMOST_FROM = 2
# Ticket actions that can bring a waiting ticket closer to the front
MOVES = frozenset(
    {
        "call",
        "cancel",
        "left",
        "transfer",
        "no_response",
        "reorder",
        "priority",
        "emergency",
        "pass_over",
        "pass_over_expired",
    }
)


def _quiet(handler: Callable[..., None]) -> Callable[..., None]:
    @functools.wraps(handler)
    def run(*args: Any, **kwargs: Any) -> None:
        try:
            handler(*args, **kwargs)
        except Exception:
            logger.exception("notification wiring failed", extra={"handler": handler.__name__})

    return run


def _facility_name(facility_id: Any) -> str:
    from medilink.tenancy.models import Facility

    return str(Facility.objects.values_list("name", flat=True).get(pk=facility_id))


def close_family(patient_id: Any) -> RecipientSpec:
    """The patient's own and guardian accounts, never a delegate's (W7: results of restricted
    consultations and the care schedule, the way the patient app shows them)."""
    from medilink.patients.models import PatientLink, Relationship

    close = set(
        PatientLink.objects.filter(
            patient_id=patient_id,
            revoked_at__isnull=True,
            relationship__in=(Relationship.SELF, Relationship.GUARDIAN),
        ).values_list("account_id", flat=True)
    )
    return Recipients.explicit(
        *[r for r in Recipients.patient(patient_id).resolve() if r.user_id in close]
    )


# ---- bookings (S5) -------------------------------------------------------------------------------


def _booking(booking_id: Any) -> Any:
    from medilink.scheduling.models import Booking

    return Booking.objects.get(pk=booking_id)


def _booking_notice(event: str, booking: Any, *, today_is_critical: bool = False) -> None:
    critical = today_is_critical and booking.service_date == timezone.localdate()
    notify(
        event,
        Recipients.patient(booking.patient_id),
        {
            "facility_name": _facility_name(booking.facility_id),
            "date": booking.starts_at,
            "time": booking.starts_at,
            "booking_id": booking.pk,
        },
        facility_id=booking.facility_id,
        patient_id=booking.patient_id,
        priority="critical" if critical else None,
        is_for_today=critical,
    )


@_quiet
def booking_confirmed(sender: Any, booking_id: Any, facility_id: Any, **kwargs: Any) -> None:
    with rls_context(facility_id=facility_id):
        _booking_notice(ev.BOOKING_CONFIRMED, _booking(booking_id))


@_quiet
def booking_cancelled(sender: Any, booking_id: Any, facility_id: Any, **kwargs: Any) -> None:
    with rls_context(facility_id=facility_id):
        booking = _booking(booking_id)
        if booking.cancel_reason_code in (None, "", "patient_request"):
            return  # the patient cancelled it themselves
        _booking_notice(ev.BOOKING_CANCELLED, booking, today_is_critical=True)


@_quiet
def booking_changed(sender: Any, booking_id: Any, facility_id: Any, **kwargs: Any) -> None:
    with rls_context(facility_id=facility_id):
        _booking_notice(ev.BOOKING_CHANGED, _booking(booking_id), today_is_critical=True)


@_quiet
def no_show(sender: Any, booking_id: Any, facility_id: Any, **kwargs: Any) -> None:
    with rls_context(facility_id=facility_id):
        booking = _booking(booking_id)
        notify(
            ev.BOOKING_NO_SHOW,
            Recipients.patient(booking.patient_id),
            {
                "facility_name": _facility_name(facility_id),
                "date": booking.starts_at,
                "booking_id": booking.pk,
            },
            facility_id=facility_id,
            patient_id=booking.patient_id,
        )


# ---- queue (S4, S5) ------------------------------------------------------------------------------


@_quiet
def ticket_event(
    sender: Any, ticket_id: Any, facility_id: Any, action: str = "", **kwargs: Any
) -> None:
    if action not in MOVES:
        return
    from medilink.visits.models import Ticket

    with rls_context(facility_id=facility_id):
        ticket = Ticket.objects.select_related("visit", "service_point").get(pk=ticket_id)
        if action == "call":
            _called(ticket, facility_id)
        _almost(ticket, facility_id)


def _called(ticket: Any, facility_id: Any) -> None:
    """Where to go; a counter with no room name gets the plain "it's your turn" (W7)."""
    room = ticket.service_point.name if ticket.service_point is not None else ""
    ids = {"ticket_id": ticket.pk, "visit_id": ticket.visit_id}
    notify(
        ev.TICKET_CALLED if room else ev.TICKET_CALLED_DESK,
        Recipients.patient(ticket.visit.patient_id),
        {"ticket_number": ticket.number, "room": room, **ids}
        if room
        else {"ticket_number": ticket.number, "facility_name": _facility_name(facility_id), **ids},
        facility_id=facility_id,
        patient_id=ticket.visit.patient_id,
        is_for_today=True,
    )


def _almost(ticket: Any, facility_id: Any) -> None:
    """Tickets of the same queue with ALMOST_FROM..NEXT_AHEAD people before them now. The dedupe
    key (one per ticket) keeps it to once, whichever move brought them there."""
    from medilink.visits import services as visits

    order = visits.calling_order(
        facility_id, ticket.service_id, ticket.stage, day=ticket.service_date
    )
    name = ""
    for ahead, waiting in enumerate(order[: NEXT_AHEAD + 1]):
        if ahead < ALMOST_FROM:
            continue
        name = name or _facility_name(facility_id)
        notify(
            ev.TICKET_ALMOST,
            Recipients.patient(waiting.visit.patient_id),
            {
                "ticket_number": waiting.number,
                "count": ahead,
                "facility_name": name,
                "ticket_id": waiting.pk,
                "visit_id": waiting.visit_id,
            },
            facility_id=facility_id,
            patient_id=waiting.visit.patient_id,
            is_for_today=True,
        )


@_quiet
def pass_over_warning(
    sender: Any, ticket_id: Any, visit_id: Any, facility_id: Any, final: bool = False, **kw: Any
) -> None:
    if final:
        return  # the move itself shows in the tracker; the warning was the notice
    from medilink.visits.models import Ticket

    with rls_context(facility_id=facility_id):
        ticket = Ticket.objects.select_related("visit").get(pk=ticket_id)
        notify(
            ev.TICKET_PASS_OVER,
            Recipients.patient(ticket.visit.patient_id),
            {
                "ticket_number": ticket.number,
                "facility_name": _facility_name(facility_id),
                "ticket_id": ticket.pk,
                "visit_id": visit_id,
            },
            facility_id=facility_id,
            patient_id=ticket.visit.patient_id,
            is_for_today=True,
        )


# ---- pharmacy (S7) -------------------------------------------------------------------------------


@_quiet
def prescription_ready(sender: Any, prescription_id: Any, facility_id: Any, **kwargs: Any) -> None:
    from medilink.pharmacy.models import Prescription

    with rls_context(facility_id=facility_id):
        p = Prescription.objects.get(pk=prescription_id)
        notify(
            ev.RX_READY,
            Recipients.patient(p.patient_id),
            {"facility_name": _facility_name(facility_id), "prescription_id": p.pk},
            facility_id=facility_id,
            patient_id=p.patient_id,
        )
        notify(
            ev.RX_TO_DISPENSE,
            Recipients.facility_staff(facility_id, permission="pharmacy.dispense"),
            {"prescription_id": p.pk},
            facility_id=facility_id,
        )


@_quiet
def prescription_dispensed(
    sender: Any, prescription_id: Any, record_id: Any, facility_id: Any, **kwargs: Any
) -> None:
    from medilink.pharmacy.models import Prescription

    with rls_context(facility_id=facility_id):
        p = Prescription.objects.get(pk=prescription_id)
        notify(
            ev.RX_DISPENSED,
            Recipients.patient(p.patient_id),
            {
                "facility_name": _facility_name(facility_id),
                "prescription_id": p.pk,
                "record_id": record_id,
            },
            facility_id=facility_id,
            patient_id=p.patient_id,
        )


@_quiet
def query_raised(
    sender: Any, query_id: Any, prescription_id: Any, facility_id: Any, **kwargs: Any
) -> None:
    from medilink.pharmacy.models import Prescription

    with rls_context(facility_id=facility_id):
        p = Prescription.objects.select_related("prescriber_membership").get(pk=prescription_id)
        notify(
            ev.RX_QUERY,
            Recipients.users(p.prescriber_membership.user_id, audience="staff"),
            {"query_id": query_id, "consultation_id": p.consultation_id},
            facility_id=facility_id,
        )


# ---- lab results (W2, W7) ------------------------------------------------------------------------


@_quiet
def lab_result_released(sender: Any, lab_order_id: Any, facility_id: Any, **kwargs: Any) -> None:
    """Tell the patient a result is ready, never which test. One notice per visit and hour: a
    doctor releasing three tests together sends one. Delegates hear nothing of a restricted
    consultation, as they see nothing of it (clinical_patient_lab_results)."""
    from medilink.clinical.models import Consultation, LabOrder, LabOrderState

    with rls_context(facility_id=facility_id):
        order = LabOrder.objects.get(pk=lab_order_id)
        if order.state != LabOrderState.RELEASED or order.released_at is None:
            return
        restricted = Consultation.objects.filter(
            pk=order.consultation_id, is_restricted=True
        ).exists()
        released = timezone.localtime(order.released_at)
        notify(
            ev.LAB_RESULT_READY,
            close_family(order.patient_id) if restricted else Recipients.patient(order.patient_id),
            {"facility_name": _facility_name(facility_id), "lab_order_id": order.pk},
            facility_id=facility_id,
            patient_id=order.patient_id,
            dedupe_key=f"{ev.LAB_RESULT_READY}:{order.visit_id}:{released:%Y%m%d%H}",
        )


# ---- documents (S7b) -----------------------------------------------------------------------------


@_quiet
def document_generated(sender: Any, document_id: Any, facility_id: Any, **kwargs: Any) -> None:
    from medilink.documents.models import Document, DocumentKind

    with rls_context(facility_id=facility_id):
        d = Document.objects.get(pk=document_id)
        if d.kind == DocumentKind.PRESCRIPTION:
            return  # "medicines ready" already tells the patient
        notify(
            ev.DOCUMENT_READY,
            Recipients.patient(d.patient_id),
            {"facility_name": _facility_name(facility_id), "document_id": d.pk},
            facility_id=facility_id,
            patient_id=d.patient_id,
        )


# ---- platform (S1, S3) ---------------------------------------------------------------------------


@_quiet
def application_submitted(application_id: Any) -> None:
    """Called by S1's `dispatch()` after commit (S1-I6)."""
    from medilink.onboarding.models import Application

    with rls_context():
        application = Application.objects.get(pk=application_id)
        notify(
            ev.APPLICATION_SUBMITTED,
            Recipients.platform_admins(),
            {"facility_name": application.facility_name, "application_id": application.pk},
        )


@_quiet
def merge_requested(sender: Any, merge_id: Any, **kwargs: Any) -> None:
    with rls_context():
        notify(ev.MERGE_REQUESTED, Recipients.platform_admins(), {"merge_id": merge_id})


def connect() -> None:
    """Called once from NotificationsConfig.ready()."""
    from medilink.clinical.lab import lab_result_released as lab_signal
    from medilink.documents.services import document_generated as doc_signal
    from medilink.patients.merge_requests import merge_requested as merge_signal
    from medilink.pharmacy import signals as rx
    from medilink.scheduling import booking as bookings
    from medilink.visits.remote import ticket_pass_over_warning
    from medilink.visits.services import on_ticket_event

    pairs: list[tuple[Any, Callable[..., None]]] = [
        (bookings.booking_confirmed, booking_confirmed),
        (bookings.booking_cancelled, booking_cancelled),
        (bookings.booking_changed_by_facility, booking_changed),
        (bookings.no_show_recorded, no_show),
        (on_ticket_event, ticket_event),
        (ticket_pass_over_warning, pass_over_warning),
        (rx.prescription_ready, prescription_ready),
        (rx.prescription_dispensed, prescription_dispensed),
        (rx.query_raised, query_raised),
        (doc_signal, document_generated),
        (merge_signal, merge_requested),
        (lab_signal, lab_result_released),
    ]
    for signal, handler in pairs:
        signal.connect(handler, dispatch_uid=f"notifications.wiring.{handler.__name__}")
