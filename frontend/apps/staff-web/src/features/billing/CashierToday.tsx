import { hasPermission, isApiError, shiftCollected, type CashShift } from "@medilink/api-client";
import { buttonClassName, cx, Skeleton, TicketNumber } from "@medilink/ui";
import { formatMoney } from "@medilink/ui/i18n";
import {
  CaretRight,
  CashRegister,
  Coins,
  HourglassMedium,
  Receipt,
  type Icon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { useStaffMe } from "../../auth/queries";

/**
 * Cashier Today (upgrade 06 §4): the shift, what is left to collect and the next bills to pay.
 * Only for people who take payments without running the queue (reception and admins have their
 * own Today cards). Opening and closing the shift stays on Payments.
 */
export function CashierTodayCard() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const { data: me } = useStaffMe();
  const show = hasPermission(me, "billing.record_payment") && !hasPermission(me, "queue.operate");
  const money = (amount: number) => formatMoney(amount, i18n.resolvedLanguage ?? "en");
  // same key as the Payments page, so both share one cache entry
  const shift = useQuery({
    queryKey: ["billing", "shift"],
    queryFn: async (): Promise<CashShift | null> => {
      try {
        return await api.billing.currentShift();
      } catch (error) {
        if (isApiError(error) && error.status === 404) return null;
        throw error;
      }
    },
    enabled: show,
  });
  const due = useQuery({
    queryKey: ["billing", "bills", "due", "today-card"],
    queryFn: () => api.billing.bills({ has_balance: true }),
    enabled: show,
    refetchInterval: 30_000,
  });
  if (!show) return null;
  const s = shift.data;
  // payments only: the expected totals also hold the opening float
  const collected = s ? shiftCollected(s) : 0;
  const rows = due.data?.results ?? [];
  const partly = rows.filter((r) => r.status === "partly_paid").length;

  return (
    <section aria-labelledby="cashier-today" className="flex flex-col gap-4 lg:col-span-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="cashier-today" className="m-0 font-heading text-h2 tracking-tight">
          {t("billing.today.title")}
        </h2>
        <Link to="/payments" className={buttonClassName({ variant: "secondary", pill: true })}>
          {t("billing.today.openPayments")}
          <CaretRight aria-hidden="true" weight="bold" />
        </Link>
      </div>

      {shift.isPending ? (
        <Skeleton height="5rem" className="rounded-2xl" />
      ) : (
        <div
          className={cx(
            "flex flex-wrap items-center gap-4 rounded-2xl p-5 shadow-card",
            s ? "bg-surface" : "bg-attention-bg",
          )}
        >
          <span
            className={cx(
              "grid size-12 shrink-0 place-items-center rounded-2xl",
              s ? "bg-brand-subtle text-on-brand-subtle" : "bg-surface text-attention",
            )}
          >
            <CashRegister aria-hidden="true" className="size-6" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="m-0 font-heading text-h3">
              {s ? t("billing.shift.open") : t("billing.shift.none")}
            </p>
            <p className="m-0 text-body-sm text-fg-secondary">
              {s
                ? t("billing.today.shiftSince", { count: s.payment_count })
                : t("billing.shift.noneHint")}
            </p>
          </div>
          {!s && (
            <Link to="/payments" className={buttonClassName({ pill: true })}>
              {t("billing.today.openShift")}
            </Link>
          )}
        </div>
      )}

      <ul
        aria-label={t("billing.today.numbers")}
        className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-4"
      >
        <Tile icon={Receipt} label={t("billing.today.toPay")} value={String(rows.length)} />
        <Tile
          icon={HourglassMedium}
          label={t("billing.today.partly")}
          value={String(partly)}
          attention={partly > 0}
        />
        <Tile
          icon={Coins}
          label={t("billing.today.payments")}
          value={String(s?.payment_count ?? 0)}
        />
        <Tile icon={CashRegister} label={t("billing.today.collected")} value={money(collected)} />
      </ul>

      {s && (
        <section
          aria-labelledby="cashier-by-method"
          className="flex flex-col gap-3 rounded-2xl bg-surface p-5 shadow-card"
        >
          <h3 id="cashier-by-method" className="m-0 font-heading text-h3 tracking-tight">
            {t("billing.shift.byMethod.title")}
          </h3>
          <dl className="m-0 grid grid-cols-2 gap-3 md:grid-cols-4">
            {s.by_method.map((row) => (
              <div
                key={row.method}
                className="flex flex-col gap-0.5 rounded-xl bg-subtle px-3.5 py-3"
              >
                <dt className="text-caption text-fg-secondary">
                  {t(`billing.method.${row.method}`)}
                </dt>
                <dd className="m-0 font-heading text-h3 leading-tight font-semibold tabular-nums">
                  {money(row.received_rwf)}
                </dd>
                <dd className="m-0 text-caption text-fg-muted">
                  {t("billing.today.inDrawer", { amount: money(row.expected_rwf) })}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section
        aria-labelledby="cashier-next"
        className="flex flex-col gap-3 rounded-2xl bg-surface p-5 shadow-card"
      >
        <h3 id="cashier-next" className="m-0 font-heading text-h3 tracking-tight">
          {t("billing.today.next")}
        </h3>
        {due.isPending ? (
          <Skeleton height="8rem" className="rounded-xl" />
        ) : rows.length === 0 ? (
          <p className="m-0 rounded-xl bg-subtle px-4 py-6 text-center text-fg-muted">
            {t("billing.today.nothing")}
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
            {rows.slice(0, 5).map((row) => (
              <li key={row.id}>
                <Link
                  to={`/payments/bills/${row.id}`}
                  className="group flex min-h-target items-center gap-3 py-2.5 text-fg no-underline"
                >
                  {row.ticket_number && (
                    <TicketNumber number={row.ticket_number} size="sm" stub tone="brand" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-semibold group-hover:underline">
                    {row.patient_display_name}
                  </span>
                  <span className="font-heading font-semibold tabular-nums">
                    {money(row.balance_rwf)}
                  </span>
                  <CaretRight aria-hidden="true" className="size-4 text-fg-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

function Tile({
  icon: TileIcon,
  label,
  value,
  attention = false,
}: {
  icon: Icon;
  label: string;
  value: string;
  attention?: boolean;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-surface px-3.5 py-3 shadow-card">
      <span
        className={cx(
          "grid size-10 shrink-0 place-items-center rounded-lg",
          attention ? "bg-attention-bg text-attention" : "bg-brand-subtle text-on-brand-subtle",
        )}
      >
        <TileIcon aria-hidden="true" weight="bold" className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-heading text-h3 leading-tight font-semibold tabular-nums">
          {value}
        </span>
        <span className="truncate text-caption text-fg-secondary">{label}</span>
      </span>
    </li>
  );
}
