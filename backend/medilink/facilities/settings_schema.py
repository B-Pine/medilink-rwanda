"""Facility settings sections (contract §2.2): each field has a type, default and limits. Later
sprints add fields with `register_settings_fields(section, fields)`."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

SECTIONS = ("queue", "booking", "billing", "documents", "notifications")


@dataclass(frozen=True)
class SettingField:
    kind: str  # "bool" | "int" | "choice" | "text"
    default: Any
    minimum: int | None = None
    maximum: int | None = None
    choices: tuple[str, ...] = ()
    max_length: int = 200
    description: str = ""


@dataclass
class Section:
    fields: dict[str, SettingField] = field(default_factory=dict)


_SCHEMA: dict[str, Section] = {name: Section() for name in SECTIONS}


def register_settings_fields(section: str, fields: dict[str, SettingField]) -> None:
    if section not in _SCHEMA:
        raise ValueError(f"Unknown settings section {section!r}")
    clash = set(fields) & set(_SCHEMA[section].fields)
    if clash:
        raise ValueError(f"Settings fields already registered in {section}: {sorted(clash)}")
    _SCHEMA[section].fields.update(fields)


def schema() -> dict[str, dict[str, SettingField]]:
    return {name: dict(section.fields) for name, section in _SCHEMA.items()}


def with_defaults(section: str, values: dict[str, Any]) -> dict[str, Any]:
    fields = _SCHEMA[section].fields
    return {name: values.get(name, spec.default) for name, spec in fields.items()}


class SettingsError(ValueError):
    def __init__(self, errors: dict[str, str]) -> None:
        super().__init__("invalid settings")
        self.errors = errors


def validate(section: str, values: dict[str, Any]) -> dict[str, Any]:
    """Checked values for `section`; unknown fields and wrong types raise SettingsError."""
    if section not in _SCHEMA:
        raise SettingsError({"section": "unknown"})
    fields = _SCHEMA[section].fields
    errors: dict[str, str] = {}
    clean: dict[str, Any] = {}
    for name, value in values.items():
        spec = fields.get(name)
        if spec is None:
            errors[name] = "unknown"
            continue
        if spec.kind == "bool" and isinstance(value, bool):
            clean[name] = value
        elif spec.kind == "int" and isinstance(value, int) and not isinstance(value, bool):
            if (spec.minimum is not None and value < spec.minimum) or (
                spec.maximum is not None and value > spec.maximum
            ):
                errors[name] = "range"
            else:
                clean[name] = value
        elif spec.kind == "choice" and value in spec.choices:
            clean[name] = value
        elif spec.kind == "text" and isinstance(value, str) and len(value) <= spec.max_length:
            clean[name] = value.strip()
        else:
            errors[name] = "type"
    if errors:
        raise SettingsError(errors)
    return clean


# ---- S2 defaults ---------------------------------------------------------------------------------

register_settings_fields(
    "queue",
    {
        "ticket_reset": SettingField("choice", "daily", choices=("daily", "never")),
        "show_names_on_display": SettingField("bool", False),
        "call_repeat_seconds": SettingField("int", 30, minimum=10, maximum=300),
        "priority_elderly_age": SettingField("int", 65, minimum=50, maximum=100),
    },
)
register_settings_fields(
    "booking",
    {
        "enabled": SettingField("bool", True),
        "lead_time_hours": SettingField("int", 2, minimum=0, maximum=168),
        "horizon_days": SettingField("int", 30, minimum=1, maximum=180),
        "cancel_until_hours": SettingField("int", 2, minimum=0, maximum=72),
        "no_show_strikes": SettingField("int", 3, minimum=1, maximum=10),
    },
)
register_settings_fields(
    "billing",
    {
        "no_insurers": SettingField("bool", False, description="The facility accepts no insurer"),
        "pay_before_consultation": SettingField("bool", True),
        "allow_exemptions": SettingField("bool", False),
        "receipt_prefix": SettingField("text", "RC", max_length=6),
    },
)
register_settings_fields(
    "documents",
    {
        "prescription_valid_days": SettingField("int", 30, minimum=1, maximum=365),
        "show_licence_numbers": SettingField("bool", True),
    },
)
register_settings_fields(
    "notifications",
    {
        "reminder_hours_before": SettingField("int", 24, minimum=1, maximum=72),
        "sms_enabled": SettingField("bool", False),
    },
)
