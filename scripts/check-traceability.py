#!/usr/bin/env python3
"""Check that docs/qa/traceability-matrix.md lists every requirement ID exactly once.

Reads the requirement tables (| FR-XXX-NN | text | Pn |) in docs/analysis/*.md and the
first column of the matrix tables. Exits with 1 if an ID is missing, unknown or duplicated,
or if a status value is not one of the allowed values.

Usage: python scripts/check-traceability.py
"""
from __future__ import annotations

import collections
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ANALYSIS = ROOT / "docs" / "analysis"
MATRIX = ROOT / "docs" / "qa" / "traceability-matrix.md"
STATUSES = {"Not started", "In progress", "Implemented", "Verified", "Accepted"}

REQ_ROW = re.compile(r"^\|\s*((?:FR|NFR)-[A-Z]+-\d+)\s*\|.*\|\s*(P[1-4](?:[–-]P[1-4])?)\s*\|\s*$")
MATRIX_ROW = re.compile(r"^\|\s*((?:FR|NFR)-[A-Z]+-\d+)\s*\|")


def main() -> int:
    defined: dict[str, str] = {}
    for path in sorted(ANALYSIS.glob("*.md")):
        for line in path.read_text(encoding="utf-8").splitlines():
            match = REQ_ROW.match(line)
            if match:
                if match.group(1) in defined:
                    print(f"duplicate requirement ID in analysis: {match.group(1)}")
                defined[match.group(1)] = path.name

    listed = collections.Counter()
    bad_status = []
    for line in MATRIX.read_text(encoding="utf-8").splitlines():
        match = MATRIX_ROW.match(line)
        if not match:
            continue
        listed[match.group(1)] += 1
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        # A status may carry the sprint and version, e.g. 'Verified (S4, backend-v0.5.0)' (QA README §3).
        if cells[-1].split(" (", 1)[0] not in STATUSES:
            bad_status.append((match.group(1), cells[-1]))

    missing = sorted(set(defined) - set(listed))
    unknown = sorted(set(listed) - set(defined))
    duplicated = sorted(k for k, v in listed.items() if v > 1)

    per_prefix = collections.Counter("-".join(i.split("-")[:2]) for i in defined)
    for prefix, count in per_prefix.items():
        print(f"{prefix:9} {count:3}")
    print(f"{'total':9} {len(defined):3} defined, {len(listed)} listed in the matrix")

    for label, items in (("missing", missing), ("unknown", unknown), ("duplicated", duplicated)):
        if items:
            print(f"{label}: {', '.join(items)}")
    for req_id, status in bad_status:
        print(f"invalid status for {req_id}: {status!r}")

    return 1 if (missing or unknown or duplicated or bad_status) else 0


if __name__ == "__main__":
    sys.exit(main())
