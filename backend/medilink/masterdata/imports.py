"""CSV imports (contract §3.5, §5): validate rows and store the diff (preview), then apply it in one
transaction with one change row per changed item. The CLI commands and the API share this code.

Kinds: locations, drugs, diagnosis-codes, symptoms. Columns are in `Kind.csv_columns`.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from typing import Any

from django.db import transaction

from medilink.masterdata import models as m
from medilink.masterdata import services
from medilink.masterdata.kinds import KINDS, LANGUAGES, Kind
from medilink.masterdata.serializers import platform_serializer

MAX_ROWS = 50_000
MAX_ERRORS = 500
LEVEL_ORDER = [level.value for level in m.LocationLevel]
_TRUE = {"1", "true", "yes", "y"}
_FALSE = {"0", "false", "no", "n", ""}


class ImportFileError(ValueError):
    """The file as a whole is unusable (headers, encoding, size)."""


@dataclass
class Plan:
    kind: str
    mode: str
    rows: int = 0
    errors: list[dict[str, Any]] = field(default_factory=list)
    changes: list[dict[str, Any]] = field(default_factory=list)

    @property
    def summary(self) -> dict[str, int]:
        counts = {"create": 0, "update": 0, "retire": 0, "unchanged": 0}
        for change in self.changes:
            counts[change["action"]] += 1
        return {"rows": self.rows, **counts, "errors": len(self.errors)}

    def as_json(self) -> dict[str, Any]:
        return {"errors": self.errors, "changes": self.changes}


def _error(plan: Plan, line: int, field_name: str, message: str) -> None:
    if len(plan.errors) < MAX_ERRORS:
        plan.errors.append({"line": line, "field": field_name, "message": message})


def read_csv(data: bytes, kind: Kind) -> list[tuple[int, dict[str, str]]]:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ImportFileError("The file must be UTF-8.") from exc
    reader = csv.DictReader(io.StringIO(text, newline=""))
    headers = [h.strip() for h in (reader.fieldnames or [])]
    missing = [c for c in kind.csv_columns if c not in headers and c != "default_route"]
    unknown = [h for h in headers if h not in kind.csv_columns]
    if missing or unknown:
        raise ImportFileError(
            f"Expected columns: {', '.join(kind.csv_columns)}."
            + (f" Missing: {', '.join(missing)}." if missing else "")
            + (f" Unknown: {', '.join(unknown)}." if unknown else "")
        )
    rows = []
    for index, raw in enumerate(reader, start=2):
        if index - 1 > MAX_ROWS:
            raise ImportFileError(f"At most {MAX_ROWS} rows per file.")
        rows.append((index, {(k or "").strip(): (v or "").strip() for k, v in raw.items()}))
    return rows


def _bool(value: str) -> bool:
    lowered = value.lower()
    if lowered in _TRUE:
        return True
    if lowered in _FALSE:
        return False
    raise ValueError("Use true or false.")


def _values(slug: str, raw: dict[str, str]) -> dict[str, Any]:
    """CSV row -> the kind's field values (raises ValueError with a message for bad cells)."""
    if slug == "locations":
        return {
            "code": raw["code"],
            "level": raw["level"],
            "parent_code": raw.get("parent_code") or None,
            "name": raw["name"],
        }
    if slug == "drugs":
        quantity = raw.get("max_usual_quantity", "")
        return {
            "code": raw["code"],
            "generic_name": raw["generic_name"],
            "strength": raw["strength"],
            "form": raw["form"],
            "default_route": raw.get("default_route", ""),
            "drug_class": raw.get("drug_class", ""),
            "is_controlled": _bool(raw.get("is_controlled", "")),
            "is_essential_list": _bool(raw.get("is_essential_list", "")),
            "max_usual_quantity": int(quantity) if quantity else None,
        }
    if slug == "diagnosis-codes":
        return {
            "code_system": "icd10",
            "code": raw["code"].upper(),
            "title_i18n": {
                c: raw.get(f"title_{c}", "") for c in LANGUAGES if raw.get(f"title_{c}")
            },
            "plain_language_i18n": {
                c: raw.get(f"plain_language_{c}", "")
                for c in LANGUAGES
                if raw.get(f"plain_language_{c}")
            },
            "is_sensitive": _bool(raw.get("is_sensitive", "")),
        }
    if slug == "symptoms":
        return {
            "code": raw["code"],
            "name_i18n": {c: raw.get(f"name_{c}", "") for c in LANGUAGES if raw.get(f"name_{c}")},
            "body_system": raw.get("body_system", ""),
            "icd_code": raw.get("icd_code", ""),
        }
    raise ImportFileError(f"{slug} can't be imported.")


def _key(kind: Kind, values: dict[str, Any]) -> str:
    return ":".join(str(values.get(name, "")) for name in kind.identity)


