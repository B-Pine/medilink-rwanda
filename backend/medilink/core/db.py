"""Database role privileges, applied after every `migrate` (run by the owner role).

The runtime role (settings.DATABASE_APP_ROLE, e.g. medilink_app) gets DML on application tables
only. It can't change the schema, can't modify migration history, and can only INSERT/SELECT the
audit log (security 04 §4, security 05 §6).
"""

from __future__ import annotations

import logging
from typing import Any

from django.conf import settings
from django.db import connections

logger = logging.getLogger(__name__)

APPEND_ONLY_TABLES = ("audit_auditentry",)
READ_ONLY_TABLES = ("django_migrations",)


def grant_app_role_privileges(sender: Any = None, using: str = "default", **kwargs: Any) -> None:
    connection = connections[using]
    if connection.vendor != "postgresql":
        return
    role = settings.DATABASE_APP_ROLE
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT current_user, EXISTS (SELECT 1 FROM pg_roles WHERE rolname = %s)", [role]
        )
        current_user, role_exists = cursor.fetchone()
        if not role_exists:
            logger.warning("Database role %s does not exist; skipping grants.", role)
            return
        if current_user == role:
            return
        quoted = connection.ops.quote_name(role)
        statements = [
            f"GRANT USAGE ON SCHEMA public TO {quoted}",
            f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {quoted}",
            f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {quoted}",
        ]
        for table in READ_ONLY_TABLES:
            statements.append(f"REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON {table} FROM {quoted}")
        for table in APPEND_ONLY_TABLES:
            statements.append(f"REVOKE UPDATE, DELETE, TRUNCATE ON {table} FROM {quoted}")
        for statement in statements:
            cursor.execute(statement)
