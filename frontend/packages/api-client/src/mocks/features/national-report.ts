import type {
  NationalDistrictRow,
  NationalFacilityRow,
  NationalReport,
  NationalTable,
  SuppressedCount,
  WaitFigures,
} from "../../features/console";
import type { ReportGroup } from "../../features/queue";
import { bucket } from "./report";

/**
 * W9 (#208) national report mock: seven facilities in four districts, with the server's
 * small-group rule (k = 10). Muhoza Health Post saw 6 patients, so it is hidden and so is the
 * smallest other Rubavu facility (the district total minus the shown facility must not give it
 * away). Kicukiro has one facility with 4 visits: the district total is hidden too, and with it
 * the national total. Two medicines are out of stock.
 */
const DAY = 86_400_000;
const K = 10;

interface Seed {
  name: string;
  district: string;
  code: string;
  perDay: number;
  /** A fixed count for the whole period instead of `perDay`. */
  fixed?: number;
  wait: number;
  out: string[];
}

const AMOX = "Amoxicillin 500 mg capsule";
const SEED: Seed[] = [
  { name: "Kigali Clinic", district: "Gasabo", code: "RW-GAS", perDay: 22, wait: 34, out: [] },
  {
    name: "Remera Health Center",
    district: "Gasabo",
    code: "RW-GAS",
    perDay: 31,
    wait: 52,
    out: [AMOX],
  },
  {
    name: "Kibagabaga Hospital",
    district: "Gasabo",
    code: "RW-GAS",
    perDay: 48,
    wait: 61,
    out: [],
  },
  {
    name: "Gisenyi District Hospital",
    district: "Rubavu",
    code: "RW-RUB",
    perDay: 2,
    wait: 40,
    out: [AMOX, "ORS sachet"],
  },
  {
    name: "Muhoza Health Post",
    district: "Rubavu",
    code: "RW-RUB",
    perDay: 0,
    fixed: 6,
    wait: 30,
    out: [],
  },
  {
    name: "Nyamata Clinic",
    district: "Kicukiro",
    code: "RW-KIC",
    perDay: 0,
    fixed: 4,
    wait: 25,
    out: [],
  },
  { name: "Musanze Clinic", district: "Musanze", code: "RW-MUS", perDay: 9, wait: 28, out: [] },
];

const small = (v: number) => v > 0 && v < K;
const shown = (value: number, hidden: boolean): SuppressedCount => ({
  value: hidden ? null : value,
  suppressed: hidden,
});
const wait = (median: number, called: number): WaitFigures =>
  called >= K
    ? { median_min: median, p90_min: Math.round(median * 1.8), suppressed: false }
    : { median_min: null, p90_min: null, suppressed: called > 0 };

/** Indexes to hide: small values, then the next smallest until the hidden add up to K. */
function protect(values: number[]): Set<number> {
  const hidden = new Set(values.flatMap((v, i) => (small(v) ? [i] : [])));
  const sum = () => [...hidden].reduce((s, i) => s + values[i]!, 0);
  while (hidden.size && sum() < K) {
    const next = values
      .map((v, i) => [v, i] as const)
      .filter(([v, i]) => !hidden.has(i) && v > 0)
      .sort((a, b) => a[0] - b[0])[0];
    if (!next) break;
    hidden.add(next[1]);
  }
  return hidden;
}

