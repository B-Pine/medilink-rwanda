"""S4 fixtures: a live facility with a service and room, staff by role, registered patients."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from medilink.patients.models import FacilityPatient, Patient
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import FacilityStatus
from tests.factories import FacilityFactory, make_patient_user
from tests.s2.conftest import client_for, make_catalogue, membership_of

S = "/api/v1/staff/"


@pytest.fixture(autouse=True)
def patient_keys() -> Any:
    from tests.patients.conftest import KEYS

    with override_settings(PATIENT_KEYS=KEYS):
        yield


@pytest.fixture
def clinic(db: Any) -> Any:
    return FacilityFactory(name="Gisozi Clinic", slug="gisozi", status=FacilityStatus.LIVE)


@pytest.fixture
def admin(clinic: Any) -> tuple[APIClient, Any]:
    return client_for(clinic, ("facility_admin",), "q-admin@example.test")


@pytest.fixture
def catalogue(admin: tuple[APIClient, Any]) -> dict[str, Any]:
    return make_catalogue(admin[0])


@pytest.fixture
def desk(clinic: Any) -> tuple[APIClient, Any]:
    return client_for(clinic, ("receptionist",), "q-desk@example.test")


@pytest.fixture
def doctor(clinic: Any) -> tuple[APIClient, Any]:
    return client_for(clinic, ("doctor",), "q-doc@example.test")


@pytest.fixture
def doctor2(clinic: Any) -> tuple[APIClient, Any]:
    return client_for(clinic, ("doctor",), "q-doc2@example.test")


def register(clinic: Any, by: Any, name: str, born: dt.date | None = None) -> FacilityPatient:
    patient = Patient.objects.create(full_name=name, date_of_birth=born or dt.date(1990, 1, 1))
    with rls_context(facility_id=clinic.pk):
        return FacilityPatient.objects.create(
            facility=clinic, patient=patient, first_visit_on=dt.date.today(), registered_by=by
        )


def check_in(client: APIClient, record: FacilityPatient, service_id: str, **extra: Any) -> Any:
    return client.post(
        f"{S}visits/check-in/",
        {"facility_patient_id": str(record.pk), "service_id": service_id, **extra},
        format="json",
    )


def on_duty(client: APIClient, point_id: str | None) -> None:
    response = client.put(
        f"{S}duty-status/", {"state": "on_duty", "service_point_id": point_id}, format="json"
    )
    assert response.status_code == 200, response.content


def call_next(client: APIClient, service_id: str) -> Any:
    return client.post(f"{S}queue/call-next/", {"service_id": service_id}, format="json")


def act(client: APIClient, ticket: dict[str, Any], action: str, **extra: Any) -> Any:
    return client.post(
        f"{S}tickets/{ticket['id']}/{action}/",
        {"version": ticket["version"], **extra},
        format="json",
    )


@pytest.fixture
def patient_account(clinic: Any, desk: tuple[APIClient, Any]) -> tuple[Any, FacilityPatient]:
    user = make_patient_user(email="tracker@example.test", full_name="Uwase Aline")
    patient = user.patient_links.get().patient
    with rls_context(facility_id=clinic.pk):
        record = FacilityPatient.objects.create(
            facility=clinic, patient=patient, first_visit_on=dt.date.today(), registered_by=desk[1]
        )
    return user, record


__all__ = ["membership_of"]
