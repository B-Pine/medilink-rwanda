"""PostgreSQL row-level security as reusable migration operations (security 04 §4).

Usage in a migration, for any table with a `facility_id` column:

    from medilink.tenancy.rls import EnableFacilityRLS

    operations = [..., EnableFacilityRLS("visit")]

This ENABLEs and FORCEs RLS (so it applies to the table owner too) and creates the policy

    CREATE POLICY facility_isolation ON <table>
      USING      (facility_id = NULLIF(current_setting('app.facility_id', true), '')::uuid)
      WITH CHECK (facility_id = NULLIF(current_setting('app.facility_id', true), '')::uuid);

A missing context turns into NULL, so no row matches: the database fails closed.
The context is set per transaction by medilink.tenancy.context.set_db_context().
"""

from __future__ import annotations

from typing import Any

from django.db import migrations

FACILITY_SETTING = "app.facility_id"
USER_SETTING = "app.user_id"


def context_uuid_sql(setting: str) -> str:
    """SQL expression for a transaction-local context value, NULL when missing or empty."""
    return f"NULLIF(current_setting('{setting}', true), '')::uuid"


FACILITY_CONTEXT_SQL = context_uuid_sql(FACILITY_SETTING)
USER_CONTEXT_SQL = context_uuid_sql(USER_SETTING)


def _table(schema_editor: Any, state: Any, app_label: str, model_name: str) -> str:
    model = state.apps.get_model(app_label, model_name)
    return schema_editor.quote_name(model._meta.db_table)


class _PostgresOnlyOperation(migrations.operations.base.Operation):
    reduces_to_sql = True
    reversible = True

    def state_forwards(self, app_label: str, state: Any) -> None:
        """Database-only operation: the model state is unchanged."""

    @staticmethod
    def _applies(schema_editor: Any) -> bool:
        return bool(schema_editor.connection.vendor == "postgresql")


class CreatePolicy(_PostgresOnlyOperation):
    """CREATE POLICY <name> ON <table> [FOR <command>] USING (...) [WITH CHECK (...)]."""

    def __init__(
        self,
        model_name: str,
        name: str,
        using: str,
        with_check: str | None = None,
        command: str = "ALL",
    ) -> None:
        if command not in {"ALL", "SELECT", "INSERT", "UPDATE", "DELETE"}:
            raise ValueError(f"Invalid policy command {command!r}")
        self.model_name = model_name
        self.name = name
        self.using = using
        self.with_check = with_check
        self.command = command

    def database_forwards(
        self, app_label: str, schema_editor: Any, from_state: Any, to_state: Any
    ) -> None:
        if not self._applies(schema_editor):
            return
        table = _table(schema_editor, to_state, app_label, self.model_name)
        sql = (
            f"CREATE POLICY {schema_editor.quote_name(self.name)} ON {table} "
            f"AS PERMISSIVE FOR {self.command} USING ({self.using})"
        )
        if self.with_check:
            sql += f" WITH CHECK ({self.with_check})"
        schema_editor.execute(sql)

    def database_backwards(
        self, app_label: str, schema_editor: Any, from_state: Any, to_state: Any
    ) -> None:
        if not self._applies(schema_editor):
            return
        table = _table(schema_editor, from_state, app_label, self.model_name)
        schema_editor.execute(
            f"DROP POLICY IF EXISTS {schema_editor.quote_name(self.name)} ON {table}"
        )

    def describe(self) -> str:
        return f"Create RLS policy {self.name} on {self.model_name}"

    @property
    def migration_name_fragment(self) -> str:
        return f"policy_{self.model_name}_{self.name}"


class EnableFacilityRLS(_PostgresOnlyOperation):
    """ENABLE + FORCE row-level security and create the `facility_isolation` policy."""

    policy_name = "facility_isolation"

    def __init__(self, model_name: str, column: str = "facility_id") -> None:
        self.model_name = model_name
        self.column = column

    def database_forwards(
        self, app_label: str, schema_editor: Any, from_state: Any, to_state: Any
    ) -> None:
        if not self._applies(schema_editor):
            return
        table = _table(schema_editor, to_state, app_label, self.model_name)
        column = schema_editor.quote_name(self.column)
        predicate = f"{column} = {FACILITY_CONTEXT_SQL}"
        schema_editor.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        schema_editor.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        schema_editor.execute(
            f"CREATE POLICY {self.policy_name} ON {table} AS PERMISSIVE FOR ALL "
            f"USING ({predicate}) WITH CHECK ({predicate})"
        )

    def database_backwards(
        self, app_label: str, schema_editor: Any, from_state: Any, to_state: Any
    ) -> None:
        if not self._applies(schema_editor):
            return
        table = _table(schema_editor, from_state, app_label, self.model_name)
        schema_editor.execute(f"DROP POLICY IF EXISTS {self.policy_name} ON {table}")
        schema_editor.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
        schema_editor.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    def describe(self) -> str:
        return f"Enable facility row-level security on {self.model_name}"

    @property
    def migration_name_fragment(self) -> str:
        return f"rls_{self.model_name}"
