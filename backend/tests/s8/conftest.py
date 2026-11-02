"""S8 fixtures: the S4 clinic with a priced consultation, an insurer rule, a cashier with an open
shift, and helpers to bill through the API."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from medilink.billing.models import InsurerRule, TariffItem
from medilink.patients.models import InsuranceProfile
from medilink.tenancy.context import rls_context
from tests.s7.conftest import (  # noqa: F401  (fixtures re-exported for S8 tests)
    AMOX,
    S,
    add_item,
    admin,
    catalogue,
    check_in,
    clinic,
    desk,
    doctor,
    doctor2,
    drugs,
    patient_keys,
    pharmacist,
    prescribe,
    register,
)

CONSULTATION = 5000


def tariff(
    facility: Any, by: Any, code: str, amount: int, kind: str = "procedure", **extra: Any
) -> TariffItem:
    with rls_context(facility_id=facility.pk):
        return TariffItem.objects.create(
            facility=facility,
            code=code,
            name_i18n={"en": code.title(), "rw": code.title(), "fr": code.title()},
            kind=kind,
            amount_rwf=amount,
            valid_from=timezone.localdate() - dt.timedelta(days=1),
            created_by=by,
            **extra,
        )


def rule(facility: Any, by: Any, code: str = "rama", bp: int = 1500, **extra: Any) -> InsurerRule:
    with rls_context(facility_id=facility.pk):
        return InsurerRule.objects.create(
            facility=facility,
            insurer_code=code,
            patient_share_bp=bp,
            valid_from=timezone.localdate() - dt.timedelta(days=1),
            created_by=by,
            **extra,
        )


def card(patient_id: Any, by: Any, code: str = "rama") -> InsuranceProfile:
    return InsuranceProfile.objects.create(
        patient_id=patient_id,
        created_by=by,
        insurer_code=code,
        insurer_display=code.upper(),
        member_number=f"{code.upper()}-0001",
    )


@pytest.fixture
def priced(clinic: Any, catalogue: dict[str, Any], admin: tuple[APIClient, Any]) -> dict[str, Any]:  # noqa: F811
    """The consultation priced at 5,000 RWF and a dressing at 2,000 RWF."""
    with rls_context(facility_id=clinic.pk):
        from medilink.facilities.models import Service

        service = Service.objects.get(pk=catalogue["service"]["id"])
    consult = tariff(clinic, admin[1], "CONSULT", CONSULTATION, kind="service", service=service)
    dressing = tariff(clinic, admin[1], "DRESSING", 2000)
    return {"service_id": catalogue["service"]["id"], "consult": consult, "dressing": dressing}


@pytest.fixture
def cashier(desk: tuple[APIClient, Any]) -> tuple[APIClient, Any]:  # noqa: F811
    """The receptionist with an open shift (float 10,000 RWF)."""
    response = desk[0].post(f"{S}cash-shifts/", {"opening_float_rwf": 10000}, format="json")
    assert response.status_code == 201, response.content
    return desk


def walk_in(
    clinic: Any,  # noqa: F811
    desk: tuple[APIClient, Any],  # noqa: F811
    service_id: str,
    name: str = "Keza Uwimana",
    *,
    insurer: str | None = None,
) -> dict[str, Any]:
    record = register(clinic, desk[1], name, dt.date(1992, 3, 4))
    extra: dict[str, Any] = {}
    profile = None
    if insurer:
        profile = card(record.patient_id, desk[1], insurer)
        extra["insurance_profile_id"] = str(profile.pk)
    response = check_in(desk[0], record, service_id, **extra)
    assert response.status_code == 201, response.content
    return {**response.json(), "record": record, "profile": profile}


def bill_of(client: APIClient, visit_id: str) -> Any:
    return client.get(f"{S}visits/{visit_id}/bill/")


def pay(
    client: APIClient, bill: dict[str, Any], amount: int, method: str = "cash", **extra: Any
) -> Any:
    headers = {}
    if "key" in extra:
        headers["HTTP_IDEMPOTENCY_KEY"] = extra.pop("key")
    return client.post(
        f"{S}bills/{bill['id']}/payments/",
        {"version": bill["version"], "method": method, "amount_rwf": amount, **extra},
        format="json",
        **headers,
    )
