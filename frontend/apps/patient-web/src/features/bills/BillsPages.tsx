import type { BillStatus, PatientBill, PatientBillRow } from "@medilink/api-client";
import { Alert, Badge, cx, EmptyState, SelectField, Skeleton, type BadgeTone } from "@medilink/ui";
import { Receipt, Scales } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { paths } from "../../app/paths";
import { useApi } from "../../app/services";
import {
  ErrorBlock,
  PageHeader,
  panelClass,
  RowIcon,
  RowLink,
  RowList,
  RowsSkeleton,
} from "../dashboard/kit";
import { useProfiles } from "../profile/ProfileLayout";
import { reportProblemTo } from "../disputes";
import { useDate } from "../records/RecordsPages";
import { billsKeys, useRwf } from "./shared";

const STATUS_TONE: Record<BillStatus, BadgeTone> = {
  open: "warning",
  partly_paid: "warning",
  paid: "success",
  voided: "neutral",
  credited: "neutral",
};

/** Bills with something left to pay first, then the newest (contract sprint-08 §6.2). */
export function sortBills(rows: PatientBillRow[]): PatientBillRow[] {
  return [...rows].sort(
    (a, b) =>
      Number(b.balance_rwf > 0) - Number(a.balance_rwf > 0) ||
      b.service_date.localeCompare(a.service_date),
  );
}

/** /dashboard/bills (S8-F6, FR-BIL-12): my and my dependants' bills, balance first. */
export function BillsPage() {
  const { t } = useTranslation();
  const api = useApi();
  const rwf = useRwf();
  const date = useDate();
  const profiles = useProfiles();
  const [patientId, setPatientId] = useState("");
  const list = useQuery({
    queryKey: billsKeys.list(patientId),
    queryFn: () => api.billing.patient.list(patientId ? { patient_id: patientId } : {}),
  });
  const people = profiles.data?.results ?? [];
  const nameOf = (id: string) => people.find((p) => p.patient_id === id)?.display_name;
  const rows = sortBills(list.data?.results ?? []);
  const toPay = rows.reduce((sum, row) => sum + row.balance_rwf, 0);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("bills.title")} />
      {people.length > 1 && (
        <SelectField
          label={t("bills.whose")}
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
          className="sm:w-72"
        >
          <option value="">{t("bills.everyone")}</option>
          {people.map((p) => (
            <option key={p.patient_id} value={p.patient_id}>
              {p.display_name}
            </option>
          ))}
        </SelectField>
      )}
      {list.isPending ? (
        <RowsSkeleton />
      ) : list.isError ? (
        <ErrorBlock message={t("bills.failed")} onRetry={() => void list.refetch()} />
      ) : rows.length ? (
        <>
          <dl className={cx(panelClass, "m-0 flex flex-col gap-1 p-5")}>
            <dt className="text-body-sm font-semibold text-fg-secondary">{t("bills.toPay")}</dt>
            <dd
              className={cx(
                "m-0 font-heading text-h1 font-bold tabular-nums",
                toPay > 0 ? "text-fg" : "text-success",
              )}
            >
              {rwf(toPay)}
            </dd>
          </dl>
          <RowList label={t("bills.title")}>
            {rows.map((row) => (
              <RowLink
                key={row.id}
                to={paths.bill(row.id)}
                leading={
                  <RowIcon icon={Receipt} tone={row.balance_rwf > 0 ? "brand" : "neutral"} />
                }
                title={row.facility_name}
                meta={[
                  date(row.service_date),
                  people.length > 1 ? nameOf(row.patient_id) : undefined,
                  row.balance_rwf > 0
                    ? t("bills.left", { amount: rwf(row.balance_rwf) })
                    : t(`bills.status.${row.status}`),
                ]
                  .filter(Boolean)
                  .join(" · ")}
                trailing={
                  <Badge tone={STATUS_TONE[row.status]}>{t(`bills.status.${row.status}`)}</Badge>
                }
              />
            ))}
          </RowList>
        </>
      ) : (
        <EmptyState icon={Receipt} title={t("bills.empty")} />
      )}
    </div>
  );
}

/** /dashboard/bills/:id: the lines with the insurer and patient share, payments and receipts. */
export function BillDetailPage() {
  const { t } = useTranslation();
  const api = useApi();
  const date = useDate();
  const { billId = "" } = useParams();
  const bill = useQuery({
    queryKey: billsKeys.detail(billId),
    queryFn: () => api.billing.patient.get(billId),
  });
  const back = { to: paths.bills, label: t("bills.back") };
  if (bill.isPending)
    return (
      <div className="flex flex-col gap-6">
        <Skeleton height="2.5rem" width="50%" />
        <Skeleton height="6rem" className="rounded-2xl" />
        <Skeleton height="14rem" className="rounded-2xl" />
      </div>
    );
  if (bill.isError)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("bills.notFound")} back={back} />
        <Alert tone="danger">{t("bills.notFound")}</Alert>
      </div>
    );
  const b = bill.data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={b.facility_name}
        subtitle={date(b.service_date)}
        back={back}
        actions={<Badge tone={STATUS_TONE[b.status]}>{t(`bills.status.${b.status}`)}</Badge>}
      />
      <Totals bill={b} />
      <Lines bill={b} />
      {b.payments.length > 0 && <Payments bill={b} />}
      <Link
        to={reportProblemTo("bill", b.id, b.patient_id)}
        className="inline-flex items-center gap-1.5 self-start text-body-sm font-semibold text-link"
      >
        <Scales aria-hidden="true" className="size-4" />
        {t("disputes.report")}
      </Link>
    </div>
  );
}

