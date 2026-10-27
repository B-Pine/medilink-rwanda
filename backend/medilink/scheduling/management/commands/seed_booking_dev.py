"""manage.py seed_booking_dev: bookable demo facilities and one upcoming booking. DEBUG only.

Kigali Demo Clinic (private, RAMA and MMI) gets General and Paediatric consultations with the demo
doctor's mornings; Musanze Demo Health Centre (public, Mutuelle, configured by seed_setup_dev) gets
catalogue codes and remote join. Slots and the public listing are generated for both, and the demo
patient gets one upcoming booking. Synthetic data only; safe to run again.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from medilink.accounts.models import User
from medilink.billing.models import InsurerRule, TariffItem
from medilink.facilities.models import (
    Department,
    OpeningHours,
    Profile,
    Service,
    ServicePoint,
)
from medilink.patients.models import PatientLink
from medilink.scheduling import booking, listing, slots
from medilink.scheduling.models import Booking, BookingStatus, ScheduleTemplate, Slot
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import Facility, FacilityMembership

KIGALI = "kigali-demo-clinic"
MUSANZE = "musanze-demo-health-centre"
DOCTOR = "doctor@demo.medilink.test"
PATIENT = "patient@demo.medilink.test"
KIGALI_SERVICES = [
    # prefix, catalogue code, rw, en, fr, minutes, price, remote join
    ("G", "general_consultation", "Ubuvuzi rusange", "General consultation",
     "Consultation générale", 15, 8000, True),
    ("P", "paediatric_consultation", "Ubuvuzi bw'abana", "Paediatric consultation",
     "Consultation pédiatrique", 20, 10000, False),
]  # fmt: skip
MUSANZE_CODES = {"G": "general_consultation", "M": "antenatal_care", "L": "laboratory_tests"}


class Command(BaseCommand):
    help = "Bookable demo facilities, slots, listing and one upcoming booking (DEBUG only)."

    def handle(self, *args: Any, **options: Any) -> None:
        if not settings.DEBUG:
            raise CommandError("seed_booking_dev runs only with DEBUG=True.")
        doctor = User.objects.filter(email=DOCTOR).first()
        if doctor is None:
            raise CommandError("Run seed_dev first (demo doctor).")
        kigali = Facility.objects.filter(slug=KIGALI).first()
        musanze = Facility.objects.filter(slug=MUSANZE).first()
        if kigali is not None:
            self._kigali(kigali, doctor)
        if musanze is not None:
            self._musanze(musanze)
        for facility in (f for f in (kigali, musanze) if f is not None):
            with rls_context(facility_id=facility.pk):
                made = slots.generate(facility.pk)
                rows = listing.refresh(facility.pk)
            self.stdout.write(
                f"Booking: {facility.name}: {made['created']} new slots, {rows} listing rows."
            )
        if kigali is not None:
            self._patient_booking(kigali)

    def _kigali(self, facility: Facility, doctor: User) -> None:
        today = timezone.localdate()
        with rls_context(facility_id=facility.pk):
            Profile.objects.update_or_create(
                facility=facility,
                defaults={
                    "phone": "+250788100100",
                    "address": "KG 11 Ave, Kimihurura, Kigali",
                    "latitude": "-1.9536",
                    "longitude": "30.0919",
                    "level_of_care": "primary",
                    "description_i18n": {
                        "en": "Private clinic with general and children's consultations.",
                        "fr": "Clinique privée : consultations générales et pédiatriques.",
                        "rw": "Ivuriro ryigenga: ubuvuzi rusange n'ubw'abana.",
                    },
                },
            )
            if Service.objects.filter(facility=facility, catalogue_item_code__gt="").exists():
                return
            department = Department.objects.filter(facility=facility).first() or (
                Department.objects.create(
                    facility=facility,
                    name_i18n={"rw": "Ubuvuzi", "en": "Outpatients", "fr": "Consultations"},
                )
            )
            point = ServicePoint.objects.filter(facility=facility, kind="room").first() or (
                ServicePoint.objects.create(facility=facility, name="Room 3", kind="room")
            )
            if not OpeningHours.objects.filter(facility=facility, service__isnull=True).exists():
                for weekday in range(6):
                    OpeningHours.objects.create(
                        facility=facility,
                        weekday=weekday,
                        opens_at=dt.time(7, 30),
                        closes_at=dt.time(18, 0) if weekday < 5 else dt.time(13, 0),
                    )
            membership = FacilityMembership.objects.filter(facility=facility, user=doctor).first()
            if membership is not None and membership.licence_attested_at is None:
                membership.licence_attested_at = timezone.now()
                membership.save()
            used = set(
                Service.objects.filter(facility=facility).values_list("ticket_prefix", flat=True)
            )
            for prefix, code, rw, en, fr, minutes, price, remote in KIGALI_SERVICES:
                if prefix in used:
                    Service.objects.filter(facility=facility, ticket_prefix=prefix).update(
                        catalogue_item_code=code, allows_remote_join=remote
                    )
                    continue
                service = Service.objects.create(
                    facility=facility,
                    department=department,
                    catalogue_item_code=code,
                    name_i18n={"rw": rw, "en": en, "fr": fr},
                    duration_minutes=minutes,
                    ticket_prefix=prefix,
                    allows_remote_join=remote,
                    min_age_months=None if prefix == "G" else 0,
                    max_age_months=None if prefix == "G" else 180,
                )
                point.services.add(service, through_defaults={"facility": facility})
                TariffItem.objects.create(
                    facility=facility,
                    code=f"SVC-{prefix}",
                    name_i18n={"rw": rw, "en": en, "fr": fr},
                    kind="service",
                    service=service,
                    amount_rwf=price,
                    valid_from=today,
                    created_by=doctor,
                )
                if membership is not None:
                    days = range(5) if prefix == "G" else (1, 3)
                    for weekday in days:
                        ScheduleTemplate.objects.create(
                            facility=facility,
                            membership=membership,
                            service=service,
                            service_point=point,
                            weekday=weekday,
                            starts_at=dt.time(8) if prefix == "G" else dt.time(14),
                            ends_at=dt.time(12) if prefix == "G" else dt.time(17),
                            slot_minutes=minutes,
                            capacity=2,
                            bookable_share_pct=50,
                            valid_from=today,
                        )
            for code, share in (("rama", 1500), ("mmi", 1000)):
                if not InsurerRule.objects.filter(facility=facility, insurer_code=code).exists():
                    InsurerRule.objects.create(
                        facility=facility,
                        insurer_code=code,
                        patient_share_bp=share,
                        valid_from=today,
                        created_by=doctor,
                    )

    def _musanze(self, facility: Facility) -> None:
        with rls_context(facility_id=facility.pk):
            for prefix, code in MUSANZE_CODES.items():
                Service.objects.filter(facility=facility, ticket_prefix=prefix).update(
                    catalogue_item_code=code, allows_remote_join=prefix == "G"
                )
            Profile.objects.filter(facility=facility).update(level_of_care="primary")

    def _patient_booking(self, facility: Facility) -> None:
        user = User.objects.filter(email=PATIENT).first()
        link = (
            PatientLink.objects.for_account(user).active().filter(relationship="self").first()
            if user
            else None
        )
        if user is None or link is None:
            return
        with rls_context(facility_id=facility.pk, user_id=user.pk):
            if Booking.objects.filter(
                patient_id=link.patient_id, status=BookingStatus.CONFIRMED
            ).exists():
                self.stdout.write("Booking: the demo patient already has an upcoming booking.")
                return
            soon = timezone.now() + dt.timedelta(days=2)
            slot = (
                Slot.objects.filter(facility=facility, status="open", starts_at__gte=soon)
                .exclude(service__catalogue_item_code="paediatric_consultation")
                .order_by("starts_at")
                .first()
            )
            if slot is None:
                return
            held = slots.hold(slot.pk, account=user)
            booking.book(
                hold_id=held.pk,
                patient=link.patient,
                who=booking.Who(user=user),
                symptoms=[{"code": "cough", "duration_days": 4}, {"code": "fever"}],
            )
        self.stdout.write("Booking: one upcoming booking for the demo patient.")
