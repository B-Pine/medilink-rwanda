"""S3 fixtures: random patient keys per test session (never committed), staff clients by role,
and a helper that registers a walk-in through the API."""

from __future__ import annotations

import base64
import os
from collections.abc import Iterator
from typing import Any

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from tests.conftest import login_patient, login_staff
from tests.factories import make_patient_user, make_staff


def _key() -> str:
    return base64.urlsafe_b64encode(os.urandom(32)).decode()


KEYS = {
    "field_keys": f"1:{_key()}",
    "field_active": "1",
    "index_keys": f"1:{_key()}",
    "index_active": "1",
}


@pytest.fixture(autouse=True)
def patient_keys(tmp_path: Any) -> Iterator[None]:
    with override_settings(
        PATIENT_KEYS=KEYS,
        UPLOADS={
            "storage": "local",
            "scanner": "fake",
            "local_root": str(tmp_path / "objects"),
            "download_base_url": "http://testserver/api/v1/files",
        },
    ):
        yield


def staff_client_for(facility: Any, roles: tuple[str, ...], email: str) -> tuple[APIClient, Any]:
    user = make_staff(facility, roles=roles, email=email)
    client = APIClient()
    login_staff(client, user)
    return client, user


@pytest.fixture
def reception(facility: Any) -> APIClient:
    return staff_client_for(facility, ("receptionist",), "desk@example.test")[0]


@pytest.fixture
def doctor(facility: Any) -> APIClient:
    return staff_client_for(facility, ("doctor",), "doctor@example.test")[0]


@pytest.fixture
def pharmacist(facility: Any) -> APIClient:
    return staff_client_for(facility, ("pharmacist",), "pharmacy@example.test")[0]


@pytest.fixture
def admin_client(facility: Any) -> APIClient:
    return staff_client_for(facility, ("facility_admin",), "admin@example.test")[0]


@pytest.fixture
def other_reception(other_facility: Any) -> APIClient:
    return staff_client_for(other_facility, ("receptionist",), "huye-desk@example.test")[0]


def patient_client_for(email: str, full_name: str = "Uwase Aline") -> tuple[APIClient, Any]:
    user = make_patient_user(email=email, full_name=full_name)
    client = APIClient()
    login_patient(client, user)
    return client, user


NATIONAL_ID = "1198480012345678"


def walk_in(client: APIClient, **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "full_name": "Mukamana Jeanne",
        "sex": "female",
        "date_of_birth": "1984-03-02",
        "phone_e164": "0788123456",
        "care_consent": {"version": "2026-10", "granted": True},
    }
    body.update(overrides)
    response = client.post("/api/v1/staff/patients/", body, format="json")
    assert response.status_code == 201, response.content
    return response.json()


@pytest.fixture
def platform_client(db: Any) -> APIClient:
    user = make_staff(None, email="super.admin@example.test", is_platform_admin=True)
    client = APIClient()
    login_staff(client, user)
    return client
