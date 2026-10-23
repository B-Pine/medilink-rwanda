"""manage.py seed_patients_dev: synthetic patients at the demo clinic (contract §5). DEBUG only.

Names, phone numbers and documents are invented for development and demos.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from medilink.accounts.models import User
from medilink.patients import consents, identity
from medilink.patients.models import (
    ConsentChannel,
    ConsentKind,
    CreatedVia,
    FacilityPatient,
    Patient,
)
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import Facility

FACILITY = "kigali-demo-clinic"
REGISTRAR = "receptionist@demo.medilink.test"
# full name, sex, date of birth, estimated, phone, file number, national ID
PATIENTS: list[tuple[str, str, date, bool, str | None, str, str | None]] = [
    (
        "Niyonsaba Claudine",
        "female",
        date(1992, 3, 14),
        False,
        "+250788100001",
        "KDC-0001",
        "1199270000000011",
    ),
    ("Hakizimana Patrick", "male", date(1985, 1, 1), True, "+250788100002", "KDC-0002", None),
    (
        "Mukandayisenga Odette",
        "female",
        date(1960, 1, 1),
        True,
        None,
        "KDC-0003",
        "1196070000000022",
    ),
    ("Iradukunda Kevin", "male", date(2016, 8, 20), False, "+250788100004", "KDC-0004", None),
    ("Uwimana Josiane", "female", date(2001, 11, 5), False, "+250788100005", "KDC-0005", None),
    ("Uwimana Josianne", "female", date(2001, 11, 5), False, None, "KDC-0006", None),
]


class Command(BaseCommand):
    help = "Seed synthetic patients at the demo clinic (DEBUG only)."

    def handle(self, *args: Any, **options: Any) -> None:
        if not settings.DEBUG:
            raise CommandError("seed_patients_dev runs only with DEBUG=True.")
        facility = Facility.objects.filter(slug=FACILITY).first()
        registrar = User.objects.filter(email=REGISTRAR).first()
        if facility is None or registrar is None:
            raise CommandError("Run seed_dev first (demo clinic and receptionist).")
        created = 0
        with rls_context(facility_id=facility.pk):
            for name, sex, born, estimated, phone, file_number, national_id in PATIENTS:
                if FacilityPatient.objects.filter(
                    facility=facility, file_number=file_number
                ).exists():
                    continue
                patient = Patient.objects.create(
                    full_name=name,
                    sex=sex,
                    date_of_birth=born,
                    is_birth_date_estimated=estimated,
                    phone_e164=phone,
                    created_via=CreatedVia.WALK_IN,
                )
                identity.assign_medilink_number(patient)
                FacilityPatient.objects.create(
                    facility=facility,
                    patient=patient,
                    file_number=file_number,
                    first_visit_on=timezone.localdate(),
                    registered_by=registrar,
                )
                if national_id:
                    identity.add_identifier(
                        patient,
                        kind="national_id",
                        country="RW",
                        value=national_id,
                        actor=registrar,
                        verified=True,
                        facility_id=facility.pk,
                    )
                consents.record_consent(
                    kind=ConsentKind.CARE,
                    version=consents.current_version(ConsentKind.CARE),
                    granted=True,
                    channel=ConsentChannel.STAFF_ASSISTED,
                    patient=patient,
                    recorded_by=registrar,
                    facility_id=facility.pk,
                )
                created += 1
        self.stdout.write(f"Patients: {created} created at {facility.name}.")
