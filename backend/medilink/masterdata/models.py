"""Master data (contract §2.2): shared, versioned, translated reference data (C0).

Only `medilink.masterdata.services` writes these tables (contract §2.6, database design D1): a
pre-save guard refuses any other writer, and the runtime role has no DELETE (retire instead).
Translations are `*_i18n` JSON objects {"rw", "en", "fr"}.
"""

from __future__ import annotations

from typing import Any, ClassVar

from django.conf import settings
from django.contrib.postgres.indexes import GinIndex, OpClass
from django.db import models
from django.db.models import Q
from django.db.models.fields.json import KeyTextTransform

from medilink.core.models import TimeStampedModel, UUIDModel


class MasterDataModel(TimeStampedModel):
    version = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)

    objects: ClassVar[models.Manager[Any]] = models.Manager()

    class Meta:
        abstract = True


class CodedModel(MasterDataModel):
    code = models.CharField(max_length=40, unique=True)

    class Meta:
        abstract = True


class LocationLevel(models.TextChoices):
    PROVINCE = "province", "Province"
    DISTRICT = "district", "District"
    SECTOR = "sector", "Sector"
    CELL = "cell", "Cell"
    VILLAGE = "village", "Village"


LEVEL_PARENT = {
    LocationLevel.PROVINCE: None,
    LocationLevel.DISTRICT: LocationLevel.PROVINCE,
    LocationLevel.SECTOR: LocationLevel.DISTRICT,
    LocationLevel.CELL: LocationLevel.SECTOR,
    LocationLevel.VILLAGE: LocationLevel.CELL,
}


class Location(MasterDataModel):
    level = models.CharField(max_length=10, choices=LocationLevel.choices)
    code = models.CharField(max_length=20, unique=True)  # NISR code
    parent = models.ForeignKey(
        "self", on_delete=models.PROTECT, null=True, blank=True, related_name="children"
    )
    name = models.CharField(max_length=120)  # proper noun, one language

    class Meta:
        db_table = "masterdata_location"
        indexes = [models.Index(fields=["level", "name"], name="md_location_level_name_idx")]

    def __str__(self) -> str:
        return f"{self.level} {self.code} {self.name}"


class LevelOfCare(models.TextChoices):
    PRIMARY = "primary", "Primary"
    SECONDARY = "secondary", "Secondary"
    TERTIARY = "tertiary", "Tertiary"


class FacilityType(CodedModel):
    name_i18n = models.JSONField(default=dict)
    level_of_care = models.CharField(max_length=12, choices=LevelOfCare.choices)

    class Meta:
        db_table = "masterdata_facility_type"


class SexRestriction(models.TextChoices):
    FEMALE = "female", "Female"
    MALE = "male", "Male"


class ServiceCatalogueItem(CodedModel):
    name_i18n = models.JSONField(default=dict)
    synonyms_i18n = models.JSONField(default=dict)
    min_age_months = models.PositiveIntegerField(null=True, blank=True)
    max_age_months = models.PositiveIntegerField(null=True, blank=True)
    sex_restriction = models.CharField(  # noqa: DJ001 (NULL = no restriction)
        max_length=8, choices=SexRestriction.choices, null=True, blank=True
    )

    class Meta:
        db_table = "masterdata_service_catalogue_item"


class InsurerScheme(models.TextChoices):
    COMMUNITY = "community", "Community-based"
    SOCIAL = "social", "Social"
    MILITARY = "military", "Military"
    PRIVATE = "private", "Private"


class Insurer(CodedModel):
    name = models.CharField(max_length=120)
    scheme = models.CharField(max_length=20, choices=InsurerScheme.choices)
    follows_referral_pathway = models.BooleanField(default=False)

    class Meta:
        db_table = "masterdata_insurer"


class Drug(CodedModel):
    generic_name = models.CharField(max_length=200)
    strength = models.CharField(max_length=60)
    form = models.CharField(max_length=40)
    default_route = models.CharField(max_length=40, blank=True)
    drug_class = models.CharField(max_length=60, blank=True)  # allergy matching
    is_controlled = models.BooleanField(default=False)
    is_essential_list = models.BooleanField(default=False)
    max_usual_quantity = models.PositiveIntegerField(null=True, blank=True)  # dose sanity

    class Meta:
        db_table = "masterdata_drug"
        indexes = [
            GinIndex(OpClass("generic_name", name="gin_trgm_ops"), name="md_drug_generic_name_trgm")
        ]


