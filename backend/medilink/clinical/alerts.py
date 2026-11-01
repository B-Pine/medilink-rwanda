"""Prescribing safety checks (contract sprint-06 §2.2 Alerts, FR-CLN-07, analysis 07 §2).

`check(patient, items)` returns warnings, never blocks: S7 stores the override reason with the
prescription item. Matching is case and accent insensitive.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from typing import Any

from django.utils import timezone

from medilink.masterdata.models import Drug
from medilink.patients.models import Allergy, Medication, Severity, Verification


def _norm(value: str) -> str:
    plain = unicodedata.normalize("NFKD", value or "")
    return " ".join("".join(c for c in plain if not unicodedata.combining(c)).lower().split())


@dataclass(frozen=True)
class Alert:
    drug_code: str
    kind: str  # allergy | duplicate | dose
    severity: str  # high | medium
    allergy_id: Any = None
    substance: str | None = None
    verification_status: str | None = None
    max_usual_quantity: int | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "drug_code": self.drug_code,
            "kind": self.kind,
            "severity": self.severity,
            "allergy_id": self.allergy_id,
            "substance": self.substance,
            "verification_status": self.verification_status,
            "max_usual_quantity": self.max_usual_quantity,
        }


def _matches(substance: str, drug: Drug) -> bool:
    substance = _norm(substance)
    if not substance:
        return False
    names = [n for n in (_norm(drug.generic_name), _norm(drug.drug_class)) if n]
    return any(substance == n or substance in n or n in substance for n in names)


def active_allergies(patient: Any) -> list[Allergy]:
    return list(
        Allergy.objects.filter(patient=patient, entered_in_error_at__isnull=True)
        .exclude(verification_status=Verification.REFUTED)
        .order_by("-severity", "substance_text")
    )


def active_medications(patient: Any) -> list[Medication]:
    today = timezone.localdate()
    return [
        m
        for m in Medication.objects.filter(patient=patient, entered_in_error_at__isnull=True)
        .exclude(verification_status=Verification.REFUTED)
        .order_by("drug_display")
        if m.stopped_on is None or m.stopped_on > today
    ]


def check(patient: Any, items: list[tuple[Drug, int | None]]) -> list[Alert]:
    allergies = [a for a in active_allergies(patient) if a.category != "food"]
    medications = active_medications(patient)
    alerts: list[Alert] = []
    seen: dict[str, str] = {}
    for drug, quantity in items:
        for allergy in allergies:
            if _matches(allergy.substance_text, drug):
                high = (
                    allergy.verification_status == Verification.VERIFIED
                    or allergy.severity == Severity.SEVERE
                )
                alerts.append(
                    Alert(
                        drug.code,
                        "allergy",
                        "high" if high else "medium",
                        allergy_id=allergy.pk,
                        substance=allergy.substance_text,
                        verification_status=allergy.verification_status,
                    )
                )
        name = _norm(drug.generic_name)
        duplicate = name in seen or any(name and name in _norm(m.drug_display) for m in medications)
        if duplicate:
            alerts.append(Alert(drug.code, "duplicate", "medium"))
        seen.setdefault(name, drug.code)
        if quantity is not None and drug.max_usual_quantity and quantity > drug.max_usual_quantity:
            alerts.append(
                Alert(drug.code, "dose", "medium", max_usual_quantity=drug.max_usual_quantity)
            )
    return alerts
