"""Symptom → likely-condition matcher (AI assistant, test phase, issue #159).

A Bernoulli naive Bayes model over the 382 yes/no symptoms of the Diseases and Symptoms dataset
(773 conditions). It runs locally, in plain Python, so ranking never sends data anywhere. The model
file holds only counts per condition and symptom: no rows of the dataset and no patient data.

Not a diagnosis. The assistant words the top match as "you may have…" and always sends the person
to a clinician (decision 2026-11-03).
"""

from __future__ import annotations

import csv
import gzip
import json
import math
import random
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

MODEL_PATH = Path(__file__).with_name("data") / "matcher.json.gz"
MODEL_VERSION = "nb-2026.11-1"
# Laplace smoothing for the symptom likelihoods
ALPHA = 1.0

# Dataset symptoms that always mean "go now": the assistant answers 912 and the nearest hospital,
# whatever the model says. Mirrors the red-flag rule R1 (triage/rules.py).
RED_FLAGS = frozenset(
    {
        "shortness of breath",
        "difficulty breathing",
        "sharp chest pain",
        "chest tightness",
        "burning chest pain",
        "hurts to breath",
        "fainting",
        "seizures",
        "vomiting blood",
        "spotting or bleeding during pregnancy",
    }
)


@dataclass(frozen=True)
class Match:
    condition: str
    probability: float


# Held-out accuracy (2026-11-03) is 37 % top-1 with 2 symptoms, 58 % with 3 and 84 % with all of a
# row's symptoms: the assistant asks follow-up questions before it names anything, and names a
# condition only above both thresholds. Below them it says a clinician needs to examine.
MIN_SYMPTOMS_TO_NAME = 3
MIN_PROBABILITY_TO_NAME = 0.5
# How many follow-up questions the assistant asks at most before answering anyway
MAX_QUESTIONS = 4


class Matcher:
    """Scores conditions from the symptoms present; absent symptoms count as "no"."""

    def __init__(self, data: dict[str, object]) -> None:
        self.version = str(data["version"])
        self.symptoms: list[str] = list(data["symptoms"])  # type: ignore[call-overload]
        self.conditions: list[str] = list(data["conditions"])  # type: ignore[call-overload]
        totals: list[int] = list(data["totals"])  # type: ignore[call-overload]
        counts: list[dict[str, int]] = list(data["counts"])  # type: ignore[call-overload]
        self.index = {name: i for i, name in enumerate(self.symptoms)}
        n = sum(totals)
        k = len(self.symptoms)
        # log P(c) + sum_j log(1 - p_jc): the score with every symptom absent
        self._base: list[float] = []
        # log(p / (1 - p)) for each symptom seen with the condition: added when it is present
        self._gain: list[dict[int, float]] = []
        # the same gain for a symptom never seen with the condition (p = ALPHA / (t + 2 ALPHA))
        self._unseen: list[float] = []
        for total, seen in zip(totals, counts, strict=True):
            denominator = total + 2 * ALPHA
            p0 = ALPHA / denominator
            base = math.log(total / n) + (k - len(seen)) * math.log(1 - p0)
            gains: dict[int, float] = {}
            for key, count in seen.items():
                p = (count + ALPHA) / denominator
                gains[int(key)] = math.log(p) - math.log(1 - p)
                base += math.log(1 - p)
            self._base.append(base)
            self._gain.append(gains)
            self._unseen.append(math.log(p0) - math.log(1 - p0))

    def known(self, names: Iterable[str]) -> list[str]:
        """The names that are symptoms of the model, deduplicated, in model order."""
        wanted = {name.strip().lower() for name in names}
        return [name for name in self.symptoms if name in wanted]

    def rank(self, symptoms: Iterable[str], top: int = 3) -> list[Match]:
        """The `top` most likely conditions with probabilities that sum to 1 over all of them."""
        present = [self.index[s] for s in self.known(symptoms)]
        if not present:
            return []
        scores = []
        for c, base in enumerate(self._base):
            gains = self._gain[c]
            unseen = self._unseen[c]
            scores.append(base + sum(gains.get(i, unseen) for i in present))
        best = max(scores)
        weights = [math.exp(s - best) for s in scores]
        total = sum(weights)
        order = sorted(range(len(scores)), key=scores.__getitem__, reverse=True)[:top]
        return [Match(self.conditions[c], weights[c] / total) for c in order]

    def likelihood(self, condition: int, symptom: int) -> float:
        """P(symptom present | condition), smoothed."""
        gain = self._gain[condition].get(symptom, self._unseen[condition])
        return 1 / (1 + math.exp(-gain))

    def next_question(
        self, symptoms: Iterable[str], asked: Iterable[str] = (), candidates: int = 5
    ) -> str | None:
        """The yes/no symptom that best splits the likeliest conditions, or None if none helps.

        Weighted by how likely each candidate is, it picks the symptom whose "yes" chance is
        closest to one half, so either answer rules a part of the candidates out.
        """
        known = set(self.known(symptoms))
        skip = known | set(self.known(asked)) | RED_FLAGS
        ranked = self.rank(known, top=candidates)
        if not ranked:
            return None
        position = {name: i for i, name in enumerate(self.conditions)}
        weights = [(position[m.condition], m.probability) for m in ranked]
        total = sum(w for _, w in weights) or 1.0
        best: tuple[float, str] | None = None
        for name in self.symptoms:
            if name in skip:
                continue
            j = self.index[name]
            yes = sum(w * self.likelihood(c, j) for c, w in weights) / total
            split = min(yes, 1 - yes)
            if split > 0.1 and (best is None or split > best[0]):
                best = (split, name)
        return best[1] if best else None