class DiagnosisCode(MasterDataModel):
    code_system = models.CharField(max_length=8, default="icd10")
    code = models.CharField(max_length=10)
    title_i18n = models.JSONField(default=dict)
    plain_language_i18n = models.JSONField(default=dict)
    is_sensitive = models.BooleanField(default=False)

    class Meta:
        db_table = "masterdata_diagnosis_code"
        constraints = [
            models.UniqueConstraint(fields=["code_system", "code"], name="md_diagnosis_code_uniq")
        ]
        indexes = [
            GinIndex(
                OpClass(KeyTextTransform("en", "title_i18n"), name="gin_trgm_ops"),
                name="md_diagnosis_title_en_trgm",
            )
        ]


class Symptom(CodedModel):
    name_i18n = models.JSONField(default=dict)
    body_system = models.CharField(max_length=40, blank=True)
    icd_code = models.CharField(max_length=10, blank=True)

    class Meta:
        db_table = "masterdata_symptom"


class PublicHoliday(MasterDataModel):
    holiday_date = models.DateField(unique=True)
    name_i18n = models.JSONField(default=dict)
    is_provisional = models.BooleanField(default=False)  # Eid dates until announced

    class Meta:
        db_table = "masterdata_public_holiday"


class ReasonCode(MasterDataModel):
    kind = models.CharField(max_length=30)
    code = models.CharField(max_length=40)
    label_i18n = models.JSONField(default=dict)
    requires_text = models.BooleanField(default=False)

    class Meta:
        db_table = "masterdata_reason_code"
        constraints = [models.UniqueConstraint(fields=["kind", "code"], name="md_reason_code_uniq")]


MASTER_DATA_MODELS: tuple[type[MasterDataModel], ...] = (
    Location,
    FacilityType,
    ServiceCatalogueItem,
    Insurer,
    Drug,
    DiagnosisCode,
    Symptom,
    PublicHoliday,
    ReasonCode,
)


class ChangeAction(models.TextChoices):
    CREATE = "create", "Create"
    UPDATE = "update", "Update"
    RETIRE = "retire", "Retire"
    RESTORE = "restore", "Restore"
    IMPORT = "import", "Import"


class MasterDataChange(UUIDModel):
    """Append-only change log (UPDATE/DELETE revoked for the runtime role)."""

    kind = models.CharField(max_length=40)
    row_id = models.UUIDField()
    row_version = models.PositiveIntegerField()
    action = models.CharField(max_length=10, choices=ChangeAction.choices)
    old = models.JSONField(null=True, blank=True)
    new = models.JSONField()
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, related_name="+"
    )
    import_ref = models.ForeignKey(
        "masterdata.MasterDataImport",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="changes",
        db_column="import_id",
    )
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "masterdata_change"
        indexes = [models.Index(fields=["kind", "row_id", "changed_at"], name="md_change_row_idx")]


class ImportMode(models.TextChoices):
    UPSERT = "upsert", "Create and update"
    UPSERT_AND_RETIRE = "upsert_and_retire_missing", "Create, update and retire missing rows"


class ImportStatus(models.TextChoices):
    VALIDATING = "validating", "Validating"
    PREVIEWED = "previewed", "Previewed"
    INVALID = "invalid", "Invalid"
    APPLYING = "applying", "Applying"
    APPLIED = "applied", "Applied"
    FAILED = "failed", "Failed"
    EXPIRED = "expired", "Expired"


class MasterDataImport(UUIDModel):
    kind = models.CharField(max_length=40)
    file = models.ForeignKey("uploads.UploadedFile", on_delete=models.PROTECT, related_name="+")
    mode = models.CharField(max_length=30, choices=ImportMode.choices)
    status = models.CharField(
        max_length=12, choices=ImportStatus.choices, default=ImportStatus.VALIDATING
    )
    summary = models.JSONField(default=dict)
    # The validated diff: {"errors": [...], "changes": [{"code", "action", "values", "changes"}]}
    plan = models.JSONField(default=dict)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    idempotency_key = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    applied_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField()

    class Meta:
        db_table = "masterdata_import"
        constraints = [
            models.UniqueConstraint(
                fields=["created_by", "idempotency_key"],
                condition=~Q(idempotency_key=""),
                name="md_import_idempotency_uniq",
            )
        ]
