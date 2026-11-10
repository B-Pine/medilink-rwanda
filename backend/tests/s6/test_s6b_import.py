"""S6-B19 legacy register import (contract sprint-06 §2.2, §3.3 L1, FR-PAT-10)."""

from __future__ import annotations

import datetime as dt
from collections.abc import Iterator
from typing import Any

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from medilink.audit.models import AuditEntry
from medilink.clinical import imports, tasks
from medilink.clinical.models import ImportBatch, ImportRow
from medilink.patients.models import FacilityPatient, Identifier, Patient
from medilink.tenancy.context import rls_context
from tests.conftest import error_code, login_staff
from tests.factories import FacilityFactory
from tests.masterdata.conftest import age_recent_auth
from tests.s2.conftest import client_for
from tests.s4.conftest import check_in, register
from tests.s6.conftest import S

pytestmark = pytest.mark.django_db(transaction=False)
IMPORTS = f"{S}patient-imports/"

CSV = (
    "Names,Sex,DOB,Phone,File no,NID\n"
    "Mukamana Alice,F,12/04/1985,0788123456,A-001,1198580012345678\n"
    "Habimana Jean,gabo,1990-01-02,,A-002,\n"
    ",F,2001-01-01,,A-003,\n"
    "Uwase Claire,X,2001-13-40,123,A-004,99\n"
    "Keza Uwimana,F,1992-03-04,,A-005,\n"
    "Twin File,M,,,A-002,\n"
)


@pytest.fixture(autouse=True)
def local_storage(tmp_path: Any) -> Iterator[None]:
    with override_settings(
        UPLOADS={
            "storage": "local",
            "scanner": "fake",
            "local_root": str(tmp_path / "objects"),
            "download_base_url": "http://testserver/api/v1/files",
        }
    ):
        yield


@pytest.fixture
def importer(clinic: Any) -> tuple[APIClient, Any]:
    return client_for(clinic, ("facility_admin",), "importer@example.test")


def upload(client: APIClient, content: str, capture: Any, name: str = "register.csv") -> str:
    with capture(execute=True):
        response = client.post(
            "/api/v1/staff/uploads/",
            {
                "purpose": "patient_import",
                "file": SimpleUploadedFile(name, content.encode(), content_type="text/csv"),
            },
            format="multipart",
        )
    assert response.status_code == 201, response.content
    return str(response.json()["id"])


MAPPING = {
    "full_name": "Names",
    "sex": "Sex",
    "date_of_birth": "DOB",
    "phone": "Phone",
    "file_number": "File no",
    "national_id": "NID",
}


def start(client: APIClient, content: str, capture: Any) -> dict[str, Any]:
    created = client.post(IMPORTS, {"upload_id": upload(client, content, capture)}, format="json")
    assert created.status_code == 201, created.content
    return dict(created.json())


