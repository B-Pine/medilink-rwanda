"""Event registry (contract sprint-09 §3.1).

Each app declares its events in `medilink/<app>/notification_events.py` as
`EVENTS: list[EventDefinition]`; `NotificationsConfig.ready()` autodiscovers them, so later sprints
add events and default templates without editing this app.
"""

from __future__ import annotations

import importlib
import re
from dataclasses import dataclass, field
from datetime import timedelta
from enum import StrEnum
from typing import Literal

from django.apps import apps

TYPE_PATTERN = re.compile(r"^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$")


class Placeholder(StrEnum):
    """Placeholder kinds (data class C0-C2 only). There is no kind for diagnoses, medicines,
    results or service names (security 06 §8)."""

    FACILITY_NAME = "facility_name"
    DATE = "date"
    TIME = "time"
    COUNT = "count"
    TICKET_NUMBER = "ticket_number"
    ROOM = "room"
    DEVICE_LABEL = "device_label"
    PERSON_NAME = "person_name"
    ANNOUNCEMENT_TITLE = "announcement_title"
    ANNOUNCEMENT_TEXT = "announcement_text"


# Kinds a channel may not carry: names never on lock screens of shared phones.
FORBIDDEN_KINDS: dict[str, frozenset[Placeholder]] = {
    "web_push": frozenset({Placeholder.PERSON_NAME}),
}


@dataclass(frozen=True)
class Text:
    subject: str
    body: str


@dataclass(frozen=True)
class EventDefinition:
    type: str
    audience: Literal["patient", "staff", "account"]
    priority: Literal["critical", "important", "routine"]
    channels: tuple[str, ...]
    fallback: tuple[str, ...] = ()
    placeholders: dict[str, Placeholder] = field(default_factory=dict)
    data_keys: frozenset[str] = frozenset()
    action_path: str = "/notifications/{id}"
    dedupe: str = "{type}:{id}"
    rate_limit: tuple[int, timedelta] = (10, timedelta(hours=1))
    ttl: timedelta | None = None
    mandatory: bool = False
    # (channel, language, variant) -> default text
    templates: dict[tuple[str, str, str], Text] = field(default_factory=dict)

    def __hash__(self) -> int:
        return hash(self.type)

    @property
    def all_channels(self) -> tuple[str, ...]:
        """in_app is implied for every event."""
        return ("in_app", *[c for c in self.channels if c != "in_app"])


_EVENTS: dict[str, EventDefinition] = {}
_DUPLICATES: list[str] = []


class RegistryError(ValueError):
    pass


def register(definition: EventDefinition) -> None:
    if not TYPE_PATTERN.match(definition.type) or len(definition.type) > 60:
        raise RegistryError(f"Invalid event type {definition.type!r}")
    if definition.type in _EVENTS:
        _DUPLICATES.append(definition.type)
        return
    _EVENTS[definition.type] = definition


def get(event_type: str) -> EventDefinition:
    try:
        return _EVENTS[event_type]
    except KeyError as exc:
        from medilink.notifications.service import NotifyError

        raise NotifyError(f"Unknown event {event_type!r}") from exc


def all_events() -> list[EventDefinition]:
    return list(_EVENTS.values())


def duplicates() -> list[str]:
    return list(_DUPLICATES)


def autodiscover() -> None:
    for config in apps.get_app_configs():
        if not config.name.startswith("medilink."):
            continue
        try:
            module = importlib.import_module(f"{config.name}.notification_events")
        except ModuleNotFoundError as exc:
            if exc.name == f"{config.name}.notification_events":
                continue
            raise
        for definition in getattr(module, "EVENTS", []):
            register(definition)
