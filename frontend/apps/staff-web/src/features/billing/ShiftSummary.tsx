import { isApiError, type CashShift, type ShiftMethodRow } from "@medilink/api-client";
import { Badge, cx } from "@medilink/ui";
import { formatMoney } from "@medilink/ui/i18n";
import { CashRegister } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";

/**
 * End-of-shift summary by payment method (#203): what each method took in, refunds paid back,
 * what the drawer should hold (cash with the opening float) and, once closed, what was counted.
 */
export function ShiftMethodTable({ shift, caption }: { shift: CashShift; caption?: string }) {
  const { t, i18n } = useTranslation();
  const money = (n: number) => formatMoney(n, i18n.resolvedLanguage ?? "en");
  const closed = shift.counted_totals !== null;
  const refunds = shift.by_method.some((r) => r.paid_out_rwf > 0);
  const rows = shift.by_method;
  const total = (pick: (r: ShiftMethodRow) => number | null) =>
    rows.reduce((s, r) => s + (pick(r) ?? 0), 0);
  const cell = "px-3 py-2 text-right tabular-nums";
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-border">
      <table className="w-full border-collapse text-body-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-subtle text-left text-caption font-semibold tracking-wide text-fg-secondary uppercase">
          <tr>
            <th scope="col" className="px-3 py-2">
              {t("billing.shift.byMethod.method")}
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              {t("billing.shift.byMethod.payments")}
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              {t("billing.shift.byMethod.received")}
            </th>
            {refunds && (
              <th scope="col" className="px-3 py-2 text-right">
                {t("billing.shift.byMethod.paidOut")}
              </th>
            )}
            <th scope="col" className="px-3 py-2 text-right">
              {t("billing.shift.byMethod.expected")}
            </th>
            {closed && (
              <>
                <th scope="col" className="px-3 py-2 text-right">
                  {t("billing.shift.byMethod.counted")}
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  {t("billing.shift.byMethod.difference")}
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.method}>
              <th scope="row" className="px-3 py-2 text-left font-medium">
                {t(`billing.method.${r.method}`)}
              </th>
              <td className={cell}>{r.payment_count}</td>
              <td className={cell}>{money(r.received_rwf)}</td>
              {refunds && <td className={cell}>{money(r.paid_out_rwf)}</td>}
              <td className={cell}>{money(r.expected_rwf)}</td>
              {closed && (
                <>
                  <td className={cx(cell, "font-semibold")}>
                    {r.counted_rwf === null ? "—" : money(r.counted_rwf)}
                  </td>
                  <td
                    className={cx(
                      cell,
                      "font-semibold",
                      (r.difference_rwf ?? 0) < 0 && "text-danger",
                      (r.difference_rwf ?? 0) > 0 && "text-attention",
                    )}
                  >
                    {r.difference_rwf === null ? "—" : money(r.difference_rwf)}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-border bg-subtle/60 font-semibold">
          <tr>
            <th scope="row" className="px-3 py-2 text-left">
              {t("billing.shift.byMethod.total")}
            </th>
            <td className={cell}>{total((r) => r.payment_count)}</td>
            <td className={cell}>{money(total((r) => r.received_rwf))}</td>
            {refunds && <td className={cell}>{money(total((r) => r.paid_out_rwf))}</td>}
            <td className={cell}>{money(total((r) => r.expected_rwf))}</td>
            {closed && (
              <>
                <td className={cell}>{money(total((r) => r.counted_rwf))}</td>
                <td className={cell}>{money(total((r) => r.difference_rwf))}</td>
              </>
            )}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Balanced, short or over, from a closed shift's difference. */
export function DifferenceBadge({ difference }: { difference: number }) {
  const { t, i18n } = useTranslation();
  const money = (n: number) => formatMoney(n, i18n.resolvedLanguage ?? "en");
  return (
    <Badge tone={difference === 0 ? "success" : difference < 0 ? "danger" : "warning"}>
      {difference === 0
        ? t("billing.approvals.shifts.balanced")
        : difference < 0
          ? t("billing.approvals.shifts.short", { amount: money(-difference) })
          : t("billing.approvals.shifts.over", { amount: money(difference) })}
    </Badge>
  );
}

/**
 * My last closed shift (#203), shown on Payments while no shift is open: the summary to hand over
 * with the drawer, and whether it was accepted.
 */
export function LastShiftSummary() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const last = useQuery({
    queryKey: ["billing", "shifts", "mine", "last"],
    queryFn: async (): Promise<CashShift | null> => {
      try {
        const page = await api.billing.shifts({ mine: true, page_size: 1 });
        return page.results.find((s) => s.status !== "open") ?? null;
      } catch (error) {
        if (isApiError(error) && error.status === 403) return null;
        throw error;
      }
    },
  });
  const shift = last.data;
  if (!shift || shift.difference_rwf === null) return null;
  const when = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat(i18n.resolvedLanguage === "rw" ? "en" : i18n.resolvedLanguage, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Africa/Kigali",
        }).format(new Date(iso))
      : "—";
  return (
    <section
      aria-labelledby="last-shift-title"
      className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-subtle text-on-brand-subtle">
            <CashRegister aria-hidden="true" weight="bold" className="size-5" />
          </span>
          <span className="flex min-w-0 flex-col">
            <h2 id="last-shift-title" className="m-0 font-heading text-h3 tracking-tight">
              {t("billing.shift.last.title")}
            </h2>
            <span className="text-body-sm text-fg-secondary tabular-nums">
              {when(shift.opened_at)} – {when(shift.closed_at)}
            </span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DifferenceBadge difference={shift.difference_rwf} />
          <Badge tone={shift.status === "reviewed" ? "success" : "info"}>
            {shift.status === "reviewed"
              ? t("billing.shift.last.accepted", { name: shift.reviewed_by_name ?? "" })
              : t("billing.shift.last.waiting")}
          </Badge>
        </div>
      </div>
      <ShiftMethodTable shift={shift} caption={t("billing.shift.last.title")} />
      {shift.note && (
        <p className="m-0 rounded-xl bg-subtle px-4 py-3 text-body-sm">
          <span className="block text-caption font-semibold text-fg-secondary">
            {t("billing.approvals.shifts.cashierNote")}
          </span>
          {shift.note}
        </p>
      )}
    </section>
  );
}
