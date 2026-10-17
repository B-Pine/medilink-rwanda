"""Per-transaction tenant context for PostgreSQL RLS (security 04 §4).

`set_config(name, value, true)` is transaction-local: the value disappears at COMMIT/ROLLBACK,
so a pooled connection can never leak one request's facility into the next. Therefore the
context must be set *inside* a transaction; `set_db_context` refuses to run outside one.

- HTTP requests: TenantContextMiddleware opens the request transaction and sets the context
  from the verified session (user + active facility membership).
- Scripts, Celery tasks, seeds and tests: `with rls_context(facility_id=..., user_id=...):`.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from uuid import UUID

from django.db import connections, transaction

from medilink.tenancy.rls import FACILITY_SETTING, USER_SETTING


class TenantContextError(RuntimeError):
    pass


@dataclass(frozen=True)
class DbContext:
    facility_id: str
    user_id: str


def _as_text(value: UUID | str | None) -> str:
    return str(value) if value else ""


def _connection(using: str):  # type: ignore[no-untyped-def]
    return connections[using]


def set_db_context(
    *,
    facility_id: UUID | str | None = None,
    user_id: UUID | str | None = None,
    using: str = "default",
) -> None:
    """Set both context values for the current transaction (missing value = no access)."""
    connection = _connection(using)
    if connection.vendor != "postgresql":
        return
    if not connection.in_atomic_block:
        raise TenantContextError("The RLS context must be set inside a transaction.")
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT set_config(%s, %s, true), set_config(%s, %s, true)",
            [FACILITY_SETTING, _as_text(facility_id), USER_SETTING, _as_text(user_id)],
        )


def set_user_context(user_id: UUID | str | None, using: str = "default") -> None:
    """Set only the user part of the context, keeping the facility part."""
    current = get_db_context(using)
    set_db_context(facility_id=current.facility_id or None, user_id=user_id, using=using)


def get_db_context(using: str = "default") -> DbContext:
    connection = _connection(using)
    if connection.vendor != "postgresql":
        return DbContext("", "")
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT coalesce(current_setting(%s, true), ''), "
            "coalesce(current_setting(%s, true), '')",
            [FACILITY_SETTING, USER_SETTING],
        )
        facility_id, user_id = cursor.fetchone()
    return DbContext(facility_id=facility_id, user_id=user_id)


@contextmanager
def rls_context(
    *,
    facility_id: UUID | str | None = None,
    user_id: UUID | str | None = None,
    using: str = "default",
) -> Iterator[None]:
    """Run a block with the given tenant context, inside a transaction (or savepoint).

    The previous context is restored afterwards, so this nests safely inside a request.
    """
    with transaction.atomic(using=using):
        previous = get_db_context(using) if _connection(using).vendor == "postgresql" else None
        set_db_context(facility_id=facility_id, user_id=user_id, using=using)
        yield
        if previous is not None:
            set_db_context(
                facility_id=previous.facility_id or None,
                user_id=previous.user_id or None,
                using=using,
            )
