"""National aggregate report (#208, upgrade 13 W9): platform admins only, groups under 10 hidden
(and anything they could be worked back from), never a patient name, CSV audited."""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient

from medilink.audit.models import AuditEntry
from medilink.platform_admin import national_report as nr
from medilink.tenancy.models import FacilityStatus
from tests.conftest import login_staff
from tests.factories import FacilityFactory, make_staff
from tests.s4.conftest import (  # noqa: F401
    admin,
    catalogue,
    check_in,
    clinic,
    desk,
    patient_keys,
    register,
)

pytestmark = pytest.mark.django_db
URL = "/api/v1/platform/reports/national/"


@pytest.fixture
def platform() -> APIClient:
    user = make_staff(None, email="plat.national@example.test", is_platform_admin=True)
    client = APIClient()
    login_staff(client, user)
    return client


def test_protect_hides_small_groups_and_their_complements() -> None:
    assert nr.protect([50, 30, 0]) == set()
    # one small facility: the next smallest goes too, so the total can't give it away
    assert nr.protect([50, 30, 4]) == {1, 2}
    # two small ones that add up to 10 or more need nothing else
    assert nr.protect([50, 6, 5]) == {1, 2}
    # all small: all hidden (the district total is then hidden by its own rule)
    assert nr.protect([3, 2]) == {0, 1}
    assert not nr.small(0) and nr.small(9) and not nr.small(10)


def test_waits_are_hidden_below_ten_patients() -> None:
    assert nr._wait([5.0] * 9) == {"median_min": None, "p90_min": None, "suppressed": True}
    assert nr._wait([5.0] * 10)["median_min"] == 5
    assert nr._wait([])["suppressed"] is False


def test_only_platform_admins_see_the_report(
    platform: APIClient,
    clinic: Any,  # noqa: F811
    catalogue: dict[str, Any],  # noqa: F811
    desk: tuple[APIClient, Any],  # noqa: F811
    admin: tuple[APIClient, Any],  # noqa: F811
) -> None:
    FacilityFactory(name="Quiet Clinic", slug="quiet", status=FacilityStatus.LIVE)
    service_id = catalogue["service"]["id"]
    for n in range(3):
        check_in(desk[0], register(clinic, desk[1], f"Secret Name{n}"), service_id)

    assert desk[0].get(URL).status_code == 403
    assert admin[0].get(URL).status_code == 403  # a facility admin is not a platform admin

    response = platform.get(URL, {"group": "week"})
    assert response.status_code == 200, response.content
    data = response.json()
    assert data["min_group_size"] == 10
    gisozi = next(r for r in data["facilities"] if r["name"] == "Gisozi Clinic")
    quiet = next(r for r in data["facilities"] if r["name"] == "Quiet Clinic")
    # 3 visits: hidden; 0 visits says nothing about anyone and stays shown
    assert gisozi["visits"] == {"value": None, "suppressed": True}
    assert quiet["visits"] == {"value": 0, "suppressed": False}
    # the facilities' district total is 3: hidden, and so is the national total
    assert data["totals"]["visits"]["suppressed"] is True
    assert all(d["visits"]["value"] in (None, 0) for d in data["districts"])
    assert data["diagnoses"] == []
    assert "Secret" not in response.content.decode()

    csv = platform.get(f"{URL}export/", {"table": "facilities"})
    assert csv.status_code == 200 and csv["Content-Type"].startswith("text/csv")
    body = csv.content.decode("utf-8")
    assert body.startswith("﻿Facility,District,Visits")
    assert "Gisozi Clinic,,suppressed" in body
    assert "Secret" not in body
    assert AuditEntry.objects.filter(action="platform.report.exported").count() == 1
    for table in nr.TABLES:
        assert platform.get(f"{URL}export/", {"table": table}).status_code == 200, table
    assert platform.get(f"{URL}export/", {"table": "patients"}).status_code == 400
    assert platform.get(URL, {"group": "year"}).status_code == 400
    assert desk[0].get(f"{URL}export/", {"table": "facilities"}).status_code == 403
