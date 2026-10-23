"""manage.py seed_masterdata_dev: development-only sample locations below the district level, so
the facility application wizard can pick a village. Refuses to run unless DEBUG.

Codes start with "DEV-" and village names are placeholders: real sectors, cells and villages come
from the official NISR file through `import_locations`.
"""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from medilink.masterdata import services
from medilink.masterdata.kinds import KINDS
from medilink.masterdata.models import Location
from medilink.tenancy.context import rls_context

# district code -> sector -> cells
SAMPLE = {
    "12": {"Kimironko": ["Bibare", "Kibagabaga", "Nyagatovu"]},
    "11": {"Nyarugenge": ["Kiyovu", "Rwampara"]},
}
VILLAGES_PER_CELL = 2


class Command(BaseCommand):
    help = "Seed sample sectors, cells and villages (DEBUG only, DEV- codes)."

    def handle(self, *args: Any, **options: Any) -> None:
        if not settings.DEBUG:
            raise CommandError("seed_masterdata_dev runs only with DEBUG=True.")
        kind = KINDS["locations"]
        created = 0
        with rls_context():
            for district_code, sectors in SAMPLE.items():
                for s_index, (sector, cells) in enumerate(sectors.items(), start=1):
                    sector_code = f"DEV-{district_code}{s_index:02d}"
                    created += self._ensure(kind, sector_code, "sector", district_code, sector)
                    for c_index, cell in enumerate(cells, start=1):
                        cell_code = f"{sector_code}{c_index:02d}"
                        created += self._ensure(kind, cell_code, "cell", sector_code, cell)
                        for v in range(1, VILLAGES_PER_CELL + 1):
                            created += self._ensure(
                                kind,
                                f"{cell_code}{v:02d}",
                                "village",
                                cell_code,
                                f"{cell} {v} (sample)",
                            )
        self.stdout.write(f"Sample locations: {created} created.")

    @staticmethod
    def _ensure(kind: Any, code: str, level: str, parent_code: str, name: str) -> int:
        if Location.objects.filter(code=code).exists():
            return 0
        services.create(
            kind,
            {"code": code, "level": level, "parent_code": parent_code, "name": name},
            actor=None,
            audit=False,
        )
        return 1
