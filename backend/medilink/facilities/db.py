"""Migration helpers shared by the S2 apps (contract sprint-02 §2.1)."""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.db import migrations


def owner_read_policy(table: str, name: str) -> migrations.RunPython:
    """A SELECT-only policy for the migrating (owner) role, so SECURITY DEFINER functions can read
    across facilities despite FORCE RLS (as patients 0004). Never created for the runtime role."""

    def create(apps: Any, schema_editor: Any) -> None:
        if schema_editor.connection.vendor != "postgresql":
            return
        with schema_editor.connection.cursor() as cursor:
            cursor.execute("SELECT current_user")
            if cursor.fetchone()[0] == settings.DATABASE_APP_ROLE:
                return
        schema_editor.execute(
            f"CREATE POLICY {name} ON {table} AS PERMISSIVE FOR SELECT TO CURRENT_USER USING (true)"
        )

    def drop(apps: Any, schema_editor: Any) -> None:
        if schema_editor.connection.vendor == "postgresql":
            schema_editor.execute(f"DROP POLICY IF EXISTS {name} ON {table}")

    return migrations.RunPython(create, drop)


def append_only(table: str) -> migrations.RunSQL:
    """Reject UPDATE and DELETE on `table` with a trigger (the runtime role also loses the rights
    in post_migrate)."""
    return migrations.RunSQL(
        f"""
        CREATE OR REPLACE FUNCTION {table}_reject_mutation() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
            USING ERRCODE = 'insufficient_privilege';
        END;
        $$;
        CREATE TRIGGER {table}_no_update_delete BEFORE UPDATE OR DELETE ON {table}
          FOR EACH ROW EXECUTE FUNCTION {table}_reject_mutation();
        """,
        f"""
        DROP TRIGGER IF EXISTS {table}_no_update_delete ON {table};
        DROP FUNCTION IF EXISTS {table}_reject_mutation();
        """,
    )


def grant_execute(functions: tuple[str, ...], append_only_tables: tuple[str, ...] = ()) -> Any:
    """post_migrate receiver body: EXECUTE on the functions for the runtime role, no UPDATE/DELETE
    on the append-only tables. Skipped when the functions don't exist (migrated back)."""

    def run(sender: Any = None, using: str = "default", **kwargs: Any) -> None:
        from django.db import connections

        connection = connections[using]
        if connection.vendor != "postgresql":
            return
        role = settings.DATABASE_APP_ROLE
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT current_user, EXISTS (SELECT 1 FROM pg_roles WHERE rolname = %s)", [role]
            )
            current_user, exists = cursor.fetchone()
            if not exists or current_user == role:
                return
            quoted = connection.ops.quote_name(role)
            for signature in functions:
                cursor.execute("SELECT to_regprocedure(%s)", [signature])
                if cursor.fetchone()[0] is not None:
                    cursor.execute(f"GRANT EXECUTE ON FUNCTION {signature} TO {quoted}")
            for table in append_only_tables:
                cursor.execute("SELECT to_regclass(%s)", [table])
                if cursor.fetchone()[0] is not None:
                    cursor.execute(f"REVOKE UPDATE, DELETE, TRUNCATE ON {table} FROM {quoted}")

    return run
