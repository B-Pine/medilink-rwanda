"""S6 fixtures: the S4 clinic with staff by role, a checked-in patient, drugs and allergies."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from rest_framework.test import APIClient

from medilink.masterdata.models import Drug
from medilink.masterdata.services import writer
from medilink.patients.models import FacilityPatient
from medilink.tenancy.context import rls_context
from tests.s2.conftest import client_for
from tests.s4.conftest import (  # noqa: F401  (fixtures re-exported for S6 tests)
    admin,
    catalogue,
    check_in,
    clinic,
    desk,
    doctor,
    doctor2,
    patient_keys,
    register,
)

S = "/api/v1/staff/"


@pytest.fixture
def pharmacist(clinic: Any) -> tuple[APIClient, Any]:  # noqa: F811
    return client_for(clinic, ("pharmacist",), "c-pharm@example.test")


@pytest.fixture
def visit(
    clinic: Any,  # noqa: F811
    catalogue: dict[str, Any],  # noqa: F811
    desk: tuple[APIClient, Any],  # noqa: F811
) -> dict[str, Any]:
    """A walk-in checked in today: {visit_id, ticket, record}."""
    record = register(clinic, desk[1], "Keza Uwimana", dt.date(1992, 3, 4))
    response = check_in(desk[0], record, catalogue["service"]["id"])
    assert response.status_code == 201, response.content
    body = response.json()
    return {"visit_id": body["visit_id"], "ticket": body["ticket"], "record": record}


def open_consultation(client: APIClient, visit_id: str) -> Any:
    return client.post(f"{S}visits/{visit_id}/consultation/", format="json")


def patch(client: APIClient, consultation: dict[str, Any], **data: Any) -> Any:
    return client.patch(
        f"{S}consultations/{consultation['id']}/",
        {"version": consultation["version"], **data},
        format="json",
    )


MALARIA = [{"code": "B54", "rank": "primary", "certainty": "confirmed"}]


def signed_consultation(client: APIClient, visit_id: str, **sections: Any) -> dict[str, Any]:
    opened = open_consultation(client, visit_id)
    assert opened.status_code in (200, 201), opened.content
    saved = patch(client, opened.json(), diagnoses=MALARIA, **sections)
    assert saved.status_code == 200, saved.content
    signed = client.post(
        f"{S}consultations/{saved.json()['id']}/sign/",
        {"version": saved.json()["version"]},
        format="json",
    )
    assert signed.status_code == 200, signed.content
    return dict(signed.json())


@pytest.fixture
def drugs(db: Any) -> dict[str, Drug]:
    with writer():
        return {
            "amox": Drug.objects.create(
                code="AMOX500",
                generic_name="Amoxicillin",
                strength="500 mg",
                form="capsule",
                drug_class="Penicillin",
                max_usual_quantity=30,
            ),
            "para": Drug.objects.create(
                code="PARA500",
                generic_name="Paracetamol",
                strength="500 mg",
                form="tablet",
                drug_class="Analgesic",
                max_usual_quantity=60,
            ),
            "metf": Drug.objects.create(
                code="METF500",
                generic_name="Metformin",
                strength="500 mg",
                form="tablet",
                drug_class="Biguanide",
            ),
        }


def facility_record(facility: Any, patient: Any, by: Any, **extra: Any) -> FacilityPatient:
    with rls_context(facility_id=facility.pk):
        return FacilityPatient.objects.create(
            facility=facility,
            patient=patient,
            first_visit_on=dt.date.today(),
            registered_by=by,
            **extra,
        )
