"""S9's own events (contract sprint-09 §3.1): security notices, announcements and `system.test`.

Default texts are version 1 of each template. Kinyarwanda drafts need native-speaker review
before go-live (listed in the S9 pull request).
"""

from __future__ import annotations

from datetime import timedelta

from medilink.notifications.registry import EventDefinition, Placeholder, Text

P = Placeholder


def _texts(
    channels: tuple[str, ...],
    by_language: dict[str, tuple[str, str]],
    push: dict[str, tuple[str, str]] | None = None,
) -> dict[tuple[str, str, str], Text]:
    out: dict[tuple[str, str, str], Text] = {}
    for channel in channels:
        source = push if channel == "web_push" and push else by_language
        for language, (subject, body) in source.items():
            out[(channel, language, "self")] = Text(subject, body)
    return out


NEW_DEVICE = {
    "rw": (
        "Winjiye muri MediLink ukoresheje igikoresho gishya",
        "Twabonye ko winjiye ukoresheje $device_label ku wa $date saa $time. Niba atari wowe, "
        "hindura ijambo ry'ibanga ako kanya.",
    ),
    "en": (
        "New sign-in to your MediLink account",
        "We noticed a sign-in from $device_label on $date at $time. If this wasn't you, change "
        "your password now.",
    ),
    "fr": (
        "Nouvelle connexion à votre compte MediLink",
        "Nous avons remarqué une connexion depuis $device_label le $date à $time. Si ce n'était "
        "pas vous, changez votre mot de passe maintenant.",
    ),
}
MFA_ENROLLED = {
    "rw": (
        "Intambwe ya kabiri yo kwinjira yashyizweho",
        "Kwinjira mu ntambwe ebyiri kwashyizweho ku wa $date saa $time. Niba atari wowe, "
        "menyesha umuyobozi w'ivuriro.",
    ),
    "en": (
        "Two-step sign-in was set up",
        "Two-step sign-in was set up for your account on $date at $time. If this wasn't you, "
        "tell your facility administrator.",
    ),
    "fr": (
        "Connexion en deux étapes activée",
        "La connexion en deux étapes a été activée sur votre compte le $date à $time. Si ce "
        "n'était pas vous, prévenez l'administrateur de votre établissement.",
    ),
}
PASSWORD_CHANGED = {
    "rw": (
        "Ijambo ry'ibanga ryahinduwe",
        "Ijambo ry'ibanga rya konti yawe ryahinduwe ku wa $date saa $time, kandi wasohowe ku "
        "bikoresho byose. Niba atari wowe, saba ijambo ry'ibanga rishya ako kanya.",
    ),
    "en": (
        "Your password was changed",
        "Your password was changed on $date at $time and you were signed out everywhere. If "
        "this wasn't you, reset your password now.",
    ),
    "fr": (
        "Votre mot de passe a été modifié",
        "Votre mot de passe a été modifié le $date à $time et vous avez été déconnecté partout. "
        "Si ce n'était pas vous, réinitialisez-le maintenant.",
    ),
}
MFA_RESET = {
    "rw": (
        "Intambwe ya kabiri yo kwinjira yasubijwe ku ntangiriro",
        "Umuyobozi wa $facility_name yasubije ku ntangiriro intambwe ya kabiri yo kwinjira. "
        "Uzayishyiraho bundi bushya ubutaha winjiye.",
    ),
    "en": (
        "Your two-step sign-in was reset",
        "An administrator at $facility_name reset your two-step sign-in. You will set it up "
        "again the next time you sign in.",
    ),
    "fr": (
        "Votre connexion en deux étapes a été réinitialisée",
        "Un administrateur de $facility_name a réinitialisé votre connexion en deux étapes. "
        "Vous la configurerez à nouveau à votre prochaine connexion.",
    ),
}
ROLE_CHANGED = {
    "rw": (
        "Inshingano zawe zahinduwe",
        "Inshingano zawe kuri $facility_name zahinduwe ku wa $date. Fungura MediLink urebe "
        "ibyo ushobora gukora ubu.",
    ),
    "en": (
        "Your roles were changed",
        "Your roles at $facility_name were changed on $date. Open MediLink to see what you can "
        "do now.",
    ),
    "fr": (
        "Vos rôles ont été modifiés",
        "Vos rôles à $facility_name ont été modifiés le $date. Ouvrez MediLink pour voir ce que "
        "vous pouvez faire maintenant.",
    ),
}
ANNOUNCEMENT = {
    "rw": ("$announcement_title", "$facility_name: $announcement_text"),
    "en": ("$announcement_title", "$facility_name: $announcement_text"),
    "fr": ("$announcement_title", "$facility_name : $announcement_text"),
}
PLATFORM_ANNOUNCEMENT = {
    "rw": ("$announcement_title", "MediLink: $announcement_text"),
    "en": ("$announcement_title", "MediLink: $announcement_text"),
    "fr": ("$announcement_title", "MediLink : $announcement_text"),
}
TEST = {
    "rw": ("Ubutumwa bwo kugerageza", "Ubu ni ubutumwa bwo kugerageza bwa MediLink."),
    "en": ("Test notification", "This is a MediLink test notification."),
    "fr": ("Notification de test", "Ceci est une notification de test MediLink."),
}

