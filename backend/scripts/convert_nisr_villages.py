"""Convert the NISR "List of Villages" (2019) to the `import_locations` CSV (issue #48).

    python scripts/convert_nisr_villages.py villages.csv nisr_raw.txt \
        medilink/masterdata/data/locations_nisr_2019.csv

`villages.csv` is the v1.4.1 release file of github.com/Derrick-MUGISHA/Rwanda-Province-District-
Sector-Cell-Village---in-Rwanda (CC BY 4.0): one row per village, NISR codes at every level,
parsed from NISR's PDF. `nisr_raw.txt` is that PDF as `pdftotext -raw` text, the reference for
the checks. Writes sectors, cells and villages (provinces and districts are in migration 0002).

The source carries PDF-parsing defects; each is repaired by a rule below and counted. The run
stops if a code is not under its parent, a code has two names, a province or district differs
from ours, or a village's name and cell do not precede its code in the PDF text (except the
three rows where the PDF itself is incomplete, listed in data/SOURCE.md).
"""

from __future__ import annotations

import csv
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

LEVELS = ("province", "district", "sector", "cell", "village")
NUM = r"(I{1,3}|Ii|Iii|Iv|IV|V)"
# Cell 450301: the source says "Bwisige" with garbled village names; the PDF reads
GACURABWENGE = {
    "45030101": "Gacurabwenge",
    "45030102": "Gasharu",
    "45030103": "Gashirwe",
    "45030104": "Rubyiniro",
    "45030105": "Ruyaga",
    "45030106": "Rwasama",
}
# The PDF row itself is incomplete or contradicts the code: keep the cell the code points to
PDF_INCOMPLETE = frozenset({"11050304", "34110309", "35080103"})
SEED = Path(__file__).resolve().parent.parent / "medilink/masterdata/migrations/_seed_0002.py"

Node = tuple[str, str, str]  # level, parent code, name
Row = dict[str, tuple[str, ...]]  # one village row: a Node per level, plus "_codes"


def tidy(name: str, fixes: Counter[str]) -> str:
    name = re.sub(r"\s+", " ", name).strip()
    if name.isupper() and len(name) > 3:  # every sector of three districts is in capitals
        name = " ".join(word.capitalize() for word in name.split(" "))
        fixes["capitals"] += 1
    return re.sub(rf"\b{NUM}\b", lambda m: m.group(1).upper(), name)  # Ii -> II


def repair(rows: list[dict[str, str]], fixes: Counter[str]) -> list[Row]:
    by_cell: dict[str, list[str]] = defaultdict(list)
    for r in rows:
        if r["cell_code"]:
            by_cell[r["cell_code"]].append(r["village"])
    # every village of a cell starts with one numeral: the numeral belongs to the cell
    cell_numeral = {}
    for code, villages in by_cell.items():
        heads = {m.group(1) if (m := re.match(rf"^{NUM} \S", v)) else None for v in villages}
        if len(heads) == 1 and None not in heads:
            cell_numeral[code] = str(heads.pop()).upper()

    out = []
    for r in rows:
        sector, cell, village = r["sector"], r["cell"], r["village"]
        cell_code, code = r["cell_code"], r["village_code"]
        if r["sector_code"] == "1110":  # "RwezamenyoKabuguru": sector Rwezamenyo, Kabuguru I/II
            sector = "Rwezamenyo"
            if re.fullmatch(NUM, cell):
                cell = f"Kabuguru {cell}"
                fixes["Kabuguru cells"] += 1
        if cell == "GikundamvuraGikundamvura":
            cell = "Gikundamvura"
            village = village.removeprefix("Gikundamvura ")
            fixes["Gikundamvura"] += 1
        if cell_code == "450301":
            cell, village = "Gacurabwenge", GACURABWENGE[code]
            fixes["Gacurabwenge from the PDF"] += 1
        if not cell_code:  # merged I/II cell: the code from the village, the numeral to the cell
            cell_code = code[:6]
            rest = village.removeprefix(cell + " ")
            m = re.match(rf"^{NUM} (.+)$", rest)
            if m is None:
                sys.exit(f"Cannot split the cell of village {code} {village!r}")
            cell, village = f"{cell} {m.group(1).upper()}", m.group(2)
            fixes["uncoded cell split"] += 1
        elif cell_code in cell_numeral:
            village = re.sub(rf"^{NUM} ", "", village)
            cell = f"{cell} {cell_numeral[cell_code]}"
            fixes["numeral moved to the cell"] += 1
        if re.fullmatch(NUM, village):  # a village called just "II" is "<cell> II"
            village = f"{cell} {village.upper()}"
            fixes["numeral-only village"] += 1
        codes = (r["province_code"], r["district_code"], r["sector_code"], cell_code, code)
        out.append(
            {
                "province": ("province", "", r["province"]),
                "district": ("district", r["province_code"], r["district"]),
                "sector": ("sector", r["district_code"], tidy(sector, fixes)),
                "cell": ("cell", r["sector_code"], tidy(cell, fixes)),
                "village": ("village", cell_code, tidy(village, fixes)),
                "_codes": codes,
            }
        )
    return out


