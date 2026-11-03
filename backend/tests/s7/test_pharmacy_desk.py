"""Pharmacist Today and the dispensing history (upgrade 05 §4)."""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient

from tests.s7.conftest import S, dispense, prescribe

pytestmark = pytest.mark.django_db(transaction=False)


def test_pharmacist_day_and_history(
    visit: dict[str, Any],
    doctor: tuple[APIClient, Any],
    pharmacist: tuple[APIClient, Any],
    desk: tuple[APIClient, Any],
    drugs: dict[str, Any],
) -> None:
    _c, p = prescribe(doctor[0], visit["visit_id"])
    client = pharmacist[0]
    before = client.get(f"{S}pharmacy/my-day/")
    assert before.status_code == 200, before.content
    assert before.json()["ready"] == 1 and before.json()["dispensed_today"] == 0

    given = dispense(
        client, p, {"item_id": p["items"][0]["id"], "outcome": "partial", "quantity": 5}
    )
    assert given.status_code == 201, given.content

    after = client.get(f"{S}pharmacy/my-day/").json()
    assert after["dispensed_today"] == 1 and after["dispensed_by_me"] == 1
    assert after["ready"] == 0 and after["partly"] == 1

    history = client.get(f"{S}pharmacy/history/").json()
    assert len(history) == 1
    row = history[0]
    assert row["prescription_number"] == p["number"]
    assert row["lines"][0]["outcome"] == "partial" and row["lines"][0]["quantity"] == 5
    assert client.get(f"{S}pharmacy/history/?q=nobody-here").json() == []
    assert len(client.get(f"{S}pharmacy/history/?mine=true&days=1").json()) == 1
    # reception has no dispensing permission
    assert desk[0].get(f"{S}pharmacy/history/").status_code == 403
