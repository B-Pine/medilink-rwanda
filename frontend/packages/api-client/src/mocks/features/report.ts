/**
 * Facility report mock (#205, upgrade 13 W6): deterministic synthetic figures for a period, so
 * screens and tests are stable. Aggregates only, like the server.
 */
import type { FacilityReport, ReportGroup, ReportTable } from "../../features/queue";
import { SETUP_IDS } from "./setup";

const DAY = 86_400_000;
const KIGALI_OFFSET = 2 * 3_600_000;
export const REPORT_GROUPS: readonly ReportGroup[] = ["day", "week", "month"];
export const REPORT_TABLES: readonly ReportTable[] = [
  "visits",
  "sources",
  "services",
  "waits",
  "diagnoses",
  "money",
  "lab",
  "stock",
];
export const REPORT_MAX_DAYS = 366;

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function bucket(date: string, group: ReportGroup): string {
  if (group === "month") return `${date.slice(0, 7)}-01`;
  if (group === "week") {
    const ms = Date.parse(date);
    const weekday = (new Date(ms).getUTCDay() + 6) % 7; // Monday = 0
    return iso(ms - weekday * DAY);
  }
  return date;
}

/** The validated period, or the field errors (same rules as the server). */
export function reportPeriod(
  url: URL,
): { from: string; to: string; group: ReportGroup } | { errors: Record<string, string> } {
  // Kigali's date (UTC+2, no daylight saving), like the server: in UTC, "today" in Kigali is
  // still tomorrow between 00:00 and 02:00, which wrongly refused the current day then.
  const today = iso(Date.now() + KIGALI_OFFSET);
  const errors: Record<string, string> = {};
  const read = (name: string, fallback: string) => {
    const raw = url.searchParams.get(name);
    if (!raw) return fallback;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) {
      errors[name] = "Use YYYY-MM-DD.";
      return fallback;
    }
    return raw;
  };
  const to = read("to", today);
  const from = read("from", iso(Date.parse(to) - 29 * DAY));
  const group = (url.searchParams.get("group") || "day") as ReportGroup;
  if (!REPORT_GROUPS.includes(group)) errors.group = "Use day, week or month.";
  if (from > to) errors.from = "The first day comes after the last day.";
  else if ((Date.parse(to) - Date.parse(from)) / DAY + 1 > REPORT_MAX_DAYS)
    errors.from = `Choose at most ${REPORT_MAX_DAYS} days.`;
  if (to > today) errors.to = "The last day can't be in the future.";
  return Object.keys(errors).length ? { errors } : { from, to, group };
}

