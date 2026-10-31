"""S5 periodic jobs (contract sprint-05 §5). Each facility runs in its own RLS context."""

from __future__ import annotations

from typing import Any

from celery import shared_task
from django.db import connection

from medilink.facilities.models import PublicListing
from medilink.scheduling import booking, listing, slots
from medilink.tenancy.context import rls_context
from medilink.visits import remote
from medilink.visits.tasks import _open_facilities


def _booking_facilities() -> list[Any]:
    """Facilities with past confirmed bookings or open holds (SECURITY DEFINER: no context yet)."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT facility_id FROM scheduling_booking_facilities()")
        return [row[0] for row in cursor.fetchall()]


@shared_task(name="medilink.scheduling.tasks.refresh_facility")
def refresh_facility(facility_id: str) -> int:
    """Slots and listing of one facility, after a configuration change."""
    with rls_context(facility_id=facility_id):
        slots.generate(facility_id)
        return listing.refresh(facility_id)


@shared_task(name="medilink.scheduling.tasks.generate_slots")
def generate_slots() -> int:
    created = 0
    for facility_id in listing.live_facilities():
        with rls_context(facility_id=facility_id):
            created += slots.generate(facility_id)["created"]
    return created


@shared_task(name="medilink.scheduling.tasks.refresh_public_listing")
def refresh_public_listing() -> int:
    live = listing.live_facilities()
    PublicListing.objects.exclude(facility_id__in=live).delete()
    total = 0
    for facility_id in live:
        with rls_context(facility_id=facility_id):
            total += listing.refresh(facility_id)
    return total


@shared_task(name="medilink.scheduling.tasks.expire_holds")
def expire_holds() -> int:
    total = 0
    for facility_id in _booking_facilities():
        with rls_context(facility_id=facility_id):
            total += slots.expire_holds(facility_id)
    return total


@shared_task(name="medilink.scheduling.tasks.mark_no_shows")
def mark_no_shows() -> int:
    total = 0
    for facility_id in _booking_facilities():
        with rls_context(facility_id=facility_id):
            total += booking.mark_no_shows(facility_id)
    return total


@shared_task(name="medilink.scheduling.tasks.pass_over")
def pass_over() -> int:
    total = 0
    for facility_id in _open_facilities():
        with rls_context(facility_id=facility_id):
            total += remote.pass_over(facility_id)
    return total


@shared_task(name="medilink.scheduling.tasks.purge")
def purge() -> int:
    total = 0
    for facility_id in listing.live_facilities():
        with rls_context(facility_id=facility_id):
            total += slots.purge(facility_id)
    return total
