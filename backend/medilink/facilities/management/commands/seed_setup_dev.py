"""manage.py seed_setup_dev: configure the second demo facility (contract §7). DEBUG only.

The first demo facility ("Kigali Demo Clinic") is left as it is, so it stays an example of a
facility in setup; "Musanze Demo Health Centre" gets departments, services, hours, a doctor's
week, prices and an insurer rule.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from medilink.accounts.models import ClinicianProfile, User
from medilink.billing.models import InsurerRule, TariffItem
from medilink.facilities.models import Department, OpeningHours, Profile, Service, ServicePoint
from medilink.scheduling.models import ScheduleTemplate
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import Facility, FacilityMembership

FACILITY = "musanze-demo-health-centre"
DOCTOR = "doctor@demo.medilink.test"
SERVICES = [
    ("G", "Ubuvuzi rusange", "General consultation", "Consultation générale", 15, 3000),
    ("M", "Kwita ku babyeyi", "Maternal care", "Soins maternels", 20, 2000),
    ("L", "Laboratwari", "Laboratory", "Laboratoire", 10, 1500),
]


class Command(BaseCommand):
    help = "Configure the second demo facility (DEBUG only)."

    def handle(self, *args: Any, **options: Any) -> None:
        if not settings.DEBUG:
            raise CommandError("seed_setup_dev runs only with DEBUG=True.")
        facility = Facility.objects.filter(slug=FACILITY).first()
        doctor = User.objects.filter(email=DOCTOR).first()
        if facility is None or doctor is None:
            raise CommandError("Run seed_dev first (demo facilities and doctor).")
        today = timezone.localdate()
        with rls_context(facility_id=facility.pk):
            if Department.objects.filter(facility=facility).exists():
                self.stdout.write("Facility setup: already seeded.")
                return
            Profile.objects.update_or_create(
                facility=facility,
                defaults={
                    "phone": "+250788200200",
                    "address": "Musanze town, near the market",
                    "latitude": "-1.499",
                    "longitude": "29.634",
                    "description_i18n": {"en": "Public health centre serving Musanze."},
                },
            )
            department = Department.objects.create(
                facility=facility,
                name_i18n={"rw": "Ubuvuzi", "en": "Outpatients", "fr": "Consultations"},
            )
            point = ServicePoint.objects.create(facility=facility, name="Room 1", kind="room")
            for weekday in range(5):
                OpeningHours.objects.create(
                    facility=facility,
                    weekday=weekday,
                    opens_at=dt.time(7, 30),
                    closes_at=dt.time(17, 0),
                    break_starts_at=dt.time(12, 30),
                    break_ends_at=dt.time(13, 30),
                )
            OpeningHours.objects.create(
                facility=facility, weekday=5, opens_at=dt.time(8), closes_at=dt.time(12)
            )
            ClinicianProfile.objects.get_or_create(
                user=doctor, defaults={"council": "rmdc", "licence_number": "RMDC/DEMO/001"}
            )
            membership = FacilityMembership.objects.filter(facility=facility, user=doctor).first()
            if membership:
                membership.licence_attested_at = timezone.now()
                membership.save()
            for prefix, rw, en, fr, minutes, price in SERVICES:
                service = Service.objects.create(
                    facility=facility,
                    department=department,
                    name_i18n={"rw": rw, "en": en, "fr": fr},
                    duration_minutes=minutes,
                    ticket_prefix=prefix,
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
                if membership and prefix == "G":
                    for weekday in range(5):
                        ScheduleTemplate.objects.create(
                            facility=facility,
                            membership=membership,
                            service=service,
                            service_point=point,
                            weekday=weekday,
                            starts_at=dt.time(8),
                            ends_at=dt.time(12),
                            slot_minutes=minutes,
                            valid_from=today,
                        )
            InsurerRule.objects.create(
                facility=facility,
                insurer_code="mutuelle",
                patient_share_bp=1000,
                valid_from=today,
                created_by=doctor,
            )
        self.stdout.write(f"Facility setup: {facility.name} configured.")
