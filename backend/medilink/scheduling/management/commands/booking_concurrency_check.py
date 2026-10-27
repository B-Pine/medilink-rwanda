"""manage.py booking_concurrency_check: S5-B5 against the dev database. DEBUG only.

As S4's queue_concurrency_check (sprint-04 D-9): the test suite runs inside one transaction, so
this command commits rows in a throwaway facility and races real threads with their own
connections. 20 patients try to hold a slot with 3 bookable places: exactly 3 holds succeed and
17 get `slot_taken`; the slot's counters match the rows.
"""

from __future__ import annotations

import datetime as dt
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections
from django.utils import timezone
from django.utils.crypto import get_random_string

from medilink.accounts.models import User
from medilink.facilities.models import Department, Service
from medilink.scheduling import slots
from medilink.scheduling.errors import BookingConflict
from medilink.scheduling.models import Slot, SlotHold
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import Facility, FacilityStatus, Organization

PEOPLE = 20
PLACES = 3


def _in_thread(fn: Any) -> Any:
    def run(*args: Any) -> Any:
        try:
            return fn(*args)
        finally:
            connections.close_all()

    return run


class Command(BaseCommand):
    help = "Prove that parallel holds never overbook a slot (DEBUG only)."

    def handle(self, *args: Any, **options: Any) -> None:
        if not settings.DEBUG:
            raise CommandError("booking_concurrency_check runs only with DEBUG=True.")
        tag = get_random_string(6).lower()
        org = Organization.objects.create(name=f"Booking check {tag}")
        facility = Facility.objects.create(
            organization=org,
            name=f"Booking Check Clinic {tag}",
            slug=f"booking-check-{tag}",
            facility_type="health_center",
            ownership="private",
            status=FacilityStatus.LIVE,
        )
        users = [
            User.objects.create_user(
                email=f"bc-{tag}-{i}@example.test", password=None, full_name=f"Person {i}"
            )
            for i in range(PEOPLE)
        ]
        starts = timezone.now() + dt.timedelta(days=2)
        with rls_context(facility_id=facility.pk):
            department = Department.objects.create(facility=facility, name_i18n={"en": "OPD"})
            service = Service.objects.create(
                facility=facility,
                department=department,
                name_i18n={"en": "General"},
                ticket_prefix="B",
            )
            slot = Slot.objects.create(
                facility=facility,
                service=service,
                starts_at=starts,
                ends_at=starts + dt.timedelta(minutes=15),
                capacity=PLACES * 2,
                bookable_capacity=PLACES,
            )

        # The service save queued a slot refresh, which closes slots that no template wants:
        # reopen this hand-made one
        with rls_context(facility_id=facility.pk):
            Slot.objects.filter(pk=slot.pk).update(status="open")

        @_in_thread
        def try_hold(user: User) -> str:
            try:
                with rls_context(facility_id=facility.pk):
                    slots.hold(slot.pk, account=user)
                return "held"
            except BookingConflict as exc:
                return str(exc.default_code)

        with ThreadPoolExecutor(max_workers=10) as pool:
            outcomes = list(pool.map(try_hold, users))
        with rls_context(facility_id=facility.pk):
            slot.refresh_from_db()
            holds = SlotHold.objects.filter(slot=slot, released_at__isnull=True).count()

        held = outcomes.count("held")
        taken = outcomes.count("slot_taken")
        self.stdout.write(f"Holds: {held} held, {taken} slot_taken (of {PEOPLE})")
        self.stdout.write(f"Slot counters: held_count={slot.held_count}, open rows={holds}")
        ok = held == PLACES and taken == PEOPLE - PLACES and slot.held_count == holds == PLACES
        if not ok:
            raise CommandError("Booking concurrency check FAILED.")
        self.stdout.write(self.style.SUCCESS("Booking concurrency check passed."))
