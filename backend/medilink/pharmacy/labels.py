"""Dosing labels (contract sprint-07 §2.2, FR-PHA-05): one per dispensed line, in the facility's
label language (Kinyarwanda by default) or the requested one."""

from __future__ import annotations

from typing import Any

from medilink.pharmacy.models import TIMES_OF_DAY, DispenseOutcome, Prescription
from medilink.pharmacy.services import instructions

FREQUENCY: dict[str, dict[str, str]] = {
    "rw": {
        "once": "Rimwe gusa",
        "od": "Rimwe ku munsi",
        "bd": "Kabiri ku munsi",
        "tds": "Gatatu ku munsi",
        "qds": "Kane ku munsi",
        "nocte": "Nijoro mbere yo kuryama",
        "prn": "Igihe ubikeneye",
    },
    "en": {
        "once": "Once only",
        "od": "Once a day",
        "bd": "Twice a day",
        "tds": "Three times a day",
        "qds": "Four times a day",
        "nocte": "At night before sleep",
        "prn": "When needed",
    },
    "fr": {
        "once": "Une seule fois",
        "od": "Une fois par jour",
        "bd": "Deux fois par jour",
        "tds": "Trois fois par jour",
        "qds": "Quatre fois par jour",
        "nocte": "Le soir au coucher",
        "prn": "Si besoin",
    },
}
ROUTE: dict[str, dict[str, str]] = {
    "rw": {
        "oral": "Kunywa",
        "topical": "Gusiga ku ruhu",
        "inhaled": "Guhumeka",
        "rectal": "Mu kibuno",
        "vaginal": "Mu gitsina",
        "eye": "Mu jisho",
        "ear": "Mu gutwi",
        "nasal": "Mu mazuru",
        "injection": "Urushinge",
    },
    "en": {
        "oral": "By mouth",
        "topical": "On the skin",
        "inhaled": "Inhaled",
        "rectal": "Rectal",
        "vaginal": "Vaginal",
        "eye": "In the eye",
        "ear": "In the ear",
        "nasal": "In the nose",
        "injection": "Injection",
    },
    "fr": {
        "oral": "Par la bouche",
        "topical": "Sur la peau",
        "inhaled": "Inhalé",
        "rectal": "Voie rectale",
        "vaginal": "Voie vaginale",
        "eye": "Dans l'œil",
        "ear": "Dans l'oreille",
        "nasal": "Dans le nez",
        "injection": "Injection",
    },
}
DAYS: dict[str, str] = {"rw": "Iminsi {n}", "en": "{n} days", "fr": "{n} jours"}
MEAL: dict[str, dict[str, str]] = {
    "rw": {
        "before_food": "Mbere yo kurya",
        "with_food": "Mu gihe urya",
        "after_food": "Nyuma yo kurya",
    },
    "en": {"before_food": "Before food", "with_food": "With food", "after_food": "After food"},
    "fr": {
        "before_food": "Avant le repas",
        "with_food": "Pendant le repas",
        "after_food": "Après le repas",
    },
}


def labels(
    prescription: Prescription, *, language: str, facility_name: str
) -> list[dict[str, Any]]:
    language = language if language in FREQUENCY else "rw"
    patient = prescription.patient
    name = str(patient.preferred_name or patient.full_name)
    out: list[dict[str, Any]] = []
    for record in prescription.dispense_records.prefetch_related("lines__prescription_item").all():
        for line in record.lines.all():
            if line.outcome == DispenseOutcome.NOT_AVAILABLE:
                continue
            item = line.prescription_item
            out.append(
                {
                    "line_id": line.pk,
                    "language": language,
                    "drug": line.substitute_display or item.drug_display,
                    "quantity": line.quantity,
                    "dose": item.dose,
                    "frequency": FREQUENCY[language].get(item.frequency_code, item.frequency_code),
                    "frequency_code": item.frequency_code,
                    "times": TIMES_OF_DAY.get(item.frequency_code, []),
                    "meal_timing": item.meal_timing,
                    "meal": MEAL[language].get(item.meal_timing, ""),
                    "route": ROUTE[language].get(item.route, item.route),
                    "duration": DAYS[language].format(n=item.duration_days)
                    if item.duration_days
                    else "",
                    "instructions": instructions(item),
                    "patient_name": name,
                    "dispensed_on": record.signed_at.date(),
                    "facility_name": facility_name,
                    "prescription_number": prescription.number,
                }
            )
    return out
