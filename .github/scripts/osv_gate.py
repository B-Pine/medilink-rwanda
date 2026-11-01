"""Fail when osv-scanner found a fixable high or critical vulnerability (security 09 §3).

osv-scanner has no severity threshold of its own. This reads its JSON report and fails only on
groups with CVSS >= 7.0 that have a fixed version; everything else is printed as a notice.

    python3 .github/scripts/osv_gate.py osv.json
"""

from __future__ import annotations

import json
import sys

THRESHOLD = 7.0


def fixable(ids: list[str], vulns: dict[str, dict]) -> bool:
    return any(
        "fixed" in event
        for vid in ids
        for affected in vulns.get(vid, {}).get("affected", [])
        for rng in affected.get("ranges", [])
        for event in rng.get("events", [])
    )


def main(path: str) -> int:
    with open(path, encoding="utf-8") as handle:
        report = json.load(handle)
    blocking: list[str] = []
    other = 0
    for result in report.get("results", []):
        source = result.get("source", {}).get("path", "")
        for pkg in result.get("packages", []):
            name = pkg["package"]["name"]
            version = pkg["package"].get("version", "")
            vulns = {v["id"]: v for v in pkg.get("vulnerabilities", [])}
            for group in pkg.get("groups", []):
                try:
                    score = float(group.get("max_severity") or 0)
                except ValueError:
                    score = 0.0
                line = f"{source}: {name} {version}: {', '.join(group['ids'])} (CVSS {score})"
                if score >= THRESHOLD and fixable(group["ids"], vulns):
                    blocking.append(line)
                else:
                    other += 1
                    sys.stdout.write(f"::notice::{line}\n")
    for line in blocking:
        sys.stdout.write(f"::error::{line}\n")
    sys.stdout.write(f"{len(blocking)} fixable high/critical, {other} other finding(s)\n")
    return 1 if blocking else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
