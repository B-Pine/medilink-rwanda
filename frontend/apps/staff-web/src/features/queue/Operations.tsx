import type { DayFigures, Operations, OperationsAttentionKey } from "@medilink/api-client";
import {
  buttonClassName,
  cx,
  FlowStrip,
  HeatMap,
  LoadMeter,
  Skeleton,
  StatTile,
  TrendChart,
} from "@medilink/ui";
import { dateFormat } from "@medilink/ui/i18n";
import {
  ArrowsDownUp,
  CaretRight,
  CashRegister,
  Certificate,
  ChartLineUp,
  CheckCircle,
  ClockCountdown,
  CurrencyCircleDollar,
  EnvelopeSimple,
  type Icon,
  Receipt,
  Scales,
  ShieldWarning,
  Signature,
  Stamp,
  Stethoscope,
  UserMinus,
  UsersThree,
  Wallet,
  WarningCircle,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { queueKeys, usePollInterval, useQueueSocket } from "./live";
import { LiveBadge } from "./LiveIndicator";
import { useTodayBookings } from "./ExpectedList";
import { BottleneckCallout, useFlowModel } from "./FrontDesk";
import { useCan } from "./shared";

const operationsKey = [...queueKeys.all, "operations"] as const;

function useOperations(enabled: boolean) {
  const api = useApi();
  const refetchInterval = usePollInterval();
  return useQuery({
    queryKey: operationsKey,
    queryFn: () => api.queue.operations(),
    enabled,
    refetchInterval,
  });
}

const pct = (now: number | null, before: number | null) =>
  now === null || before === null || before === 0
    ? null
    : Math.round(((now - before) / before) * 100);

function useDayLabel() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  return (iso: string, style: "short" | "weekday" = "short") => {
    const date = new Date(`${iso}T00:00:00Z`);
    try {
      return dateFormat(
        lang,
        style === "weekday"
          ? { weekday: "long", timeZone: "UTC" }
          : { day: "numeric", month: "short", timeZone: "UTC" },
      ).format(date);
    } catch {
      return iso;
    }
  };
}

/** Four tiles, no more (design 04 §3.4): flow, wait, no-shows and money today. */
function KpiRow({ data }: { data: Operations }) {
  const { t } = useTranslation();
  const label = useDayLabel();
  const today: DayFigures = data.today;
  const before = data.same_day_last_week;
  const vs = t("queue.ops.vsLast", { day: label(before.date, "weekday") });
  const { bookings, finance } = data;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label={t("queue.ops.patientsToday")}
        value={today.patients}
        deltaPct={pct(today.patients, before.patients)}
        deltaLabel={vs}
        trend={data.trend.map((d) => d.patients)}
        icon={<UsersThree aria-hidden="true" className="size-5" />}
      />
      <StatTile
        label={t("queue.ops.medianWait")}
        value={today.median_wait_min ?? "—"}
        unit={today.median_wait_min !== null ? t("queue.ops.min") : undefined}
        deltaPct={pct(today.median_wait_min, before.median_wait_min)}
        deltaLabel={vs}
        lowerIsBetter
        trend={data.trend.map((d) => d.median_wait_min)}
        icon={<ClockCountdown aria-hidden="true" className="size-5" />}
      />
      <StatTile
        label={t("queue.ops.noShows")}
        value={bookings.expected_today ? bookings.no_show_rate_pct : "—"}
        unit={bookings.expected_today ? "%" : undefined}
        caption={
          bookings.expected_today
            ? t("queue.ops.noShowsCaption", {
                count: bookings.no_shows_today,
                expected: bookings.expected_today,
              })
            : t("queue.ops.noBookings")
        }
        icon={<UserMinus aria-hidden="true" className="size-5" />}
      />
      <StatTile
        label={t("queue.ops.revenue")}
        value={finance.collected_today_rwf.toLocaleString("en-US")}
        unit={t("queue.ops.rwf")}
        caption={t("queue.ops.paymentsCaption", { count: finance.payments_today })}
        icon={<CurrencyCircleDollar aria-hidden="true" className="size-5" />}
      />
    </div>
  );
}

