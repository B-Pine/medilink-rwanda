"""Rules-based triage (contract public-pages-and-triage §2.2-§2.4, PT-B2..B4)."""

from __future__ import annotations

from typing import Any

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from medilink.triage import rules
from medilink.triage.models import AppendOnlyError, TriageLog
from medilink.triage.views import TriageThrottle

URL = "/api/v1/public/triage/"
RED = {"chest_pain", "shortness_of_breath", "bleeding"}


def run(*symptoms: str, duration: str = "days", age: str = "adult", pregnant: bool = False):
    return rules.triage(rules.Answers(frozenset(symptoms), duration, age, pregnant), RED)


# ---- rules (no database) --------------------------------------------------------------------


@pytest.mark.acceptance("PT-B2")
@pytest.mark.parametrize(
    ("answers", "rule", "urgency", "service", "level"),
    [
        ({"symptoms": ("cough", "chest_pain")}, "R1", "emergency", "emergency_care", "secondary"),
        ({"symptoms": ("vomiting",), "pregnant": True}, "R2", "today", "antenatal_care", "primary"),
        (
            {"symptoms": ("headache", "dizziness"), "pregnant": True},
            "R2",
            "today",
            "antenatal_care",
            "primary",
        ),
        (
            {"symptoms": ("diarrhoea",), "age": "infant"},
            "R3",
            "today",
            "paediatric_consultation",
            "primary",
        ),
        ({"symptoms": ("fever",)}, "R4", "today", "general_consultation", "primary"),
        (
            {"symptoms": ("fever",), "age": "child"},
            "R4",
            "today",
            "paediatric_consultation",
            "primary",
        ),
        (
            {"symptoms": ("diarrhoea", "vomiting")},
            "R5",
            "today",
            "general_consultation",
            "primary",
        ),
        (
            {"symptoms": ("cough",), "duration": "week"},
            "R6",
            "today",
            "general_consultation",
            "primary",
        ),
        ({"symptoms": ("toothache",)}, "R7", "soon", "dental_care", "primary"),
        ({"symptoms": ("eye_pain",)}, "R8", "soon", "eye_care", "primary"),
        ({"symptoms": ("rash",)}, "R9", "soon", "dermatology", "primary"),
        (
            {"symptoms": ("rash",), "age": "child"},
            "R9",
            "soon",
            "paediatric_consultation",
            "primary",
        ),
        ({"symptoms": ("painful_urination",)}, "R10", "soon", "general_consultation", "primary"),
        (
            {"symptoms": ("sore_throat",), "duration": "today"},
            "R11",
            "self_care",
            "general_consultation",
            "primary",
        ),
        ({"symptoms": ("headache",)}, "R12", "soon", "general_consultation", "primary"),
        (
            {"symptoms": ("headache",), "age": "child"},
            "R12",
            "soon",
            "paediatric_consultation",
            "primary",
        ),
    ],
)
def test_each_rule_with_its_example(
    answers: dict[str, Any], rule: str, urgency: str, service: str, level: str
) -> None:
    symptoms = answers.pop("symptoms")
    result = run(*symptoms, **answers)
    assert (result.rule, result.urgency, result.service_code, result.level_of_care) == (
        rule,
        urgency,
        service,
        level,
    )


def test_red_flags_win_over_everything_and_are_named() -> None:
    result = run("fever", "bleeding", "toothache", pregnant=True)
    assert result.urgency == "emergency" and result.red_flags == ("bleeding",)


def test_pregnancy_is_only_read_for_teens_and_adults() -> None:
    assert run("vomiting", age="older", pregnant=True).rule != "R2"
    assert run("vomiting", age="teen", pregnant=True).rule == "R2"


def test_safety_layer_never_sends_the_youngest_or_oldest_home() -> None:
    older = run("sore_throat", duration="today", age="older")
    assert older.urgency == "soon"
    # R11 is adults only, so an infant falls to R12; a week-long illness is seen today
    infant = run("sore_throat", duration="week", age="infant")
    assert infant.urgency == "today" and "safety_duration" in infant.reasons


def test_self_care_needs_a_single_mild_symptom_for_under_a_week() -> None:
    assert run("sore_throat", duration="week").urgency == "soon"
    assert run("sore_throat", "back_pain").urgency == "soon"


# ---- API --------------------------------------------------------------------------------------


@pytest.mark.django_db
@pytest.mark.acceptance("PT-B4")
def test_api_answers_and_logs_without_personal_data() -> None:
    api = APIClient()
    response = api.post(
        URL,
        {"symptoms": ["fever", "cough"], "duration": "days", "age_group": "adult"},
        format="json",
    )
    assert response.status_code == 200, response.content
    assert response["Cache-Control"] == "no-store"
    assert response.json() == {
        "urgency": "today",
        "service_code": "general_consultation",
        "level_of_care": "primary",
        "red_flags": [],
        "reasons": ["fever"],
        "rules_version": rules.RULES_VERSION,
        "signed_off": False,
    }
    [log] = TriageLog.objects.all()
    assert log.symptoms == ["cough", "fever"] and log.rule == "R4"
    assert {f.name for f in TriageLog._meta.get_fields()} == {
        "id",
        "symptoms",
        "duration",
        "age_group",
        "pregnant",
        "urgency",
        "service_code",
        "level_of_care",
        "rule",
        "rules_version",
        "created_at",
    }
    log.urgency = "soon"
    with pytest.raises(AppendOnlyError):
        log.save()


@pytest.mark.django_db
def test_api_red_flag_from_master_data() -> None:
    body = (
        APIClient()
        .post(
            URL,
            {"symptoms": ["chest_pain"], "duration": "today", "age_group": "adult"},
            format="json",
        )
        .json()
    )
    assert body["urgency"] == "emergency" and body["red_flags"] == ["chest_pain"]


@pytest.mark.django_db
@pytest.mark.acceptance("PT-B3")
@pytest.mark.parametrize(
    "body",
    [
        {"symptoms": ["not_a_symptom"], "duration": "days", "age_group": "adult"},
        {"symptoms": [], "duration": "days", "age_group": "adult"},
        {"symptoms": ["fever"] * 9, "duration": "days", "age_group": "adult"},
        {"symptoms": ["fever"], "duration": "forever", "age_group": "adult"},
        {"symptoms": ["fever"], "duration": "days"},
        {"symptoms": ["fever"], "duration": "days", "age_group": "adult", "name": "Uwase"},
    ],
)
def test_api_rejects_bad_answers(body: dict[str, Any]) -> None:
    assert APIClient().post(URL, body, format="json").status_code == 400
    assert not TriageLog.objects.exists()


@pytest.mark.django_db
def test_api_is_throttled(monkeypatch: pytest.MonkeyPatch) -> None:
    cache.clear()
    monkeypatch.setattr(TriageThrottle, "get_rate", lambda self: "2/min")
    api = APIClient()
    body = {"symptoms": ["headache"], "duration": "days", "age_group": "adult"}
    codes = [api.post(URL, body, format="json").status_code for _ in range(3)]
    assert codes == [200, 200, 429]