def build(repaired: list[Row]) -> dict[str, Node]:
    nodes: dict[str, Node] = {}
    for row in repaired:
        for level, code in zip(LEVELS, row["_codes"], strict=True):
            level_, parent, name = row[level]
            node = (level_, parent, name)
            if node[1] and not code.startswith(node[1]):
                sys.exit(f"{level} {code} is not under {node[1]}")
            if nodes.setdefault(code, node) != node:
                sys.exit(f"Code {code} has two entries: {nodes[code]} and {node}")
    return nodes


def check_seed(nodes: dict[str, Node]) -> None:
    text = SEED.read_text(encoding="utf-8")
    ours = dict(re.findall(r'\("(\d{1,2})",\s*(?:"\d"\s*,\s*)?"([^"]+)"', text))
    for code, (level, _parent, name) in nodes.items():
        if level in ("province", "district") and ours.get(code, "").lower() != name.lower():
            sys.exit(f"{level} {code}: ours {ours.get(code)!r}, source {name!r}")


def check_pdf(nodes: dict[str, Node], raw_text: str) -> None:
    def squash(value: str) -> str:
        return re.sub(r"[^a-z0-9]", "", value.lower())

    flat = squash(raw_text)
    position = {m.group(1): m.start() for m in re.finditer(r"(\d{8})(ge|sas|microgrid)", flat)}
    villages = {c: n for c, n in nodes.items() if n[0] == "village"}
    if set(position) != set(villages):
        sys.exit(f"Village codes differ from the PDF: {sorted(set(position) ^ set(villages))[:10]}")
    differ = []
    for code, (_level, parent, name) in villages.items():
        before = flat[max(0, position[code] - 120) : position[code]]
        cell = squash(re.sub(rf" {NUM}$", "", nodes[parent][2]))
        if not before.endswith(squash(name)) or cell not in before[-len(squash(name)) - 40 :]:
            differ.append(code)
    if set(differ) != PDF_INCOMPLETE:
        sys.exit(f"Villages differing from the PDF: {sorted(differ)}")


def main() -> None:
    source, raw_pdf, output = (Path(arg) for arg in sys.argv[1:4])
    with source.open(encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    fixes: Counter[str] = Counter()
    nodes = build(repair(rows, fixes))
    check_seed(nodes)
    check_pdf(nodes, raw_pdf.read_text(encoding="utf-8", errors="replace"))
    counts = Counter(level for level, _p, _n in nodes.values())
    with output.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(["code", "level", "parent_code", "name"])
        for code, (level, parent, name) in sorted(
            nodes.items(), key=lambda item: (LEVELS.index(item[1][0]), item[0])
        ):
            if level in ("sector", "cell", "village"):
                writer.writerow([code, level, parent, name])
    summary = {level: counts[level] for level in LEVELS}
    sys.stdout.write(f"Repairs: {dict(fixes)}\nCounts: {summary}\n")


if __name__ == "__main__":
    main()
