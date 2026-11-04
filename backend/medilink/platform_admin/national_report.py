"""National aggregate report for the platform super admin (#208, upgrade 13 W9).

Load by facility and district, wait trends, top diagnoses by district and stock-outs, for a
period. Aggregates only: no patient names, IDs or records ever leave a facility.

**How the data is read.** One facility at a time, inside that facility's own RLS context
(`rls_context(facility_id=...)`), with the W6 facility-report helpers. This is the path the
console already uses to read across facilities; nothing bypasses row security.

**Small groups (k = 10).** A count of 1 to 9 patients or visits is hidden ("suppressed"), and so
is anything that would let someone work it back out:

- facility visits: hidden when 1-9; then, inside the same district, the next smallest facilities
  are hidden too until the hidden ones add up to 10 or more, so the district total minus the
  shown facilities never gives one small facility;
- district visits: hidden when 1-9 (then every facility in it with visits is hidden too);
- national visits: hidden when the hidden districts add up to 1-9;
- a median or 90th-percentile wait: hidden when fewer than 10 patients were called;
- diagnoses by district: only codes with 10 or more visits are listed, sensitive diagnoses never;
  no totals are shown that the hidden codes could be derived from.

Stock-outs are not about patients, so they are not suppressed. The CSV writes "suppressed"
where the screen shows a hidden cell.
"""

from __future__ import annotations

import datetime as dt
from collections import Counter, defaultdict
from typing import Any

from django.db.models import Count, Min

from medilink.tenancy.context import rls_context
from medilink.visits import report
from medilink.visits.models import Stage

K = 10
TOP = 10
TABLES = ("facilities", "districts", "waits", "diagnoses", "stockouts")
WAIT_STAGE = Stage.CONSULTATION  # the wait people feel: from arrival to the doctor's call
HIDDEN = "suppressed"
NO_DISTRICT = ""


# ---- small-group protection --------------------------------------------------------------------


def small(value: int) -> bool:
    return 0 < value < K


def protect(values: list[int]) -> set[int]:
    """Indexes to hide among the children of one shown total: every small value, then the next
    smallest shown values until the hidden ones add up to K or more (or every value is hidden).
    Zero is shown: it says nothing about anyone."""
    hidden = {i for i, v in enumerate(values) if small(v)}
    while hidden and sum(values[i] for i in hidden) < K:
        rest = sorted((v, i) for i, v in enumerate(values) if i not in hidden and v > 0)
        if not rest:
            break
        hidden.add(rest[0][1])
    return hidden


def _cell(value: int | None, hidden: bool) -> dict[str, Any]:
    return {"value": None if hidden else value, "suppressed": hidden}


def _wait(values: list[float]) -> dict[str, Any]:
    enough = len(values) >= K
    return {
        "median_min": report.median(values) if enough else None,
        "p90_min": report.p90(values) if enough else None,
        "suppressed": bool(values) and not enough,
    }


# ---- where facilities are ----------------------------------------------------------------------


def districts() -> dict[Any, tuple[str, str]]:
    """Facility ID to (district code, district name), from the location on its approved
    application (village up to district), like the command centre's network map."""
    from medilink.masterdata.models import LocationLevel
    from medilink.onboarding.models import Application

    out: dict[Any, tuple[str, str]] = {}
    rows = Application.objects.filter(facility__isnull=False).select_related(
        "village__parent__parent__parent__parent"
    )
    for application in rows:
        node = application.village
        while node is not None and node.level != LocationLevel.DISTRICT:
            node = node.parent
        if node is not None:
            out[application.facility_id] = (node.code, node.name)
    return out


def facilities() -> list[tuple[Any, str]]:
    """Facilities that see patients or did (live or suspended), by name."""
    from medilink.tenancy.models import Facility, FacilityStatus

    return list(
        Facility.objects.filter(status__in=[FacilityStatus.LIVE, FacilityStatus.SUSPENDED])
        .order_by("name")
        .values_list("pk", "name")
    )


