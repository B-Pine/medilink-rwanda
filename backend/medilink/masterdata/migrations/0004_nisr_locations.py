"""Rwanda's sectors, cells and villages with NISR codes (issue #48; data/SOURCE.md).

Adds only codes that are not there yet, so it is safe where `import_locations` already ran.
Reversing removes the rows this file lists, villages first; it fails if a facility or
application still uses one (PROTECT).
"""

import csv
from pathlib import Path
from typing import Any

from django.db import migrations

from medilink.core.ids import uuid7

DATA = Path(__file__).resolve().parent.parent / "data" / "locations_nisr_2019.csv"
LEVELS = ("sector", "cell", "village")


def _rows() -> list[dict[str, str]]:
    with DATA.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def forwards(apps: Any, schema_editor: Any) -> None:
    location = apps.get_model("masterdata", "Location")
    known = dict(location.objects.values_list("code", "id"))
    rows = _rows()
    for level in LEVELS:  # parents first: sectors need districts, cells need sectors
        new = [
            location(
                id=uuid7(),
                level=level,
                code=row["code"],
                parent_id=known[row["parent_code"]],
                name=row["name"],
            )
            for row in rows
            if row["level"] == level and row["code"] not in known
        ]
        location.objects.bulk_create(new, batch_size=2000)
        known.update((item.code, item.id) for item in new)


def backwards(apps: Any, schema_editor: Any) -> None:
    location = apps.get_model("masterdata", "Location")
    rows = _rows()
    for level in reversed(LEVELS):
        codes = [row["code"] for row in rows if row["level"] == level]
        for start in range(0, len(codes), 2000):
            location.objects.filter(level=level, code__in=codes[start : start + 2000]).delete()


class Migration(migrations.Migration):
    dependencies = [("masterdata", "0003_s5")]

    operations = [migrations.RunPython(forwards, backwards, elidable=False)]