export function facilityReportMock(from: string, to: string, group: ReportGroup): FacilityReport {
  const periods = new Map<string, FacilityReport["visits"]["periods"][number]>();
  for (let ms = Date.parse(from); ms <= Date.parse(to); ms += DAY) {
    const date = iso(ms);
    const back = Math.round((Date.now() - ms) / DAY);
    const weekday = new Date(ms).getUTCDay();
    const patients = weekday === 0 ? 0 : weekday === 6 ? 9 : 18 + ((back * 7) % 9);
    const key = bucket(date, group);
    const row = periods.get(key) ?? {
      start: key,
      patients: 0,
      completed: 0,
      left_without_service: 0,
      emergencies: 0,
      no_shows: 0,
    };
    row.patients += patients;
    row.completed += Math.max(0, patients - 2);
    row.left_without_service += patients ? back % 2 : 0;
    row.emergencies += back % 3 === 0 && patients ? 1 : 0;
    row.no_shows += patients ? back % 2 : 0;
    periods.set(key, row);
  }
  const rows = [...periods.values()];
  const sum = (k: keyof (typeof rows)[number]) =>
    rows.reduce((n, r) => n + (typeof r[k] === "number" ? r[k] : 0), 0);
  const patients = sum("patients");
  const noShows = sum("no_shows");
  const expected = Math.round(patients * 0.35) + noShows;
  const share = (pct: number) => Math.round((patients * pct) / 100);
  return {
    from,
    to,
    group,
    visits: {
      periods: rows,
      totals: {
        patients,
        completed: sum("completed"),
        left_without_service: sum("left_without_service"),
        emergencies: sum("emergencies"),
        bookings_expected: expected,
        no_shows: noShows,
        no_show_rate_pct: expected ? Math.round((100 * noShows) / expected) : null,
      },
      by_source: [
        { source: "walk_in", count: share(52) },
        { source: "online_booking", count: share(26) },
        { source: "phone_booking", count: share(9) },
        { source: "follow_up", count: share(7) },
        { source: "referral", count: share(4) },
        { source: "emergency", count: sum("emergencies") },
      ].filter((r) => r.count > 0),
      by_service: [
        {
          service_id: SETUP_IDS.sGen,
          name_i18n: {
            en: "General consultation",
            rw: "Kwisuzumisha rusange",
            fr: "Consultation générale",
          },
          count: share(71),
        },
        {
          service_id: SETUP_IDS.sPed,
          name_i18n: { en: "Child consultation", rw: "Kuvura abana", fr: "Consultation enfant" },
          count: share(29),
        },
      ].filter((r) => r.count > 0),
    },
    waits: patients
      ? [
          {
            stage: "reception",
            tickets: patients,
            called: patients,
            median_wait_min: 6,
            p90_wait_min: 14,
            left_without_service: 0,
          },
          {
            stage: "triage",
            tickets: share(60),
            called: share(60),
            median_wait_min: 11,
            p90_wait_min: 25,
            left_without_service: 0,
          },
          {
            stage: "consultation",
            tickets: patients,
            called: patients - sum("left_without_service"),
            median_wait_min: 38,
            p90_wait_min: 82,
            left_without_service: sum("left_without_service"),
          },
          {
            stage: "lab",
            tickets: share(22),
            called: share(22),
            median_wait_min: 17,
            p90_wait_min: 41,
            left_without_service: 0,
          },
          {
            stage: "pharmacy",
            tickets: share(64),
            called: share(64),
            median_wait_min: 9,
            p90_wait_min: 22,
            left_without_service: 0,
          },
        ]
      : [],
    diagnoses: {
      signed_with_diagnosis: sum("completed"),
      sensitive_count: share(2),
      top: [
        { code: "B54", display: "Malaria, unspecified", count: share(18) },
        { code: "J06.9", display: "Acute upper respiratory infection", count: share(14) },
        { code: "A09", display: "Gastroenteritis and colitis", count: share(8) },
        { code: "I10", display: "Essential (primary) hypertension", count: share(6) },
        { code: "N39.0", display: "Urinary tract infection", count: share(5) },
        { code: "E11.9", display: "Type 2 diabetes mellitus", count: share(3) },
      ].filter((r) => r.count > 0),
      referrals_out: share(3),
      referrals_by_specialty: [
        { specialty: "Internal medicine", count: share(1.4) },
        { specialty: "Obstetrics", count: share(0.9) },
        { specialty: "Paediatrics", count: share(0.7) },
      ].filter((r) => r.count > 0),
    },
    money: {
      collected_rwf: patients * 2_150,
      billed_rwf: patients * 6_400,
      by_method: [
        { method: "cash", count: share(48), amount_rwf: patients * 1_050 },
        { method: "mtn_momo", count: share(37), amount_rwf: patients * 820 },
        { method: "airtel_money", count: share(9), amount_rwf: patients * 210 },
        { method: "card", count: share(2), amount_rwf: patients * 70 },
      ].filter((r) => r.count > 0),
      by_insurer: [
        {
          insurer_code: "mutuelle",
          insurer_name: "Mutuelle de Santé",
          bills: share(41),
          insurer_share_rwf: patients * 2_300,
          patient_share_rwf: patients * 260,
        },
        {
          insurer_code: "rama",
          insurer_name: "RAMA (RSSB)",
          bills: share(14),
          insurer_share_rwf: patients * 1_500,
          patient_share_rwf: patients * 170,
        },
        {
          insurer_code: "mmi",
          insurer_name: "MMI",
          bills: share(5),
          insurer_share_rwf: patients * 560,
          patient_share_rwf: patients * 60,
        },
      ].filter((r) => r.bills > 0),
      exemptions: patients
        ? [
            { reason: "indigent", count: share(2), amount_rwf: patients * 40 },
            { reason: "public_programme", count: share(1), amount_rwf: patients * 25 },
          ].filter((r) => r.count > 0)
        : [],
      voided_payments: { count: share(0.5), amount_rwf: patients * 8 },
      voided_bills: share(0.3),
      credit_notes: { count: share(0.4), amount_rwf: patients * 12 },
      refunds_paid_rwf: patients * 9,
    },
    lab: {
      ordered: share(22),
      cancelled: share(0.5),
      resulted: share(21),
      waiting: 2,
      median_turnaround_min: patients ? 46 : null,
      p90_turnaround_min: patients ? 118 : null,
      by_test: [
        { code: "MRDT", name: "Malaria rapid test", count: share(11), abnormal: share(4) },
        { code: "FBC", name: "Full blood count", count: share(5), abnormal: share(1) },
        { code: "URINE", name: "Urinalysis", count: share(3), abnormal: share(1) },
        { code: "GLU", name: "Blood glucose", count: share(2), abnormal: share(0.5) },
      ]
        .filter((r) => r.count > 0)
        .map((r, i) => ({ ...r, median_turnaround_min: [24, 72, 51, 18][i] ?? null })),
    },
    stock: {
      tracked: 42,
      out_now: 2,
      low_now: 5,
      out_medicines: ["Amoxicillin 250 mg capsule", "ORS sachet"],
      received_units: share(310),
      dispensed_units: share(255),
      adjusted_units: -share(3),
      expiring: [
        {
          drug_code: "PCM500",
          display: "Paracetamol 500 mg tablet",
          batch_number: "PC-2311",
          expiry_date: iso(Date.now() - 4 * DAY),
          quantity_on_hand: 40,
          is_expired: true,
        },
        {
          drug_code: "ALU20",
          display: "Artemether/Lumefantrine 20/120 mg tablet",
          batch_number: "AL-0907",
          expiry_date: iso(Date.now() + 19 * DAY),
          quantity_on_hand: 180,
          is_expired: false,
        },
        {
          drug_code: "MTZ250",
          display: "Metronidazole 250 mg tablet",
          batch_number: "MZ-118",
          expiry_date: iso(Date.now() + 47 * DAY),
          quantity_on_hand: 95,
          is_expired: false,
        },
      ],
      expiring_window_days: 60,
    },
  };
}

/** A small CSV of one table (headings like the server's). */
export function facilityReportCsv(report: FacilityReport, table: ReportTable): string {
  const lines: (string | number | null)[][] =
    table === "visits"
      ? [
          [
            "Period start",
            "Patients",
            "Completed",
            "Left without service",
            "Emergencies",
            "No-shows",
          ],
          ...report.visits.periods.map((p) => [
            p.start,
            p.patients,
            p.completed,
            p.left_without_service,
            p.emergencies,
            p.no_shows,
          ]),
        ]
      : table === "waits"
        ? [
            ["Stage", "Tickets", "Called", "Median wait (min)", "90th percentile (min)"],
            ...report.waits.map((w) => [
              w.stage,
              w.tickets,
              w.called,
              w.median_wait_min,
              w.p90_wait_min,
            ]),
          ]
        : [["Table", table]];
  return "﻿" + lines.map((l) => l.map((c) => c ?? "").join(",")).join("\r\n") + "\r\n";
}
