/**
 * S10 part 2b reports (contract sprint-10c §3): the facility period report and its CSV export,
 * the audit log for facilities and the platform, platform figures, and the patient's own data
 * export. Aggregates only; no patient names in reports.
 */
import type { ApiClient } from "../client";
import { parseErrorResponse } from "../errors";
import type { Uuid } from "../types";

export interface ReportDay {
  date: string;
  patients: number;
  completed: number;
  median_wait_min: number | null;
  p90_wait_min: number | null;
  avg_consult_min: number | null;
  left_rate_pct: number | null;
  walk_ins: number;
  emergencies: number;
}

export interface FacilityPeriodReport {
  from: string;
  to: string;
  totals: {
    patients: number;
    completed: number;
    walk_ins: number;
    emergencies: number;
    median_wait_min: number | null;
  };
  days: ReportDay[];
  bookings: {
    booked: number;
    checked_in: number;
    no_show: number;
    cancelled: number;
    late_cancelled: number;
  };
  doctors: { membership_id: Uuid; name: string; signed: number; unsigned: number; late: number }[];
  finance: {
    bills: number;
    billed: number;
    insurer: number;
    patient: number;
    paid: number;
    exempted: number;
    refunded: number;
    balance: number;
  };
  disputes: {
    raised: number;
    open: number;
    overdue: number;
    by_type: Record<string, number>;
    by_outcome: Record<string, number>;
  };
}

export interface PlatformReport {
  from: string;
  to: string;
  totals: {
    facilities_live: number;
    facilities_active: number;
    visits: number;
    bookings: number;
    disputes: number;
    disputes_per_1000_visits: number | null;
    escalation_rate_pct: number | null;
  };
  facilities: {
    facility_id: Uuid;
    name: string;
    status: string;
    facility_type: string;
    visits: number;
    bookings: number;
    disputes: number;
    escalated: number;
  }[];
}

export interface AuditEntryRow {
  id: Uuid;
  occurred_at: string;
  actor_name: string;
  actor_role: string;
  action: string;
  object_type: string;
  object_id: string;
  reason: string;
  metadata: Record<string, unknown>;
}

export interface AuditFilters {
  action?: string;
  actor_id?: Uuid;
  object_id?: string;
  from?: string;
  to?: string;
  page?: number;
  facility_id?: Uuid;
}

interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface DownloadedFile {
  blob: Blob;
  filename: string;
}

export const reportsPaths = {
  period: "/api/v1/staff/reports/period/",
  periodExport: "/api/v1/staff/reports/period/export/",
  staffAudit: "/api/v1/staff/audit-entries/",
  platformReport: "/api/v1/platform/reports/",
  platformAudit: "/api/v1/platform/audit-entries/",
  dataExport: "/api/v1/patient/data-export/",
};

function query(params: object): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params as Record<string, string | number | undefined>))
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

function filename(response: Response, fallback: string): string {
  const header = response.headers.get("Content-Disposition") ?? "";
  return /filename="([^"]+)"/.exec(header)?.[1] ?? fallback;
}

/** A file response (CSV, JSON) as a Blob; errors become ApiError like every other call. */
async function download(
  client: ApiClient,
  path: string,
  init: RequestInit,
  fallback: string,
): Promise<DownloadedFile> {
  const headers: Record<string, string> = { "Accept-Language": client.language() };
  if (init.method && init.method !== "GET") {
    headers["X-CSRFToken"] = await client.ensureCsrfToken();
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`${client.baseUrl}${path}`, {
    credentials: "include",
    ...init,
    headers,
  });
  if (!response.ok) throw await parseErrorResponse(response);
  return { blob: await response.blob(), filename: filename(response, fallback) };
}

export function createReportsApi(client: ApiClient) {
  const p = reportsPaths;
  return {
    period: (params: { from?: string; to?: string } = {}) =>
      client.get<FacilityPeriodReport>(p.period + query(params)),
    /** Step-up; audited. */
    exportPeriod: (params: { from?: string; to?: string } = {}) =>
      download(client, p.periodExport + query(params), { method: "GET" }, "medilink-report.csv"),
    audit: (filters: AuditFilters = {}) =>
      client.get<Paginated<AuditEntryRow>>(p.staffAudit + query(filters)),
    platform: {
      report: (params: { from?: string; to?: string } = {}) =>
        client.get<PlatformReport>(p.platformReport + query(params)),
      audit: (filters: AuditFilters = {}) =>
        client.get<Paginated<AuditEntryRow>>(p.platformAudit + query(filters)),
    },
    patient: {
      /** All my data as JSON; confirmed with the password. */
      exportMyData: (currentPassword: string) =>
        download(
          client,
          p.dataExport,
          { method: "POST", body: JSON.stringify({ current_password: currentPassword }) },
          "medilink-my-data.json",
        ),
    },
  };
}

export type ReportsApi = ReturnType<typeof createReportsApi>;

/** Hands a downloaded file to the browser. */
export function saveFile(file: DownloadedFile): void {
  const url = URL.createObjectURL(file.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
