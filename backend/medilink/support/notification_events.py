"""S10 part 1 notification events (contract sprint-10 §3.1), autodiscovered by S9.

No placeholders: request subjects and messages are free text from users and never go into a
notification. Kinyarwanda texts need native-speaker review before go-live.
"""

from __future__ import annotations

from datetime import timedelta

from medilink.notifications.registry import EventDefinition, Text

CREATED = "support.request.created"
FOLLOWED_UP = "support.request.followed_up"
ANSWERED = "support.request.answered"
CLOSED = "support.request.closed"


def _texts(
    channels: tuple[str, ...], by_language: dict[str, tuple[str, str]]
) -> dict[tuple[str, str, str], Text]:
    return {
        (channel, language, "self"): Text(subject, body)
        for channel in channels
        for language, (subject, body) in by_language.items()
    }


NEW_REQUEST = {
    "rw": ("Hari icyifuzo gishya cy'ubufasha", "Umuntu yohereje icyifuzo gishya cy'ubufasha."),
    "en": ("New support request", "Someone opened a new support request."),
    "fr": ("Nouvelle demande d'aide", "Une nouvelle demande d'aide a été ouverte."),
}
FOLLOW_UP = {
    "rw": ("Igisubizo gishya ku cyifuzo", "Uwasabye ubufasha yongeyeho ubutumwa."),
    "en": ("New message on a support request", "The requester added a message."),
    "fr": ("Nouveau message sur une demande d'aide", "Le demandeur a ajouté un message."),
}
ANSWER = {
    "rw": (
        "MediLink yagusubije",
        "Itsinda ry'ubufasha rya MediLink ryasubije icyifuzo cyawe. Fungura MediLink urebe "
        "igisubizo.",
    ),
    "en": (
        "MediLink support replied",
        "MediLink support replied to your request. Open MediLink to read the answer.",
    ),
    "fr": (
        "Le support MediLink a répondu",
        "Le support MediLink a répondu à votre demande. Ouvrez MediLink pour lire la réponse.",
    ),
}
CLOSE = {
    "rw": ("Icyifuzo cyawe cyafunzwe", "Icyifuzo cyawe cy'ubufasha cyafunzwe."),
    "en": ("Your support request was closed", "Your support request was closed."),
    "fr": ("Votre demande d'aide a été clôturée", "Votre demande d'aide a été clôturée."),
}

PLATFORM_PATH = "/platform/support/{request_id}"
REQUESTER_PATH = "/support/requests/{request_id}"

EVENTS: list[EventDefinition] = [
    EventDefinition(
        type=CREATED,
        audience="staff",
        priority="routine",
        channels=("in_app",),
        data_keys=frozenset({"request_id"}),
        action_path=PLATFORM_PATH,
        dedupe="{type}:{request_id}",
        rate_limit=(200, timedelta(hours=1)),
        templates=_texts(("in_app",), NEW_REQUEST),
    ),
    EventDefinition(
        type=FOLLOWED_UP,
        audience="staff",
        priority="routine",
        channels=("in_app",),
        data_keys=frozenset({"request_id", "message_id"}),
        action_path=PLATFORM_PATH,
        dedupe="{type}:{message_id}",
        rate_limit=(200, timedelta(hours=1)),
        templates=_texts(("in_app",), FOLLOW_UP),
    ),
    EventDefinition(
        type=ANSWERED,
        audience="account",
        priority="important",
        channels=("in_app", "web_push", "email"),
        data_keys=frozenset({"request_id", "message_id"}),
        action_path=REQUESTER_PATH,
        dedupe="{type}:{message_id}",
        templates=_texts(("in_app", "web_push", "email"), ANSWER),
    ),
    EventDefinition(
        type=CLOSED,
        audience="account",
        priority="routine",
        channels=("in_app",),
        data_keys=frozenset({"request_id"}),
        action_path=REQUESTER_PATH,
        dedupe="{type}:{request_id}",
        templates=_texts(("in_app",), CLOSE),
    ),
]
