"""Public queue figures on the facility profile and in search (contract public-pages-and-triage
§2.1, PT-B1): counts and a wait range only, never a person."""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient

from medilink.scheduling import listing
from medilink.tenancy.context import rls_context
from tests.s4.conftest import check_in, on_duty, register

pytestmark = pytest.mark.django_db

PUB = "/api/v1/public/"


def _service(body: dict[str, Any], service_id: str) -> dict[str, Any]:
    return next(s for s in body["services"] if s["id"] == service_id)


@pytest.mark.acceptance("PT-B1")
def test_profile_shows_waiting_count_and_range_without_people(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
) -> None:
    service_id = catalogue["service"]["id"]
    for name in ("Uwase Aline", "Mugabo Eric", "Ishimwe Kevin"):
        assert check_in(desk[0], register(clinic, desk[1], name), service_id).status_code == 201

    api = APIClient()
    before = _service(api.get(f"{PUB}facilities/{clinic.slug}/").json(), service_id)
    # Nobody on duty: the count is known, the wait is not
    assert before["waiting"] == 3 and before["wait_range"] is None

    on_duty(doctor[0], None)
    body = api.get(f"{PUB}facilities/{clinic.slug}/").json()
    service = _service(body, service_id)
    # 3 waiting x 15 min / 1 doctor = 45 min, shown as -20 % .. +25 %, rounded to 5
    assert service["waiting"] == 3
    assert service["wait_range"] == {"min": 35, "max": 60}
    text = str(body)
    for name in ("Uwase", "Mugabo", "Ishimwe"):
        assert name not in text

    with rls_context(facility_id=clinic.pk):
        listing.refresh(clinic.pk)
    [row] = [
        r
        for r in api.post(f"{PUB}facilities/search/", {}, format="json").json()["results"]
        if r["slug"] == clinic.slug
    ]
    assert row["waiting"] == 3 and row["wait_range"] == {"min": 35, "max": 60}
