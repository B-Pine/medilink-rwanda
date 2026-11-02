import { http, HttpResponse } from "msw";

import type {
  AuditEntryRow,
  FacilityPeriodReport,
  PlatformReport,
  ReportDay,
} from "../../features/reports";
import { MOCK_PASSWORD } from "../data";
import type { FeatureMockFactory } from "../features";
import { id, page, s1, stepUpFailure } from "./s1-common";

/** S10 part 2b mocks (sprint-10c §3): synthetic, deterministic figures for Kigali Clinic. */

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function days(from: string, to: string): ReportDay[] {
  const out: ReportDay[] = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += DAY) {
    const n = new Date(t).getUTCDay();
    const patients = n === 0 ? 0 : 18 + ((t / DAY) % 9);
    out.push({
      date: iso(t),
      patients,
      completed: Math.max(patients - 2, 0),
      median_wait_min: patients ? 24 + ((t / DAY) % 13) : null,
      p90_wait_min: patients ? 58 + ((t / DAY) % 20) : null,
      avg_consult_min: patients ? 12 : null,
      left_rate_pct: patients ? 4 : null,
      walk_ins: Math.round(patients * 0.6),
      emergencies: n === 3 ? 1 : 0,
    });
  }
  return out;
}

function report(from: string, to: string): FacilityPeriodReport {
  const rows = days(from, to);
  const patients = rows.reduce((s, d) => s + d.patients, 0);
  const waits = rows.flatMap((d) => (d.median_wait_min === null ? [] : [d.median_wait_min]));
  return {
    from,
    to,
    totals: {
      patients,
      completed: rows.reduce((s, d) => s + d.completed, 0),
      walk_ins: rows.reduce((s, d) => s + d.walk_ins, 0),
      emergencies: rows.reduce((s, d) => s + d.emergencies, 0),
      median_wait_min: waits.length
        ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length)
        : null,
    },
    days: rows,
    bookings: { booked: 142, checked_in: 121, no_show: 9, cancelled: 12, late_cancelled: 3 },
    doctors: [
      { membership_id: id(), name: "Uwimana Keza", signed: 214, unsigned: 2, late: 3 },
      { membership_id: id(), name: "Mugabo Paul", signed: 168, unsigned: 0, late: 1 },
    ],
    finance: {
      bills: patients,
      billed: patients * 6200,
      insurer: patients * 4100,
      patient: patients * 2100,
      paid: patients * 2000,
      exempted: 18000,
      refunded: 5000,
      balance: patients * 100,
    },
    disputes: {
      raised: 3,
      open: 1,
      overdue: 0,
      by_type: { medication: 1, billing: 2 },
      by_outcome: { refund: 1, rejected: 1 },
    },
  };
}

const AUDIT: AuditEntryRow[] = [
  ["pharmacy.dispensed", "Nshimiyimana Patrick", "pharmacist", "pharmacy.prescription"],
  ["clinical.consultation.signed", "Uwimana Keza", "doctor", "clinical.consultation"],
  ["queue.ticket.called", "Uwimana Keza", "doctor", "visits.ticket"],
  ["billing.payment.recorded", "Habimana Eric", "receptionist", "billing.bill"],
  ["patients.record.viewed", "Uwimana Keza", "doctor", "patients.facility_patient"],
  ["reports.exported", "Uwase Aline", "facility_admin", "reports.period"],
].map(([action, actor_name, actor_role, object_type], i) => ({
  id: id(),
  occurred_at: new Date(Date.now() - i * 37 * 60_000).toISOString(),
  actor_name: actor_name!,
  actor_role: actor_role!,
  action: action!,
  object_type: object_type!,
  object_id: id(),
  reason: "",
  metadata: {},
}));

