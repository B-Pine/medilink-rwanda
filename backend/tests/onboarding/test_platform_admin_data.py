"""The super admin's pages show what MediLink holds (2026-11-03): create an application with every
group, richer application and facility rows, the facility export for the Ministry of Health, and
staff phone, profession and licence state on the users list."""

from __future__ import annotations

import csv
import io
from datetime import timedelta
from decimal import Decimal
from typing import Any

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from medilink.accounts.models import ClinicianProfile
from medilink.audit.models import AuditEntry
from medilink.facilities.models import Profile
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import FacilityStatus
from tests.factories import FacilityFactory, make_staff
from tests.onboarding.conftest import FACILITIES, PLATFORM

pytestmark = pytest.mark.django_db


def test_create_on_behalf_takes_every_group(village: str, platform_client: APIClient) -> None:
    created = platform_client.post(
        PLATFORM,
        {
            "applicant": {
                "name": "Mukamana Jeanne",
                "email": "j@ubuzima.example",
                "phone": "0788000111",
            },
            "facility": {
                "name": "Clinique Ubuzima",
                "facility_type": "private_clinic",
                "ownership": "private",
                "moh_facility_code": "FOSA-77",
                "tin": "102345678",
                "phone": "+250788123456",
                "email": "info@ubuzima.example",
            },
            "location": {
                "village_code": village,
                "address": "KG 11 Ave 5",
                "latitude": "-1.944200",
                "longitude": "30.123400",
            },
            "proposed_admin": {
                "name": "Habimana Eric",
                "email": "eric@ubuzima.example",
                "phone": "0788000222",
            },
            "claimed_insurer_codes": ["rama", "mutuelle"],
            "send_link": False,
        },
        format="json",
    )
    assert created.status_code == 201, created.content
    body = created.json()
    assert body["facility"]["moh_facility_code"] == "FOSA-77"
    assert body["proposed_admin"]["name"] == "Habimana Eric"
    assert body["claimed_insurer_codes"] == ["mutuelle", "rama"]
    assert body["location"]["latitude"] == pytest.approx(-1.9442)
    # only the documents and the agreements are left for the applicant
    assert set(body["missing_for_submit"]) <= {
        "documents.moh_licence",
        "documents.rdb_registration",
        "documents.tin_certificate",
    }
    rows = platform_client.get(PLATFORM, {"status": "draft"}).json()["results"]
    row = next(r for r in rows if r["id"] == body["id"])
    assert row["district_name"] == "Gasabo"
    assert row["proposed_admin_name"] == "Habimana Eric"
    assert row["documents_count"] == 0 and row["missing_count"] == 3


def _live_facility(platform_admin: Any) -> Any:
    facility = FacilityFactory(
        name="Ubuzima Clinic",
        status=FacilityStatus.LIVE,
        moh_facility_code="=FOSA",  # a formula in data must not run in a spreadsheet
        tin="102345678",
    )
    with rls_context(facility_id=facility.pk):
        Profile.objects.create(
            facility=facility,
            phone="+250788123456",
            email="info@ubuzima.example",
            address="KG 11 Ave 5",
            village_code="12090101",
            latitude=Decimal("-1.9442"),
            longitude=Decimal("30.1234"),
            level_of_care="primary",
        )
    admin = make_staff(facility, roles=("facility_admin",), email="boss@ubuzima.example")
    admin.phone = "+250788000222"
    admin.save()
    doc = make_staff(facility, roles=("doctor",), email="doc@ubuzima.example")
    ClinicianProfile.objects.create(
        user=doc,
        council="rmdc",
        licence_number="RMDC/9",
        profession="medical_doctor",
        licence_valid_until=timezone.localdate() + timedelta(days=30),
    )
    return facility


def test_facility_rows_and_detail_carry_profile_and_people(
    platform_admin: Any, platform_client: APIClient
) -> None:
    facility = _live_facility(platform_admin)
    rows = platform_client.get(FACILITIES).json()["results"]
    row = next(r for r in rows if r["id"] == str(facility.pk))
    assert row["phone"] == "+250788123456" and row["level_of_care"] == "primary"
    assert row["location"] == {
        "province": "Umujyi wa Kigali",
        "district": "Gasabo",
        "sector": "Kimironko",
        "cell": "Bibare",
        "village": "Abatuje",
    }
    assert row["admins"] == [
        {
            "name": row["admins"][0]["name"],
            "email": "boss@ubuzima.example",
            "phone": "+250788000222",
        }
    ]
    assert (row["staff_count"], row["doctor_count"], row["doctors_attested"]) == (2, 1, 0)
    assert row["staff_by_profession"] == {"medical_doctor": 1}
    detail = platform_client.get(f"{FACILITIES}{facility.pk}/").json()
    assert detail["latitude"] == pytest.approx(-1.9442)
    # filters
    assert platform_client.get(FACILITIES, {"ownership": "public"}).json()["count"] == 0
    assert platform_client.get(FACILITIES, {"missing_code": "true"}).json()["count"] == 0


def test_the_facility_export_for_the_ministry(
    platform_admin: Any, platform_client: APIClient
) -> None:
    facility = _live_facility(platform_admin)
    response = platform_client.get(f"{FACILITIES}export/")
    assert response.status_code == 200
    assert response["Content-Type"].startswith("text/csv")
    assert "attachment" in response["Content-Disposition"]
    text = response.content.decode("utf-8-sig")
    rows = list(csv.DictReader(io.StringIO(text)))
    row = next(r for r in rows if r["Facility name"] == "Ubuzima Clinic")
    assert row["MoH facility code (FOSA ID)"] == "'=FOSA"  # neutralised
    assert (row["District"], row["Sector"], row["Village"]) == ("Gasabo", "Kimironko", "Abatuje")
    assert row["Latitude"] == "-1.9442" and row["TIN"] == "102345678"
    assert "boss@ubuzima.example" in row["Facility admins"]
    assert row["Active staff"] == "2"
    assert AuditEntry.objects.filter(action="facility.list_exported").exists()
    filtered = platform_client.get(f"{FACILITIES}export/", {"status": "suspended"})
    assert len(list(csv.reader(io.StringIO(filtered.content.decode("utf-8-sig"))))) == 1
    assert APIClient().get(f"{FACILITIES}export/").status_code == 401
    assert str(facility.pk)  # used


def test_users_show_phone_profession_and_licence(
    platform_admin: Any, platform_client: APIClient
) -> None:
    _live_facility(platform_admin)
    rows = platform_client.get("/api/v1/platform/users/").json()["results"]
    doc = next(r for r in rows if r["email"] == "doc@ubuzima.example")
    assert (doc["profession"], doc["licence_state"]) == ("medical_doctor", "missing")  # no scan
    boss = next(r for r in rows if r["email"] == "boss@ubuzima.example")
    assert boss["phone"] == "+250788000222" and boss["licence_state"] is None
