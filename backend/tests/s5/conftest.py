"""S5 fixtures: a live clinic with hours, a doctor's weekly block, a price and an insurer rule,
and a fixed clock (next Monday 09:00 in Kigali) so slot times don't depend on when tests run."""

from __future__ import annotations

import datetime as dt
from collections.abc import Iterator
from typing import Any
from unittest import mock

import pytest
from rest_framework.test import APIClient

from medilink.billing.models import InsurerRule, TariffItem
from medilink.facilities.calendar import KIGALI
from medilink.facilities.models import Service, Settings
from medilink.scheduling import listing, slots
from medilink.scheduling.models import ScheduleTemplate, Slot
from medilink.tenancy.context import rls_context
from tests.conftest import login_patient
from tests.factories import make_patient_user
from tests.s2.conftest import attest, set_hours
from tests.s4 import conftest as s4

# S4 fixtures reused as they are (a live clinic, its admin, catalogue and staff)
admin, catalogue, clinic = s4.admin, s4.catalogue, s4.clinic
desk, doctor, patient_keys = s4.desk, s4.doctor, s4.patient_keys

P = "/api/v1/patient/"
PUB = "/api/v1/public/"
S = "/api/v1/staff/"


class Clock:
    def __init__(self, now: dt.datetime) -> None:
        self.now = now

    def __call__(self) -> dt.datetime:
        return self.now

    def at(self, hour: int, minute: int = 0, days: int = 0) -> dt.datetime:
        local = self.now.astimezone(KIGALI)
        self.now = dt.datetime.combine(
            local.date() + dt.timedelta(days=days), dt.time(hour, minute), KIGALI
        )
        return self.now


@pytest.fixture
def clock() -> Iterator[Clock]:
    today = dt.datetime.now(KIGALI).date()
    monday = today + dt.timedelta(days=7 - today.weekday())
    value = Clock(dt.datetime.combine(monday, dt.time(9, 0), KIGALI))
    with mock.patch("django.utils.timezone.now", value):
        yield value


def settings_for(clinic: Any, section: str, **values: Any) -> None:
    with rls_context(facility_id=clinic.pk):
        row, _ = Settings.objects.get_or_create(facility=clinic)
        current = dict(getattr(row, section) or {})
        current.update(values)
        setattr(row, section, current)
        row.save()


@pytest.fixture
def bookable(
    clock: Clock,
    clinic: Any,
    admin: tuple[APIClient, Any],
    catalogue: dict[str, Any],
    doctor: tuple[APIClient, Any],
) -> dict[str, Any]:
    """Mon-Fri 08:00-17:00 (lunch 12-13); Dr's block 08:00-12:00 every weekday, 15-minute slots,
    capacity 2 with half bookable; 5 000 RWF; RAMA patients pay 10 %."""
    service_id = catalogue["service"]["id"]
    set_hours(admin[0])
    membership = attest(doctor[1], clinic)
    with rls_context(facility_id=clinic.pk):
        Service.objects.filter(pk=service_id).update(
            catalogue_item_code="general_consultation", allows_remote_join=True
        )
        for weekday in range(5):
            ScheduleTemplate.objects.create(
                facility=clinic,
                membership=membership,
                service_id=service_id,
                service_point_id=catalogue["point"]["id"],
                weekday=weekday,
                starts_at=dt.time(8, 0),
                ends_at=dt.time(12, 0),
                slot_minutes=15,
                capacity=2,
                bookable_share_pct=50,
                valid_from=clock.now.date() - dt.timedelta(days=7),
            )
        TariffItem.objects.create(
            facility=clinic,
            code="CONSULT",
            name_i18n={"en": "Consultation"},
            kind="service",
            service_id=service_id,
            amount_rwf=5000,
            valid_from=clock.now.date() - dt.timedelta(days=30),
            created_by=admin[1],
        )
        InsurerRule.objects.create(
            facility=clinic,
            insurer_code="rama",
            patient_share_bp=1000,
            valid_from=clock.now.date() - dt.timedelta(days=30),
            created_by=admin[1],
        )
        generated = slots.generate(clinic.pk)
        listing.refresh(clinic.pk)
    return {"service_id": service_id, "membership": membership, "generated": generated}


def first_slot(clinic: Any, service_id: str, after: dt.datetime | None = None) -> Slot:
    with rls_context(facility_id=clinic.pk):
        qs = Slot.objects.filter(facility=clinic, service_id=service_id, status="open")
        if after is not None:
            qs = qs.filter(starts_at__gte=after)
        return qs.order_by("starts_at").first()


def patient_client(email: str, name: str) -> tuple[APIClient, Any]:
    user = make_patient_user(email=email, full_name=name)
    client = APIClient()
    login_patient(client, user)
    return client, user


def self_id(user: Any) -> str:
    return str(user.patient_links.get().patient_id)


def book(client: APIClient, user: Any, slot: Slot, key: str | None = None, **extra: Any) -> Any:
    hold = client.post(f"{P}slots/{slot.pk}/hold/")
    assert hold.status_code == 201, hold.content
    headers = {"HTTP_IDEMPOTENCY_KEY": key} if key else {}
    return client.post(
        f"{P}bookings/",
        {
            "hold_id": hold.json()["hold_id"],
            "patient_id": self_id(user),
            "symptoms": [{"code": "fever", "duration_days": 2}],
            **extra,
        },
        format="json",
        **headers,
    )