export const reportsMocks: FeatureMockFactory = (context) => {
  const { api } = context;
  const period = (url: URL) => {
    const to = url.searchParams.get("to") || iso(Date.now());
    const from = url.searchParams.get("from") || iso(Date.parse(to) - 29 * DAY);
    return { from, to };
  };
  const staff = (request: Request, code: string) => {
    const lang = context.languageFrom(request);
    const result = context.authenticatedStaff(lang);
    if ("error" in result) return { error: result.error };
    if (
      !result.me.active_facility_id ||
      !(result.me.permissions as readonly string[]).includes(code)
    )
      return {
        error: context.errorResponse(403, "permission_denied", s1("permissionDenied", lang)),
      };
    return { lang };
  };
  const platform = (request: Request) => {
    const lang = context.languageFrom(request);
    const result = context.authenticatedStaff(lang);
    if ("error" in result) return { error: result.error };
    if (!result.me.is_platform_admin)
      return {
        error: context.errorResponse(403, "permission_denied", s1("permissionDenied", lang)),
      };
    return { lang };
  };
  const auditRows = (url: URL) => {
    const action = url.searchParams.get("action") ?? "";
    return AUDIT.filter((r) =>
      !action ? true : action.endsWith(".") ? r.action.startsWith(action) : r.action === action,
    );
  };
  return {
    handlers: [
      http.get(`${api}/staff/reports/period/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, "reports.view");
        if ("error" in ok) return ok.error;
        const { from, to } = period(new URL(request.url));
        if ((Date.parse(to) - Date.parse(from)) / DAY + 1 > 92)
          return context.validationError(ok.lang, { to: ["Choose 92 days or fewer."] });
        return HttpResponse.json(report(from, to));
      }),
      http.get(`${api}/staff/reports/period/export/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, "reports.view");
        if ("error" in ok) return ok.error;
        const step = stepUpFailure(context, ok.lang);
        if (step) return step;
        const { from, to } = period(new URL(request.url));
        const r = report(from, to);
        const csv = [
          "date,patients,completed,median_wait_min",
          ...r.days.map((d) =>
            [d.date, d.patients, d.completed, d.median_wait_min ?? ""].join(","),
          ),
        ].join("\n");
        return new HttpResponse(csv, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="medilink-report-${from}-${to}.csv"`,
          },
        });
      }),
      http.get(`${api}/staff/audit-entries/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, "audit.view");
        if ("error" in ok) return ok.error;
        const url = new URL(request.url);
        return HttpResponse.json(page(auditRows(url), url));
      }),
      http.get(`${api}/platform/reports/`, async ({ request }) => {
        await context.settle();
        const ok = platform(request);
        if ("error" in ok) return ok.error;
        const { from, to } = period(new URL(request.url));
        const body: PlatformReport = {
          from,
          to,
          totals: {
            facilities_live: 2,
            facilities_active: 2,
            visits: 1284,
            bookings: 312,
            disputes: 5,
            disputes_per_1000_visits: 3.9,
            escalation_rate_pct: 20,
          },
          facilities: [
            {
              facility_id: id(),
              name: "Kigali Clinic",
              status: "live",
              facility_type: "private_clinic",
              visits: 912,
              bookings: 241,
              disputes: 4,
              escalated: 1,
            },
            {
              facility_id: id(),
              name: "Musanze Health Centre",
              status: "live",
              facility_type: "health_centre",
              visits: 372,
              bookings: 71,
              disputes: 1,
              escalated: 0,
            },
          ],
        };
        return HttpResponse.json(body);
      }),
      http.get(`${api}/platform/audit-entries/`, async ({ request }) => {
        await context.settle();
        const ok = platform(request);
        if ("error" in ok) return ok.error;
        const url = new URL(request.url);
        return HttpResponse.json(page(auditRows(url), url));
      }),
      http.post(`${api}/patient/data-export/`, async ({ request }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const auth = context.authenticatedPatient(lang);
        if ("error" in auth) return auth.error;
        const body = ((await context.readJson(request)) ?? {}) as { current_password?: string };
        if (body.current_password !== MOCK_PASSWORD)
          return context.validationError(lang, {
            current_password: ["That password is not right."],
          });
        const data = {
          exported_at: new Date().toISOString(),
          account: { email: auth.me.email },
          profiles: auth.me.profiles,
        };
        return new HttpResponse(JSON.stringify(data, null, 2), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="medilink-my-data.json"`,
          },
        });
      }),
    ],
  };
};
