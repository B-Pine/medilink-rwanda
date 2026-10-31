"""The nine master data kinds (contract §3.5): URL slug, model, editable fields, translations,
audiences, filters and CSV import columns."""

from __future__ import annotations

from dataclasses import dataclass, field

from medilink.masterdata import models as m

LANGUAGES = ("rw", "en", "fr")


@dataclass(frozen=True)
class Kind:
    slug: str
    model: type[m.MasterDataModel]
    fields: tuple[str, ...]  # editable columns besides is_active/sort_order (code included)
    i18n_fields: tuple[str, ...] = ()
    all_languages: bool = False  # shown to patients: rw, en and fr required
    public: bool = False
    importable: bool = False
    identity: tuple[str, ...] = ("code",)  # natural key, immutable after creation
    search: tuple[str, ...] = ()  # columns (or i18n fields) searched by `q`
    trigram: str = ""  # column used for trigram ranking on staff search
    filters: tuple[str, ...] = ()  # exact-match query parameters
    ordering: tuple[str, ...] = ("sort_order", "code")
    csv_columns: tuple[str, ...] = field(default=())

    @property
    def change_fields(self) -> list[str]:
        return [*self.fields, "is_active", "sort_order"]


KINDS: dict[str, Kind] = {
    k.slug: k
    for k in (
        Kind(
            slug="locations",
            model=m.Location,
            fields=("code", "level", "parent_code", "name"),
            public=True,
            importable=True,
            search=("name", "code"),
            filters=("level",),
            ordering=("level", "name"),
            csv_columns=("code", "level", "parent_code", "name"),
        ),
        Kind(
            slug="facility-types",
            model=m.FacilityType,
            fields=("code", "name_i18n", "level_of_care"),
            i18n_fields=("name_i18n",),
            all_languages=True,
            public=True,
            search=("code",),
            filters=("level_of_care",),
        ),
        Kind(
            slug="service-catalogue-items",
            model=m.ServiceCatalogueItem,
            fields=(
                "code",
                "name_i18n",
                "synonyms_i18n",
                "min_age_months",
                "max_age_months",
                "sex_restriction",
            ),
            i18n_fields=("name_i18n", "synonyms_i18n"),
            all_languages=True,
            public=True,
            search=("code", "name_i18n", "synonyms_i18n"),
        ),
        Kind(
            slug="insurers",
            model=m.Insurer,
            fields=("code", "name", "scheme", "follows_referral_pathway"),
            public=True,
            search=("code", "name"),
            filters=("scheme",),
        ),
        Kind(
            slug="drugs",
            model=m.Drug,
            fields=(
                "code",
                "generic_name",
                "strength",
                "form",
                "default_route",
                "drug_class",
                "is_controlled",
                "is_essential_list",
                "max_usual_quantity",
            ),
            importable=True,
            search=("code", "generic_name"),
            trigram="generic_name",
            filters=("form", "drug_class", "is_controlled", "is_essential_list"),
            ordering=("generic_name", "strength"),
            csv_columns=(
                "code",
                "generic_name",
                "strength",
                "form",
                "default_route",
                "drug_class",
                "is_controlled",
                "is_essential_list",
                "max_usual_quantity",
            ),
        ),
        Kind(
            slug="diagnosis-codes",
            model=m.DiagnosisCode,
            fields=("code_system", "code", "title_i18n", "plain_language_i18n", "is_sensitive"),
            i18n_fields=("title_i18n", "plain_language_i18n"),
            importable=True,
            identity=("code_system", "code"),
            search=("code", "title_i18n"),
            trigram="title_en",
            filters=("code_system", "is_sensitive"),
            ordering=("code_system", "code"),
            csv_columns=(
                "code",
                "title_en",
                "title_rw",
                "title_fr",
                "plain_language_en",
                "plain_language_rw",
                "plain_language_fr",
                "is_sensitive",
            ),
        ),
        Kind(
            slug="symptoms",
            model=m.Symptom,
            fields=("code", "name_i18n", "body_system", "icd_code", "is_red_flag"),
            i18n_fields=("name_i18n",),
            all_languages=True,
            importable=True,
            search=("code", "name_i18n"),
            filters=("body_system",),
            csv_columns=("code", "name_rw", "name_en", "name_fr", "body_system", "icd_code"),
        ),
        Kind(
            slug="public-holidays",
            model=m.PublicHoliday,
            fields=("holiday_date", "name_i18n", "is_provisional"),
            i18n_fields=("name_i18n",),
            all_languages=True,
            public=True,
            identity=("holiday_date",),
            filters=("is_provisional",),
            ordering=("holiday_date",),
        ),
        Kind(
            slug="reason-codes",
            model=m.ReasonCode,
            fields=("kind", "code", "label_i18n", "requires_text"),
            i18n_fields=("label_i18n",),
            all_languages=True,
            identity=("kind", "code"),
            search=("code", "label_i18n"),
            filters=("kind",),
            ordering=("kind", "sort_order", "code"),
        ),
    )
}

PUBLIC_KINDS = tuple(slug for slug, kind in KINDS.items() if kind.public)
IMPORTABLE_KINDS = tuple(slug for slug, kind in KINDS.items() if kind.importable)


def kind_for_model(model: type) -> Kind:
    for kind in KINDS.values():
        if kind.model is model:
            return kind
    raise KeyError(model)


def localise(value: object, language: str) -> str:
    """The requested language, then English, then any non-empty translation."""
    if not isinstance(value, dict):
        return ""
    for code in (language, "en", *LANGUAGES):
        text = value.get(code)
        if text:
            return str(text)
    return ""


def missing_languages(row: m.MasterDataModel, kind: Kind) -> list[str]:
    missing: set[str] = set()
    for name in kind.i18n_fields:
        if name in ("synonyms_i18n", "plain_language_i18n"):
            continue  # optional
        value = getattr(row, name) or {}
        missing.update(code for code in LANGUAGES if not value.get(code))
    return [code for code in LANGUAGES if code in missing]
