"""manage.py seed_dev: synthetic demo data for local development. Refuses to run unless DEBUG.

Creates an organisation, "Kigali Demo Clinic" (+ a second facility to demo the facility picker),
one user per facility role, a platform admin and a patient, and prints dev-only passwords.
Idempotent: running it again resets the demo users' passwords. All data is synthetic.
"""

from __future__ import annotations

import secrets
from typing import Any

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction

from medilink.accounts.models import Language, User
from medilink.patients.models import PatientLink
from medilink.patients.services import register_patient
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import (
    Facility,
    FacilityMembership,
    FacilityStatus,
    FacilityType,
    Organization,
    Ownership,
    Role,
)

ORGANIZATION = "MediLink Demo Health Ltd"
FACILITIES = {
    "kigali-demo-clinic": ("Kigali Demo Clinic", FacilityType.PRIVATE_CLINIC, Ownership.PRIVATE),
    "musanze-demo-health-centre": (
        "Musanze Demo Health Centre",
        FacilityType.HEALTH_CENTER,
        Ownership.PUBLIC,
    ),
}
# email, full name, platform admin, {facility slug: [roles]}
STAFF = [
    ("platform.admin@demo.medilink.test", "Mugisha Eric", True, {}),
    (
        "facility.admin@demo.medilink.test",
        "Uwase Aline",
        False,
        {"kigali-demo-clinic": ["facility_admin"]},
    ),
    (
        "receptionist@demo.medilink.test",
        "Ingabire Grace",
        False,
        {"kigali-demo-clinic": ["receptionist"]},
    ),
    (
        "doctor@demo.medilink.test",
        "Habimana Jean Bosco",
        False,
        {"kigali-demo-clinic": ["doctor"], "musanze-demo-health-centre": ["doctor"]},
    ),
    (
        "pharmacist@demo.medilink.test",
        "Mukeshimana Diane",
        False,
        {"kigali-demo-clinic": ["pharmacist"]},
    ),
]
PATIENT = ("patient@demo.medilink.test", "Mukamana Jeanne")


# Sprint dev seeders, run after the core demo data (shared-file protocol: one command name per
# sprint, ONLY between its markers). Each must refuse to run when DEBUG is false.
DEV_SEED_COMMANDS: list[str] = [
    # [S1]
    "seed_masterdata_dev",
    # [/S1]
    # [S3]
    # [/S3]
    # [S9]
    # [/S9]
]


class Command(BaseCommand):
    help = "Seed synthetic demo data for local development (DEBUG only)."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--password",
            help="Use this password for every demo user (default: a new random one per user).",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        if not settings.DEBUG:
            raise CommandError("seed_dev refuses to run when DEBUG is False (development only).")
        fixed_password = options.get("password")
        if fixed_password:
            self._check_password(fixed_password)

        credentials: list[tuple[str, str, str]] = []
        with transaction.atomic():
            organization, _ = Organization.objects.get_or_create(name=ORGANIZATION)
            facilities = {}
            for slug, (name, facility_type, ownership) in FACILITIES.items():
                facilities[slug], _ = Facility.objects.update_or_create(
                    slug=slug,
                    defaults={
                        "organization": organization,
                        "name": name,
                        "facility_type": facility_type,
                        "ownership": ownership,
                        "status": FacilityStatus.LIVE,
                    },
                )
            roles = {role.code: role for role in Role.objects.all()}

            for email, full_name, is_platform_admin, memberships in STAFF:
                password = fixed_password or self._random_password()
                user, _ = User.objects.update_or_create(
                    email=email,
                    defaults={
                        "full_name": full_name,
                        "is_platform_admin": is_platform_admin,
                        "is_active": True,
                        "preferred_language": Language.RW,
                    },
                )
                user.set_password(password)
                user.save()
                for slug, role_codes in memberships.items():
                    facility = facilities[slug]
                    # FacilityMembership is RLS-protected: write it inside that facility's context.
                    with rls_context(facility_id=facility.pk, user_id=user.pk):
                        membership, _ = FacilityMembership.objects.update_or_create(
                            user=user,
                            facility=facility,
                            defaults={"is_active": True, "deactivated_at": None},
                        )
                        membership.roles.set([roles[code] for code in role_codes])
                label = (
                    "platform admin"
                    if is_platform_admin
                    else ", ".join(
                        f"{'+'.join(codes)} @ {facilities[slug].name}"
                        for slug, codes in memberships.items()
                    )
                )
                credentials.append((email, label, password))

            email, full_name = PATIENT
            password = fixed_password or self._random_password()
            patient_user = User.objects.filter(email=email).first()
            if patient_user is None:
                register_patient(
                    full_name=full_name,
                    email=email,
                    password=password,
                    preferred_language=Language.RW,
                    accepted_terms_version="2026-10",
                    accepted_privacy_version="2026-10",
                    research_consent=False,
                )
            else:
                patient_user.set_password(password)
                patient_user.save()
                if not PatientLink.objects.for_account(patient_user).active().exists():
                    raise CommandError("The demo patient account exists without a patient profile.")
            credentials.append((email, "patient", password))

        for command in DEV_SEED_COMMANDS:  # sprint seeders, e.g. "seed_patients_dev"
            call_command(command, stdout=self.stdout)
        self.stdout.write(self.style.SUCCESS("Demo data ready (synthetic, development only)."))
        self.stdout.write("Staff sign in at staff-web and set up TOTP on first login.\n")
        width = max(len(email) for email, _, _ in credentials)
        for email, label, password in credentials:
            self.stdout.write(f"  {email.ljust(width)}  {password}  ({label})")

    @staticmethod
    def _random_password() -> str:
        return "dev-" + secrets.token_urlsafe(15)

    @staticmethod
    def _check_password(password: str) -> None:
        candidate = User(email="seed@demo.medilink.test", full_name="Seed")
        candidate._password_audience = "patient"  # type: ignore[attr-defined]  # noqa: S105
        try:
            validate_password(password, candidate)
        except ValidationError as exc:
            raise CommandError("--password rejected: " + " ".join(exc.messages)) from exc
