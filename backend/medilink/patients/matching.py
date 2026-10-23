"""Duplicate detection (contract §2.2). Thresholds are constants tuned in the pilot."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from django.contrib.postgres.search import TrigramSimilarity
from django.db.models import Q

from medilink.patients.identity import (
    find_by_identifier,
    find_by_medilink_number,
    known_elsewhere,
)
from medilink.patients.models import FacilityPatient, Patient
from medilink.patients.normalize import normalize_name

CANDIDATE_SIMILARITY = 0.45
STRONG_NAME = 0.6
MAX_CANDIDATES = 50


@dataclass
class Match:
    level: str  # exact_identifier | strong | possible
    patient: Patient
    matched_on: str = ""


@dataclass
class MatchResult:
    here: list[tuple[Match, FacilityPatient]] = field(default_factory=list)
    external: Match | None = None
    other_facility_possible_count: int = 0


def _level(
    name_score: float, candidate: Patient, sex: str | None, dob: date | None, phone: str | None
) -> str | None:
    same_dob = bool(dob and candidate.date_of_birth == dob)
    same_phone = bool(phone and candidate.phone_e164 == phone)
    level = None
    if (name_score >= STRONG_NAME and (same_dob or same_phone)) or (same_phone and same_dob):
        level = "strong"
    elif name_score >= CANDIDATE_SIMILARITY and (
        same_phone
        or (dob and candidate.date_of_birth and abs(candidate.date_of_birth.year - dob.year) <= 2)
    ):
        level = "possible"
    if level == "strong" and sex and candidate.sex and candidate.sex != sex:
        level = "possible"
    return level


def find_matches(
    *,
    facility_id: Any,
    full_name: str = "",
    sex: str | None = None,
    date_of_birth: date | None = None,
    phone_e164: str | None = None,
    identifier: dict[str, str] | None = None,
    medilink_number: str | None = None,
) -> MatchResult:
    result = MatchResult()
    exact: list[tuple[Patient, str]] = []
    if identifier and identifier.get("value"):
        patient = find_by_identifier(
            identifier["kind"], identifier.get("issuing_country", ""), identifier["value"]
        )
        if patient:
            exact.append((patient, identifier["kind"]))
    if medilink_number:
        patient = find_by_medilink_number(medilink_number)
        if patient:
            exact.append((patient, "medilink_number"))

    def here_record(patient: Patient) -> FacilityPatient | None:
        return FacilityPatient.objects.filter(
            facility_id=facility_id, patient=patient, is_active=True
        ).first()

    seen: set[Any] = set()
    for patient, matched_on in exact:
        if patient.pk in seen:
            continue
        seen.add(patient.pk)
        record = here_record(patient)
        if record:
            result.here.append((Match("exact_identifier", patient, matched_on), record))
        elif result.external is None:
            result.external = Match("exact_identifier", patient, matched_on)

    name = normalize_name(full_name)
    if name or phone_e164:
        candidates = Patient.objects.filter(merged_into__isnull=True)
        condition = Q()
        if name:
            candidates = candidates.annotate(score=TrigramSimilarity("name_normalized", name))
            condition |= Q(score__gte=CANDIDATE_SIMILARITY)
        if phone_e164:
            condition |= Q(phone_e164=phone_e164)
        candidates = candidates.filter(condition).exclude(pk__in=seen)
        if name:
            candidates = candidates.order_by("-score")  # type: ignore[misc]
        for candidate in candidates[:MAX_CANDIDATES]:
            score = float(getattr(candidate, "score", 0.0) or 0.0)
            level = _level(score, candidate, sex, date_of_birth, phone_e164)
            if level is None:
                continue
            record = here_record(candidate)
            if record:
                result.here.append((Match(level, candidate, "name"), record))
            elif known_elsewhere(candidate.pk, facility_id):
                result.other_facility_possible_count += 1
    order = {"exact_identifier": 0, "strong": 1, "possible": 2}
    result.here.sort(key=lambda pair: order[pair[0].level])
    return result
