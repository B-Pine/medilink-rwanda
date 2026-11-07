import {
  billingPaths,
  hasPermission,
  isApiError,
  type ClaimRow,
  type ClaimStatus,
} from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  cx,
  EmptyState,
  LoadingState,
  SelectField,
  TextField,
} from "@medilink/ui";
import { dateFormat, formatMoney } from "@medilink/ui/i18n";
import { CheckCircle, DownloadSimple, ShieldCheck, XCircle } from "@phosphor-icons/react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";

import { useApi } from "../../app/services";
import { useStaffMe } from "../../auth/queries";
import { PageHeader } from "../../components/PageHeader";
import { env } from "../../env";

const STATUS_TONE: Record<ClaimStatus, "warning" | "success" | "danger"> = {
  pending: "warning",
  paid: "success",
  rejected: "danger",
};
const FILTERS = ["all", "pending", "paid", "rejected"] as const;
type Filter = (typeof FILTERS)[number];

/** This month in Kigali, as `YYYY-MM` (the month picker goes back to the month to send). */
function thisMonth(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kigali" })
    .format(new Date())
    .slice(0, 7);
}

function errorText(error: unknown, fallback: string): string {
  return isApiError(error) ? error.message : fallback;
}

/**
 * Insurance claims (#203, upgrade 13 §3 W4): one insurer's insured visits for a month, the CSV or
 * PDF to send them, and marking each claim paid or rejected with the insurer's reason. Electronic
 * submission to RAMA or MMI waits for their interface.
 */
