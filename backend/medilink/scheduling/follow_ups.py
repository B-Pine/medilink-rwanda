"""Follow-ups from a visit (contract sprint-05 §2.2 Follow-up, FR-SCH-15): "come back in N days".
`booking` mode books the first open slot on or after that day (same service, the same doctor when
possible); `reminder` mode stores the due date for S9. Callers run in the visit's facility context.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db import IntegrityError, transaction
from django.db.models import F
from django.dispatch import Signal
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from medilink.audit.services import record
from medilink.facilities.calendar import KIGALI
from medilink.patients.models import InsuranceProfile
from medilink.scheduling import booking as bookings
from medilink.scheduling.errors import BookingConflict
from medilink.scheduling.models import (
    Booking,
    BookingSource,
    BookingStatus,
    FollowUp,
    FollowUpMode,
    FollowUpStatus,
    Slot,
    SlotStatus,
)
from medilink.scheduling.slots import booking_settings
from medilink.visits.models import Visit

# S9 hook: kwargs follow_up_id, facility_id (reminders are S9's, contract §2.2)
follow_up_created = Signal()

EXISTS = _("A follow-up is already set for this visit.")
CANDIDATES = 20


def _candidates(facility_id: Any, service_id: Any, after: dt.datetime, doctor: Any) -> list[Slot]:
    horizon = booking_settings(facility_id)["horizon_days"]
    until = dt.datetime.combine(
        timezone.localdate() + dt.timedelta(days=horizon + 1), dt.time.min, KIGALI
    )
    base = Slot.objects.filter(
        facility_id=facility_id,
        service_id=service_id,
        status=SlotStatus.OPEN,
        starts_at__gte=after,
        starts_at__lt=until,
        booked_count__lt=F("bookable_capacity") - F("held_count"),
    ).order_by("starts_at")
    own = list(base.filter(membership_id=doctor)[:CANDIDATES]) if doctor else []
    return own + [s for s in base[:CANDIDATES] if s not in own]


def _book(fu: FollowUp, visit: Visit, who: bookings.Who) -> Booking | None:
    after = max(
        dt.datetime.combine(fu.due_on, dt.time.min, KIGALI),
        timezone.now(),
    )
    insurer = None
    if visit.insurance_profile_id:
        profile = InsuranceProfile.objects.filter(pk=visit.insurance_profile_id).first()
        insurer = profile.insurer_code if profile else None
    for candidate in _candidates(fu.facility_id, fu.service_id, after, fu.membership_id):
        try:
            with transaction.atomic():
                slot = Slot.objects.select_for_update().get(pk=candidate.pk)
                if slot.status != SlotStatus.OPEN or slot.open_places < 1:
                    continue
                day = timezone.localtime(slot.starts_at).date()
                cost = bookings.estimate(fu.facility_id, fu.service_id, day, insurer)
                booking = Booking.objects.create(
                    facility_id=fu.facility_id,
                    patient_id=fu.patient_id,
                    facility_patient_id=visit.facility_patient_id,
                    booked_by_membership=who.membership,
                    source=BookingSource.FOLLOW_UP,
                    slot=slot,
                    service_id=fu.service_id,
                    membership_id=slot.membership_id,
                    starts_at=slot.starts_at,
                    service_date=day,
                    status=BookingStatus.CONFIRMED,
                    booking_code=bookings._new_code(fu.facility_id),
                    insurance_profile_id=visit.insurance_profile_id,
                    insurer_code=cost.insurer_code,
                    insurer_accepted=cost.insurer_accepted,
                    estimated_fee_rwf=cost.fee_rwf,
                    estimated_patient_share_rwf=cost.patient_share_rwf,
                )
                slot.booked_count += 1
                slot.save(update_fields=["booked_count", "updated_at"])
                bookings._event(booking, "", who, reason_code="follow_up")
                return booking
        except IntegrityError:
            continue  # already booked for this service that day: try the next day's slots
    return None


def create(*, visit: Visit, in_days: int, mode: str, who: bookings.Who) -> FollowUp:
    if FollowUp.objects.filter(visit=visit).exists():
        raise BookingConflict(EXISTS, "follow_up_exists")
    with transaction.atomic():
        fu = FollowUp.objects.create(
            facility_id=visit.facility_id,
            visit=visit,
            patient_id=visit.patient_id,
            service_id=visit.first_service_id,
            membership=who.membership,
            due_on=timezone.localdate() + dt.timedelta(days=in_days),
            mode=mode,
            status=FollowUpStatus.DUE,
            created_by=who.user,
        )
        if mode == FollowUpMode.BOOKING:
            booking = _book(fu, visit, who)
            fu.booking = booking
            fu.status = FollowUpStatus.BOOKED if booking else FollowUpStatus.NO_SLOT
            fu.save(update_fields=["booking", "status", "updated_at"])
    record(
        "scheduling.follow_up.create",
        request=who.request,
        facility_id=fu.facility_id,
        object_type="scheduling.follow_up",
        object_id=fu.pk,
        metadata={"mode": mode, "in_days": in_days, "status": fu.status},
    )
    fu_id, facility_id = fu.pk, fu.facility_id
    transaction.on_commit(
        lambda: follow_up_created.send(sender=FollowUp, follow_up_id=fu_id, facility_id=facility_id)
    )
    if fu.booking_id:
        booking_id = fu.booking_id
        transaction.on_commit(
            lambda: bookings.booking_confirmed.send(
                sender=Booking, booking_id=booking_id, facility_id=facility_id
            )
        )
    return fu