def test_upload_map_preview_confirm_and_rollback(
    clinic: Any,
    importer: tuple[APIClient, Any],
    desk: tuple[APIClient, Any],
    django_capture_on_commit_callbacks: Any,
) -> None:
    client = importer[0]
    register(clinic, desk[1], "Keza Uwimana", dt.date(1992, 3, 4))  # already a patient here
    batch = start(client, CSV, django_capture_on_commit_callbacks)
    assert batch["status"] == "uploaded" and batch["row_count"] == 6
    assert batch["headers"] == ["Names", "Sex", "DOB", "Phone", "File no", "NID"]
    assert batch["column_mapping"]["full_name"] == "Names"
    assert batch["column_mapping"]["date_of_birth"] == "DOB"
    patients_before = Patient.objects.count()

    url = f"{IMPORTS}{batch['id']}/mapping/"
    bad = client.put(url, {"version": batch["version"], "mapping": {"sex": "Sex"}}, format="json")
    assert bad.status_code == 422
    unknown = client.put(
        url,
        {"version": batch["version"], "mapping": {**MAPPING, "full_name": "Nope"}},
        format="json",
    )
    assert unknown.status_code == 422
    stale = client.put(url, {"version": batch["version"] + 1, "mapping": MAPPING}, format="json")
    assert stale.status_code == 409
    preview = client.put(url, {"version": batch["version"], "mapping": MAPPING}, format="json")
    assert preview.status_code == 200, preview.content
    body = preview.json()
    assert body["status"] == "previewed"
    assert (body["valid_count"], body["error_count"], body["duplicate_count"]) == (2, 3, 1)
    assert Patient.objects.count() == patients_before  # nothing saved before confirm

    rows = {
        r["row_number"]: r for r in client.get(f"{IMPORTS}{batch['id']}/rows/").json()["results"]
    }
    assert rows[2]["status"] == "valid" and rows[2]["has_national_id"] is True
    assert rows[2]["phone_e164"] == "+250788123456" and rows[2]["date_of_birth"] == "1985-04-12"
    assert rows[3]["sex"] == "male"
    assert {p["field"] for p in rows[4]["problems"]} == {"full_name"}
    assert {p["field"] for p in rows[5]["problems"]} == {
        "sex",
        "date_of_birth",
        "phone",
        "national_id",
    }
    assert rows[6]["status"] == "duplicate" and rows[6]["matched_patient_id"]
    assert {p["code"] for p in rows[7]["problems"]} == {"taken"}  # file number repeated
    errors_only = client.get(f"{IMPORTS}{batch['id']}/rows/?status=error").json()
    assert errors_only["count"] == 3
    raw = ImportRow.objects.filter(batch_id=batch["id"]).first()
    assert raw is not None and b"Mukamana" not in bytes(raw.raw_enc)
    assert "1198580012345678" not in str(raw.normalized)

    age_recent_auth(client)
    refused = client.post(
        f"{IMPORTS}{batch['id']}/confirm/", {"version": body["version"]}, format="json"
    )
    assert refused.status_code == 403 and error_code(refused) == "step_up_required"
    fresh = APIClient()
    login_staff(fresh, importer[1])
    confirmed = fresh.post(
        f"{IMPORTS}{batch['id']}/confirm/", {"version": body["version"]}, format="json"
    )
    assert confirmed.status_code == 200, confirmed.content
    done = confirmed.json()
    assert done["status"] == "confirmed" and done["created_count"] == 2 and done["can_roll_back"]
    assert Patient.objects.count() == patients_before + 2
    alice = FacilityPatient.objects.get(facility=clinic, file_number="A-001")
    assert alice.patient.full_name == "Mukamana Alice"
    assert Identifier.objects.filter(patient=alice.patient).exists()
    again = fresh.post(
        f"{IMPORTS}{batch['id']}/confirm/", {"version": done["version"]}, format="json"
    )
    assert again.status_code == 422
    remap = fresh.put(url, {"version": done["version"], "mapping": MAPPING}, format="json")
    assert remap.status_code == 422

    rolled = fresh.post(
        f"{IMPORTS}{batch['id']}/rollback/", {"version": done["version"]}, format="json"
    )
    assert rolled.status_code == 200 and rolled.json()["status"] == "rolled_back"
    alice.refresh_from_db()
    assert alice.is_active is False
    assert (
        fresh.post(
            f"{IMPORTS}{batch['id']}/rollback/",
            {"version": rolled.json()["version"]},
            format="json",
        ).status_code
        == 422
    )
    listing = fresh.get(IMPORTS).json()
    assert listing["count"] == 1
    actions = set(AuditEntry.objects.filter(facility_id=clinic.pk).values_list("action", flat=True))
    for action in ("uploaded", "previewed", "confirmed", "rolled_back"):
        assert f"patients.import.{action}" in actions


