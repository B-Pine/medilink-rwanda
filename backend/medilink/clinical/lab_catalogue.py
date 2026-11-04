"""The laboratory test catalogue (upgrade 06 §3, #201): common outpatient tests at Rwandan health
centres and district hospitals. A constant list for now; master data takes it over when the
facilities need their own tests (a follow-up of W2).

A test has one or more result items. A `number` item has a unit and a reference range (adults);
a `choice` item has fixed answers and, when there is one, the expected answer (`normal`), so
anything else is flagged. Codes are stable: lab orders keep them, and a tariff item with the same
code puts the test on the bill.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any

from django.utils.translation import gettext_lazy as _

NEED_VALUE = _("Enter this result.")
NEED_NUMBER = _("Enter a number.")
NEED_CHOICE = _("Choose one of the answers.")
POS_NEG = ("negative", "positive", "invalid")
DIPSTICK = ("negative", "trace", "positive")


@dataclass(frozen=True)
class Item:
    code: str
    label: dict[str, str]
    kind: str  # "number" | "choice"
    unit: str = ""
    low: Decimal | None = None
    high: Decimal | None = None
    choices: tuple[str, ...] = ()
    normal: str | None = None


@dataclass(frozen=True)
class LabTest:
    code: str
    name: dict[str, str]
    specimen: str  # blood | urine | stool
    items: tuple[Item, ...] = field(default_factory=tuple)


def _n(en: str, fr: str, rw: str) -> dict[str, str]:
    return {"en": en, "fr": fr, "rw": rw}


def _result(normal: str | None = "negative", choices: tuple[str, ...] = POS_NEG) -> Item:
    return Item(
        "result", _n("Result", "Résultat", "Igisubizo"), "choice", choices=choices, normal=normal
    )


TESTS: tuple[LabTest, ...] = (
    LabTest(
        "MAL-RDT",
        _n(
            "Malaria rapid test (RDT)",
            "Test rapide du paludisme (TDR)",
            "Isuzuma ryihuse rya malariya",
        ),
        "blood",
        (_result(),),
    ),
    LabTest(
        "FBC",
        _n("Full blood count", "Numération formule sanguine", "Isuzuma ryuzuye ry'amaraso"),
        "blood",
        (
            Item(
                "hb",
                _n("Haemoglobin", "Hémoglobine", "Hemoglobine"),
                "number",
                "g/dL",
                Decimal("12.0"),
                Decimal("17.5"),
            ),
            Item(
                "wbc",
                _n("White cells", "Globules blancs", "Insoro zera"),
                "number",
                "×10⁹/L",  # noqa: RUF001 (the SI notation clinicians read)
                Decimal("4.0"),
                Decimal("11.0"),
            ),
            Item(
                "plt",
                _n("Platelets", "Plaquettes", "Plakete"),
                "number",
                "×10⁹/L",  # noqa: RUF001 (the SI notation clinicians read)
                Decimal("150"),
                Decimal("450"),
            ),
        ),
    ),
    LabTest(
        "URINE",
        _n("Urinalysis (dipstick)", "Analyse d'urine (bandelette)", "Isuzuma ry'inkari"),
        "urine",
        (
            Item(
                "protein",
                _n("Protein", "Protéines", "Poroteyine"),
                "choice",
                choices=DIPSTICK,
                normal="negative",
            ),
            Item(
                "glucose",
                _n("Glucose", "Glucose", "Isukari"),
                "choice",
                choices=DIPSTICK,
                normal="negative",
            ),
            Item(
                "leukocytes",
                _n("Leukocytes", "Leucocytes", "Insoro zera"),
                "choice",
                choices=DIPSTICK,
                normal="negative",
            ),
            Item(
                "nitrite",
                _n("Nitrite", "Nitrites", "Nitirite"),
                "choice",
                choices=("negative", "positive"),
                normal="negative",
            ),
            Item(
                "blood",
                _n("Blood", "Sang", "Amaraso"),
                "choice",
                choices=DIPSTICK,
                normal="negative",
            ),
        ),
    ),
    LabTest(
        "GLU",
        _n("Blood glucose (random)", "Glycémie (aléatoire)", "Isukari mu maraso"),
        "blood",
        (
            Item(
                "glucose",
                _n("Glucose", "Glucose", "Isukari"),
                "number",
                "mmol/L",
                Decimal("3.9"),
                Decimal("7.8"),
            ),
        ),
    ),
    LabTest(
        "HIV-RT",
        _n("HIV rapid test", "Test rapide du VIH", "Isuzuma ryihuse rya SIDA"),
        "blood",
        (_result(),),
    ),
    LabTest(
        "PREG",
        _n("Pregnancy test (urine)", "Test de grossesse (urine)", "Isuzuma ry'inda"),
        "urine",
        (_result(normal=None),),
    ),
    LabTest(
        "STOOL",
        _n("Stool examination", "Examen des selles", "Isuzuma ry'umwanda"),
        "stool",
        (
            Item(
                "parasites",
                _n("Ova and parasites", "Œufs et parasites", "Amagi n'inzoka"),
                "choice",
                choices=("none_seen", "seen"),
                normal="none_seen",
            ),
        ),
    ),
    LabTest(
        "TYPHOID",
        _n("Typhoid rapid test", "Test rapide de la typhoïde", "Isuzuma ryihuse rya tifoyide"),
        "blood",
        (_result(),),
    ),
)

BY_CODE: dict[str, LabTest] = {t.code: t for t in TESTS}


def pick(values: dict[str, str], lang: str) -> str:
    return values.get(lang) or values["en"]


def catalogue_row(test: LabTest, lang: str) -> dict[str, Any]:
    return {
        "code": test.code,
        "name": pick(test.name, lang),
        "specimen": test.specimen,
        "items": [
            {
                "code": i.code,
                "label": pick(i.label, lang),
                "kind": i.kind,
                "unit": i.unit,
                "low": i.low,
                "high": i.high,
                "choices": list(i.choices),
                "normal": i.normal,
            }
            for i in test.items
        ],
    }


def parse_values(
    test: LabTest, values: dict[str, Any]
) -> tuple[dict[str, str], dict[str, list[str]]]:
    """Check one result: every item answered, numbers as numbers, choices from the list. Returns
    the clean values and the errors per item (empty when valid)."""
    clean: dict[str, str] = {}
    errors: dict[str, list[str]] = {}
    for item in test.items:
        raw = str(values.get(item.code, "") or "").strip()
        if not raw:
            errors[item.code] = [str(NEED_VALUE)]
        elif item.kind == "number":
            try:
                number = Decimal(raw.replace(",", "."))
            except InvalidOperation:
                errors[item.code] = [str(NEED_NUMBER)]
                continue
            if not number.is_finite() or number < 0 or number > Decimal("100000"):
                errors[item.code] = [str(NEED_NUMBER)]
                continue
            clean[item.code] = format(number.normalize(), "f")
        elif raw not in item.choices:
            errors[item.code] = [str(NEED_CHOICE)]
        else:
            clean[item.code] = raw
    return clean, errors


def flag(item: Item, value: str) -> str | None:
    """`low`, `high` or `abnormal` against the reference; None when in range or not judged."""
    if item.kind == "number":
        try:
            number = Decimal(value)
        except InvalidOperation:
            return None
        if item.low is not None and number < item.low:
            return "low"
        if item.high is not None and number > item.high:
            return "high"
        return None
    if item.normal is not None and value != item.normal:
        return "abnormal"
    return None


def result_rows(test_code: str, values: dict[str, str], lang: str) -> list[dict[str, Any]]:
    """The result as rows for a screen or the patient: label, value, unit, range and flag."""
    test = BY_CODE.get(test_code)
    if test is None:
        return [
            {
                "code": k,
                "label": k,
                "kind": "choice",
                "value": v,
                "unit": "",
                "low": None,
                "high": None,
                "flag": None,
            }
            for k, v in values.items()
        ]
    return [
        {
            "code": i.code,
            "label": pick(i.label, lang),
            "kind": i.kind,
            "value": values.get(i.code, ""),
            "unit": i.unit,
            "low": i.low,
            "high": i.high,
            "flag": flag(i, values.get(i.code, "")) if values.get(i.code) else None,
        }
        for i in test.items
    ]
