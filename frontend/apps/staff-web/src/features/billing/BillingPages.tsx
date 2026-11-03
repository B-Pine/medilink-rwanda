import {
  isApiError,
  PAYMENT_METHODS,
  EXEMPTION_REASONS,
  type ApprovalRequest,
  type Bill,
  type BillRow,
  type BillStatus,
  type CashShift,
  type ExemptionReason,
  type MethodTotals,
  type PaymentMethod,
} from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  buttonClassName,
  cx,
  Dialog,
  EmptyState,
  LoadingState,
  SelectField,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextField,
  TicketNumber,
} from "@medilink/ui";
import { formatMoney } from "@medilink/ui/i18n";
import {
  ArrowRight,
  CashRegister,
  CheckCircle,
  Printer,
  Receipt as ReceiptIcon,
  SealCheck,
  ShieldCheck,
  XCircle,
} from "@phosphor-icons/react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { useStepUp } from "../lock/StepUp";

const keys = {
  all: ["billing"] as const,
  bills: (status: string, q: string) => ["billing", "bills", status, q] as const,
  bill: (id: string) => ["billing", "bill", id] as const,
  shift: ["billing", "shift"] as const,
  approvals: ["billing", "approvals"] as const,
  shiftsToReview: ["billing", "shifts", "closed"] as const,
  receipt: (id: string) => ["billing", "receipt", id] as const,
};

function useMoney() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  return (amount: number) => formatMoney(amount, lang);
}

function errorText(error: unknown, fallback: string): string {
  return isApiError(error) ? error.message : fallback;
}

const STATUS_TONE: Record<BillStatus, "warning" | "info" | "success" | "neutral"> = {
  open: "warning",
  partly_paid: "info",
  paid: "success",
  voided: "neutral",
  credited: "neutral",
};

function StatusBadge({ status }: { status: BillStatus }) {
  const { t } = useTranslation();
  return <Badge tone={STATUS_TONE[status]}>{t(`billing.status.${status}`)}</Badge>;
}

// ---- cash shift ----------------------------------------------------------------------------

function useShift() {
  const api = useApi();
  return useQuery({
    queryKey: keys.shift,
    queryFn: async (): Promise<CashShift | null> => {
      try {
        return await api.billing.currentShift();
      } catch (error) {
        if (isApiError(error) && error.status === 404) return null;
        throw error;
      }
    },
  });
}

