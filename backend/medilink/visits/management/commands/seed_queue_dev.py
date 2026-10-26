"""manage.py seed_queue_dev: today's queue at the configured demo facility. DEBUG only.

Musanze Demo Health Centre (configured by seed_setup_dev) gets five walk-ins checked in today,
one of them a priority patient, the demo doctor on duty in the first room, and the demo
receptionist as a member so the reception board can be tried. Synthetic people only.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from medilink.accounts.models import User
from medilink.facilities.models import Service, ServicePoint
from medilink.patients.models import FacilityPatient, Patient
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import Facility, FacilityMembership, Role
from medilink.visits import services
from medilink.visits.models import Visit

FACILITY = "musanze-demo-health-centre"
DOCTOR = "doctor@demo.medilink.test"
RECEPTION = "receptionist@demo.medilink.test"
PEOPLE = [
    ("Uwimana Claudine", dt.date(1991, 4, 2), "female", None),
    ("Nshimiyimana Patrick", dt.date(1957, 8, 19), "male", "elderly"),
    ("Mukandayisenga Alice", dt.date(1999, 1, 23), "female", None),
    ("Habyarimana Jean", dt.date(1983, 11, 5), "male", None),
    ("Ingabire Divine", dt.date(2016, 6, 30), "female", None),
]


class Command(BaseCommand):
    help = "Check in today's demo queue at the configured demo facility (DEBUG only)."

    def handle(self, *args: Any, **options: Any) -> None:
        if not settings.DEBUG:
            raise CommandError("seed_queue_dev runs only with DEBUG=True.")
        facility = Facility.objects.filter(slug=FACILITY).first()
        if facility is None:
            self.stdout.write("Queue: demo facility missing; run seed_dev first.")
            return
        doctor = User.objects.filter(email=DOCTOR).first()
        desk = User.objects.filter(email=RECEPTION).first()
        with rls_context(facility_id=facility.pk):
            if Visit.objects.filter(service_date=services.today()).exists():
                self.stdout.write("Queue: today's queue already seeded.")
                return
            service = Service.objects.filter(is_active=True).order_by("ticket_prefix").first()
            point = ServicePoint.objects.filter(is_active=True).order_by("name").first()
            if service is None or doctor is None or desk is None:
                self.stdout.write("Queue: run seed_setup_dev first.")
                return
            membership, _ = FacilityMembership.objects.get_or_create(
                facility=facility, user=desk, defaults={"is_active": True}
            )
            membership.roles.add(*Role.objects.filter(code="receptionist"))
            desk_membership = membership
            doctor_membership = FacilityMembership.objects.get(facility=facility, user=doctor)
            services.set_duty(
                facility_id=facility.pk,
                membership=doctor_membership,
                state="on_duty",
                service_point_id=point.pk if point else None,
            )
            actor = services.Actor(user=desk, membership=desk_membership)
            for name, born, sex, priority in PEOPLE:
                patient = Patient.objects.create(full_name=name, date_of_birth=born, sex=sex)
                record = FacilityPatient.objects.create(
                    facility=facility,
                    patient=patient,
                    first_visit_on=services.today(),
                    registered_by=desk,
                )
                services.check_in(
                    facility_id=facility.pk,
                    facility_patient=record,
                    service=service,
                    source="walk_in",
                    actor=actor,
                    priority_class=priority,
                    priority_reason_code="age" if priority else None,
                )
        self.stdout.write(f"Queue: {len(PEOPLE)} walk-ins checked in at {facility.name}.")
