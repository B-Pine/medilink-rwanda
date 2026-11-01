"""S7a fixtures: the S6 clinic with a pharmacist, drugs and a checked-in patient, plus helpers to
draft, sign and dispense prescriptions through the API."""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient

from medilink.masterdata.models import Drug
from medilink.masterdata.services import writer
from tests.s6.conftest import (  # noqa: F401  (fixtures re-exported for S7 tests)
    MALARIA,
    S,
    admin,
    catalogue,
    check_in,
    clinic,
    desk,
    doctor,
    doctor2,
    drugs,
    open_consultation,
    patch,
    patient_keys,
    pharmacist,
    register,
    visit,
)

AMOX = {
    "drug_code": "AMOX500",
    "dose": "1 capsule",
    "frequency_code": "tds",
    "route": "oral",
    "duration_days": 7,
    "instructions": "After meals",
}


@pytest.fixture
def more_drugs(drugs: dict[str, Drug]) -> dict[str, Drug]:  # noqa: F811
    with writer():
        drugs["amox_generic"] = Drug.objects.create(
            code="AMOX500G",
            generic_name="Amoxicillin",
            strength="500 mg",
            form="capsule",
            drug_class="Penicillin",
        )
        drugs["amox250"] = Drug.objects.create(
            code="AMOX250",
            generic_name="Amoxicillin",
            strength="250 mg",
            form="capsule",
            drug_class="Penicillin",
        )
        drugs["morph"] = Drug.objects.create(
            code="MORPH10",
            generic_name="Morphine",
            strength="10 mg",
            form="tablet",
            drug_class="Opioid",
            is_controlled=True,
        )
    return drugs


def draft(client: APIClient, visit_id: str) -> dict[str, Any]:
    opened = open_consultation(client, visit_id)
    assert opened.status_code in (200, 201), opened.content
    saved = patch(client, opened.json(), diagnoses=MALARIA)
    assert saved.status_code == 200, saved.content
    return dict(saved.json())


def add_item(client: APIClient, consultation_id: str, **data: Any) -> Any:
    return client.post(
        f"{S}consultations/{consultation_id}/prescription/items/", data or AMOX, format="json"
    )


def sign(client: APIClient, consultation_id: str) -> Any:
    current = client.get(f"{S}consultations/{consultation_id}/").json()
    return client.post(
        f"{S}consultations/{consultation_id}/sign/", {"version": current["version"]}, format="json"
    )


def prescribe(
    client: APIClient, visit_id: str, *items: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Draft, add items, sign: (consultation, issued prescription)."""
    consultation = draft(client, visit_id)
    for item in items or (AMOX,):
        response = add_item(client, consultation["id"], **item)
        assert response.status_code == 201, response.content
    signed = sign(client, consultation["id"])
    assert signed.status_code == 200, signed.content
    p = client.get(f"{S}consultations/{consultation['id']}/prescription/")
    assert p.status_code == 200, p.content
    return consultation, dict(p.json())


def dispense(client: APIClient, p: dict[str, Any], *lines: dict[str, Any], **extra: Any) -> Any:
    body = {
        "version": p["version"],
        "identity_check_method": "ticket_name_dob",
        "lines": list(lines),
        **extra,
    }
    return client.post(f"{S}prescriptions/{p['id']}/dispense/", body, format="json")