/** Shift banner (contract §6.1): open a shift, or the running totals and Close. */
function ShiftBanner() {
  const { t } = useTranslation();
  const money = useMoney();
  const shift = useShift();
  const [dialog, setDialog] = useState<"open" | "close" | null>(null);
  if (shift.isPending) return null;
  const s = shift.data;
  const expected = s
    ? s.expected_totals.cash +
      s.expected_totals.mtn_momo +
      s.expected_totals.airtel_money +
      s.expected_totals.card
    : 0;
  return (
    <section
      aria-labelledby="shift-title"
      className={cx(
        "flex flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl p-5 shadow-card",
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
        <h2 id="shift-title" className="m-0 text-h3">
          {s ? t("billing.shift.open") : t("billing.shift.none")}
        </h2>
        <p className="m-0 text-body-sm text-fg-secondary">
          {s
            ? t("billing.shift.summary", { count: s.payment_count, cashier: s.cashier_name })
            : t("billing.shift.noneHint")}
        </p>
      </div>
      {s && (
        <dl className="m-0 flex flex-wrap gap-x-8 gap-y-2">
          <div>
            <dt className="text-caption font-semibold text-fg-muted uppercase">
              {t("billing.shift.collected")}
            </dt>
            <dd className="m-0 font-heading text-h2 font-bold tabular-nums">{money(expected)}</dd>
          </div>
          <div>
            <dt className="text-caption font-semibold text-fg-muted uppercase">
              {t("billing.shift.float")}
            </dt>
            <dd className="m-0 font-heading text-h2 font-bold tabular-nums">
              {money(s.opening_float_rwf)}
            </dd>
          </div>
        </dl>
      )}
      <Button
        pill
        variant={s ? "secondary" : "primary"}
        onClick={() => setDialog(s ? "close" : "open")}
      >
        {s ? t("billing.shift.closeAction") : t("billing.shift.openAction")}
      </Button>
      {dialog === "open" && <OpenShiftDialog onClose={() => setDialog(null)} />}
      {dialog === "close" && s && <CloseShiftDialog shift={s} onClose={() => setDialog(null)} />}
    </section>
  );
}

function OpenShiftDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [float, setFloat] = useState("0");
  const open = useMutation({
    mutationFn: () => api.billing.openShift(Number(float) || 0),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.shift });
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(value) => !value && onClose()}
      title={t("billing.shift.openTitle")}
      closeLabel={t("billing.cancel")}
      footer={
        <Button loading={open.isPending} onClick={() => open.mutate()}>
          {t("billing.shift.openAction")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {open.isError && <Alert tone="danger">{errorText(open.error, t("billing.failed"))}</Alert>}
        <TextField
          label={t("billing.shift.float")}
          hint={t("billing.shift.floatHint")}
          inputMode="numeric"
          value={float}
          onChange={(e) => setFloat(e.target.value.replace(/\D/g, ""))}
        />
      </div>
    </Dialog>
  );
}

function CloseShiftDialog({ shift, onClose }: { shift: CashShift; onClose: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const money = useMoney();
  const queryClient = useQueryClient();
  const [counted, setCounted] = useState<Record<PaymentMethod, string>>({
    cash: String(shift.expected_totals.cash + shift.opening_float_rwf),
    mtn_momo: String(shift.expected_totals.mtn_momo),
    airtel_money: String(shift.expected_totals.airtel_money),
    card: String(shift.expected_totals.card),
  });
  const [note, setNote] = useState("");
  const totals: MethodTotals = {
    cash: Number(counted.cash) || 0,
    mtn_momo: Number(counted.mtn_momo) || 0,
    airtel_money: Number(counted.airtel_money) || 0,
    card: Number(counted.card) || 0,
  };
  const difference =
    totals.cash -
    (shift.expected_totals.cash + shift.opening_float_rwf) +
    (totals.mtn_momo - shift.expected_totals.mtn_momo) +
    (totals.airtel_money - shift.expected_totals.airtel_money) +
    (totals.card - shift.expected_totals.card);
  const close = useMutation({
    mutationFn: () =>
      api.billing.closeShift(shift.id, { version: shift.version, counted_totals: totals, note }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.shift });
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(value) => !value && onClose()}
      title={t("billing.shift.closeTitle")}
      closeLabel={t("billing.cancel")}
      footer={
        <Button loading={close.isPending} onClick={() => close.mutate()}>
          {t("billing.shift.closeAction")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {close.isError && (
          <Alert tone="danger">{errorText(close.error, t("billing.failed"))}</Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {PAYMENT_METHODS.map((method) => (
            <TextField
              key={method}
              label={t(`billing.method.${method}`)}
              hint={t("billing.shift.expected", {
                amount: money(
                  shift.expected_totals[method] + (method === "cash" ? shift.opening_float_rwf : 0),
                ),
              })}
              inputMode="numeric"
              value={counted[method]}
              onChange={(e) =>
                setCounted((c) => ({ ...c, [method]: e.target.value.replace(/\D/g, "") }))
              }
            />
          ))}
        </div>
        <p
          className={cx(
            "m-0 rounded-xl px-4 py-3 font-semibold tabular-nums",
            difference === 0 ? "bg-success-bg text-success" : "bg-attention-bg text-attention",
          )}
        >
          {t("billing.shift.difference", { amount: money(difference) })}
        </p>
        <TextField
          label={t("billing.shift.note")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Dialog>
  );
}

// ---- /payments ------------------------------------------------------------------------------

const TABS: { key: string; status?: BillStatus }[] = [
  { key: "unpaid", status: "open" },
  { key: "partly", status: "partly_paid" },
  { key: "paid", status: "paid" },
  { key: "all" },
];

/** Today's bills (contract §6.1): shift banner, tabs, search, one row per bill. */
export function BillsPage() {
  const { t } = useTranslation();
  const api = useApi();
  const money = useMoney();
  const [tab, setTab] = useState("unpaid");
  const [search, setSearch] = useState("");
  const status = TABS.find((x) => x.key === tab)?.status;
  const q = search.trim();
  const bills = useQuery({
    queryKey: keys.bills(status ?? "all", q),
    queryFn: () => api.billing.bills({ status, q: q || undefined }),
    placeholderData: keepPreviousData,
  });
  const rows = bills.data?.results ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("billing.title")} />
      <ShiftBanner />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label={t("billing.tabsLabel")}>
            {TABS.map((x) => (
              <TabsTrigger key={x.key} value={x.key}>
                {t(`billing.tab.${x.key}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <TextField
          type="search"
          label={t("billing.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-80"
        />
      </div>
      {bills.isPending ? (
        <LoadingState />
      ) : bills.isError ? (
        <Alert tone="danger">{errorText(bills.error, t("billing.failed"))}</Alert>
      ) : rows.length === 0 ? (
        <EmptyState icon={ReceiptIcon} title={t("billing.empty")} />
      ) : (
        <ul
          aria-label={t("billing.title")}
          className={cx(
            "m-0 flex list-none flex-col overflow-hidden rounded-2xl bg-surface p-0 shadow-card",
            bills.isPlaceholderData && "opacity-60",
          )}
        >
          {rows.map((row) => (
            <BillRowItem key={row.id} row={row} money={money} />
          ))}
        </ul>
      )}
    </div>
  );
}

function BillRowItem({ row, money }: { row: BillRow; money: (n: number) => string }) {
  const { t } = useTranslation();
  return (
    <li className="animate-enter border-b border-border/60 last:border-b-0">
      <Link
        to={`/payments/bills/${row.id}`}
        className="group flex flex-wrap items-center gap-4 px-5 py-4 text-fg no-underline transition-colors duration-200 ease-out-quint hover:bg-subtle/60"
      >
        {row.ticket_number && (
          <TicketNumber number={row.ticket_number} size="sm" stub tone="brand" />
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-semibold">{row.patient_display_name}</span>
          <span className="flex flex-wrap items-center gap-2 text-body-sm text-fg-secondary">
            <StatusBadge status={row.status} />
            <span>{t(`billing.insurance.${row.insurance_status}`)}</span>
          </span>
        </span>
        <span className="flex flex-col items-end">
          <span className="text-caption text-fg-muted">{t("billing.balance")}</span>
          <span
            className={cx(
              "font-heading text-h3 font-bold tabular-nums",
              row.balance_rwf > 0 ? "text-attention" : "text-success",
            )}
          >
            {money(row.balance_rwf)}
          </span>
        </span>
        <ArrowRight
          aria-hidden="true"
          className="size-5 text-fg-muted transition-transform duration-200 ease-out-quint group-hover:translate-x-0.5"
        />
      </Link>
    </li>
  );
}

// ---- /payments/bills/:billId -----------------------------------------------------------------

/**
 * One bill (contract §6.1): lines with the insurer and patient split, totals, record a payment,
 * an exemption, receipts and void requests. A `409` reloads the bill.
 */
export function BillPage() {
  const { t } = useTranslation();
  const { billId = "" } = useParams();
  const api = useApi();
  const money = useMoney();
  const bill = useQuery({ queryKey: keys.bill(billId), queryFn: () => api.billing.bill(billId) });
  const [exempt, setExempt] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);

  if (bill.isPending) return <LoadingState />;
  if (bill.isError || !bill.data)
    return <Alert tone="danger">{errorText(bill.error, t("billing.failed"))}</Alert>;
  const b = bill.data;
  const lines = b.lines.filter((l) => !l.removed);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ to: "/payments", label: t("billing.title") }}
        title={b.patient_display_name}
        badges={<StatusBadge status={b.status} />}
        description={
          <span className="flex flex-wrap items-center gap-3">
            {b.ticket_number && <TicketNumber number={b.ticket_number} size="sm" />}
            <InsuranceLine bill={b} />
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <section
            aria-labelledby="lines"
            className="overflow-hidden rounded-2xl bg-surface shadow-card"
          >
            <h2 id="lines" className="m-0 border-b border-border/60 px-5 py-4 text-h3">
              {t("billing.lines")}
            </h2>
            <table className="w-full border-collapse text-body-sm">
              <thead>
                <tr className="text-left text-caption text-fg-muted">
                  <th className="px-5 py-2 font-semibold">{t("billing.item")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("billing.qty")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("billing.total")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("billing.insurer")}</th>
                  <th className="px-5 py-2 text-right font-semibold">{t("billing.patient")}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-t border-border/50">
                    <td className="px-5 py-3">
                      <span className="font-semibold">{l.name}</span>
                      <span className="block text-caption text-fg-muted">{l.code}</span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{l.quantity}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(l.total_rwf)}</td>
                    <td className="px-3 py-3 text-right text-fg-secondary tabular-nums">
                      {money(l.insurer_share_rwf)}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">
                      {money(l.patient_share_rwf)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section
            aria-labelledby="payments"
            className="overflow-hidden rounded-2xl bg-surface shadow-card"
          >
            <h2 id="payments" className="m-0 border-b border-border/60 px-5 py-4 text-h3">
              {t("billing.payments")}
            </h2>
            {b.payments.length === 0 && b.exemptions.length === 0 ? (
              <p className="m-0 px-5 py-4 text-fg-muted">{t("billing.noPayments")}</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {b.payments.map((p) => {
                  const pending = b.approval_requests.some(
                    (r) => r.payment_id === p.id && r.status === "pending",
                  );
                  return (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/50 px-5 py-3 last:border-b-0"
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span
                          className={cx(
                            "font-semibold tabular-nums",
                            p.status === "voided" && "line-through",
                          )}
                        >
                          {money(p.amount_rwf)} · {t(`billing.method.${p.method}`)}
                        </span>
                        <span className="text-caption text-fg-muted">
                          {p.received_by_name}
                          {p.reference && ` · ${p.reference}`}
                        </span>
                      </span>
                      {p.status === "voided" && <Badge tone="neutral">{t("billing.voided")}</Badge>}
                      {pending && <Badge tone="warning">{t("billing.voidPending")}</Badge>}
                      {p.receipt && (
                        <Link
                          to={`/payments/receipts/${p.receipt.id}`}
                          className="inline-flex items-center gap-1.5 text-body-sm font-semibold"
                        >
                          <ReceiptIcon aria-hidden="true" className="size-4" />
                          {p.receipt.number}
                        </Link>
                      )}
                      {p.status === "recorded" && !pending && (
                        <Button size="sm" variant="ghost" onClick={() => setVoiding(p.id)}>
                          {t("billing.requestVoid")}
                        </Button>
                      )}
                    </li>
                  );
                })}
                {b.exemptions.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center gap-4 border-b border-border/50 px-5 py-3 last:border-b-0"
                  >
                    <span className="flex-1 font-semibold tabular-nums">
                      {money(e.amount_rwf)} · {t(`billing.exemption.${e.reason_code}`)}
                    </span>
                    {e.is_pending && <Badge tone="warning">{t("billing.awaitingApproval")}</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <Totals bill={b} />
          {b.totals.balance_rwf > 0 && <PaymentForm key={b.version} bill={b} />}
          {b.totals.balance_rwf > 0 && (
            <Button variant="ghost" onClick={() => setExempt(true)}>
              {t("billing.exempt")}
            </Button>
          )}
        </aside>
      </div>
      {exempt && <ExemptionDialog bill={b} onClose={() => setExempt(false)} />}
      {voiding && <VoidDialog billId={b.id} paymentId={voiding} onClose={() => setVoiding(null)} />}
    </div>
  );
}

function InsuranceLine({ bill }: { bill: Bill }) {
  const { t } = useTranslation();
  const i = bill.insurance;
  if (i.status === "none") return <span>{t("billing.insurance.none")}</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {i.status === "verified" ? (
        <ShieldCheck aria-hidden="true" weight="fill" className="size-4 text-success" />
      ) : (
        <XCircle aria-hidden="true" className="size-4 text-fg-muted" />
      )}
      {i.insurer_display}
      {i.member_number && <span className="font-mono text-caption">{i.member_number}</span>}
      <span className="text-fg-muted">· {t(`billing.insurance.${i.status}`)}</span>
    </span>
  );
}

function Totals({ bill }: { bill: Bill }) {
  const { t } = useTranslation();
  const money = useMoney();
  const x = bill.totals;
  const row = (label: string, value: number, strong = false) => (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={strong ? "font-semibold" : "text-on-forest-muted"}>{label}</dt>
      <dd className={cx("m-0 tabular-nums", strong && "font-semibold")}>{money(value)}</dd>
    </div>
  );
  return (
    <section
      aria-labelledby="totals"
      className="relative isolate flex flex-col gap-4 overflow-hidden rounded-2xl bg-[linear-gradient(135deg,var(--color-forest)_0%,var(--color-forest-raised)_100%)] p-6 text-on-forest shadow-raised"
    >
      <h2 id="totals" className="sr-only">
        {t("billing.totals")}
      </h2>
      <dl className="m-0 flex flex-col gap-2 text-body-sm">
        {row(t("billing.total"), x.total_rwf)}
        {row(t("billing.insurerPays"), x.insurer_share_rwf)}
        {x.exempted_rwf > 0 && row(t("billing.exempted"), x.exempted_rwf)}
        {row(t("billing.patientPays"), x.due_rwf, true)}
        {row(t("billing.paid"), x.paid_rwf)}
      </dl>
      <div className="border-t border-on-forest/15 pt-4">
        <p className="m-0 text-caption font-semibold tracking-wider text-on-forest-muted uppercase">
          {t("billing.balance")}
        </p>
        <p className="m-0 font-heading text-[2.25rem] leading-tight font-bold tabular-nums">
          {money(x.balance_rwf)}
        </p>
      </div>
    </section>
  );
}

function PaymentForm({ bill }: { bill: Bill }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const shift = useShift();
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState(String(bill.totals.balance_rwf));
  const [reference, setReference] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const pay = useMutation({
    mutationFn: () =>
      api.billing.pay(
        bill.id,
        { version: bill.version, method, amount_rwf: Number(amount), reference: reference.trim() },
        key,
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.bill(bill.id), updated);
      void queryClient.invalidateQueries({ queryKey: keys.all });
    },
    onError: (error) => {
      if (isApiError(error) && error.status === 409)
        void queryClient.invalidateQueries({ queryKey: keys.bill(bill.id) });
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    pay.mutate();
  };
  const noShift = shift.isSuccess && shift.data === null;
  return (
    <form
      onSubmit={submit}
      aria-labelledby="pay-title"
      className="flex flex-col gap-4 rounded-2xl bg-surface p-6 shadow-card"
    >
      <h2 id="pay-title" className="m-0 text-h3">
        {t("billing.recordPayment")}
      </h2>
      {noShift && (
        <Alert tone="warning">
          {t("billing.shift.needed")}{" "}
          <Link to="/payments" className="font-semibold">
            {t("billing.shift.openAction")}
          </Link>
        </Alert>
      )}
      {pay.isError && <Alert tone="danger">{errorText(pay.error, t("billing.failed"))}</Alert>}
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 font-semibold">{t("billing.methodLabel")}</legend>
        <div className="grid grid-cols-2 gap-2">
          {PAYMENT_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={method === m}
              onClick={() => setMethod(m)}
              className="min-h-11 cursor-pointer rounded-xl border border-border-input bg-surface px-3 text-body-sm font-semibold text-fg transition-colors duration-150 ease-out-quint hover:border-fg-muted aria-pressed:border-primary aria-pressed:bg-brand-subtle aria-pressed:text-on-brand-subtle"
            >
              {t(`billing.method.${m}`)}
            </button>
          ))}
        </div>
      </fieldset>
      <TextField
        label={t("billing.amount")}
        inputMode="numeric"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
      />
      {method !== "cash" && (
        <TextField
          label={t("billing.reference")}
          hint={t("billing.referenceHint")}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      )}
      <Button
        type="submit"
        size="lg"
        pill
        loading={pay.isPending}
        disabled={noShift || !Number(amount)}
      >
        <CheckCircle aria-hidden="true" weight="bold" />
        {t("billing.recordPayment")}
      </Button>
    </form>
  );
}

function ExemptionDialog({ bill, onClose }: { bill: Bill; onClose: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<ExemptionReason>("indigent");
  const [text, setText] = useState("");
  const [amount, setAmount] = useState(String(bill.totals.balance_rwf));
  const exempt = useMutation({
    mutationFn: () =>
      api.billing.exempt(bill.id, {
        version: bill.version,
        reason_code: reason,
        reason_text: text,
        amount_rwf: Number(amount),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.bill(bill.id), updated);
      void queryClient.invalidateQueries({ queryKey: keys.all });
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(value) => !value && onClose()}
      title={t("billing.exempt")}
      closeLabel={t("billing.cancel")}
      footer={
        <Button loading={exempt.isPending} onClick={() => exempt.mutate()}>
          {t("billing.exempt")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {exempt.isError && (
          <Alert tone="danger">{errorText(exempt.error, t("billing.failed"))}</Alert>
        )}
        <SelectField
          label={t("billing.reason")}
          value={reason}
          onChange={(e) => setReason(e.target.value as ExemptionReason)}
        >
          {EXEMPTION_REASONS.map((r) => (
            <option key={r} value={r}>
              {t(`billing.exemption.${r}`)}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t("billing.amount")}
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
        />
        <TextField
          label={t("billing.note")}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
    </Dialog>
  );
}

function VoidDialog({
  billId,
  paymentId,
  onClose,
}: {
  billId: string;
  paymentId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const request = useMutation({
    mutationFn: () => api.billing.requestVoid(paymentId, { reason_text: reason.trim() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.bill(billId) });
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(value) => !value && onClose()}
      title={t("billing.requestVoid")}
      description={t("billing.voidHint")}
      closeLabel={t("billing.cancel")}
      footer={
        <Button
          loading={request.isPending}
          disabled={reason.trim().length < 5}
          onClick={() => request.mutate()}
        >
          {t("billing.sendRequest")}
        </Button>
      }
    >
      {request.isError && (
        <Alert tone="danger">{errorText(request.error, t("billing.failed"))}</Alert>
      )}
      <TextField
        label={t("billing.reason")}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
    </Dialog>
  );
}

// ---- /payments/receipts/:receiptId ------------------------------------------------------------

/** Receipt (contract §6.1): 80 mm print view, black on white, printed from the browser. */
export function ReceiptPage() {
  const { t, i18n } = useTranslation();
  const { receiptId = "" } = useParams();
  const api = useApi();
  const money = useMoney();
  const receipt = useQuery({
    queryKey: keys.receipt(receiptId),
    queryFn: () => api.billing.receipt(receiptId),
  });
  if (receipt.isPending) return <LoadingState />;
  if (receipt.isError || !receipt.data)
    return <Alert tone="danger">{errorText(receipt.error, t("billing.failed"))}</Alert>;
  const r = receipt.data;
  const when = new Intl.DateTimeFormat(
    i18n.resolvedLanguage === "rw" ? "en" : i18n.resolvedLanguage,
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Kigali",
    },
  ).format(new Date(r.issued_at));
  const line = (label: string, value: ReactNode) => (
    <div className="flex justify-between gap-4">
      <span>{label}</span>
      <span className="text-right font-semibold tabular-nums">{value}</span>
    </div>
  );
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex w-full max-w-[22rem] items-center justify-between print:hidden">
        <Link to={`/payments/bills/${r.bill_id}`} className="font-semibold">
          {t("billing.backToBill")}
        </Link>
        <Button pill onClick={() => window.print()}>
          <Printer aria-hidden="true" />
          {t("billing.print")}
        </Button>
      </div>
      <article className="w-full max-w-[22rem] bg-white p-5 font-mono text-[13px] leading-relaxed text-black shadow-raised print:max-w-[80mm] print:p-0 print:shadow-none">
        <p className="m-0 text-center text-[15px] font-bold">{r.facility_name}</p>
        <p className="m-0 mb-3 text-center">{t("billing.receiptTitle")}</p>
        {line(t("billing.receiptNo"), r.number)}
        {line(t("billing.date"), when)}
        {line(t("billing.patient"), r.patient_display_name)}
        <hr className="my-3 border-0 border-t border-dashed border-black" />
        {line(t("billing.total"), money(r.bill_total_rwf))}
        {line(t("billing.patientPays"), money(r.bill_patient_share_rwf))}
        {line(`${t("billing.paid")} · ${t(`billing.method.${r.method}`)}`, money(r.amount_rwf))}
        {r.reference && line(t("billing.reference"), r.reference)}
        {line(t("billing.balance"), money(r.balance_after_rwf))}
        <hr className="my-3 border-0 border-t border-dashed border-black" />
        {line(t("billing.cashier"), r.received_by_name)}
        {r.status === "voided" && (
          <p className="m-0 mt-3 text-center font-bold">{t("billing.voided")}</p>
        )}
        <p className="m-0 mt-3 text-center">{t("billing.thanks")}</p>
      </article>
    </div>
  );
}

// ---- /approvals ------------------------------------------------------------------------------

/**
 * Approvals inbox (contract §6.1): voids, refunds and waivers, then closed cash shifts to accept
 * (B22). Every decision asks for step-up.
 */
export function ApprovalsPage() {
  const { t } = useTranslation();
  const api = useApi();
  const [search, setSearch] = useSearchParams();
  const tab = search.get("tab") === "shifts" ? "shifts" : "requests";
  const approvals = useQuery({
    queryKey: keys.approvals,
    queryFn: () => api.billing.approvals({ status: "pending" }),
  });
  const shifts = useQuery({
    queryKey: keys.shiftsToReview,
    queryFn: () => api.billing.shifts({ status: "closed" }),
  });
  const rows = approvals.data?.results ?? [];
  const closed = shifts.data?.results ?? [];
  const count = (n: number | undefined) =>
    n ? (
      <span className="grid min-w-5 place-items-center rounded-full bg-attention-bg px-1.5 text-caption font-bold text-attention tabular-nums">
        {n}
      </span>
    ) : null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("billing.approvals.title")} description={t("billing.approvals.intro")} />
      <Tabs
        value={tab}
        onValueChange={(value) => setSearch(value === "shifts" ? { tab: "shifts" } : {})}
      >
        <TabsList aria-label={t("billing.approvals.title")}>
          <TabsTrigger value="requests">
            <SealCheck aria-hidden="true" />
            {t("billing.approvals.tabs.requests")}
            {count(approvals.data?.count)}
          </TabsTrigger>
          <TabsTrigger value="shifts">
            <CashRegister aria-hidden="true" />
            {t("billing.approvals.tabs.shifts")}
            {count(shifts.data?.count)}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="requests">
          {approvals.isPending ? (
            <LoadingState />
          ) : approvals.isError ? (
            <Alert tone="danger">{errorText(approvals.error, t("billing.failed"))}</Alert>
          ) : rows.length === 0 ? (
            <EmptyState icon={SealCheck} title={t("billing.approvals.empty")} />
          ) : (
            <ul className="ml-stagger m-0 flex list-none flex-col gap-4 p-0">
              {rows.map((r) => (
                <ApprovalItem key={r.id} request={r} />
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="shifts">
          {shifts.isPending ? (
            <LoadingState />
          ) : shifts.isError ? (
            <Alert tone="danger">{errorText(shifts.error, t("billing.failed"))}</Alert>
          ) : closed.length === 0 ? (
            <EmptyState icon={CashRegister} title={t("billing.approvals.shifts.empty")} />
          ) : (
            <ul className="ml-stagger m-0 grid list-none gap-4 p-0 xl:grid-cols-2">
              {closed.map((s) => (
                <ShiftReviewItem key={s.id} shift={s} />
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** A closed shift (B22): expected against counted per method, the gap, then accept. */
function ShiftReviewItem({ shift }: { shift: CashShift }) {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const money = useMoney();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const [note, setNote] = useState("");
  const review = useMutation({
    mutationFn: () =>
      withStepUp(() =>
        api.billing.reviewShift(shift.id, { version: shift.version, note: note.trim() }),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.all }),
  });
  const time = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat(i18n.resolvedLanguage === "rw" ? "en" : i18n.resolvedLanguage, {
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Africa/Kigali",
        }).format(new Date(iso))
      : "—";
  const diff = shift.difference_rwf ?? 0;
  const counted = shift.counted_totals;
  return (
    <li className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-subtle text-on-brand-subtle">
            <CashRegister aria-hidden="true" weight="bold" className="size-5" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-semibold">{shift.cashier_name}</span>
            <span className="text-body-sm text-fg-secondary tabular-nums">
              {time(shift.opened_at)} – {time(shift.closed_at)} ·{" "}
              {t("billing.approvals.shifts.payments", { count: shift.payment_count })}
            </span>
          </span>
        </div>
        <Badge tone={diff === 0 ? "success" : diff < 0 ? "danger" : "warning"}>
          {diff === 0
            ? t("billing.approvals.shifts.balanced")
            : diff < 0
              ? t("billing.approvals.shifts.short", { amount: money(-diff) })
              : t("billing.approvals.shifts.over", { amount: money(diff) })}
        </Badge>
      </div>
      <div className="overflow-hidden rounded-xl ring-1 ring-border">
        <table className="w-full border-collapse text-body-sm">
          <thead className="bg-subtle text-left text-caption font-semibold tracking-wide text-fg-secondary uppercase">
            <tr>
              <th scope="col" className="px-3 py-2">
                {t("billing.approvals.shifts.method")}
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                {t("billing.approvals.shifts.expected")}
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                {t("billing.approvals.shifts.counted")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {PAYMENT_METHODS.map((m) => {
              const expected =
                shift.expected_totals[m] + (m === "cash" ? shift.opening_float_rwf : 0);
              const got = counted?.[m] ?? null;
              return (
                <tr key={m}>
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {t(`billing.method.${m}`)}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">{money(expected)}</td>
                  <td
                    className={cx(
                      "px-3 py-2 text-right font-semibold tabular-nums",
                      got !== null && got !== expected && "text-danger",
                    )}
                  >
                    {got === null ? "—" : money(got)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="m-0 text-caption text-fg-muted">
        {t("billing.approvals.shifts.float", { amount: money(shift.opening_float_rwf) })}
      </p>
      {shift.note && (
        <blockquote className="m-0 rounded-xl bg-subtle px-4 py-3 text-body-sm text-fg">
          <span className="block text-caption font-semibold text-fg-secondary">
            {t("billing.approvals.shifts.cashierNote")}
          </span>
          {shift.note}
        </blockquote>
      )}
      {review.isError && (
        <Alert tone="danger">{errorText(review.error, t("billing.failed"))}</Alert>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label={t("billing.approvals.shifts.reviewNote")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="min-w-0 flex-1"
        />
        <Button
          pill
          loading={review.isPending}
          disabled={diff !== 0 && note.trim().length < 3}
          onClick={() => review.mutate()}
        >
          <CheckCircle aria-hidden="true" weight="bold" />
          {t("billing.approvals.shifts.accept")}
        </Button>
      </div>
    </li>
  );
}

function ApprovalItem({ request }: { request: ApprovalRequest }) {
  const { t } = useTranslation();
  const api = useApi();
  const money = useMoney();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const decide = useMutation({
    mutationFn: (action: "approve" | "reject") =>
      withStepUp(() =>
        action === "approve"
          ? api.billing.approve(request.id, { version: request.version })
          : api.billing.reject(request.id, { version: request.version, note: note.trim() }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.all });
      setRejecting(false);
    },
  });
  return (
    <li className="flex animate-enter flex-col gap-4 rounded-2xl bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="m-0 flex flex-wrap items-center gap-2">
            <Badge tone="warning">{t(`billing.approvals.kind.${request.kind}`)}</Badge>
            <span className="font-semibold">{request.patient_display_name}</span>
          </p>
          <p className="m-0 text-body-sm text-fg-secondary">
            {t("billing.approvals.by", { name: request.requested_by_name })}
          </p>
        </div>
        {request.amount_rwf !== null && (
          <span className="font-heading text-h2 font-bold tabular-nums">
            {money(request.amount_rwf)}
          </span>
        )}
      </div>
      <blockquote className="m-0 rounded-xl bg-subtle px-4 py-3 text-fg">
        {request.reason_text}
      </blockquote>
      {decide.isError && (
        <Alert tone="danger">{errorText(decide.error, t("billing.failed"))}</Alert>
      )}
      {rejecting ? (
        <div className="flex flex-wrap items-end gap-3">
          <TextField
            label={t("billing.approvals.rejectNote")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="min-w-0 flex-1"
          />
          <Button
            variant="danger"
            loading={decide.isPending}
            disabled={note.trim().length < 3}
            onClick={() => decide.mutate("reject")}
          >
            {t("billing.approvals.reject")}
          </Button>
          <Button variant="ghost" onClick={() => setRejecting(false)}>
            {t("billing.cancel")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button pill loading={decide.isPending} onClick={() => decide.mutate("approve")}>
            <CheckCircle aria-hidden="true" weight="bold" />
            {t("billing.approvals.approve")}
          </Button>
          <Button pill variant="secondary" onClick={() => setRejecting(true)}>
            {t("billing.approvals.reject")}
          </Button>
          <Link
            to={`/payments/bills/${request.bill_id}`}
            className={buttonClassName({ variant: "ghost" })}
          >
            {t("billing.approvals.viewBill")}
          </Link>
        </div>
      )}
    </li>
  );
}
