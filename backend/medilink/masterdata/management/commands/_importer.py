"""Shared CSV import command: dry run unless --apply; idempotent; errors reported by line."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser

from medilink.audit.services import record
from medilink.masterdata import imports
from medilink.masterdata.models import ImportMode
from medilink.tenancy.context import rls_context


class ImportCommand(BaseCommand):
    kind = ""

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("path", help="UTF-8 CSV file")
        parser.add_argument(
            "--apply", action="store_true", help="Write the changes (default: dry run)"
        )
        parser.add_argument(
            "--retire-missing",
            action="store_true",
            help="Retire active rows that are not in the file",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        path = Path(options["path"])
        if not path.is_file():
            raise CommandError(f"No such file: {path}")
        mode = ImportMode.UPSERT_AND_RETIRE if options["retire_missing"] else ImportMode.UPSERT
        with rls_context():
            try:
                plan = imports.build_plan(self.kind, path.read_bytes(), mode)
            except imports.ImportFileError as exc:
                raise CommandError(str(exc)) from exc
            summary = plan.summary
            self.stdout.write(
                "{rows} rows: {create} to create, {update} to update, {retire} to retire, "
                "{unchanged} unchanged, {errors} errors".format(**summary)
            )
            for error in plan.errors:
                self.stdout.write(f"  line {error['line']} {error['field']}: {error['message']}")
            if plan.errors:
                raise CommandError("Fix the errors above; nothing was written.")
            if not options["apply"]:
                self.stdout.write("Dry run: nothing was written. Add --apply to write.")
                return
            counts = imports.apply_plan(self.kind, plan.as_json(), actor=None)
            record(
                "masterdata.import.applied",
                object_type="masterdata.import",
                metadata={"kind": self.kind, "source": "cli", **counts},
            )
            self.stdout.write(self.style.SUCCESS(f"Applied: {counts}"))
