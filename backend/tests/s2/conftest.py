"""S2 fixtures: a facility in setup, staff clients by role, and a ready-made catalogue."""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient

from medilink.accounts.models import ClinicianProfile
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import FacilityMembership, FacilityStatus
from tests.conftest import login_staff
from tests.factories import FacilityFactory, make_staff

S = "/api/v1/staff/"
F = "/api/v1/staff/facility/"
NAMES = {"rw": "Ubuvuzi rusange", "en": "General consultation", "fr": "Consultation générale"}


@pytest.fixture
def setup_facility(db: Any) -> Any:
    return FacilityFactory(
        name="Remera Test Clinic", slug="remera-test", status=FacilityStatus.SETUP
    )


def client_for(facility: Any, roles: tuple[str, ...], email: str) -> tuple[APIClient, Any]:
    user = make_staff(facility, roles=roles, email=email)
    client = APIClient()
    login_staff(client, user)
    return client, user


@pytest.fixture
def admin(setup_facility: Any) -> tuple[APIClient, Any]:
    return client_for(setup_facility, ("facility_admin",), "fadmin@example.test")


@pytest.fixture
def admin_client(admin: tuple[APIClient, Any]) -> APIClient:
    return admin[0]


@pytest.fixture
def reception(setup_facility: Any) -> APIClient:
    return client_for(setup_facility, ("receptionist",), "desk2@example.test")[0]


@pytest.fixture
def doctor(setup_facility: Any) -> tuple[APIClient, Any]:
    return client_for(setup_facility, ("doctor",), "doc2@example.test")


def membership_of(user: Any, facility: Any) -> FacilityMembership:
    with rls_context(facility_id=facility.pk):
        return FacilityMembership.objects.get(user=user, facility=facility)


def attest(user: Any, facility: Any, licence: str = "RMDC/1234") -> FacilityMembership:
    from django.utils import timezone

    ClinicianProfile.objects.get_or_create(
        user=user, defaults={"council": "rmdc", "licence_number": licence}
    )
    with rls_context(facility_id=facility.pk):
        membership = FacilityMembership.objects.get(user=user, facility=facility)
        membership.licence_attested_at = timezone.now()
        membership.save()
    return membership


def make_catalogue(client: APIClient) -> dict[str, Any]:
    department = client.post(f"{S}departments/", {"name_i18n": NAMES}, format="json")
    assert department.status_code == 201, department.content
    service = client.post(
        f"{S}services/",
        {
            "department_id": department.json()["id"],
            "name_i18n": NAMES,
            "duration_minutes": 15,
            "ticket_prefix": "G",
        },
        format="json",
    )
    assert service.status_code == 201, service.content
    service_id = service.json()["service"]["id"]
    point = client.post(
        f"{S}service-points/",
        {"name": "Room 1", "kind": "room", "service_ids": [service_id]},
        format="json",
    )
    assert point.status_code == 201, point.content
    return {
        "department": department.json(),
        "service": service.json()["service"],
        "point": point.json(),
    }


WEEK = [
    {
        "weekday": d,
        "opens_at": "08:00",
        "closes_at": "17:00",
        "break_starts_at": "12:00",
        "break_ends_at": "13:00",
    }
    for d in range(5)
]


def set_hours(client: APIClient, service_id: str | None = None) -> Any:
    current = client.get(
        f"{F}opening-hours/" + (f"?service_id={service_id}" if service_id else "")
    ).json()
    response = client.put(
        f"{F}opening-hours/",
        {"service_id": service_id, "version": current["version"], "days": WEEK},
        format="json",
    )
    assert response.status_code == 200, response.content
    return response.json()
