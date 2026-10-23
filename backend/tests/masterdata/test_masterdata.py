"""S1-B12 (master data writes and reads), S1-B13 (seeds and imports), S1-B2 (platform matrix)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import DatabaseError, connection, transaction
from rest_framework.test import APIClient

from medilink.audit.models import AuditEntry
from medilink.masterdata import services
from medilink.masterdata.kinds import KINDS
from medilink.masterdata.models import (
    DiagnosisCode,
    Drug,
    FacilityType,
    Insurer,
    Location,
    MasterDataChange,
    MasterDataImport,
    PublicHoliday,
    ReasonCode,
    ServiceCatalogueItem,
    Symptom,
)
from medilink.tenancy.models import FacilityType as TenancyFacilityType
from tests.conftest import error_code, login_patient, login_staff
from tests.factories import make_staff
from tests.masterdata.conftest import age_recent_auth

PLATFORM = "/api/v1/platform/master-data"
STAFF = "/api/v1/staff/master-data"
PUBLIC = "/api/v1/public/master-data"

DB_DESIGN_REASON_KINDS = {
    "dispute",
    "no_show_reversal",
    "void",
    "reorder",
    "priority",
    "exemption",
    "access",
    "break_glass",
    "application_rejection",
    "facility_suspension",
    "facility_reactivation",
    "facility_deactivation",
}


# ---- S1-B13: seeds ------------------------------------------------------------------------------


@pytest.mark.acceptance("S1-B13")
@pytest.mark.django_db
def test_seeds() -> None:
    assert Location.objects.filter(level="province").count() == 5
    assert Location.objects.filter(level="district").count() == 30
    assert set(
        Location.objects.filter(level="district", parent__code="1").values_list("name", flat=True)
    ) == {
        "Nyarugenge",
        "Gasabo",
        "Kicukiro",
    }
    assert set(FacilityType.objects.values_list("code", flat=True)) == set(
        TenancyFacilityType.values
    )
    assert {"mutuelle", "rama", "mmi"} <= set(Insurer.objects.values_list("code", flat=True))
    assert Insurer.objects.filter(scheme="private").exists()
    assert ServiceCatalogueItem.objects.count() >= 25
    assert DiagnosisCode.objects.filter(code="B54").exists()
    assert DiagnosisCode.objects.filter(is_sensitive=True).exists()
    assert Symptom.objects.count() >= 15
    years = {d.year for d in PublicHoliday.objects.values_list("holiday_date", flat=True)}
    assert years == {2026, 2027}
    assert PublicHoliday.objects.filter(is_provisional=True).exists()
    assert (
        set(ReasonCode.objects.values_list("kind", flat=True).distinct()) == DB_DESIGN_REASON_KINDS
    )
    for kind in KINDS.values():
        if kind.all_languages:
            field = next(n for n in kind.i18n_fields if n != "synonyms_i18n")
            for row in kind.model.objects.all():
                assert all(getattr(row, field).get(c) for c in ("rw", "en", "fr")), (
                    kind.slug,
                    row.pk,
                )


# ---- S1-B12: services-only writes, change log, privileges --------------------------------------


@pytest.mark.acceptance("S1-B12")
@pytest.mark.django_db
def test_create_update_retire_restore(platform_admin: Any) -> None:
    kind = KINDS["insurers"]
    row = services.create(
        kind,
        {
            "code": "radiant",
            "name": "Radiant",
            "scheme": "private",
            "follows_referral_pathway": False,
        },
        actor=platform_admin,
    )
    assert row.version == 1
    row = services.update(kind, row, {"name": "Radiant Insurance"}, version=1, actor=platform_admin)
    row = services.update(kind, row, {"is_active": False}, version=2, actor=platform_admin)
    row = services.update(kind, row, {"is_active": True}, version=3, actor=platform_admin)
    assert row.version == 4
    actions = list(
        MasterDataChange.objects.filter(row_id=row.pk)
        .order_by("changed_at")
        .values_list("action", flat=True)
    )
    assert actions == ["create", "update", "retire", "restore"]
    change = MasterDataChange.objects.get(row_id=row.pk, action="update")
    assert change.old["name"] == "Radiant" and change.new["name"] == "Radiant Insurance"
    audit = list(
        AuditEntry.objects.filter(object_id=str(row.pk))
        .order_by("sequence")
        .values_list("action", flat=True)
    )
    assert audit == [
        "masterdata.created",
        "masterdata.updated",
        "masterdata.retired",
        "masterdata.restored",
    ]
    # Identity fields are immutable; no-op updates don't bump the version.
    same = services.update(
        kind, row, {"code": "other", "name": "Radiant Insurance"}, version=4, actor=platform_admin
    )
    assert same.code == "radiant" and same.version == 4


@pytest.mark.acceptance("S1-B12")
@pytest.mark.django_db
def test_stale_version_conflicts(platform_admin: Any) -> None:
    from medilink.core.exceptions import Conflict

    kind = KINDS["insurers"]
    row = Insurer.objects.get(code="rama")
    with pytest.raises(Conflict):
        services.update(kind, row, {"name": "x"}, version=99, actor=platform_admin)


@pytest.mark.acceptance("S1-B12")
@pytest.mark.django_db
def test_writes_outside_services_are_refused() -> None:
    row = Insurer.objects.get(code="rama")
    row.name = "changed"
    with pytest.raises(services.MasterDataWriteOutsideServices):
        row.save()
    for model in (Drug, Location, ReasonCode):
        with pytest.raises(services.MasterDataWriteOutsideServices):
            model.objects.create()


@pytest.mark.acceptance("S1-B12")
@pytest.mark.django_db
@pytest.mark.parametrize("table", ["masterdata_insurer", "masterdata_location", "masterdata_drug"])
def test_app_role_cannot_delete_master_data(table: str) -> None:
    with (
        pytest.raises(DatabaseError, match="permission denied"),
        transaction.atomic(),
        connection.cursor() as cursor,
    ):
        cursor.execute(f"DELETE FROM {table}")  # noqa: S608 (fixed table names)


@pytest.mark.acceptance("S1-B18")
@pytest.mark.django_db
def test_change_log_is_append_only(platform_admin: Any) -> None:
    services.create(
        KINDS["insurers"],
        {
            "code": "britam",
            "name": "Britam",
            "scheme": "private",
            "follows_referral_pathway": False,
        },
        actor=platform_admin,
    )
    for statement in ("UPDATE masterdata_change SET action = 'x'", "DELETE FROM masterdata_change"):
        with (
            pytest.raises(DatabaseError, match="permission denied"),
            transaction.atomic(),
            connection.cursor() as cursor,
        ):
            cursor.execute(statement)


# ---- reads ------------------------------------------------------------------------------------------


@pytest.mark.acceptance("S1-B12")
@pytest.mark.django_db
def test_public_reads_are_localised_cacheable_and_hide_retired(platform_admin: Any) -> None:
    client = APIClient()
    response = client.get(f"{PUBLIC}/facility-types/", HTTP_ACCEPT_LANGUAGE="fr")
    assert response.status_code == 200
    names = {item["code"]: item["name"] for item in response.json()["results"]}
    assert names["health_center"] == "Centre de santé"
    assert response["Cache-Control"] == "public, max-age=3600"
    assert "Accept-Language" in response["Vary"]
    etag = response["ETag"]
    again = client.get(
        f"{PUBLIC}/facility-types/", HTTP_ACCEPT_LANGUAGE="fr", HTTP_IF_NONE_MATCH=etag
    )
    assert again.status_code == 304
    rw = client.get(f"{PUBLIC}/facility-types/", HTTP_ACCEPT_LANGUAGE="rw").json()["results"]
    assert {i["code"]: i["name"] for i in rw}["health_center"] == "Ikigo nderabuzima"
    # Fallback to English when the requested translation is missing.
    diagnosis = client.get(f"{STAFF}/diagnosis-codes/", HTTP_ACCEPT_LANGUAGE="rw")
    assert diagnosis.status_code == 401  # staff only
    services.update(
        KINDS["insurers"],
        Insurer.objects.get(code="mmi"),
        {"is_active": False},
        version=1,
        actor=platform_admin,
    )
    codes = {i["code"] for i in client.get(f"{PUBLIC}/insurers/").json()["results"]}
    assert "mmi" not in codes and "rama" in codes
    assert client.get(f"{PUBLIC}/drugs/").status_code == 404  # not a public kind


@pytest.mark.django_db
def test_location_cascade() -> None:
    client = APIClient()
    provinces = client.get(f"{PUBLIC}/locations/").json()["results"]
    assert len(provinces) == 5 and all(p["has_children"] for p in provinces)
    kigali = client.get(f"{PUBLIC}/locations/", {"parent": "1"}).json()["results"]
    assert {d["code"] for d in kigali} == {"11", "12", "13"}
    assert kigali[0]["parent_code"] == "1" and kigali[0]["level"] == "district"
    assert client.get(f"{PUBLIC}/public-holidays/", {"year": 2027}).json()["count"] == 15


@pytest.mark.acceptance("S1-B12")
@pytest.mark.django_db
def test_staff_reads_all_kinds_with_search(staff_client: APIClient, platform_admin: Any) -> None:
    for slug in KINDS:
        assert staff_client.get(f"{STAFF}/{slug}/").status_code == 200, slug
    services.create(
        KINDS["drugs"],
        {
            "code": "AMOX500C",
            "generic_name": "Amoxicillin",
            "strength": "500 mg",
            "form": "capsule",
            "is_essential_list": True,
        },
        actor=platform_admin,
    )
    found = staff_client.get(f"{STAFF}/drugs/", {"q": "amoxycillin"}).json()["results"]  # misspelt
    assert [d["code"] for d in found] == ["AMOX500C"]
    english = staff_client.get(
        f"{STAFF}/diagnosis-codes/", {"q": "malaria"}, HTTP_ACCEPT_LANGUAGE="rw"
    )
    item = english.json()["results"][0]
    assert item["code"] == "B54" and item["title"] == "Unspecified malaria"  # en fallback


# ---- platform API --------------------------------------------------------------------------------


@pytest.mark.acceptance("S1-B12")
@pytest.mark.django_db
def test_platform_crud(platform_client: APIClient) -> None:
    created = platform_client.post(
        f"{PLATFORM}/symptoms/",
        {
            "code": "itching",
            "name_i18n": {"rw": "Uburyaryate", "en": "Itching", "fr": "Démangeaisons"},
        },
        format="json",
    )
    assert created.status_code == 201, created.content
    item = created.json()
    assert item["version"] == 1 and item["missing_languages"] == []
    url = f"{PLATFORM}/symptoms/{item['id']}/"
    patched = platform_client.patch(url, {"version": 1, "body_system": "skin"}, format="json")
    assert patched.json()["version"] == 2
    stale = platform_client.patch(url, {"version": 1, "body_system": "general"}, format="json")
    assert stale.status_code == 409
    immutable = platform_client.patch(url, {"version": 2, "code": "x"}, format="json")
    assert immutable.status_code == 400 and "code" in immutable.json()["error"]["fields"]
    retired = platform_client.patch(url, {"version": 2, "is_active": False}, format="json")
    assert retired.json()["is_active"] is False
    assert platform_client.delete(url).status_code == 405
    history = platform_client.get(f"{url}changes/").json()["results"]
    assert [h["action"] for h in history] == ["retire", "update", "create"]
    listed = platform_client.get(f"{PLATFORM}/symptoms/", {"is_active": "false"}).json()["results"]
    assert [i["code"] for i in listed] == ["itching"]


@pytest.mark.acceptance("S1-B12")
@pytest.mark.django_db
def test_platform_validation(platform_client: APIClient) -> None:
    missing = platform_client.post(
        f"{PLATFORM}/symptoms/", {"code": "x", "name_i18n": {"en": "Only English"}}, format="json"
    )
    assert missing.status_code == 400 and "name_i18n" in missing.json()["error"]["fields"]
    duplicate = platform_client.post(
        f"{PLATFORM}/insurers/",
        {"code": "rama", "name": "Again", "scheme": "social", "follows_referral_pathway": True},
        format="json",
    )
    assert duplicate.status_code == 400 and "code" in duplicate.json()["error"]["fields"]
    # Drugs aren't shown to patients: English alone is enough for diagnosis titles.
    ok = platform_client.post(
        f"{PLATFORM}/diagnosis-codes/",
        {"code_system": "icd10", "code": "A01.0", "title_i18n": {"en": "Typhoid fever"}},
        format="json",
    )
    assert ok.status_code == 201
    assert ok.json()["missing_languages"] == ["rw", "fr"]
    filtered = platform_client.get(
        f"{PLATFORM}/diagnosis-codes/", {"missing_language": "rw"}
    ).json()
    assert filtered["count"] == DiagnosisCode.objects.count()
    location = platform_client.post(
        f"{PLATFORM}/locations/",
        {"code": "1101", "level": "sector", "parent_code": "1", "name": "X"},
        format="json",
    )
    assert location.status_code == 400 and "parent_code" in location.json()["error"]["fields"]
    sector = platform_client.post(
        f"{PLATFORM}/locations/",
        {"code": "1101", "level": "sector", "parent_code": "11", "name": "Gitega"},
        format="json",
    )
    assert sector.status_code == 201, sector.content
    assert sector.json()["parent_code"] == "11"


@pytest.mark.acceptance("S1-B16")
@pytest.mark.django_db
def test_platform_writes_need_recent_auth(stale_platform_client: APIClient) -> None:
    assert stale_platform_client.get(f"{PLATFORM}/insurers/").status_code == 200
    response = stale_platform_client.post(
        f"{PLATFORM}/insurers/",
        {"code": "x", "name": "X", "scheme": "private", "follows_referral_pathway": False},
        format="json",
    )
    assert response.status_code == 403
    assert error_code(response) == "step_up_required"


@pytest.mark.acceptance("S1-B2")
@pytest.mark.django_db
def test_platform_matrix(
    facility: Any, patient_user: Any, platform_admin: Any, settings: Any
) -> None:
    url = f"{PLATFORM}/insurers/"
    assert APIClient().get(url).status_code == 401
    patient = APIClient()
    login_patient(patient, patient_user)
    assert patient.get(url).status_code == 401  # staff cookie absent on the platform path
    for role in ("facility_admin", "receptionist", "doctor", "nurse", "pharmacist"):
        client = APIClient()
        login_staff(client, make_staff(facility, roles=(role,), email=f"{role}@example.test"))
        assert client.get(url).status_code == 403, role
    admin = APIClient()
    login_staff(admin, platform_admin)
    assert admin.get(url).status_code == 200
    settings.PLATFORM_ALLOWED_NETWORKS = "10.20.0.0/16"
    assert admin.get(url).status_code == 403
    assert admin.get(url, REMOTE_ADDR="10.20.3.4").status_code == 200


# ---- S1-B13: imports ------------------------------------------------------------------------------


LOCATIONS_CSV = (
    "code,level,parent_code,name\n"
    "110101,cell,1101,Kiyovu\n"
    "1101,sector,11,Nyarugenge\n"
    "11010101,village,110101,Ubumwe\n"
)


@pytest.mark.acceptance("S1-B13")
@pytest.mark.django_db
def test_import_locations_cli(tmp_path: Path) -> None:
    path = tmp_path / "locations.csv"
    path.write_text(LOCATIONS_CSV, encoding="utf-8")
    call_command("import_locations", str(path))  # dry run
    assert not Location.objects.filter(code="1101").exists()
    call_command("import_locations", str(path), "--apply")
    village = Location.objects.select_related("parent__parent").get(code="11010101")
    assert village.parent.parent.code == "1101"
    call_command("import_locations", str(path), "--apply")  # idempotent
    assert Location.objects.filter(code__startswith="1101").count() == 3
    assert MasterDataChange.objects.filter(kind="locations", action="import").count() == 3
    bad = tmp_path / "bad.csv"
    bad.write_text(
        "code,level,parent_code,name\n9901,sector,99,Nowhere\n1101,sector,11,Dup\n1101,sector,11,Dup\n"
    )
    with pytest.raises(CommandError):
        call_command("import_locations", str(bad))
    wrong_headers = tmp_path / "h.csv"
    wrong_headers.write_text("code,name\n1,x\n")
    with pytest.raises(CommandError, match="Expected columns"):
        call_command("import_locations", str(wrong_headers))


@pytest.mark.acceptance("S1-B13")
@pytest.mark.django_db
def test_import_drugs_and_diagnoses_cli(tmp_path: Path, capsys: Any) -> None:
    drugs = tmp_path / "drugs.csv"
    drugs.write_text(
        "code,generic_name,strength,form,default_route,drug_class,is_controlled,is_essential_list,max_usual_quantity\n"
        "PCM500T,Paracetamol,500 mg,tablet,oral,analgesic,false,true,60\n"
        "MOR10I,Morphine,10 mg/ml,injection,iv,opioid,maybe,false,\n"
    )
    with pytest.raises(CommandError):
        call_command("import_drugs", str(drugs), "--apply")
    assert "line 3" in capsys.readouterr().out
    drugs.write_text(
        "code,generic_name,strength,form,default_route,drug_class,is_controlled,is_essential_list,max_usual_quantity\n"
        "PCM500T,Paracetamol,500 mg,tablet,oral,analgesic,false,true,60\n"
    )
    call_command("import_drugs", str(drugs), "--apply")
    assert Drug.objects.get(code="PCM500T").max_usual_quantity == 60
    diagnoses = tmp_path / "icd.csv"
    diagnoses.write_text(
        "code,title_en,title_rw,title_fr,plain_language_en,plain_language_rw,plain_language_fr,is_sensitive\n"
        "b54,Unspecified malaria (updated),,Paludisme,Malaria,,Paludisme,false\n"
    )
    call_command("import_diagnosis_codes", str(diagnoses), "--apply")
    row = DiagnosisCode.objects.get(code="B54")
    assert row.title_i18n["en"] == "Unspecified malaria (updated)" and row.version == 2


@pytest.mark.acceptance("S1-B13")
@pytest.mark.django_db
def test_api_import_preview_and_confirm(
    platform_client: APIClient, django_capture_on_commit_callbacks: Any
) -> None:
    from django.core.files.uploadedfile import SimpleUploadedFile

    csv_file = SimpleUploadedFile(
        "symptoms.csv",
        (
            "code,name_rw,name_en,name_fr,body_system,icd_code\n"
            "itching,Uburyaryate,Itching,Démangeaisons,skin,L29.9\n"
            "fever,Umuriro,Fever (high temperature),Fièvre,general,R50.9\n"
        ).encode(),
    )
    with django_capture_on_commit_callbacks(execute=True):
        created = platform_client.post(
            f"{PLATFORM}/symptoms/imports/",
            {"file": csv_file, "mode": "upsert"},
            format="multipart",
        )
    assert created.status_code == 202, created.content
    job_url = f"{PLATFORM}/symptoms/imports/{created.json()['id']}/"
    job = platform_client.get(job_url).json()
    assert job["status"] == "previewed", job
    assert job["summary"]["create"] == 1 and job["summary"]["update"] == 1
    assert {c["action"] for c in job["sample_changes"]} == {"create", "update"}
    age_recent_auth(platform_client)
    assert platform_client.post(f"{job_url}confirm/").status_code == 403
    login_staff(platform_client, MasterDataImport.objects.get().created_by)
    with django_capture_on_commit_callbacks(execute=True):
        confirmed = platform_client.post(f"{job_url}confirm/", HTTP_IDEMPOTENCY_KEY="c-1")
    assert confirmed.status_code == 202
    assert platform_client.get(job_url).json()["status"] == "applied"
    assert Symptom.objects.get(code="fever").name_i18n["en"] == "Fever (high temperature)"
    assert AuditEntry.objects.filter(action="masterdata.import.applied").exists()
    replay = platform_client.post(f"{job_url}confirm/", HTTP_IDEMPOTENCY_KEY="c-1")
    assert replay.status_code == 202
    assert platform_client.post(f"{job_url}confirm/").status_code == 422
    not_importable = platform_client.post(f"{PLATFORM}/insurers/imports/", {}, format="multipart")
    assert not_importable.status_code == 404


@pytest.mark.django_db
def test_dev_seed_refuses_without_debug() -> None:
    with pytest.raises(CommandError, match="DEBUG"):
        call_command("seed_masterdata_dev")


@pytest.mark.django_db
def test_dev_seed(settings: Any) -> None:
    settings.DEBUG = True
    call_command("seed_masterdata_dev")
    call_command("seed_masterdata_dev")
    assert Location.objects.filter(level="village", code__startswith="DEV-").count() == 10


def _post_import(
    client: APIClient, capture: Any, slug: str, content: bytes, name: str = "f.csv"
) -> Any:
    from django.core.files.uploadedfile import SimpleUploadedFile

    with capture(execute=True):
        response = client.post(
            f"{PLATFORM}/{slug}/imports/",
            {"file": SimpleUploadedFile(name, content), "mode": "upsert_and_retire_missing"},
            format="multipart",
        )
    assert response.status_code == 202, response.content
    return client.get(f"{PLATFORM}/{slug}/imports/{response.json()['id']}/").json()


@pytest.mark.acceptance("S1-B13")
@pytest.mark.django_db
def test_api_import_failures(
    platform_client: APIClient, django_capture_on_commit_callbacks: Any
) -> None:
    from datetime import timedelta

    from django.utils import timezone

    from medilink.uploads.scanner import EICAR

    headers = _post_import(
        platform_client, django_capture_on_commit_callbacks, "drugs", b"code,name\nX,Y\n"
    )
    assert headers["status"] == "invalid" and "Expected columns" in headers["errors"][0]["message"]
    rows = _post_import(
        platform_client,
        django_capture_on_commit_callbacks,
        "symptoms",
        b"code,name_rw,name_en,name_fr,body_system,icd_code\nx,,Only English,,skin,\n",
    )
    assert rows["status"] == "invalid" and rows["errors"][0]["line"] == 2
    infected = _post_import(
        platform_client, django_capture_on_commit_callbacks, "symptoms", b"code,x\n" + EICAR
    )
    assert infected["status"] == "failed"
    # Retire missing: the preview lists every active symptom not in the file.
    retire = _post_import(
        platform_client,
        django_capture_on_commit_callbacks,
        "symptoms",
        "code,name_rw,name_en,name_fr,body_system,icd_code\nfever,Umuriro,Fever,Fièvre,general,R50.9\n".encode(),
    )
    assert retire["status"] == "previewed"
    assert retire["summary"]["retire"] == Symptom.objects.count() - 1
    job = MasterDataImport.objects.get(pk=retire["id"])
    MasterDataImport.objects.filter(pk=job.pk).update(
        expires_at=timezone.now() - timedelta(minutes=1)
    )
    expired = platform_client.post(f"{PLATFORM}/symptoms/imports/{job.pk}/confirm/")
    assert expired.status_code == 422
    assert (
        platform_client.get(f"{PLATFORM}/symptoms/imports/{job.pk}/").json()["status"] == "expired"
    )
    assert platform_client.get(f"{PLATFORM}/drugs/imports/{job.pk}/").status_code == 404


@pytest.mark.django_db
def test_apply_failure_marks_import_failed(
    platform_admin: Any, django_capture_on_commit_callbacks: Any, platform_client: APIClient
) -> None:
    from unittest import mock

    from medilink.masterdata.tasks import apply_import

    job = _post_import(
        platform_client,
        django_capture_on_commit_callbacks,
        "symptoms",
        b"code,name_rw,name_en,name_fr,body_system,icd_code\nnew,A,B,C,skin,\n",
    )
    MasterDataImport.objects.filter(pk=job["id"]).update(
        status="applying", confirmed_by=platform_admin
    )
    with mock.patch("medilink.masterdata.imports.apply_plan", side_effect=RuntimeError("boom")):
        apply_import(job["id"])
    assert MasterDataImport.objects.get(pk=job["id"]).status == "failed"
    apply_import(job["id"])  # not applying any more: no-op


@pytest.mark.django_db
def test_import_symptoms_cli(tmp_path: Path) -> None:
    path = tmp_path / "s.csv"
    path.write_text(
        "code,name_rw,name_en,name_fr,body_system,icd_code\nnausea,Iseseme,Nausea,Nausée,digestive,R11\n",
        encoding="utf-8",
    )
    call_command("import_symptoms", str(path), "--apply")
    assert Symptom.objects.get(code="nausea").name_i18n["fr"] == "Nausée"
    with pytest.raises(CommandError, match="No such file"):
        call_command("import_symptoms", str(tmp_path / "missing.csv"))