/** Total, what insurance pays, my share, paid, and what is left: labels and figures only. */
function Totals({ bill: b }: { bill: PatientBill }) {
  const { t } = useTranslation();
  const rwf = useRwf();
  const facts: [string, number, boolean?][] = [
    [t("bills.total"), b.total_rwf],
    [t("bills.insurer"), b.insurer_share_rwf],
    [t("bills.share"), b.patient_share_rwf],
    ...(b.exempted_rwf > 0 ? ([[t("bills.exempted"), b.exempted_rwf]] as [string, number][]) : []),
    ...(b.credited_rwf > 0 ? ([[t("bills.credited"), b.credited_rwf]] as [string, number][]) : []),
    [t("bills.paid"), b.paid_rwf],
    [t("bills.balance"), b.balance_rwf, true],
  ];
  return (
    <dl
      className={cx(
        panelClass,
        "m-0 grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-3 lg:grid-cols-5",
      )}
    >
      {facts.map(([label, amount, main]) => (
        <div key={label} className="flex flex-col gap-1 bg-surface px-5 py-4">
          <dt className="text-caption font-semibold text-fg-muted">{label}</dt>
          <dd
            className={cx(
              "m-0 font-semibold tabular-nums",
              main ? "font-heading text-h3 font-bold" : "text-fg",
              main && (amount > 0 ? "text-fg" : "text-success"),
            )}
          >
            {rwf(amount)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Lines({ bill: b }: { bill: PatientBill }) {
  const { t } = useTranslation();
  const rwf = useRwf();
  return (
    <section aria-labelledby="bill-lines" className="flex flex-col gap-3">
      <h2 id="bill-lines" className="m-0 font-heading text-h3 font-bold">
        {t("bills.lines")}
      </h2>
      {/* phones: one item per row, the two shares under its name */}
      <ul
        aria-label={t("bills.lines")}
        className={cx(panelClass, "m-0 list-none divide-y divide-border p-0 sm:hidden")}
      >
        {b.lines.map((line, index) => (
          <li key={`${line.name}-${index}`} className="flex flex-col gap-1 px-4 py-3">
            <span className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-fg">
                {line.name}
                {line.quantity > 1 && (
                  <span className="font-normal text-fg-secondary"> × {line.quantity}</span>
                )}
              </span>
              <span className="whitespace-nowrap tabular-nums">{rwf(line.total_rwf)}</span>
            </span>
            <span className="text-body-sm text-fg-secondary tabular-nums">
              {t("bills.insurer")} {rwf(line.insurer_share_rwf)} · {t("bills.share")}{" "}
              <span className="font-semibold text-fg">{rwf(line.patient_share_rwf)}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className={cx(panelClass, "hidden overflow-x-auto sm:block")}>
        <table className="w-full border-collapse text-body-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-border text-left text-caption text-fg-muted">
              <th scope="col" className="px-5 py-3 font-semibold">
                {t("bills.item")}
              </th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">
                {t("bills.quantity")}
              </th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">
                {t("bills.total")}
              </th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">
                {t("bills.insurer")}
              </th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">
                {t("bills.share")}
              </th>
            </tr>
          </thead>
          <tbody>
            {b.lines.map((line, index) => (
              <tr key={`${line.name}-${index}`} className="border-b border-border last:border-b-0">
                <th scope="row" className="px-5 py-3 text-left font-semibold text-fg">
                  {line.name}
                </th>
                <td className="px-3 py-3 text-right tabular-nums">{line.quantity}</td>
                <td className="px-3 py-3 text-right tabular-nums">{rwf(line.total_rwf)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{rwf(line.insurer_share_rwf)}</td>
                <td className="px-5 py-3 text-right font-semibold tabular-nums">
                  {rwf(line.patient_share_rwf)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Payments({ bill: b }: { bill: PatientBill }) {
  const { t } = useTranslation();
  const rwf = useRwf();
  const date = useDate();
  return (
    <section aria-labelledby="bill-payments" className="flex flex-col gap-3">
      <h2 id="bill-payments" className="m-0 font-heading text-h3 font-bold">
        {t("bills.payments")}
      </h2>
      <RowList label={t("bills.payments")}>
        {b.payments.map((p, index) => (
          <li
            key={`${p.received_at}-${index}`}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3"
          >
            <span className="flex flex-col">
              <span className={cx("font-semibold", p.status === "voided" && "line-through")}>
                {rwf(p.amount_rwf)} · {t(`bills.method.${p.method}`)}
              </span>
              <span className="text-body-sm text-fg-secondary">
                {date(p.received_at, true)}
                {p.status === "voided" ? ` · ${t("bills.voided")}` : ""}
              </span>
            </span>
            {p.receipt_number && (
              <span className="text-body-sm text-fg-secondary">
                {t("bills.receipt")}{" "}
                <span className="font-mono font-semibold text-fg">{p.receipt_number}</span>
              </span>
            )}
          </li>
        ))}
      </RowList>
    </section>
  );
}