def _existing(kind: Kind) -> dict[str, m.MasterDataModel]:
    rows = kind.model.objects.all()
    if kind.slug == "locations":
        rows = rows.select_related("parent")
    return {":".join(str(getattr(r, n)) for n in kind.identity): r for r in rows}


def _json(value: Any) -> Any:
    return value.isoformat() if hasattr(value, "isoformat") else value


def build_plan(kind_slug: str, data: bytes, mode: str = m.ImportMode.UPSERT) -> Plan:
    kind = KINDS[kind_slug]
    if not kind.importable:
        raise ImportFileError(f"{kind_slug} can't be imported.")
    plan = Plan(kind=kind_slug, mode=mode)
    rows = read_csv(data, kind)
    plan.rows = len(rows)
    existing = _existing(kind)
    seen: dict[str, int] = {}
    file_levels: dict[str, str] = {}
    if kind_slug == "locations":
        rows.sort(
            key=lambda r: (
                LEVEL_ORDER.index(r[1]["level"]) if r[1].get("level") in LEVEL_ORDER else -1
            )
        )
    for line, raw in rows:
        try:
            values = _values(kind_slug, raw)
        except (ValueError, KeyError) as exc:
            _error(plan, line, "", str(exc))
            continue
        key = _key(kind, values)
        if key in seen:
            _error(plan, line, kind.identity[-1], f"Duplicate of line {seen[key]}.")
            continue
        seen[key] = line
        current = existing.get(key)
        if kind_slug == "locations":
            if not _check_location(plan, line, values, existing, file_levels):
                continue
            file_levels[values["code"]] = values["level"]
            serializer_values = {k: v for k, v in values.items() if k != "parent_code"}
        else:
            serializer_values = values
        serializer = platform_serializer(kind_slug)(
            instance=current,
            data=serializer_values,
            partial=current is not None,
            context={"import": True},
        )
        if not serializer.is_valid():
            for name, messages in serializer.errors.items():
                _error(plan, line, name, " ".join(str(x) for x in messages))
            continue
        values = {**values, "is_active": True}
        if current is None:
            plan.changes.append({"code": key, "action": "create", "values": _jsonable(values)})
            continue
        old = services.snapshot(current, kind)
        diff = {
            name: [old.get(name), _json(value)]
            for name, value in values.items()
            if name not in kind.identity and old.get(name) != _json(value)
        }
        if kind_slug == "locations" and "parent_code" in diff:
            _error(plan, line, "parent_code", "A location can't move to another parent.")
            continue
        action = "update" if diff else "unchanged"
        plan.changes.append(
            {"code": key, "action": action, "values": _jsonable(values), "changes": diff}
        )
    if mode == m.ImportMode.UPSERT_AND_RETIRE:
        for key, row in existing.items():
            if key not in seen and row.is_active:
                plan.changes.append(
                    {
                        "code": key,
                        "action": "retire",
                        "values": {"is_active": False},
                        "changes": {"is_active": [True, False]},
                    }
                )
    return plan


def _jsonable(values: dict[str, Any]) -> dict[str, Any]:
    return {k: _json(v) for k, v in values.items()}


def _check_location(
    plan: Plan,
    line: int,
    values: dict[str, Any],
    existing: dict[str, m.MasterDataModel],
    file_levels: dict[str, str],
) -> bool:
    level = values["level"]
    if level not in LEVEL_ORDER:
        _error(plan, line, "level", f"Use one of: {', '.join(LEVEL_ORDER)}.")
        return False
    expected = m.LEVEL_PARENT[m.LocationLevel(level)]
    parent_code = values["parent_code"]
    if expected is None:
        if parent_code:
            _error(plan, line, "parent_code", "A province has no parent.")
            return False
        return True
    parent_level = file_levels.get(parent_code or "")
    if parent_level is None and parent_code in existing:
        parent_level = existing[parent_code].level  # type: ignore[attr-defined]
    if parent_level is None:
        _error(plan, line, "parent_code", "Unknown parent location.")
        return False
    if parent_level != expected:
        _error(plan, line, "parent_code", "The parent must be one level up.")
        return False
    return True


def apply_plan(
    kind_slug: str,
    plan_json: dict[str, Any],
    *,
    actor: Any,
    import_ref: m.MasterDataImport | None = None,
) -> dict[str, int]:
    """Apply a validated plan in one transaction. Returns counts per action."""
    kind = KINDS[kind_slug]
    counts = {"create": 0, "update": 0, "retire": 0}
    with transaction.atomic():
        existing = _existing(kind)
        for change in plan_json.get("changes", []):
            action = change["action"]
            if action == "unchanged":
                continue
            values = dict(change["values"])
            if action == "create":
                services.create(
                    kind, values, actor=actor, import_ref=import_ref, audit=False, imported=True
                )
            else:
                row = existing[change["code"]]
                services.update(
                    kind,
                    row,
                    values,
                    version=None,
                    actor=actor,
                    import_ref=import_ref,
                    audit=False,
                    imported=True,
                )
            counts[action] += 1
    return counts