@lru_cache(maxsize=1)
def load(path: Path = MODEL_PATH) -> Matcher:
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        return Matcher(json.load(handle))


def train(rows: Sequence[tuple[str, frozenset[int]]], symptoms: Sequence[str]) -> dict[str, object]:
    """Counts per condition: rows seen and, for each symptom, rows where it was present."""
    conditions = sorted({condition for condition, _ in rows})
    position = {name: i for i, name in enumerate(conditions)}
    totals = [0] * len(conditions)
    counts: list[dict[int, int]] = [{} for _ in conditions]
    for condition, present in rows:
        c = position[condition]
        totals[c] += 1
        seen = counts[c]
        for i in present:
            seen[i] = seen.get(i, 0) + 1
    return {
        "version": MODEL_VERSION,
        "symptoms": list(symptoms),
        "conditions": conditions,
        "totals": totals,
        "counts": [{str(i): n for i, n in seen.items()} for seen in counts],
    }


def read_dataset(path: Path) -> tuple[list[str], list[tuple[str, frozenset[int]]]]:
    """The dataset's symptom names and, per row, the condition and the symptoms marked 1."""
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.reader(handle)
        header = next(reader)
        symptoms = [name.strip().lower() for name in header[1:]]
        rows = [
            (row[0].strip().lower(), frozenset(i for i, v in enumerate(row[1:]) if v == "1"))
            for row in reader
            if row and row[0].strip()
        ]
    return symptoms, rows


def evaluate(
    rows: Sequence[tuple[str, frozenset[int]]], symptoms: Sequence[str], *, seed: int = 7
) -> dict[str, float]:
    """Top-1 and top-3 accuracy on a held-out 10 % of the rows (fixed seed)."""
    shuffled = list(rows)
    random.Random(seed).shuffle(shuffled)  # noqa: S311 (a reproducible split, not security)
    cut = len(shuffled) // 10
    test, train_rows = shuffled[:cut], shuffled[cut:]
    model = Matcher(train(train_rows, symptoms))
    sample = test[:5000]
    top1 = top3 = 0
    for condition, present in sample:
        names = [symptoms[i] for i in present]
        ranked = [m.condition for m in model.rank(names, top=3)]
        top1 += bool(ranked) and ranked[0] == condition
        top3 += condition in ranked
    return {"top1": top1 / len(sample), "top3": top3 / len(sample), "tested": float(len(sample))}


def save(model: dict[str, object], path: Path = MODEL_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt", encoding="utf-8") as handle:
        json.dump(model, handle, separators=(",", ":"))
