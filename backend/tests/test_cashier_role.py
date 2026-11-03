"""Upgrade 06 §4: the cashier takes payments and nothing else."""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient

from tests.conftest import login_staff
from tests.factories import make_staff

pytestmark = pytest.mark.django_db

S = "/api/v1/staff/"


def test_cashier_reads_bills_but_not_the_queue(facility: Any) -> None:
    client = APIClient()
    login_staff(client, make_staff(facility, roles=("cashier",), email="cash@example.test"))
    me = client.get(f"{S}auth/me/").json()
    assert me["memberships"][0]["roles"] == ["cashier"]
    assert client.get(f"{S}bills/").status_code == 200
    assert client.get(f"{S}cash-shifts/current/").status_code in (200, 404)  # no shift yet
    assert client.get(f"{S}queue/board/").status_code == 403
    assert client.post(f"{S}queue/call-next/", {}, format="json").status_code == 403
