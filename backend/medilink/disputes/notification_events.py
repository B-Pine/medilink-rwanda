"""S10 part 2a notification events (contract sprint-10b §4), autodiscovered by S9.
No dispute text in any notice. Kinyarwanda drafts need native-speaker review (#11)."""

from __future__ import annotations

from datetime import timedelta

from medilink.notifications.registry import EventDefinition, Placeholder, Text

UPDATED = "disputes.updated"
OPENED = "disputes.opened"
COMMENT_REQUESTED = "disputes.comment_requested"
ESCALATED = "disputes.escalated"


def _texts(
    channels: tuple[str, ...], by_language: dict[str, tuple[str, str]]
) -> dict[tuple[str, str, str], Text]:
    return {
        (channel, language, "self"): Text(subject, body)
        for channel in channels
        for language, (subject, body) in by_language.items()
    }


T_UPDATED = {
    "rw": ("Ikirego cyahindutse", "$facility_name yasubije ku kirego. Fungura MediLink urebe."),
    "en": ("Dispute update", "$facility_name updated a dispute. Open MediLink to read it."),
    "fr": ("Litige mis à jour", "$facility_name a mis à jour un litige. Ouvrez MediLink."),
}
T_OPENED = {
    "rw": ("Ikirego gishya", "Umurwayi yatanze ikirego. Cyakire mbere y'igihe ntarengwa."),
    "en": ("New dispute", "A patient raised a dispute. Acknowledge it before the deadline."),
    "fr": ("Nouveau litige", "Un patient a ouvert un litige. Accusez réception avant l'échéance."),
}
T_COMMENT = {
    "rw": ("Basabye igitekerezo cyawe", "Basabye igitekerezo cyawe ku kirego."),
    "en": ("Your comment is requested", "You are asked to comment on a dispute."),
    "fr": ("Votre commentaire est demandé", "On vous demande un commentaire sur un litige."),
}
T_ESCALATED = {
    "rw": ("Ikirego cyazamuwe", "Ikirego cyo kuri $facility_name gikeneye icyemezo cya MediLink."),
    "en": ("Dispute escalated", "A dispute at $facility_name needs a MediLink decision."),
    "fr": ("Litige transmis", "Un litige à $facility_name attend une décision de MediLink."),
}

FACILITY = {"facility_name": Placeholder.FACILITY_NAME}

EVENTS: list[EventDefinition] = [
    EventDefinition(
        type=UPDATED,
        audience="patient",
        priority="important",
        channels=("in_app", "web_push", "email"),
        placeholders=FACILITY,
        data_keys=frozenset({"dispute_id", "event_id"}),
        action_path="/disputes/{dispute_id}",
        dedupe="{type}:{event_id}",
        templates=_texts(("in_app", "web_push", "email"), T_UPDATED),
    ),
    EventDefinition(
        type=OPENED,
        audience="staff",
        priority="important",
        channels=("in_app",),
        data_keys=frozenset({"dispute_id", "event_id"}),
        action_path="/disputes/{dispute_id}",
        dedupe="{type}:{event_id}",
        rate_limit=(100, timedelta(hours=1)),
        templates=_texts(("in_app",), T_OPENED),
    ),
    EventDefinition(
        type=COMMENT_REQUESTED,
        audience="staff",
        priority="important",
        channels=("in_app",),
        data_keys=frozenset({"dispute_id", "request_id"}),
        action_path="/disputes/{dispute_id}",
        dedupe="{type}:{request_id}",
        templates=_texts(("in_app",), T_COMMENT),
    ),
    EventDefinition(
        type=ESCALATED,
        audience="staff",
        priority="important",
        channels=("in_app", "email"),
        placeholders=FACILITY,
        data_keys=frozenset({"dispute_id", "event_id"}),
        action_path="/platform/disputes/{dispute_id}",
        dedupe="{type}:{event_id}",
        rate_limit=(200, timedelta(hours=1)),
        templates=_texts(("in_app", "email"), T_ESCALATED),
    ),
]
