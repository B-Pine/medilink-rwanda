"""The only writer of master data (contract §2.6, S1-D7).

One function per action. Each writes the row, a `masterdata_change` row and the audit entry in
one transaction, and bumps `version`. Nothing is deleted: `is_active=False` retires a row and
`True` restores it. A pre-save guard refuses master data writes from anywhere else.
"""

from __future__ import annotations

import contextvars
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from django.db import transaction
from django.db.models.signals import pre_save

from medilink.audit.services import record
from medilink.core.exceptions import Conflict
from medilink.masterdata import models as m
from medilink.masterdata.kinds import Kind, kind_for_model

_writing = contextvars.ContextVar("masterdata_writing", default=False)


class MasterDataWriteOutsideServices(RuntimeError):
    pass


def _guard(sender: Any, instance: Any, raw: bool = False, **kwargs: Any) -> None:
    if raw or _writing.get():
        return
    raise MasterDataWriteOutsideServices(
        f"{sender.__name__} is written only by medilink.masterdata.services"
    )


def connect_guard() -> None:
    for model in m.MASTER_DATA_MODELS:
        pre_save.connect(_guard, sender=model, dispatch_uid=f"masterdata-guard-{model.__name__}")


@contextmanager
def writer() -> Iterator[None]:
    """Allow master data saves inside this block (services, migrations' seed helpers, commands)."""
    token = _writing.set(True)
    try:
        yield
    finally:
        _writing.reset(token)


def snapshot(row: m.MasterDataModel, kind: Kind) -> dict[str, Any]:
    data: dict[str, Any] = {}
    for name in kind.change_fields:
        if name == "parent_code":
            parent = getattr(row, "parent", None)
            data[name] = parent.code if parent is not None else None
            continue
        value = getattr(row, name)
        data[name] = value.isoformat() if hasattr(value, "isoformat") else value
    return data


def _apply(row: m.MasterDataModel, values: dict[str, Any]) -> None:
    for name, value in values.items():
        if name == "parent_code":
            row.parent = (  # type: ignore[attr-defined]
                m.Location.objects.get(code=value) if value else None
            )
        else:
            setattr(row, name, value)


def _audit_action(action: str) -> str:
    names: dict[str, str] = {
        m.ChangeAction.CREATE: "masterdata.created",
        m.ChangeAction.IMPORT: "masterdata.updated",
        m.ChangeAction.RETIRE: "masterdata.retired",
        m.ChangeAction.RESTORE: "masterdata.restored",
    }
    return names.get(action, "masterdata.updated")


def _log(
    kind: Kind,
    row: m.MasterDataModel,
    action: str,
    old: dict[str, Any] | None,
    actor: Any,
    request: Any,
    import_ref: m.MasterDataImport | None = None,
    audit: bool = True,
) -> None:
    m.MasterDataChange.objects.create(
        kind=kind.slug,
        row_id=row.pk,
        row_version=row.version,
        action=action,
        old=old,
        new=snapshot(row, kind),
        actor=actor,
        import_ref=import_ref,
    )
    if audit:
        record(
            _audit_action(action),
            request=request,
            actor=actor,
            object_type=f"masterdata.{kind.slug}",
            object_id=row.pk,
            metadata={"kind": kind.slug, "row_version": row.version},
        )


def create(
    kind: Kind,
    values: dict[str, Any],
    *,
    actor: Any,
    request: Any = None,
    import_ref: m.MasterDataImport | None = None,
    audit: bool = True,
    imported: bool = False,
) -> m.MasterDataModel:
    with transaction.atomic(), writer():
        row = kind.model()
        _apply(row, values)
        row.version = 1
        row.save()
        _log(
            kind,
            row,
            m.ChangeAction.IMPORT if import_ref or imported else m.ChangeAction.CREATE,
            None,
            actor,
            request,
            import_ref,
            audit,
        )
    return row


def update(
    kind: Kind,
    row: m.MasterDataModel,
    values: dict[str, Any],
    *,
    version: int | None,
    actor: Any,
    request: Any = None,
    import_ref: m.MasterDataImport | None = None,
    audit: bool = True,
    imported: bool = False,
) -> m.MasterDataModel:
    """Change fields (identity fields are immutable). `is_active` False/True retires/restores."""
    with transaction.atomic(), writer():
        locked = type(row).objects.select_for_update().get(pk=row.pk)
        if version is not None and locked.version != version:
            raise Conflict()
        old = snapshot(locked, kind)
        changes = {k: v for k, v in values.items() if k not in kind.identity}
        _apply(locked, changes)
        new = snapshot(locked, kind)
        if new == old:
            return locked
        if old["is_active"] and not new["is_active"]:
            action = m.ChangeAction.RETIRE
        elif not old["is_active"] and new["is_active"]:
            action = m.ChangeAction.RESTORE
        else:
            action = m.ChangeAction.IMPORT if import_ref or imported else m.ChangeAction.UPDATE
        locked.version += 1
        locked.save()
        _log(kind, locked, action, old, actor, request, import_ref, audit)
    return locked


def model_kind(row: m.MasterDataModel) -> Kind:
    return kind_for_model(type(row))