const panel = "flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-card";

function PanelHead({ id, title, aside }: { id: string; title: string; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id={id} className="m-0 font-heading text-h3 tracking-tight">
        {title}
      </h2>
      {aside}
    </div>
  );
}

function PanelLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-body-sm font-semibold text-brand no-underline transition-colors hover:bg-brand-subtle"
    >
      {children}
      <CaretRight aria-hidden="true" weight="bold" className="size-3.5" />
    </Link>
  );
}

function LiveByService({ data }: { data: Operations }) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? "en") as "rw" | "en" | "fr";
  const max = Math.max(8, ...data.services.map((s) => s.waiting));
  return (
    <section aria-labelledby="ops-live" className={panel}>
      <PanelHead
        id="ops-live"
        title={t("queue.ops.liveTitle")}
        aside={
          <span className="rounded-full bg-subtle px-3 py-1 text-body-sm text-fg-secondary tabular-nums">
            {t("queue.ops.liveSummary", {
              waiting: data.now.waiting,
              count: data.now.doctors_on_duty,
            })}
          </span>
        }
      />
      {data.services.length === 0 ? (
        <p className="m-0 rounded-xl bg-subtle px-4 py-6 text-center text-fg-muted">
          {t("queue.ops.quiet")}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
          {data.services.map((s) => (
            <li
              key={s.service_id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold">
                  {s.name_i18n[lang] || s.name_i18n.en}
                </span>
                <span className="inline-flex items-center gap-1 text-caption text-fg-secondary">
                  <Stethoscope aria-hidden="true" className="size-3.5" />
                  {t("queue.ops.doctors", { count: s.doctors_on_duty })}
                </span>
              </span>
              <span className="order-3 col-span-2 sm:order-none sm:col-span-1">
                <LoadMeter
                  load={s.load}
                  value={s.waiting}
                  max={max}
                  label={t(`queue.ops.load.${s.load}`)}
                />
              </span>
              <span className="flex flex-col items-end">
                <span className="font-heading text-h2 leading-none tabular-nums">{s.waiting}</span>
                <span className="text-caption text-fg-secondary tabular-nums">
                  {s.waiting
                    ? t("queue.ops.longest", { min: s.longest_wait_min })
                    : t("queue.ops.waiting")}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface AttentionItem {
  key: string;
  to: string;
  icon: Icon;
  label: string;
  urgent: boolean;
}

/** Needs your attention (upgrade 05 §5): every open decision, urgent first, one tap away. */
function Attention({ data }: { data: Operations }) {
  const { t } = useTranslation();
  const a = data.attention;
  const n = (key: OperationsAttentionKey) => a[key] ?? 0;
  const licence = a.licence_days_left;
  const candidates: (AttentionItem | false)[] = [
    licence !== undefined &&
      licence <= 30 && {
        key: "licence",
        to: "/settings/profile",
        icon: Certificate,
        urgent: true,
        label:
          licence < 0
            ? t("queue.ops.licenceExpired")
            : t("queue.ops.licenceExpiring", { count: licence }),
      },
    data.now.doctors_on_duty === 0 &&
      data.now.waiting > 0 && {
        key: "noDoctor",
        to: "/queue",
        icon: WarningCircle,
        urgent: true,
        label: t("queue.ops.noDoctor", { count: data.now.waiting }),
      },
    n("approvals_pending") > 0 && {
      key: "approvals",
      to: "/approvals",
      icon: Stamp,
      urgent: true,
      label: t("queue.ops.approvalsPending", { count: n("approvals_pending") }),
    },
    n("shifts_to_review") > 0 && {
      key: "shifts",
      to: "/approvals?tab=shifts",
      icon: CashRegister,
      urgent: false,
      label: t("queue.ops.shiftsToReview", { count: n("shifts_to_review") }),
    },
    n("unreviewed_reorders") > 0 && {
      key: "reorders",
      to: "/queue/reorders",
      icon: ArrowsDownUp,
      urgent: false,
      label: t("queue.ops.reordersToReview", { count: n("unreviewed_reorders") }),
    },
    n("unsigned_records") > 0 && {
      key: "unsigned",
      to: "/clinical/unsigned",
      icon: Signature,
      urgent: false,
      label: t("queue.ops.unsignedRecords", { count: n("unsigned_records") }),
    },
    n("disputes_open") > 0 && {
      key: "disputes",
      to: "/disputes",
      icon: Scales,
      urgent: false,
      label: t("queue.ops.disputesOpen", { count: n("disputes_open") }),
    },
    n("staff_without_mfa") > 0 && {
      key: "mfa",
      to: "/staff",
      icon: ShieldWarning,
      urgent: false,
      label: t("queue.ops.staffWithoutMfa", { count: n("staff_without_mfa") }),
    },
    n("invitations_pending") > 0 && {
      key: "invites",
      to: "/staff",
      icon: EnvelopeSimple,
      urgent: false,
      label: t("queue.ops.invitationsPending", { count: n("invitations_pending") }),
    },
  ];
  const items = candidates.filter((item): item is AttentionItem => Boolean(item));
  return (
    <section aria-labelledby="ops-attention" className={panel}>
      <PanelHead
        id="ops-attention"
        title={t("queue.ops.attention")}
        aside={
          items.length > 0 && (
            <span className="grid min-w-7 place-items-center rounded-full bg-attention-bg px-2 py-0.5 text-body-sm font-bold text-attention tabular-nums">
              {items.length}
            </span>
          )
        }
      />
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-subtle px-4 py-8 text-center">
          <CheckCircle aria-hidden="true" weight="fill" className="size-8 text-success" />
          <p className="m-0 text-fg-secondary">{t("queue.ops.allClear")}</p>
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {items.map(({ key, to, icon: ItemIcon, label, urgent }) => (
            <li key={key}>
              <Link
                to={to}
                className="group flex min-h-target items-center gap-3 rounded-xl px-2.5 py-2 text-fg no-underline transition-colors duration-150 hover:bg-subtle"
              >
                <span
                  className={cx(
                    "grid size-9 shrink-0 place-items-center rounded-lg",
                    urgent ? "bg-danger-bg text-danger" : "bg-attention-bg text-attention",
                  )}
                >
                  <ItemIcon aria-hidden="true" weight="bold" className="size-[1.125rem]" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body-sm font-semibold">{label}</span>
                  <span
                    className={cx(
                      "text-caption font-semibold tracking-wide uppercase",
                      urgent ? "text-danger" : "text-fg-muted",
                    )}
                  >
                    {urgent ? t("queue.ops.urgent") : t("queue.ops.review")}
                  </span>
                </span>
                <CaretRight
                  aria-hidden="true"
                  className="size-4 text-fg-muted transition-transform duration-200 ease-out-quint group-hover:translate-x-0.5"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Bookings today (S5): one stacked bar for arrived, still to come and no-shows. */
function BookingsPanel({ data }: { data: Operations }) {
  const { t } = useTranslation();
  const b = data.bookings;
  const toCome = Math.max(0, b.expected_today - b.checked_in_today - b.no_shows_today);
  const parts = [
    { key: "arrived", value: b.checked_in_today, className: "bg-success" },
    { key: "toCome", value: toCome, className: "bg-brand" },
    { key: "noShow", value: b.no_shows_today, className: "bg-danger" },
  ];
  return (
    <section aria-labelledby="ops-bookings" className={panel}>
      <PanelHead
        id="ops-bookings"
        title={t("queue.ops.bookings.title")}
        aside={<PanelLink to="/calendar">{t("queue.ops.bookings.open")}</PanelLink>}
      />
      {b.expected_today === 0 ? (
        <p className="m-0 rounded-xl bg-subtle px-4 py-6 text-center text-fg-muted">
          {t("queue.ops.bookings.empty")}
        </p>
      ) : (
        <>
          <p className="m-0 flex items-baseline gap-2">
            <span className="font-heading text-display leading-none font-semibold tabular-nums">
              {b.expected_today}
            </span>
            <span className="text-body-sm text-fg-secondary">
              {t("queue.ops.bookings.expected")}
            </span>
          </p>
          <div
            className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-subtle"
            aria-hidden="true"
          >
            {parts.map((p) =>
              p.value > 0 ? (
                <span
                  key={p.key}
                  className={cx("h-full", p.className)}
                  style={{ width: `${(100 * p.value) / b.expected_today}%` }}
                />
              ) : null,
            )}
          </div>
          <dl className="m-0 grid grid-cols-3 gap-2">
            {parts.map((p) => (
              <div key={p.key} className="flex flex-col gap-0.5">
                <dt className="inline-flex items-center gap-1.5 text-caption text-fg-secondary">
                  <span aria-hidden="true" className={cx("size-2 rounded-full", p.className)} />
                  {t(`queue.ops.bookings.${p.key}`)}
                </dt>
                <dd className="m-0 font-heading text-h3 tabular-nums">{p.value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}

/** Money today (S8): totals only; the detail lives on Payments. */
function MoneyPanel({ data }: { data: Operations }) {
  const { t } = useTranslation();
  const f = data.finance;
  const rows = [
    { key: "bills", value: f.bills_today.toLocaleString("en-US"), icon: Receipt },
    {
      key: "open",
      value: `${f.open_balance_rwf.toLocaleString("en-US")} ${t("queue.ops.rwf")}`,
      icon: Wallet,
    },
  ];
  return (
    <section aria-labelledby="ops-money" className={panel}>
      <PanelHead
        id="ops-money"
        title={t("queue.ops.money.title")}
        aside={<PanelLink to="/payments">{t("queue.ops.money.view")}</PanelLink>}
      />
      <div className="flex flex-col gap-1 rounded-xl bg-brand-subtle px-4 py-3.5">
        <span className="text-caption font-semibold tracking-wide text-on-brand-subtle uppercase">
          {t("queue.ops.money.collected")}
        </span>
        <span className="flex items-baseline gap-1.5 font-heading text-h1 leading-none font-semibold text-fg tabular-nums">
          {f.collected_today_rwf.toLocaleString("en-US")}
          <span className="text-body font-semibold text-fg-secondary">{t("queue.ops.rwf")}</span>
        </span>
        <span className="text-body-sm text-fg-secondary">
          {t("queue.ops.paymentsCaption", { count: f.payments_today })}
        </span>
      </div>
      <dl className="m-0 flex flex-col divide-y divide-border">
        {rows.map(({ key, value, icon: RowIcon }) => (
          <div key={key} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <RowIcon aria-hidden="true" className="size-5 text-fg-muted" />
            <dt className="flex-1 text-body-sm text-fg-secondary">{t(`queue.ops.money.${key}`)}</dt>
            <dd className="m-0 font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const DUTY_TONE: Record<string, string> = {
  on_duty: "bg-success",
  break: "bg-attention",
  emergency: "bg-danger",
  off: "bg-fg-muted",
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

/** Team on duty: who is working now and where (names of staff only, never patients). */
function TeamPanel({ data }: { data: Operations }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="ops-team" className={panel}>
      <PanelHead
        id="ops-team"
        title={t("queue.ops.team.title")}
        aside={<PanelLink to="/staff">{t("queue.ops.team.manage")}</PanelLink>}
      />
      {data.on_duty.length === 0 ? (
        <p className="m-0 rounded-xl bg-subtle px-4 py-6 text-center text-fg-muted">
          {t("queue.ops.team.empty")}
        </p>
      ) : (
        <ul className="m-0 flex max-h-72 list-none flex-col gap-1 overflow-y-auto p-0">
          {data.on_duty.map((p) => (
            <li
              key={`${p.name}-${p.room}`}
              className="flex items-center gap-3 rounded-xl px-1 py-1.5"
            >
              <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-subtle text-body-sm font-semibold text-fg-secondary">
                {initials(p.name)}
                <span
                  aria-hidden="true"
                  className={cx(
                    "absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-surface",
                    DUTY_TONE[p.state],
                  )}
                />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body-sm font-semibold">{p.name}</span>
                <span className="truncate text-caption text-fg-secondary">
                  {t(`queue.ops.team.state.${p.state}`)}
                  {p.room ? ` · ${p.room}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height="9rem" className="rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton height="16rem" className="rounded-2xl lg:col-span-2" />
        <Skeleton height="16rem" className="rounded-2xl" />
      </div>
    </div>
  );
}

/**
 * Facility command centre (design 04 §3.4, upgrade 05 §5): live flow, four KPIs, needs your
 * attention, bookings, money and the team on duty. Aggregates only; never a patient name.
 */
export function OperationsTodayCard() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const allowed = useCan("reports.view");
  const seesQueue = useCan("queue.operate");
  useQueueSocket(allowed);
  const ops = useOperations(allowed);
  const refetchInterval = usePollInterval();
  const board = useQuery({
    queryKey: queueKeys.board,
    queryFn: () => api.queue.board(),
    enabled: allowed && seesQueue,
    refetchInterval,
  });
  const bookings = useTodayBookings(allowed && seesQueue);
  const flow = useFlowModel(board.data?.queues ?? [], bookings.data?.results);
  if (!allowed) return null;
  const updated = ops.data
    ? dateFormat(i18n.resolvedLanguage ?? "en", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Africa/Kigali",
      }).format(new Date(ops.data.updated_at))
    : null;
  return (
    <section aria-labelledby="ops-title" className="flex flex-col gap-5 lg:col-span-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2
            id="ops-title"
            className="m-0 flex items-center gap-3 font-heading text-h2 tracking-tight"
          >
            {t("queue.ops.title")}
            <LiveBadge />
          </h2>
          <p className="m-0 text-body-sm text-fg-secondary">
            {t("queue.ops.subtitle")}
            {updated && (
              <span className="tabular-nums"> · {t("queue.ops.updated", { time: updated })}</span>
            )}
          </p>
        </div>
        <Link to="/reports" className={buttonClassName({ variant: "secondary", pill: true })}>
          <ChartLineUp aria-hidden="true" />
          {t("queue.ops.allReports")}
        </Link>
      </div>
      {board.data && (
        <div className="flex flex-col gap-3">
          <FlowStrip stages={flow.stages} label={t("queue.flow.label")} />
          <BottleneckCallout bottleneck={flow.bottleneck} />
        </div>
      )}
      {!ops.data ? (
        <DashboardSkeleton />
      ) : (
        <div className="ml-stagger flex flex-col gap-4">
          <KpiRow data={ops.data} />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <LiveByService data={ops.data} />
            <Attention data={ops.data} />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <BookingsPanel data={ops.data} />
            <MoneyPanel data={ops.data} />
            <TeamPanel data={ops.data} />
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Arrivals by weekday and hour over the last 4 weeks, with the last 14 days' waits (analysis 13
 * §2), under the period report on /reports. Aggregates only.
 */
export function ArrivalsPanel() {
  const { t, i18n } = useTranslation();
  const allowed = useCan("reports.view");
  const ops = useOperations(allowed);
  const label = useDayLabel();
  const data = ops.data;
  if (!allowed || !data) return null;
  const days = data.trend;
  const weekdays = Array.from({ length: 6 }, (_, i) =>
    dateFormat(i18n.resolvedLanguage ?? "rw", { weekday: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(2026, 0, 5 + i)),
    ),
  );
  const hours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="rounded-2xl bg-surface shadow-card p-5">
        <HeatMap
          title={t("queue.reports.arrivals")}
          rows={weekdays}
          columns={hours}
          value={(r, c) =>
            data.arrivals_heatmap.find((x) => x.weekday === r && x.hour === c)?.count ?? 0
          }
          legend={{ less: t("queue.reports.less"), more: t("queue.reports.more") }}
        />
      </div>
      <div className="rounded-2xl bg-surface shadow-card p-5">
        <TrendChart
          title={t("queue.reports.waitToBeSeen")}
          labels={days.map((d) => label(d.date))}
          unit={` ${t("queue.ops.min")}`}
          series={[
            { name: t("queue.reports.median"), values: days.map((d) => d.median_wait_min) },
            { name: t("queue.reports.p90"), values: days.map((d) => d.p90_wait_min) },
          ]}
        />
      </div>
    </div>
  );
}
