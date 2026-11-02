"""S6b notification events (contract sprint-06 §5), autodiscovered by S9. Counts only."""

from __future__ import annotations

from datetime import timedelta

from medilink.notifications.registry import EventDefinition, Placeholder, Text

BREAK_GLASS_REVIEW_DUE = "authz.break_glass.review_due"

REVIEW_DUE = {
    "rw": (
        "Hari ibisabwa gusuzumwa",
        "Hari $count byo kwinjira byihutirwa bitegereje gusuzumwa n'undi muyobozi.",
    ),
    "en": (
        "Break-glass sessions to review",
        "$count emergency access sessions are waiting for review by another super admin.",
    ),
    "fr": (
        "Accès d'urgence à examiner",
        "$count accès d'urgence attendent l'examen d'un autre super administrateur.",
    ),
}

EVENTS: list[EventDefinition] = [
    EventDefinition(
        type=BREAK_GLASS_REVIEW_DUE,
        audience="staff",
        priority="important",
        channels=("in_app", "email"),
        placeholders={"count": Placeholder.COUNT},
        action_path="/platform/break-glass",
        dedupe="{type}",
        rate_limit=(5, timedelta(days=1)),
        templates={
            (channel, language, "self"): Text(subject, body)
            for channel in ("in_app", "email")
            for language, (subject, body) in REVIEW_DUE.items()
        },
    ),
]
