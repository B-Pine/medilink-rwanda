"""manage.py verify_audit_chain: recompute the audit hash chain; exit code 1 on any mismatch."""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandError

from medilink.audit.services import verify_chain


class Command(BaseCommand):
    help = "Verify the audit log hash chain (sequence, links and content hashes)."

    def handle(self, *args: Any, **options: Any) -> None:
        report = verify_chain()
        if not report.ok:
            for error in report.errors:
                self.stderr.write(error)
            raise CommandError(f"Audit chain BROKEN: {len(report.errors)} problem(s) found.")
        self.stdout.write(
            self.style.SUCCESS(
                f"Audit chain OK: {report.count} entries verified. Head: {report.head}"
            )
        )
