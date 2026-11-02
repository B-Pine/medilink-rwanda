"""S10 part 2b (contract sprint-10c §5): period report, CSV export, audit log, platform figures,
patient data export."""

from __future__ import annotations

import json
from typing import Any

import pytest
from rest_framework.test import APIClient

from medilink.reports import figures
from tests.conftest import PASSWORD, error_code, login_patient, login_staff
from tests.factories import make_staff
from tests.masterdata.conftest import age_recent_auth
from tests.s2.conftest import client_for
from tests.s4.conftest import patient_account  # noqa: F401
from tests.s7.conftest import (  # noqa: F401
    S,
    admin,
    catalogue,
    check_in,
    clinic,
    desk,
    doctor,
    drugs,
    patient_keys,
    prescribe,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def world(
    clinic: Any,  # noqa: F811
    catalogue: dict[str, Any],  # noqa: F811
    desk: Any,  # noqa: F811
    doctor: Any,  # noqa: F811
    drugs: Any,  # noqa: F811
    patient_account: tuple[Any, Any],  # noqa: F811
) -> dict[str, Any]:
    user, record = patient_account
    visit = check_in(desk[0], record, catalogue["service"]["id"]).json()
    _c, p = prescribe(doctor[0], visit["visit_id"])
    return {"user": user, "visit": visit, "prescription": p}


def test_period_report_and_limits(admin: Any, desk: Any, world: dict[str, Any]) -> None:  # noqa: F811
    report = admin[0].get(f"{S}reports/period/")
    assert report.status_code == 200, report.content
    body = report.json()
    assert body["totals"]["patients"] == 1 and len(body["days"]) == 30
    assert body["doctors"][0]["signed"] == 1
    assert "Keza" not in json.dumps(body)  # no patient names
    assert admin[0].get(f"{S}reports/period/?from=2026-01-01&to=2026-06-01").status_code == 400
    assert desk[0].get(f"{S}reports/period/").status_code == 403


def test_csv_export_is_formula_safe_audited_and_needs_step_up(
    admin: Any,  # noqa: F811
    world: dict[str, Any],
) -> None:
    age_recent_auth(admin[0])
    refused = admin[0].get(f"{S}reports/period/export/")
    assert refused.status_code == 403 and error_code(refused) == "step_up_required"
    fresh = APIClient()
    login_staff(fresh, admin[1])
    csv = fresh.get(f"{S}reports/period/export/")
    assert csv.status_code == 200 and csv["Content-Type"].startswith("text/csv")
    assert b"median_wait_min" in csv.content
    assert figures.csv_cell("=HYPERLINK(1)") == "'=HYPERLINK(1)"
    assert figures.csv_cell(-5) == "-5"
    entries = fresh.get(f"{S}audit-entries/?action=reports.").json()["results"]
    assert entries[0]["action"] == "reports.exported"


def test_audit_log_is_facility_scoped(admin: Any, world: dict[str, Any]) -> None:  # noqa: F811
    from medilink.tenancy.models import FacilityStatus
    from tests.factories import FacilityFactory

    rows = admin[0].get(f"{S}audit-entries/?action=pharmacy.").json()["results"]
    assert rows and all(r["action"].startswith("pharmacy.") for r in rows)
    other = FacilityFactory(name="Other", slug="other-audit", status=FacilityStatus.LIVE)
    stranger = client_for(other, ("facility_admin",), "audit-other@example.test")[0]
    assert stranger.get(f"{S}audit-entries/?action=pharmacy.").json()["results"] == []


def test_platform_report_and_audit(world: dict[str, Any]) -> None:
    platform = APIClient()
    login_staff(
        platform, make_staff(None, email="plat.reports@example.test", is_platform_admin=True)
    )
    body = platform.get("/api/v1/platform/reports/").json()
    assert body["totals"]["visits"] >= 1 and body["facilities"]
    assert platform.get("/api/v1/platform/audit-entries/").status_code == 200


def test_patient_data_export(world: dict[str, Any]) -> None:
    patient = APIClient()
    login_patient(patient, world["user"])
    wrong = patient.post(
        "/api/v1/patient/data-export/", {"current_password": "nope"}, format="json"
    )
    assert wrong.status_code == 400
    exported = patient.post(
        "/api/v1/patient/data-export/", {"current_password": PASSWORD}, format="json"
    )
    assert exported.status_code == 200, exported.content
    assert "attachment" in exported["Content-Disposition"]
    data = json.loads(exported.content)
    assert data["account"]["email"] == world["user"].email
    assert data["prescriptions"][0]["number"] == world["prescription"]["number"]
    assert "private_notes" not in exported.content.decode()