# ---- one facility, in its own RLS context ------------------------------------------------------


def _facility_figures(facility_id: Any, start: dt.date, end: dt.date) -> dict[str, Any]:
    from medilink.clinical.models import ConsultationStatus, Diagnosis
    from medilink.pharmacy import stock
    from medilink.visits.models import Visit, VisitStatus

    with rls_context(facility_id=facility_id):
        visits = (
            Visit.objects.filter(
                facility_id=facility_id, service_date__gte=start, service_date__lte=end
            )
            .exclude(status=VisitStatus.CANCELLED)
            .count()
        )
        waits = [
            (day, minutes)
            for day, stage, minutes in report.wait_samples(facility_id, start, end)
            if stage == WAIT_STAGE
        ]
        diagnoses = list(
            Diagnosis.objects.filter(
                facility_id=facility_id,
                is_sensitive=False,
                consultation__status=ConsultationStatus.SIGNED,
                consultation__visit__service_date__gte=start,
                consultation__visit__service_date__lte=end,
            )
            .values("code")
            .annotate(n=Count("id"), display=Min("display"))
            .values_list("code", "display", "n")
        )
        out_now = sorted(
            stock.drug_display(c.drug)
            for c in stock.cards(facility_id)
            if stock.level(int(c.on_hand or 0), c.low_stock_threshold) == "out"
        )
    return {"visits": visits, "waits": waits, "diagnoses": diagnoses, "out_now": out_now}


# ---- the report --------------------------------------------------------------------------------


def national_report(start: dt.date, end: dt.date, group: str) -> dict[str, Any]:
    where = districts()
    rows: list[dict[str, Any]] = []
    for facility_id, name in facilities():
        code, district = where.get(facility_id, (NO_DISTRICT, ""))
        rows.append(
            {
                "id": facility_id,
                "name": name,
                "district_code": code,
                "district": district,
                **_facility_figures(facility_id, start, end),
            }
        )

    by_district: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_district[row["district_code"]].append(row)

    facility_out: list[dict[str, Any]] = []
    district_out: list[dict[str, Any]] = []
    hidden_district_sum = 0
    for code, members in sorted(by_district.items(), key=lambda kv: kv[1][0]["district"] or "~"):
        total = sum(r["visits"] for r in members)
        district_hidden = small(total)
        hidden = (
            {i for i, r in enumerate(members) if r["visits"]}
            if district_hidden
            else protect([r["visits"] for r in members])
        )
        if district_hidden:
            hidden_district_sum += total
        for i, r in enumerate(members):
            facility_out.append(
                {
                    "facility_id": r["id"],
                    "name": r["name"],
                    "district_code": code,
                    "district": r["district"],
                    "visits": _cell(r["visits"], i in hidden),
                    "wait": _wait([m for _d, m in r["waits"]]),
                    "medicines_out": len(r["out_now"]),
                }
            )
        district_out.append(
            {
                "district_code": code,
                "district": members[0]["district"],
                "facilities": len(members),
                "visits": _cell(total, district_hidden),
                "wait": _wait([m for r in members for _d, m in r["waits"]]),
                "medicines_out": sum(len(r["out_now"]) for r in members),
            }
        )
    facility_out.sort(key=lambda r: (r["district"] or "~", r["name"]))

    national = sum(r["visits"] for r in rows)
    pooled: dict[dt.date, list[float]] = defaultdict(list)
    for r in rows:
        for day, minutes in r["waits"]:
            pooled[report.bucket(day, group)].append(minutes)
    trend = [{"start": b, **_wait(pooled.get(b, []))} for b in report.buckets(start, end, group)]

    diagnoses: list[dict[str, Any]] = []
    for code, members in by_district.items():
        counts: Counter[str] = Counter()
        names: dict[str, str] = {}
        for r in members:
            for icd, display, n in r["diagnoses"]:
                counts[icd] += n
                names.setdefault(icd, display)
        top = [
            {"code": icd, "display": names[icd], "count": n}
            for icd, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
            if n >= K
        ][:TOP]
        if top:
            diagnoses.append(
                {"district_code": code, "district": members[0]["district"], "top": top}
            )
    diagnoses.sort(key=lambda d: d["district"] or "~")

    medicines: dict[str, dict[str, Any]] = {}
    for r in rows:
        for display in r["out_now"]:
            row = medicines.setdefault(display, {"medicine": display, "facilities": 0, "d": set()})
            row["facilities"] += 1
            if r["district"]:
                row["d"].add(r["district"])
    stockouts = [
        {"medicine": m["medicine"], "facilities": m["facilities"], "districts": sorted(m["d"])}
        for m in sorted(medicines.values(), key=lambda m: (-m["facilities"], m["medicine"]))
    ]

    return {
        "from": start,
        "to": end,
        "group": group,
        "min_group_size": K,
        "totals": {
            "facilities": len(rows),
            "districts": len([c for c in by_district if c]),
            "visits": _cell(national, small(hidden_district_sum)),
            "wait": _wait([m for r in rows for _d, m in r["waits"]]),
            "facilities_with_stockouts": sum(1 for r in rows if r["out_now"]),
        },
        "facilities": facility_out,
        "districts": district_out,
        "wait_trend": trend,
        "diagnoses": diagnoses,
        "stockouts": stockouts,
    }


