"""Triage rules, version 2026.11-p1 (contract public-pages-and-triage §2.3).

Care navigation, not diagnosis (analysis 11 §1): the answer is an urgency, a service and a level of
care. Red flags run first and nothing overrides them; then the first matching rule decides; then the
safety layer may only raise the urgency, never lower it (analysis 11 §4.4).

Provisional: written from analysis 11 and the seeded symptom list, not yet signed off by a clinician
(#93). `SIGNED_OFF` stays False until the clinical lead approves this version.
"""

from __future__ import annotations

from collections.abc import Callable, Collection
from dataclasses import dataclass, field

RULES_VERSION = "2026.11-p1"
SIGNED_OFF = False

DURATIONS = ("today", "days", "week")
AGE_GROUPS = ("infant", "child", "teen", "adult", "older")
URGENCY_ORDER = ("self_care", "soon", "today", "emergency")


@dataclass(frozen=True)
class Answers:
    symptoms: frozenset[str]
    duration: str
    age_group: str
    pregnant: bool = False

    @property
    def young(self) -> bool:
        return self.age_group in ("infant", "child")

    @property
    def can_be_pregnant(self) -> bool:
        return self.pregnant and self.age_group in ("teen", "adult")


@dataclass(frozen=True)
class Result:
    urgency: str
    service_code: str
    level_of_care: str
    rule: str
    reasons: tuple[str, ...]
    red_flags: tuple[str, ...] = field(default_factory=tuple)


def _general(a: Answers) -> str:
    return "paediatric_consultation" if a.young else "general_consultation"


@dataclass(frozen=True)
class Rule:
    key: str
    when: Callable[[Answers], bool]
    urgency: str
    service: Callable[[Answers], str]
    reason: str
    level: str = "primary"


RULES: tuple[Rule, ...] = (
    Rule(
        "R2",
        lambda a: (
            a.can_be_pregnant
            and (
                "abdominal_pain" in a.symptoms
                or "vomiting" in a.symptoms
                or {"headache", "dizziness"} <= a.symptoms
            )
        ),
        "today",
        lambda a: "antenatal_care",
        "pregnancy_warning",
    ),
    Rule(
        "R3",
        lambda a: a.age_group == "infant" and bool({"fever", "diarrhoea", "vomiting"} & a.symptoms),
        "today",
        lambda a: "paediatric_consultation",
        "infant_illness",
    ),
    Rule("R4", lambda a: "fever" in a.symptoms, "today", _general, "fever"),
    Rule(
        "R5",
        lambda a: {"diarrhoea", "vomiting"} <= a.symptoms,
        "today",
        _general,
        "fluid_loss",
    ),
    Rule(
        "R6",
        lambda a: "cough" in a.symptoms and a.duration == "week",
        "today",
        lambda a: "general_consultation",
        "long_cough",
    ),
    Rule("R7", lambda a: "toothache" in a.symptoms, "soon", lambda a: "dental_care", "teeth"),
    Rule("R8", lambda a: "eye_pain" in a.symptoms, "soon", lambda a: "eye_care", "eyes"),
    Rule(
        "R9",
        lambda a: "rash" in a.symptoms,
        "soon",
        lambda a: "paediatric_consultation" if a.young else "dermatology",
        "skin",
    ),
    Rule(
        "R10",
        lambda a: "painful_urination" in a.symptoms,
        "soon",
        lambda a: "general_consultation",
        "urine",
    ),
    Rule(
        "R11",
        lambda a: (
            a.age_group == "adult"
            and a.duration != "week"
            and (a.symptoms == {"sore_throat"} or a.symptoms == {"back_pain"})
        ),
        "self_care",
        lambda a: "general_consultation",
        "self_care",
    ),
)

FALLBACK = Rule("R12", lambda a: True, "soon", _general, "see_clinician")


def _raise(urgency: str, at_least: str) -> str:
    return max(urgency, at_least, key=URGENCY_ORDER.index)


def triage(answers: Answers, red_flag_codes: Collection[str]) -> Result:
    """Apply R1 (red flags), then R2-R12 in order, then the safety layer."""
    flags = tuple(sorted(answers.symptoms & set(red_flag_codes)))
    if flags:
        return Result("emergency", "emergency_care", "secondary", "R1", ("red_flag",), flags)

    rule = next((r for r in RULES if r.when(answers)), FALLBACK)
    urgency = rule.urgency
    reasons = [rule.reason]

    # Safety layer: the youngest and the oldest never get "care at home"; an infant ill for a
    # week or more is seen today.
    if answers.age_group in ("infant", "older") and urgency == "self_care":
        urgency = _raise(urgency, "soon")
        reasons.append("safety_age")
    if answers.age_group == "infant" and answers.duration == "week":
        if urgency != _raise(urgency, "today"):
            reasons.append("safety_duration")
        urgency = _raise(urgency, "today")

    return Result(urgency, rule.service(answers), rule.level, rule.key, tuple(reasons))
