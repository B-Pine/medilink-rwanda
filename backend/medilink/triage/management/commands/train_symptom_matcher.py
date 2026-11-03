"""Train the symptom matcher from the Diseases and Symptoms CSV (issue #159).

    python manage.py train_symptom_matcher <csv>

where <csv> is ../datasets/Final_Augmented_dataset_Diseases_and_Symptoms.csv from the backend.

Prints top-1 and top-3 accuracy on a held-out 10 %, then writes `triage/data/matcher.json.gz`
(counts only, trained on every row). The CSV itself is never committed (.gitignore `datasets/`).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser

from medilink.triage import matcher


class Command(BaseCommand):
    help = "Train the symptom matcher (naive Bayes) from the Diseases and Symptoms CSV."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("csv", type=Path, help="Path to the dataset CSV.")
        parser.add_argument(
            "--skip-eval", action="store_true", help="Do not measure held-out accuracy."
        )

    def handle(self, *args: Any, **options: Any) -> None:
        path: Path = options["csv"]
        if not path.is_file():
            raise CommandError(f"No such file: {path}")
        symptoms, rows = matcher.read_dataset(path)
        conditions = len({condition for condition, _ in rows})
        self.stdout.write(f"{len(rows)} rows, {conditions} conditions, {len(symptoms)} symptoms.")
        if not options["skip_eval"]:
            score = matcher.evaluate(rows, symptoms)
            self.stdout.write(
                f"Held-out ({int(score['tested'])} rows): top-1 {score['top1']:.1%}, "
                f"top-3 {score['top3']:.1%}."
            )
        matcher.save(matcher.train(rows, symptoms))
        self.stdout.write(f"Model {matcher.MODEL_VERSION} written to {matcher.MODEL_PATH}.")