SECURITY = {"mandatory": True, "priority": "important"}

EVENTS: list[EventDefinition] = [
    EventDefinition(
        type="account.login.new_device",
        audience="account",
        channels=("in_app", "email"),
        placeholders={"device_label": P.DEVICE_LABEL, "date": P.DATE, "time": P.TIME},
        data_keys=frozenset({"device_id"}),
        dedupe="{type}:{device_id}",
        rate_limit=(5, timedelta(hours=1)),
        templates=_texts(("in_app", "email"), NEW_DEVICE),
        **SECURITY,  # type: ignore[arg-type]
    ),
    EventDefinition(
        type="account.mfa.enrolled",
        audience="staff",
        channels=("in_app", "email"),
        placeholders={"date": P.DATE, "time": P.TIME},
        data_keys=frozenset({"entry_id"}),
        dedupe="{type}:{entry_id}",
        templates=_texts(("in_app", "email"), MFA_ENROLLED),
        **SECURITY,  # type: ignore[arg-type]
    ),
    EventDefinition(
        type="account.password.changed",
        audience="account",
        channels=("in_app",),
        placeholders={"date": P.DATE, "time": P.TIME},
        data_keys=frozenset({"entry_id"}),
        dedupe="{type}:{entry_id}",
        templates=_texts(("in_app",), PASSWORD_CHANGED),
        **SECURITY,  # type: ignore[arg-type]
    ),
    EventDefinition(
        type="account.mfa.reset",
        audience="staff",
        channels=("in_app", "email"),
        placeholders={"facility_name": P.FACILITY_NAME},
        data_keys=frozenset({"membership_id", "reset_id"}),
        dedupe="{type}:{reset_id}",
        templates=_texts(("in_app", "email"), MFA_RESET),
        **SECURITY,  # type: ignore[arg-type]
    ),
    EventDefinition(
        type="account.role.changed",
        audience="staff",
        channels=("in_app", "email"),
        placeholders={"facility_name": P.FACILITY_NAME, "date": P.DATE},
        data_keys=frozenset({"membership_id", "change_id"}),
        dedupe="{type}:{change_id}",
        templates=_texts(("in_app", "email"), ROLE_CHANGED),
        **SECURITY,  # type: ignore[arg-type]
    ),
    EventDefinition(
        type="announcement.facility.published",
        audience="patient",
        priority="routine",
        channels=("in_app", "web_push", "email"),
        placeholders={
            "facility_name": P.FACILITY_NAME,
            "announcement_title": P.ANNOUNCEMENT_TITLE,
            "announcement_text": P.ANNOUNCEMENT_TEXT,
        },
        data_keys=frozenset({"announcement_id"}),
        dedupe="{type}:{announcement_id}",
        rate_limit=(20, timedelta(hours=24)),
        templates=_texts(("in_app", "web_push", "email"), ANNOUNCEMENT),
    ),
    EventDefinition(
        type="announcement.platform.published",
        audience="staff",
        priority="routine",
        channels=("in_app", "email"),
        placeholders={
            "announcement_title": P.ANNOUNCEMENT_TITLE,
            "announcement_text": P.ANNOUNCEMENT_TEXT,
        },
        data_keys=frozenset({"announcement_id"}),
        dedupe="{type}:{announcement_id}",
        rate_limit=(20, timedelta(hours=24)),
        templates=_texts(("in_app", "email"), PLATFORM_ANNOUNCEMENT),
    ),
    EventDefinition(
        type="system.test",
        audience="account",
        priority="routine",
        channels=("in_app", "web_push", "email"),
        dedupe="{type}:{test_id}",
        data_keys=frozenset({"test_id"}),
        templates=_texts(("in_app", "web_push", "email"), TEST),
    ),
]

# Wave 6 part A (contract §11): the catalogue events of the modules built so far
from medilink.notifications.wiring_events import EVENTS as _WIRING_EVENTS  # noqa: E402

EVENTS += _WIRING_EVENTS
