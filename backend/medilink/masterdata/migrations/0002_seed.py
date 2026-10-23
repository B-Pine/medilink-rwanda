"""Seed master data (contract S1-B13): provinces and districts, facility types, insurers,
services, an ICD-10 subset, symptoms, public holidays 2026-2027 and reason codes.

Historical models skip the services-only guard; seeds write no change rows (version 1).
"""

from datetime import date
from typing import Any

from django.db import migrations

from medilink.core.ids import uuid7
from medilink.masterdata.migrations import _seed_0002 as seed


def _tr(rw: str, en: str, fr: str) -> dict[str, str]:
    return {"rw": rw, "en": en, "fr": fr}


def forwards(apps: Any, schema_editor: Any) -> None:
    location = apps.get_model("masterdata", "Location")
    provinces = {}
    for order, (code, name) in enumerate(seed.PROVINCES):
        provinces[code] = location.objects.create(
            id=uuid7(), level="province", code=code, name=name, sort_order=order
        )
    location.objects.bulk_create(
        location(id=uuid7(), level="district", code=code, parent=provinces[parent], name=name)
        for code, parent, name in seed.DISTRICTS
    )

    facility_type = apps.get_model("masterdata", "FacilityType")
    facility_type.objects.bulk_create(
        facility_type(id=uuid7(), code=code, level_of_care=level, name_i18n=_tr(rw, en, fr), sort_order=i)
        for i, (code, level, rw, en, fr) in enumerate(seed.FACILITY_TYPES)
    )

    insurer = apps.get_model("masterdata", "Insurer")
    insurer.objects.bulk_create(
        insurer(id=uuid7(), code=code, name=name, scheme=scheme, follows_referral_pathway=referral, sort_order=i)
        for i, (code, name, scheme, referral) in enumerate(seed.INSURERS)
    )

    service = apps.get_model("masterdata", "ServiceCatalogueItem")
    service.objects.bulk_create(
        service(
            id=uuid7(),
            code=code,
            name_i18n=_tr(rw, en, fr),
            min_age_months=min_age,
            max_age_months=max_age,
            sex_restriction=sex,
            sort_order=i,
        )
        for i, (code, rw, en, fr, min_age, max_age, sex) in enumerate(seed.SERVICES)
    )

    diagnosis = apps.get_model("masterdata", "DiagnosisCode")
    diagnosis.objects.bulk_create(
        diagnosis(
            id=uuid7(),
            code_system="icd10",
            code=code,
            title_i18n={"en": title_en, "fr": title_fr},
            plain_language_i18n={"en": plain_en, "fr": plain_fr},
            is_sensitive=sensitive,
        )
        for code, title_en, title_fr, plain_en, plain_fr, sensitive in seed.DIAGNOSES
    )

    symptom = apps.get_model("masterdata", "Symptom")
    symptom.objects.bulk_create(
        symptom(id=uuid7(), code=code, name_i18n=_tr(rw, en, fr), body_system=system, icd_code=icd, sort_order=i)
        for i, (code, rw, en, fr, system, icd) in enumerate(seed.SYMPTOMS)
    )

    holiday = apps.get_model("masterdata", "PublicHoliday")
    holiday.objects.bulk_create(
        holiday(
            id=uuid7(),
            holiday_date=date.fromisoformat(day),
            name_i18n=_tr(rw, en, fr),
            is_provisional=provisional,
        )
        for day, rw, en, fr, provisional in seed.HOLIDAYS
    )

    reason = apps.get_model("masterdata", "ReasonCode")
    reason.objects.bulk_create(
        reason(
            id=uuid7(),
            kind=kind,
            code=code,
            label_i18n=_tr(rw, en, fr),
            requires_text=requires_text,
            sort_order=i,
        )
        for kind, codes in seed.REASON_CODES.items()
        for i, (code, rw, en, fr, requires_text) in enumerate(codes)
    )


class Migration(migrations.Migration):
    dependencies = [("masterdata", "0001_initial")]

    # Not reversible: master data is never deleted (retire instead).
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
