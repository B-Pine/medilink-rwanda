"""Master data privileges (contract §2.6, S1-D7), applied after every `migrate` by the owner role.

The runtime role keeps INSERT/UPDATE on master data tables (only `masterdata.services` writes
them) but loses DELETE/TRUNCATE (retire instead), and the change log is append-only.
"""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.db import connections

from medilink.masterdata.models import MASTER_DATA_MODELS, MasterDataChange

NO_DELETE_TABLES = tuple(model._meta.db_table for model in MASTER_DATA_MODELS)
APPEND_ONLY_TABLES = (MasterDataChange._meta.db_table,)


def revoke_master_data_writes(sender: Any = None, using: str = "default", **kwargs: Any) -> None:
    revoke(NO_DELETE_TABLES, APPEND_ONLY_TABLES, using=using)


def revoke(
    no_delete: tuple[str, ...], append_only: tuple[str, ...], using: str = "default"
) -> None:
    """REVOKE DELETE/TRUNCATE on `no_delete` and UPDATE/DELETE/TRUNCATE on `append_only`."""
    connection = connections[using]
    if connection.vendor != "postgresql":
        return
    role = settings.DATABASE_APP_ROLE
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT current_user, EXISTS (SELECT 1 FROM pg_roles WHERE rolname = %s)", [role]
        )
        current_user, role_exists = cursor.fetchone()
        if not role_exists or current_user == role:
            return
        quoted = connection.ops.quote_name(role)
        for table in no_delete:
            cursor.execute(f"REVOKE DELETE, TRUNCATE ON {table} FROM {quoted}")
        for table in append_only:
            cursor.execute(f"REVOKE UPDATE, DELETE, TRUNCATE ON {table} FROM {quoted}")