export function nationalReportMock(from: string, to: string, group: ReportGroup): NationalReport {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
  const visits = (s: Seed) => s.fixed ?? s.perDay * days;
  const facilities: NationalFacilityRow[] = [];
  const districts: NationalDistrictRow[] = [];
  let hiddenDistricts = 0;
  for (const code of [...new Set(SEED.map((s) => s.code))]) {
    const members = SEED.filter((s) => s.code === code);
    const counts = members.map(visits);
    const total = counts.reduce((a, b) => a + b, 0);
    const districtHidden = small(total);
    if (districtHidden) hiddenDistricts += total;
    const hidden = districtHidden
      ? new Set(counts.flatMap((v, i) => (v ? [i] : [])))
      : protect(counts);
    members.forEach((s, i) =>
      facilities.push({
        facility_id: `f9000000-0000-4000-8000-00000000000${SEED.indexOf(s) + 1}`,
        name: s.name,
        district_code: s.code,
        district: s.district,
        visits: shown(counts[i]!, hidden.has(i)),
        wait: wait(s.wait, Math.round(counts[i]! * 0.8)),
        medicines_out: s.out.length,
      }),
    );
    districts.push({
      district_code: code,
      district: members[0]!.district,
      facilities: members.length,
      visits: shown(total, districtHidden),
      wait: wait(
        Math.round(members.reduce((sum, s) => sum + s.wait, 0) / members.length),
        Math.round(total * 0.8),
      ),
      medicines_out: members.reduce((sum, s) => sum + s.out.length, 0),
    });
  }
  const starts: string[] = [];
  for (let ms = Date.parse(from); ms <= Date.parse(to); ms += DAY) {
    const start = bucket(new Date(ms).toISOString().slice(0, 10), group);
    if (starts.at(-1) !== start) starts.push(start);
  }
  const wait_trend = starts.map((start, i) =>
    // Sundays are quiet: too few patients called, so the day's figures are hidden
    group === "day" && new Date(Date.parse(start)).getUTCDay() === 0
      ? { start, median_min: null, p90_min: null, suppressed: true }
      : { start, ...wait(44 + ((i * 7) % 13), 100) },
  );
  const gasabo = [
    { code: "J06.9", display: "Acute upper respiratory infection", count: 14 * days },
    { code: "B54", display: "Malaria, unspecified", count: 9 * days },
    { code: "A09", display: "Diarrhoea and gastroenteritis", count: 4 * days },
  ].filter((r) => r.count >= K);
  const musanze = [
    { code: "J06.9", display: "Acute upper respiratory infection", count: 3 * days },
  ].filter((r) => r.count >= K);
  return {
    from,
    to,
    group,
    min_group_size: K,
    totals: {
      facilities: SEED.length,
      districts: districts.length,
      visits: shown(
        SEED.reduce((s, x) => s + visits(x), 0),
        small(hiddenDistricts),
      ),
      wait: wait(47, 1000),
      facilities_with_stockouts: SEED.filter((s) => s.out.length).length,
    },
    facilities: facilities.sort(
      (a, b) => a.district.localeCompare(b.district) || a.name.localeCompare(b.name),
    ),
    districts: districts.sort((a, b) => a.district.localeCompare(b.district)),
    wait_trend,
    diagnoses: [
      { district_code: "RW-GAS", district: "Gasabo", top: gasabo },
      { district_code: "RW-MUS", district: "Musanze", top: musanze },
    ].filter((d) => d.top.length),
    stockouts: [
      { medicine: AMOX, facilities: 2, districts: ["Gasabo", "Rubavu"] },
      { medicine: "ORS sachet", facilities: 1, districts: ["Rubavu"] },
    ],
  };
}

type Cell = string | number | null;
const csvCell = (v: Cell) =>
  v === null ? "" : typeof v === "number" ? String(v) : `"${v.replace(/"/g, '""')}"`;
const count = (c: SuppressedCount): Cell => (c.suppressed ? "suppressed" : c.value);
const w = (x: WaitFigures, key: "median_min" | "p90_min"): Cell =>
  x.suppressed ? "suppressed" : x[key];
const LOAD = ["Visits", "Median wait to the doctor (min)", "90th percentile (min)"];

export function nationalReportCsv(report: NationalReport, table: NationalTable): string {
  const rows: Cell[][] = [];
  if (table === "facilities") {
    rows.push(["Facility", "District", ...LOAD, "Medicines out of stock now"]);
    for (const f of report.facilities)
      rows.push([
        f.name,
        f.district,
        count(f.visits),
        w(f.wait, "median_min"),
        w(f.wait, "p90_min"),
        f.medicines_out,
      ]);
  } else if (table === "districts") {
    rows.push(["District", "Facilities", ...LOAD, "Medicines out of stock now"]);
    for (const d of report.districts)
      rows.push([
        d.district,
        d.facilities,
        count(d.visits),
        w(d.wait, "median_min"),
        w(d.wait, "p90_min"),
        d.medicines_out,
      ]);
  } else if (table === "waits") {
    rows.push(["Period start", "Median wait to the doctor (min)", "90th percentile (min)"]);
    for (const r of report.wait_trend) rows.push([r.start, w(r, "median_min"), w(r, "p90_min")]);
  } else if (table === "diagnoses") {
    rows.push(["District", "ICD-10", "Diagnosis", "Visits"]);
    for (const d of report.diagnoses)
      for (const r of d.top) rows.push([d.district, r.code, r.display, r.count]);
  } else {
    rows.push(["Medicine", "Facilities out of stock now", "Districts"]);
    for (const r of report.stockouts) rows.push([r.medicine, r.facilities, r.districts.join("; ")]);
  }
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
