"""Reverse each app's latest migration, then migrate forward again (NFR-OPS-08).

Testing strategy §3.5: CI migrates an empty database, then runs the latest migrations backwards
and forwards again. One process (Django starts once) and the owner role, like `manage.py migrate`:

    python manage.py migrate --noinput
    python scripts/check_migrations_reversible.py

Exits non-zero on the first migration that can't be reversed or re-applied.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent


def main() -> None:
    sys.path.insert(0, str(BACKEND))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
    os.environ.setdefault("MEDILINK_DB_ROLE", "owner")  # schema changes run as the owner role

    import django

    django.setup()

    from django.apps import apps
    from django.core.management import call_command
    from django.db import connection
    from django.db.migrations.loader import MigrationLoader

    graph = MigrationLoader(connection).graph
    labels = sorted(
        config.label for config in apps.get_app_configs() if config.name.startswith("medilink.")
    )
    for label in labels:
        for leaf in graph.leaf_nodes(label):
            parents = [name for app, name in graph.node_map[leaf].parents if app == label]
            target = parents[0] if parents else "zero"
            sys.stdout.write(f"== {label}: {leaf[1]} -> {target} -> latest\n")
            sys.stdout.flush()
            call_command("migrate", label, target, interactive=False, verbosity=0)
            call_command("migrate", interactive=False, verbosity=0)
    sys.stdout.write("All latest migrations reverse and re-apply cleanly.\n")


if __name__ == "__main__":
    main()