export function ClaimsPage() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const { data: me } = useStaffMe();
  const canMark = hasPermission(me, "billing.approve");
  const money = (n: number) => formatMoney(n, i18n.resolvedLanguage ?? "en");
  const [search, setSearch] = useSearchParams();
  const month = search.get("month") || thisMonth();
  const [filter, setFilter] = useState<Filter>("all");
  const insurers = useQuery({
    queryKey: ["billing", "claims", "insurers"],
    queryFn: () => api.billing.claimInsurers(),
  });
  const insurer = search.get("insurer") || insurers.data?.[0]?.code || "";
  const claims = useQuery({
    queryKey: ["billing", "claims", insurer, month],
    queryFn: () => api.billing.claims({ insurer, month }),
    enabled: Boolean(insurer && /^\d{4}-\d{2}$/.test(month)),
    placeholderData: keepPreviousData,
  });
  const choose = (next: { insurer?: string; month?: string }) =>
    setSearch({ insurer: next.insurer ?? insurer, month: next.month ?? month });
  const rows = (claims.data?.results ?? []).filter((r) => filter === "all" || r.status === filter);
  const summary = claims.data?.summary;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("billing.claims.title")} />

      <div className="flex flex-wrap items-end gap-4 rounded-2xl bg-surface p-5 shadow-card">
        <SelectField
          label={t("billing.claims.insurer")}
          value={insurer}
          onChange={(e) => choose({ insurer: e.target.value })}
          className="w-full sm:w-64"
        >
          {(insurers.data ?? []).map((x) => (
            <option key={x.code} value={x.code}>
              {x.name}
            </option>
          ))}
        </SelectField>
        <TextField
          type="month"
          label={t("billing.claims.month")}
          value={month}
          onChange={(e) => e.target.value && choose({ month: e.target.value })}
          className="w-full sm:w-48"
        />
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <DownloadButton insurer={insurer} month={month} kind="csv" />
          <DownloadButton insurer={insurer} month={month} kind="pdf" />
        </div>
      </div>

      {summary && (
        <ul
          aria-label={t("billing.claims.totals")}
          className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-4"
        >
          <Figure
            label={t("billing.claims.visits", { count: summary.count })}
            value={money(summary.insurer_share_rwf)}
            hint={t("billing.claims.toClaim")}
          />
          <Figure
            label={t("billing.claims.status.pending")}
            value={String(summary.pending_count)}
            tone="warning"
          />
          <Figure
            label={t("billing.claims.status.paid")}
            value={money(summary.paid_rwf)}
            hint={t("billing.claims.claimsCount", { count: summary.paid_count })}
            tone="success"
          />
          <Figure
            label={t("billing.claims.status.rejected")}
            value={money(summary.rejected_rwf)}
            hint={t("billing.claims.claimsCount", { count: summary.rejected_count })}
            tone="danger"
          />
        </ul>
      )}

      <div
        role="group"
        aria-label={t("billing.claims.filter")}
        className="flex flex-wrap gap-1 self-start rounded-full bg-subtle p-1"
      >
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cx(
              "min-h-9 rounded-full px-4 text-body-sm font-semibold transition-colors duration-150",
              filter === f ? "bg-surface text-fg shadow-card" : "text-fg-secondary hover:text-fg",
            )}
          >
            {f === "all" ? t("billing.claims.all") : t(`billing.claims.status.${f}`)}
          </button>
        ))}
      </div>

      {insurers.isPending || (claims.isPending && claims.fetchStatus !== "idle") ? (
        <LoadingState />
      ) : insurers.isError || claims.isError ? (
        <Alert tone="danger">
          {errorText(insurers.error ?? claims.error, t("billing.failed"))}
        </Alert>
      ) : rows.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={t("billing.claims.empty")} />
      ) : (
        <ul
          aria-label={t("billing.claims.title")}
          className={cx(
            "m-0 flex list-none flex-col gap-3 p-0",
            claims.isPlaceholderData && "opacity-60",
          )}
        >
          {rows.map((row) => (
            <ClaimItem key={row.bill_id} row={row} canMark={canMark} money={money} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warning" | "success" | "danger";
}) {
  return (
    <li className="flex flex-col gap-0.5 rounded-xl bg-surface px-4 py-3 shadow-card">
      <span className="text-caption text-fg-secondary">{label}</span>
      <span
        className={cx(
          "font-heading text-h3 leading-tight font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger",
          tone === "warning" && "text-attention",
        )}
      >
        {value}
      </span>
      {hint && <span className="text-caption text-fg-muted">{hint}</span>}
    </li>
  );
}

/** The month's list as a file, with the session cookie (audit-logged on the server). */
function DownloadButton({
  insurer,
  month,
  kind,
}: {
  insurer: string;
  month: string;
  kind: "csv" | "pdf";
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function download() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch(
        `${env.apiBaseUrl}${billingPaths.claimsExport({ insurer, month, kind })}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error(String(response.status));
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `claims-${insurer}-${month}.${kind}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        pill
        loading={busy}
        disabled={!insurer}
        onClick={() => void download()}
      >
        <DownloadSimple aria-hidden="true" weight="bold" />
        {t(kind === "csv" ? "billing.claims.downloadCsv" : "billing.claims.downloadPdf")}
      </Button>
      {failed && (
        <span role="alert" className="text-body-sm text-danger">
          {t("billing.claims.downloadFailed")}
        </span>
      )}
    </div>
  );
}

function ClaimItem({
  row,
  canMark,
  money,
}: {
  row: ClaimRow;
  canMark: boolean;
  money: (n: number) => string;
}) {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [marking, setMarking] = useState<"paid" | "rejected" | null>(null);
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const mark = useMutation({
    mutationFn: (status: "paid" | "rejected") =>
      api.billing.markClaim(row.bill_id, {
        version: row.version,
        status,
        reason: reason.trim(),
        reference: reference.trim(),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["billing", "claims"] });
      setMarking(null);
      setReason("");
      setReference("");
    },
    onError: async (error) => {
      if (isApiError(error) && error.status === 409)
        await queryClient.invalidateQueries({ queryKey: ["billing", "claims"] });
    },
  });
  const date = dateFormat(i18n.resolvedLanguage ?? "rw", {
    dateStyle: "medium",
    timeZone: "Africa/Kigali",
  }).format(new Date(`${row.service_date}T12:00:00`));
  return (
    <li className="flex animate-enter flex-col gap-4 rounded-2xl bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="m-0 flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[row.status]}>{t(`billing.claims.status.${row.status}`)}</Badge>
            <Link to={`/payments/bills/${row.bill_id}`} className="font-semibold">
              {row.patient_display_name}
            </Link>
          </p>
          <p className="m-0 text-body-sm text-fg-secondary tabular-nums">
            {date} · {t("billing.claims.member", { number: row.member_number || "—" })}
          </p>
          <p className="m-0 flex flex-wrap items-center gap-1.5 text-body-sm">
            <span className="text-fg-secondary">{t("billing.claims.icd10")}</span>
            {row.icd10_codes.length === 0 ? (
              <span className="text-attention">{t("billing.claims.noDiagnosis")}</span>
            ) : (
              row.icd10_codes.map((code) => (
                <code
                  key={code}
                  className="rounded-md bg-subtle px-1.5 py-0.5 font-mono text-caption"
                >
                  {code}
                </code>
              ))
            )}
          </p>
        </div>
        <dl className="m-0 flex gap-6 text-right">
          <div>
            <dt className="text-caption text-fg-muted">{t("billing.insurerPays")}</dt>
            <dd className="m-0 font-heading text-h3 font-bold tabular-nums">
              {money(row.insurer_share_rwf)}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-fg-muted">{t("billing.patientPays")}</dt>
            <dd className="m-0 font-heading text-h3 tabular-nums">
              {money(row.patient_share_rwf)}
            </dd>
          </div>
        </dl>
      </div>

      <details className="rounded-xl bg-subtle/60 px-4 py-2 text-body-sm">
        <summary className="cursor-pointer py-1 font-semibold">
          {t("billing.claims.lines", { count: row.lines.length })}
        </summary>
        <ul className="m-0 mt-1 flex list-none flex-col divide-y divide-border p-0">
          {row.lines.map((line, index) => (
            <li key={`${line.code}-${index}`} className="flex flex-wrap gap-x-4 gap-y-1 py-1.5">
              <span className="min-w-0 flex-1">
                {line.name}{" "}
                <span className="text-fg-muted">
                  {line.code} × {line.quantity}
                </span>
              </span>
              <span className="tabular-nums">{money(line.total_rwf)}</span>
              {!line.is_covered && (
                <span className="text-caption text-fg-muted">{t("billing.claims.notCovered")}</span>
              )}
            </li>
          ))}
        </ul>
      </details>

      {row.status !== "pending" && (
        <p className="m-0 text-body-sm text-fg-secondary">
          {t("billing.claims.markedBy", { name: row.decided_by_name ?? "" })}
          {row.reference && ` · ${t("billing.claims.referenceIs", { reference: row.reference })}`}
          {row.reason && (
            <span className="mt-1 block rounded-xl bg-subtle px-3 py-2 text-fg">{row.reason}</span>
          )}
        </p>
      )}

      {mark.isError && <Alert tone="danger">{errorText(mark.error, t("billing.failed"))}</Alert>}

      {canMark &&
        (marking ? (
          <div className="flex flex-wrap items-end gap-3">
            {marking === "rejected" ? (
              <TextField
                label={t("billing.claims.reason")}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="min-w-0 flex-1"
              />
            ) : (
              <TextField
                label={t("billing.claims.reference")}
                hint={t("billing.claims.referenceHint")}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="min-w-0 flex-1"
              />
            )}
            <Button
              variant={marking === "rejected" ? "danger" : "primary"}
              loading={mark.isPending}
              disabled={marking === "rejected" && reason.trim().length < 5}
              onClick={() => mark.mutate(marking)}
            >
              {marking === "rejected"
                ? t("billing.claims.confirmRejected")
                : t("billing.claims.confirmPaid")}
            </Button>
            <Button variant="ghost" onClick={() => setMarking(null)}>
              {t("billing.cancel")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {row.status !== "paid" && (
              <Button pill onClick={() => setMarking("paid")}>
                <CheckCircle aria-hidden="true" weight="bold" />
                {t("billing.claims.markPaid")}
              </Button>
            )}
            {row.status !== "rejected" && (
              <Button pill variant="secondary" onClick={() => setMarking("rejected")}>
                <XCircle aria-hidden="true" weight="bold" />
                {t("billing.claims.markRejected")}
              </Button>
            )}
          </div>
        ))}
    </li>
  );
}
