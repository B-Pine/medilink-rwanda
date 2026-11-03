"""AI symptom assistant (issue #159): matcher, conversation turns and the endpoint.

The model is replaced by a fake, so these tests need no key and no network.
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient

from medilink.triage import assistant, llm, matcher
from medilink.triage.models import AppendOnlyError, AssistantLog

URL = "/api/v1/public/assistant/"
ON = {"ASSISTANT_ENABLED": True, "NVIDIA_API_KEY": "test-key"}


@pytest.fixture(autouse=True)
def _clear_throttle() -> None:
    cache.clear()


def tiny() -> matcher.Matcher:
    """Three conditions over five symptoms, enough to check the arithmetic."""
    symptoms = ["fever", "headache", "cough", "toothache", "sharp chest pain"]
    rows = (
        [("flu", frozenset({0, 1, 2}))] * 6
        + [("migraine", frozenset({1}))] * 4
        + [("dental caries", frozenset({3}))] * 5
    )
    return matcher.Matcher(matcher.train(rows, symptoms))


class FakeModel:
    """Answers the extraction, question and reply prompts like the real model would."""

    def __init__(
        self, present: list[str], *, emergency: bool = False, absent: list[str] | None = None
    ):
        self.present = present
        self.absent = absent or []
        self.emergency = emergency
        self.calls: list[str] = []

    def __call__(self, messages: list[dict[str, str]], **_: Any) -> str:
        system = messages[0]["content"]
        if system.startswith("You turn"):
            self.calls.append("extract")
            return json.dumps(
                {"present": self.present, "absent": self.absent, "emergency": self.emergency}
            )
        if system.startswith("Ask ONE"):
            self.calls.append("question")
            return f"Do you also have {messages[1]['content']}?"
        self.calls.append("answer")
        return json.dumps(
            {
                "reply": "You may have the flu. It is best to see a doctor.",
                "service_code": "general_consultation",
                "urgency": "today",
            }
        )


# ---- matcher (no database) ------------------------------------------------------------------


def test_matcher_ranks_the_condition_whose_symptoms_match() -> None:
    model = tiny()
    ranked = model.rank(["fever", "cough", "headache"])
    assert ranked[0].condition == "flu"
    assert abs(sum(m.probability for m in model.rank(["fever"], top=3)) - 1) < 1e-9


def test_matcher_ignores_unknown_names_and_returns_nothing_without_symptoms() -> None:
    model = tiny()
    assert model.known(["Fever ", "unknown", "fever"]) == ["fever"]
    assert model.rank(["nothing known"]) == []


def test_next_question_never_asks_a_red_flag_or_a_known_symptom() -> None:
    question = tiny().next_question(["headache"])
    assert question not in {"headache", "sharp chest pain", None}


def test_the_shipped_model_loads_and_knows_its_red_flags() -> None:
    model = matcher.load()
    assert len(model.conditions) > 700
    assert set(model.symptoms) >= matcher.RED_FLAGS


# ---- conversation turns ---------------------------------------------------------------------


def _turn(monkeypatch: pytest.MonkeyPatch, fake: FakeModel, state: Any = None) -> assistant.Turn:
    monkeypatch.setattr(matcher, "load", tiny)
    monkeypatch.setattr(llm, "chat", fake)
    return assistant.respond("I feel ill", "en", state or {})


@override_settings(**ON)
def test_a_red_flag_ends_the_chat_with_emergency_and_no_reply(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeModel(["fever", "sharp chest pain"])
    turn = _turn(monkeypatch, fake)
    assert turn.kind == "emergency"
    assert turn.red_flags == ("sharp chest pain",)
    assert turn.service_code == "emergency_care"
    assert fake.calls == ["extract"]  # no condition, no generated text


@override_settings(**ON)
def test_the_model_flagging_an_emergency_is_enough(monkeypatch: pytest.MonkeyPatch) -> None:
    turn = _turn(monkeypatch, FakeModel([], emergency=True))
    assert turn.kind == "emergency"


@override_settings(**ON)
def test_too_few_symptoms_asks_a_follow_up_question(monkeypatch: pytest.MonkeyPatch) -> None:
    turn = _turn(monkeypatch, FakeModel(["fever"]))
    assert turn.kind == "question"
    assert turn.state.pending == turn.state.asked[0]
    assert turn.reply and turn.reply.startswith("Do you also have")


@override_settings(**ON)
def test_enough_confident_symptoms_name_a_possible_cause(monkeypatch: pytest.MonkeyPatch) -> None:
    turn = _turn(monkeypatch, FakeModel(["fever", "headache", "cough"]))
    assert turn.kind == "answer"
    assert turn.named and turn.condition == "flu"
    assert turn.service_code == "general_consultation"
    assert turn.urgency == "today"


@override_settings(**ON)
def test_no_recognised_symptom_asks_the_person_to_say_more(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert _turn(monkeypatch, FakeModel(["not a symptom"])).kind == "clarify"


@override_settings(**ON)
def test_a_no_removes_the_symptom_and_state_from_the_client_is_cleaned(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeModel([], absent=["cough"])
    state = {"present": ["fever", "cough", "made up"], "asked": ["cough"], "pending": "cough"}
    turn = _turn(monkeypatch, fake, state)
    assert "cough" not in turn.state.present and "cough" in turn.state.absent
    assert "made up" not in turn.state.present


# ---- endpoint -------------------------------------------------------------------------------


@pytest.mark.django_db
def test_switched_off_the_endpoint_says_unavailable() -> None:
    response = APIClient().post(URL, {"message": "fever", "language": "en"}, format="json")
    assert response.status_code == 503
    assert response.json()["code"] == "assistant_unavailable"


@pytest.mark.django_db
@override_settings(**ON)
def test_a_model_failure_is_unavailable_not_an_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def broken(*_: Any, **__: Any) -> str:
        raise llm.LLMError("down")

    monkeypatch.setattr(llm, "chat", broken)
    response = APIClient().post(URL, {"message": "fever", "language": "en"}, format="json")
    assert response.status_code == 503


@pytest.mark.django_db
@override_settings(**ON)
def test_an_answer_is_returned_and_logged_without_the_persons_words(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(matcher, "load", tiny)
    monkeypatch.setattr(llm, "chat", FakeModel(["fever", "headache", "cough"]))
    response = APIClient().post(
        URL, {"message": "My name is Jean, fever and cough", "language": "en"}, format="json"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["kind"] == "answer" and body["named"] is True and body["test_phase"] is True
    assert response["Cache-Control"] == "no-store"
    log = AssistantLog.objects.get()
    assert log.condition == "flu" and log.outcome == "answer"
    assert "Jean" not in json.dumps([log.present, log.absent, log.condition])
    with pytest.raises(AppendOnlyError):
        log.save()


@pytest.mark.django_db
@override_settings(**ON)
def test_the_request_is_validated() -> None:
    client = APIClient()
    too_long = {"message": "x" * (assistant.MAX_MESSAGE + 1), "language": "en"}
    assert client.post(URL, too_long, format="json").status_code == 400
    assert (
        client.post(URL, {"message": "fever", "language": "de"}, format="json").status_code == 400
    )


# ---- NVIDIA client (fake HTTP) ---------------------------------------------------------------


class FakeResponse:
    def __init__(self, payload: Any) -> None:
        self.payload = json.dumps(payload).encode()

    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *_: Any) -> None:
        return None

    def read(self, *_: Any) -> bytes:
        return self.payload


def _http(monkeypatch: pytest.MonkeyPatch, payload: Any, seen: list[Any]) -> None:
    def urlopen(request: Any, timeout: float) -> FakeResponse:
        seen.append((request, timeout))
        return FakeResponse(payload)

    monkeypatch.setattr(llm.urllib.request, "urlopen", urlopen)


@override_settings(**ON, NVIDIA_MODEL="meta/llama-3.1-70b-instruct")
def test_the_client_sends_the_key_and_model_and_reads_the_reply(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[Any] = []
    reply = {"choices": [{"message": {"content": ' noise {"a": 1} '}}]}
    _http(monkeypatch, reply, seen)
    assert llm.chat_json([{"role": "user", "content": "hi"}]) == {"a": 1}
    request, _ = seen[0]
    assert request.full_url.endswith("/chat/completions")
    assert request.get_header("Authorization") == "Bearer test-key"
    body = json.loads(request.data)
    assert body["model"] == "meta/llama-3.1-70b-instruct"
    assert body["response_format"] == {"type": "json_object"}


@override_settings(**ON)
@pytest.mark.parametrize(
    "payload",
    [
        {"choices": []},
        {"choices": [{"message": {"content": "no json"}}]},
        {"choices": [{"message": {"content": "[1]"}}]},
    ],
)
def test_the_client_turns_bad_answers_into_errors(
    monkeypatch: pytest.MonkeyPatch, payload: Any
) -> None:
    _http(monkeypatch, payload, [])
    with pytest.raises(llm.LLMError):
        llm.chat_json([{"role": "user", "content": "hi"}])


@override_settings(**ON)
def test_a_network_failure_is_an_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail(*_: Any, **__: Any) -> None:
        raise llm.urllib.error.URLError("down")

    monkeypatch.setattr(llm.urllib.request, "urlopen", fail)
    with pytest.raises(llm.LLMError):
        llm.chat([{"role": "user", "content": "hi"}])


def test_switched_off_the_client_never_calls_out() -> None:
    with pytest.raises(llm.LLMError):
        llm.chat([{"role": "user", "content": "hi"}])


# ---- training -------------------------------------------------------------------------------


def test_the_command_trains_from_a_csv_and_reports_accuracy(
    tmp_path: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    from django.core.management import call_command

    csv_path = tmp_path / "data.csv"
    lines = ["diseases,fever,cough,toothache"]
    lines += ["flu,1,1,0"] * 30 + ["dental caries,0,0,1"] * 30
    csv_path.write_text("\n".join(lines), encoding="utf-8")
    out = tmp_path / "model.json.gz"
    monkeypatch.setattr(matcher, "MODEL_PATH", out)
    monkeypatch.setattr(matcher.save, "__defaults__", (out,))
    from io import StringIO

    printed = StringIO()
    call_command("train_symptom_matcher", str(csv_path), stdout=printed)
    assert "top-1 100.0%" in printed.getvalue()
    model = matcher.load.__wrapped__(out)
    assert model.rank(["toothache"])[0].condition == "dental caries"


def test_the_command_rejects_a_missing_file(tmp_path: Any) -> None:
    from django.core.management import CommandError, call_command

    with pytest.raises(CommandError):
        call_command("train_symptom_matcher", str(tmp_path / "missing.csv"))
