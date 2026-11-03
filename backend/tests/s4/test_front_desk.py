"""Front desk on the board (upgrade 05 §2): the patient's words, action flags, raise emergency."""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient

from medilink.audit.models import AuditEntry
from tests.s4.conftest import S, act, check_in, register

pytestmark = pytest.mark.django_db(transaction=False)


def _row(client: APIClient, ticket_id: str) -> dict[str, Any]:
    board = client.get(f"{S}queue/board/").json()
    for queue in board["queues"]:
        for row in queue["waiting"]:
            if row["id"] == ticket_id:
                return dict(row)
    raise AssertionError("ticket not on the board")


def test_board_rows_carry_the_patients_words_and_flags(
    clinic: Any, catalogue: dict[str, Any], desk: tuple[APIClient, Any]
) -> None:
    record = register(clinic, desk[1], "Mugisha Jean")
    made = check_in(desk[0], record, catalogue["service"]["id"], reason_text="Cough for a week")
    assert made.status_code == 201, made.content
    row = _row(desk[0], made.json()["ticket"]["id"])
    assert row["reason_text"] == "Cough for a week"
    assert row["symptoms"] == []
    # a patient registered without a phone is flagged, so reception knows to print a slip
    assert "no_phone" in row["flags"]


def test_reception_raises_an_emergency_with_a_reason(
    clinic: Any, catalogue: dict[str, Any], desk: tuple[APIClient, Any]
) -> None:
    record = register(clinic, desk[1], "Uwase Aline")
    ticket = check_in(desk[0], record, catalogue["service"]["id"]).json()["ticket"]
    refused = act(desk[0], ticket, "emergency")
    assert refused.status_code == 422, refused.content
    raised = act(desk[0], ticket, "emergency", reason_text="Chest pain, struggling to breathe")
    assert raised.status_code == 200, raised.content
    assert "emergency" in raised.json()["flags"]
    assert raised.json()["priority_rank"] == 0
    assert AuditEntry.objects.filter(action="visits.ticket.emergency").exists()