# ---- CSV ---------------------------------------------------------------------------------------


def _v(cell: dict[str, Any]) -> Any:
    return HIDDEN if cell["suppressed"] else cell["value"]


def _w(wait: dict[str, Any], key: str) -> Any:
    return HIDDEN if wait["suppressed"] else wait[key]


def table_rows(data: dict[str, Any], table: str) -> list[list[Any]]:
    """One table as rows, the header first; hidden cells read "suppressed"."""
    note = [f"Groups of fewer than {K} patients or visits are suppressed."]
    if table == "facilities":
        head = ["Facility", "District", "Visits", "Median wait to the doctor (min)"]
        rows = [[*head, "90th percentile (min)", "Medicines out of stock now"]]
        rows += [
            [
                r["name"],
                r["district"],
                _v(r["visits"]),
                _w(r["wait"], "median_min"),
                _w(r["wait"], "p90_min"),
                r["medicines_out"],
            ]
            for r in data["facilities"]
        ]
    elif table == "districts":
        head = ["District", "Facilities", "Visits", "Median wait to the doctor (min)"]
        rows = [[*head, "90th percentile (min)", "Medicines out of stock now"]]
        rows += [
            [
                r["district"],
                r["facilities"],
                _v(r["visits"]),
                _w(r["wait"], "median_min"),
                _w(r["wait"], "p90_min"),
                r["medicines_out"],
            ]
            for r in data["districts"]
        ]
        t = data["totals"]
        rows += [["All districts", t["facilities"], _v(t["visits"]), _w(t["wait"], "median_min")]]
    elif table == "waits":
        rows = [["Period start", "Median wait to the doctor (min)", "90th percentile (min)"]]
        rows += [
            [r["start"].isoformat(), _w(r, "median_min"), _w(r, "p90_min")]
            for r in data["wait_trend"]
        ]
    elif table == "diagnoses":
        rows = [["District", "ICD-10", "Diagnosis", "Visits"]]
        rows += [
            [d["district"], r["code"], r["display"], r["count"]]
            for d in data["diagnoses"]
            for r in d["top"]
        ]
        note = [f"Only diagnoses with {K} or more visits in a district; sensitive ones never."]
    else:
        rows = [["Medicine", "Facilities out of stock now", "Districts"]]
        rows += [
            [r["medicine"], r["facilities"], "; ".join(r["districts"])] for r in data["stockouts"]
        ]
        note = ["Stock levels are as of now, not over the period."]
    return [*rows, [], note]


def export_csv(data: dict[str, Any], table: str) -> str:
    return report.csv_text(table_rows(data, table))
