"""manage.py queue_concurrency_check: S4-B4..B6 against the dev database. DEBUG only.

pytest can't test real concurrency here (the suite runs inside one transaction and avoids
`transaction=True`, tests/conftest.py), so this command commits real rows in a throwaway facility
and runs threads with their own connections:

- 4 parallel check-ins of the same patient → one ticket
- parallel check-ins of other patients → daily numbers without gaps
- 4 doctors calling next in parallel → every ticket called once
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections
from django.utils.crypto import get_random_string

from medilink.accounts.models import User
from medilink.core.exceptions import Conflict
from medilink.facilities.models import Department, Service, ServicePoint
from medilink.patients.models import FacilityPatient, Patient
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import Facility, FacilityMembership, FacilityStatus, Organization
from medilink.visits import services
from medilink.visits.models import Ticket


def _in_thread(fn: Any) -> Any:
    def run(*args: Any) -> Any:
        try:
            return fn(*args)
        finally:
            connections.close_all()

    return run


class Command(BaseCommand):
    help = "Prove check-in idempotency, gapless numbers and atomic call-next (DEBUG only)."

    def handle(self, *args: Any, **options: Any) -> None:
        if not settings.DEBUG:
            raise CommandError("queue_concurrency_check runs only with DEBUG=True.")
        tag = get_random_string(6).lower()
        org = Organization.objects.create(name=f"Concurrency check {tag}")
        facility = Facility.objects.create(
            organization=org,
            name=f"Concurrency Check Clinic {tag}",
            slug=f"concurrency-{tag}",
            facility_type="health_center",
            ownership="private",
            status=FacilityStatus.LIVE,
        )
        users = [
            User.objects.create_user(
                email=f"cc-{tag}-{i}@example.test", password=None, full_name=f"Doctor {i}"
            )
            for i in range(4)
        ]
        with rls_context(facility_id=facility.pk):
            department = Department.objects.create(facility=facility, name_i18n={"en": "OPD"})
            service = Service.objects.create(
                facility=facility,
                department=department,
                name_i18n={"en": "General"},
                ticket_prefix="C",
            )
            point = ServicePoint.objects.create(facility=facility, name="Room", kind="room")
            members = [FacilityMembership.objects.create(facility=facility, user=u) for u in users]
            records = []
            for i in range(11):
                patient = Patient.objects.create(full_name=f"Check Person {tag} {i}")
                records.append(
                    FacilityPatient.objects.create(
                        facility=facility,
                        patient=patient,
                        first_visit_on=services.today(),
                        registered_by=users[0],
                    )
                )
            for m in members:
                services.set_duty(
                    facility_id=facility.pk,
                    membership=m,
                    state="on_duty",
                    service_point_id=point.pk,
                )

        @_in_thread
        def check_in(record: FacilityPatient) -> bool:
            with rls_context(facility_id=facility.pk):
                _v, _t, created = services.check_in(
                    facility_id=facility.pk,
                    facility_patient=record,
                    service=service,
                    source="walk_in",
                    actor=services.Actor(user=users[0], membership=members[0]),
                )
                return created

        with ThreadPoolExecutor(max_workers=4) as pool:
            same = list(pool.map(check_in, [records[0]] * 4))
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(check_in, records[1:]))
        with rls_context(facility_id=facility.pk):
            sequences = sorted(
                Ticket.objects.filter(service=service).values_list("sequence", flat=True)
            )

        @_in_thread
        def serve(member: FacilityMembership) -> list[str]:
            got: list[str] = []
            actor = services.Actor(user=member.user, membership=member)
            while True:
                with rls_context(facility_id=facility.pk):
                    try:
                        ticket = services.call_next(
                            facility_id=facility.pk,
                            service_id=service.pk,
                            stage="consultation",
                            actor=actor,
                        )
                    except Conflict:
                        continue
                    if ticket is None:
                        return got
                    got.append(str(ticket.pk))
                    ticket = services.act(ticket.pk, "start", version=ticket.version, actor=actor)
                    services.act(ticket.pk, "complete", version=ticket.version, actor=actor)

        with ThreadPoolExecutor(max_workers=4) as pool:
            served = [t for batch in pool.map(serve, members) for t in batch]

        checks = {
            "one ticket for 4 parallel check-ins of one patient": same.count(True) == 1,
            "numbers 1..11 without gaps": sequences == list(range(1, 12)),
            "11 tickets served, none twice": len(served) == len(set(served)) == 11,
        }
        for name, ok in checks.items():
            self.stdout.write(f"{'PASS' if ok else 'FAIL'}  {name}")
        if not all(checks.values()):
            raise CommandError("Concurrency check failed.")
