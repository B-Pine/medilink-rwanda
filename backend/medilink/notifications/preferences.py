"""Preferences with defaults in code (contract sprint-09 §2.1, §2.5).

Patients choose channels per priority and quiet hours (default 21:00-06:00 Africa/Kigali);
guardians switch alerts per dependent. Staff have no channel choices or quiet hours: they choose
sound and the approvals digest.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Any

from medilink.notifications import conf
from medilink.notifications.models import Audience, Preference

INTERRUPTING = ("web_push", "email")
PRIORITIES = ("critical", "important", "routine")
DEFAULT_REMINDERS = [1440, 120]


@dataclass
class Effective:
    channels: dict[str, list[str]]
    quiet_hours: tuple[dt.time, dt.time] | None
    reminder_offsets_minutes: list[int]
    sound_enabled: bool
    approvals_digest: str
    version: int
    dependents_off: set[str] = field(default_factory=set)


def available_channels() -> list[str]:
    from medilink.notifications.channels import interrupting_channels

    return interrupting_channels()


def defaults(audience: str) -> Effective:
    channels = {level: available_channels() for level in PRIORITIES}
    return Effective(
        channels=channels,
        quiet_hours=conf.default_quiet_hours() if audience == Audience.PATIENT else None,
        reminder_offsets_minutes=list(DEFAULT_REMINDERS),
        sound_enabled=False,
        approvals_digest="immediate",
        version=0,
    )


def row(user: Any, audience: str) -> Preference | None:
    return Preference.objects.filter(user=user, audience=audience, patient_id__isnull=True).first()


def effective(user: Any, audience: str) -> Effective:
    result = defaults(audience)
    saved = row(user, audience)
    if saved is not None:
        if saved.channels:
            result.channels = {
                level: list(saved.channels.get(level, result.channels[level]))
                for level in PRIORITIES
            }
        if audience == Audience.PATIENT:
            result.quiet_hours = (
                (saved.quiet_hours_start, saved.quiet_hours_end)
                if saved.quiet_hours_enabled and saved.quiet_hours_start and saved.quiet_hours_end
                else None
            )
        if saved.reminder_offsets_minutes is not None:
            result.reminder_offsets_minutes = list(saved.reminder_offsets_minutes)
        if saved.sound_enabled is not None:
            result.sound_enabled = saved.sound_enabled
        if saved.approvals_digest:
            result.approvals_digest = saved.approvals_digest
        result.version = saved.version
    result.dependents_off = {
        str(pid)
        for pid in Preference.objects.filter(
            user=user, audience=audience, patient_id__isnull=False, receive_alerts=False
        ).values_list("patient_id", flat=True)
    }
    return result


def in_quiet_hours(window: tuple[dt.time, dt.time] | None, at: dt.datetime) -> bool:
    if window is None:
        return False
    start, end = window
    local = at.astimezone(conf_tz()).time()
    if start <= end:
        return start <= local < end
    return local >= start or local < end


def quiet_hours_end(window: tuple[dt.time, dt.time], at: dt.datetime) -> dt.datetime:
    """The next moment the window ends, after `at`."""
    tz = conf_tz()
    local = at.astimezone(tz)
    candidate = local.replace(hour=window[1].hour, minute=window[1].minute, second=0, microsecond=0)
    if candidate <= local:
        candidate += dt.timedelta(days=1)
    return candidate.astimezone(dt.UTC)


def conf_tz() -> dt.tzinfo:
    import zoneinfo

    return zoneinfo.ZoneInfo("Africa/Kigali")
