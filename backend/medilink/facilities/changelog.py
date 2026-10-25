"""Configuration change log (contract §2.2): one row per changed field, no personal data."""

from __future__ import annotations

import datetime as dt
import decimal
import uuid
from typing import Any

from medilink.facilities.models import ConfigChange


def _json(value: Any) -> Any:
    if isinstance(value, (dt.date, dt.time, dt.datetime)):
        return value.isoformat()
    if isinstance(value, (uuid.UUID, decimal.Decimal)):
        return str(value)
    if isinstance(value, (list, tuple)):
        return [_json(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _json(v) for k, v in value.items()}
    return value


def snapshot(obj: Any, fields: tuple[str, ...] | list[str]) -> dict[str, Any]:
    return {name: _json(getattr(obj, name)) for name in fields}


def log_changes(
    *,
    facility_id: Any,
    entity: str,
    entity_id: Any,
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
    actor: Any,
) -> list[str]:
    """Write a row per field whose value differs; returns the changed field names. `before=None`
    is a creation, `after=None` a deletion."""
    before = {k: _json(v) for k, v in (before or {}).items()}
    after = {k: _json(v) for k, v in (after or {}).items()}
    changed = sorted(k for k in set(before) | set(after) if before.get(k) != after.get(k))
    ConfigChange.objects.bulk_create(
        [
            ConfigChange(
                facility_id=facility_id,
                entity=entity,
                entity_id=str(entity_id),
                field=name,
                old_value=before.get(name),
                new_value=after.get(name),
                actor=actor,
            )
            for name in changed
        ]
    )
    return changed
