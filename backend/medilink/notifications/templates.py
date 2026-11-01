"""Templates (contract sprint-09 §3.1): `string.Template` syntax, no attribute access, no HTML.

Defaults from the event registry are synced on `post_migrate` as version 1 for every missing
(code, channel, language, variant); rows edited by platform admins are never overwritten.
"""

from __future__ import annotations

import datetime as dt
import string
import zoneinfo
from dataclasses import dataclass
from typing import Any

from medilink.notifications import content_policy, registry
from medilink.notifications.models import Template, TemplateSource, Variant
from medilink.notifications.registry import FORBIDDEN_KINDS, EventDefinition, Placeholder

KIGALI = zoneinfo.ZoneInfo("Africa/Kigali")
LANGUAGES = ("rw", "en", "fr")


@dataclass(frozen=True)
class TextLimits:
    subject: int
    body: int


LIMITS: dict[str, TextLimits] = {
    "in_app": TextLimits(120, 500),
    "web_push": TextLimits(60, 160),
    "email": TextLimits(120, 4000),
}


def placeholders_in(text: str) -> set[str]:
    names: set[str] = set()
    for _escaped, named, braced, _invalid in string.Template.pattern.findall(text):
        if named or braced:
            names.add(named or braced)
    return names


class TemplateError(ValueError):
    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field
        self.message = message


def validate(definition: EventDefinition, channel: str, subject: str, body: str) -> list[str]:
    """Placeholders used by the text; raises TemplateError for an unknown placeholder, a kind the
    channel may not carry, a clinical term or text over the channel's limits."""
    used = placeholders_in(subject) | placeholders_in(body)
    unknown = used - set(definition.placeholders)
    if unknown:
        raise TemplateError("body", f"Unknown placeholder: {', '.join(sorted(unknown))}.")
    forbidden = FORBIDDEN_KINDS.get(channel, frozenset())
    blocked = sorted(n for n in used if definition.placeholders[n] in forbidden)
    if blocked:
        raise TemplateError("body", f"Not allowed on {channel}: {', '.join(blocked)}.")
    limits = LIMITS.get(channel)
    if limits and len(subject) > limits.subject:
        raise TemplateError("subject", f"At most {limits.subject} characters.")
    if limits and len(body) > limits.body:
        raise TemplateError("body", f"At most {limits.body} characters.")
    terms = content_policy.clinical_terms(f"{subject}\n{body}")
    if terms:
        raise TemplateError("body", "Clinical words are not allowed in notifications.")
    return sorted(used)


def active(code: str, channel: str, language: str, variant: str) -> Template | None:
    """The active template, falling back to the `self` variant, then rw, then en (§2.5)."""
    variants = [variant] if variant == Variant.SELF else [variant, Variant.SELF]
    languages = [language] + [lang for lang in ("rw", "en") if lang != language]
    rows = {
        (t.language, t.variant): t
        for t in Template.objects.filter(
            code=code, channel=channel, is_active=True, language__in=languages, variant__in=variants
        )
    }
    for lang in languages:
        for v in variants:
            if (lang, v) in rows:
                return rows[(lang, v)]
    return None


def format_value(kind: Placeholder, value: Any, language: str) -> str:
    if kind == Placeholder.DATE and isinstance(value, (dt.date, dt.datetime)):
        day = value.astimezone(KIGALI) if isinstance(value, dt.datetime) else value
        return day.strftime("%d/%m/%Y")
    if kind == Placeholder.TIME and isinstance(value, dt.datetime):
        return value.astimezone(KIGALI).strftime("%H:%M")
    return str(value)


def format_context(
    definition: EventDefinition, context: dict[str, Any], language: str
) -> dict[str, str]:
    return {
        name: format_value(kind, context[name], language)
        for name, kind in definition.placeholders.items()
        if name in context
    }


def render_text(template: Template, values: dict[str, str]) -> tuple[str, str]:
    subject = string.Template(template.subject).safe_substitute(values)
    body = string.Template(template.body).safe_substitute(values)
    return subject, body


def sync_defaults(using: str = "default", **_: Any) -> int:
    """post_migrate: add version 1 of every missing default; never touch existing rows. Does
    nothing while the table is absent (migrating backwards)."""
    from django.db import connections

    if Template._meta.db_table not in connections[using].introspection.table_names():
        return 0
    created = 0
    for definition in registry.all_events():
        for (channel, language, variant), text in definition.templates.items():
            exists = Template.objects.filter(
                code=definition.type, channel=channel, language=language, variant=variant
            ).exists()
            if exists:
                continue
            Template.objects.create(
                code=definition.type,
                channel=channel,
                language=language,
                variant=variant,
                template_version=1,
                subject=text.subject,
                body=text.body,
                placeholders=sorted(placeholders_in(text.subject) | placeholders_in(text.body)),
                is_active=True,
                source=TemplateSource.SEED,
            )
            created += 1
    return created