def test_rollback_refused_with_a_visit_or_after_the_window(
    clinic: Any,
    catalogue: dict[str, Any],
    importer: tuple[APIClient, Any],
    desk: tuple[APIClient, Any],
    django_capture_on_commit_callbacks: Any,
) -> None:
    client = importer[0]
    content = "Name,Sex\nNiyonzima Paul,M\nIngabire Rose,F\n"
    batch = start(client, content, django_capture_on_commit_callbacks)
    mapped = client.put(
        f"{IMPORTS}{batch['id']}/mapping/",
        {"version": batch["version"], "mapping": {"full_name": "Name", "sex": "Sex"}},
        format="json",
    ).json()
    done = client.post(
        f"{IMPORTS}{batch['id']}/confirm/", {"version": mapped["version"]}, format="json"
    ).json()
    record = FacilityPatient.objects.filter(
        facility=clinic, patient__full_name="Niyonzima Paul"
    ).get()
    assert check_in(desk[0], record, catalogue["service"]["id"]).status_code == 201
    refused = client.post(
        f"{IMPORTS}{batch['id']}/rollback/", {"version": done["version"]}, format="json"
    )
    assert refused.status_code == 422

    second = start(client, "Name,Sex\nMugabo Eric,M\n", django_capture_on_commit_callbacks)
    mapped2 = client.put(
        f"{IMPORTS}{second['id']}/mapping/",
        {"version": second["version"], "mapping": {"full_name": "Name", "sex": "Sex"}},
        format="json",
    ).json()
    done2 = client.post(
        f"{IMPORTS}{second['id']}/confirm/", {"version": mapped2["version"]}, format="json"
    ).json()
    with rls_context(facility_id=clinic.pk):
        ImportBatch.objects.filter(pk=second["id"]).update(
            rollback_until=timezone.now() - dt.timedelta(minutes=1)
        )
    late = client.post(
        f"{IMPORTS}{second['id']}/rollback/", {"version": done2["version"]}, format="json"
    )
    assert late.status_code == 422
    assert client.get(f"{IMPORTS}{second['id']}/").json()["can_roll_back"] is False


def test_bad_files_permissions_and_isolation(
    clinic: Any,
    importer: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
    django_capture_on_commit_callbacks: Any,
) -> None:
    client = importer[0]
    empty = client.post(
        IMPORTS,
        {"upload_id": upload(client, "Name,Sex\n", django_capture_on_commit_callbacks)},
        format="json",
    )
    assert empty.status_code == 422
    one_col = client.post(
        IMPORTS,
        {"upload_id": upload(client, "Name\nAlice\n", django_capture_on_commit_callbacks)},
        format="json",
    )
    assert one_col.status_code == 422
    missing = client.post(
        IMPORTS, {"upload_id": "00000000-0000-0000-0000-000000000000"}, format="json"
    )
    assert missing.status_code == 422
    assert doctor[0].get(IMPORTS).status_code == 403
    batch = start(client, "Name;Sex\nAlice Uwera;F\n", django_capture_on_commit_callbacks)
    assert batch["headers"] == ["Name", "Sex"]  # semicolons detected
    other = client_for(
        FacilityFactory(slug="other-imp"), ("facility_admin",), "o-imp@example.test"
    )[0]
    assert other.get(f"{IMPORTS}{batch['id']}/").status_code == 404
    assert other.get(f"{IMPORTS}{batch['id']}/rows/").status_code == 404


def test_parse_helpers_and_purge(
    clinic: Any, importer: tuple[APIClient, Any], django_capture_on_commit_callbacks: Any
) -> None:
    with pytest.raises(imports.ImportFileError):
        imports.parse_csv(("Name,Sex\n" + "A,F\n" * (imports.MAX_ROWS + 1)).encode())
    headers, body = imports.parse_csv("Nom,Sexe\nÉlise,F\n".encode("latin-1"))
    assert headers == ["Nom", "Sexe"] and body == [["Élise", "F"]]
    assert imports.suggest_mapping(["Amazina", "Igitsina"]) == {
        "full_name": "Amazina",
        "sex": "Igitsina",
    }
    client = importer[0]
    batch = start(client, "Name,Sex\nA Person,F\n", django_capture_on_commit_callbacks)
    assert imports.due_facilities() == []
    with rls_context(facility_id=clinic.pk):
        ImportBatch.objects.filter(pk=batch["id"]).update(
            created_at=timezone.now() - dt.timedelta(days=8)
        )
    assert tasks.purge_import_rows() == 1
    with rls_context(facility_id=clinic.pk):
        row = ImportRow.objects.get(batch_id=batch["id"])
        assert row.raw_enc is None and row.normalized == {}
        assert imports.purge(clinic.pk) == 0
