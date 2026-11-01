"""REVOKE UPDATE, DELETE, TRUNCATE on the audit table from the runtime role (security 05 §6).

medilink.core.db already does this after every migrate; doing it in a migration as well means the
privilege is gone even where post_migrate receivers don't run (e.g. `migrate` from another tool or
a restored dump with the default privileges of backend/docker/postgres/init/01-roles.sh).
"""

from typing import Any

from django.conf import settings
from django.db import migrations


def revoke(apps: Any, schema_editor: Any) -> None:
    connection = schema_editor.connection
    if connection.vendor != "postgresql":
        return
    role = settings.DATABASE_APP_ROLE
    with connection.cursor() as cursor:
        cursor.execute("SELECT current_user, EXISTS (SELECT 1 FROM pg_roles WHERE rolname = %s)", [role])
        current_user, exists = cursor.fetchone()
        if not exists or current_user == role:
            return
        quoted = connection.ops.quote_name(role)
        cursor.execute(f"REVOKE UPDATE, DELETE, TRUNCATE ON audit_auditentry FROM {quoted}")


class Migration(migrations.Migration):
    dependencies = [("audit", "0002_append_only")]

    operations = [migrations.RunPython(revoke, migrations.RunPython.noop, elidable=False)]
