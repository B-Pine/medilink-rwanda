#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""

import os
import sys

# Commands that change the schema run as the database *owner* role (DATABASE_OWNER_URL).
# Everything else, including the web app, runs as the restricted runtime role (DATABASE_URL),
# which is NOSUPERUSER NOBYPASSRLS and owns no tables (docs/security/04 §4).
OWNER_COMMANDS = frozenset(
    {"migrate", "makemigrations", "sqlmigrate", "showmigrations", "squashmigrations", "flush"}
)


def main() -> None:
    try:  # importing `config` already needs the settings module (config.celery)
        from config.environment import require_settings_module

        require_settings_module()
    except RuntimeError as exc:
        sys.exit(str(exc))
    if len(sys.argv) > 1 and sys.argv[1] in OWNER_COMMANDS:
        os.environ.setdefault("MEDILINK_DB_ROLE", "owner")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:  # pragma: no cover
        raise ImportError(
            "Couldn't import Django. Is the virtual environment (backend/.venv) active?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
