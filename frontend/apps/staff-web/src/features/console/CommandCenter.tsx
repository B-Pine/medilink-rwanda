import type { CommandCenter } from "@medilink/api-client";
import {
  ArrowClockwise,
  ArrowRight,
  Buildings,
  CaretRight,
  Certificate,
  ClockCountdown,
  FileText,
  Gavel,
  LockKey,
  ShieldCheck,
  Siren,
  UsersThree,
  WarningOctagon,
  WifiSlash,
  type Icon,
} from "@phosphor-icons/react";
import { Alert, Button, cx, LoadingState, Skeleton, type MapPoint } from "@medilink/ui";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { PageHeading } from "../../components/PageHeading";
import { env } from "../../env";
import { Kpi, OutcomeIcon, Panel, useActionLabel, useRelative } from "./shared";

const FacilityMap = lazy(() => import("@medilink/ui/map"));

const kindOf = (type: string): MapPoint["kind"] =>
  type === "health_post"
    ? "post"
    : type === "health_center"
      ? "centre"
      : type.endsWith("hospital")
        ? "hospital"
        : "clinic";

interface ActionItem {
  key: string;
  count: number;
  icon: Icon;
  to: string;
  tone: "danger" | "attention" | "info";
}

/**
 * Command centre (upgrade 2026-11-02): is the network healthy, and what needs the super admin? Four
 * live figures, the network map with facilities coloured by load and stale data, a "Needs your
 * action" inbox ordered by risk, the application pipeline, security posture and recent activity.
 */
export function CommandCenterPage() {
  const { t } = useTranslation();
  const api = useApi();
  const relative = useRelative();
  const data = useQuery({
    queryKey: ["console", "command-center"],
    queryFn: () => api.console.commandCenter(),
    refetchInterval: 60_000,
  });

  if (data.isPending) return <LoadingState />;
  if (data.isError || !data.data) return <Alert tone="danger">{t("console.failed")}</Alert>;
  const d = data.data;
  const mfaPct = d.security.staff_total
    ? Math.round((d.security.staff_with_mfa / d.security.staff_total) * 100)
    : 100;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="m-0 flex items-center gap-2 text-caption font-semibold tracking-wider text-fg-muted uppercase">
            <span aria-hidden="true" className="ml-live-dot text-success" />
            {t("console.cc.updated", { time: relative(d.generated_at) })}
          </p>
          <PageHeading
            title={t("console.cc.title")}
            className="text-h1 font-bold tracking-tight text-fg"
          >
            {t("console.cc.title")}
          </PageHeading>
        </div>
        <Button
          variant="secondary"
          pill
          size="sm"
          loading={data.isFetching}
          onClick={() => void data.refetch()}
          iconStart={<ArrowClockwise aria-hidden="true" className="size-4" />}
        >
          {t("console.refresh")}
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label={t("console.cc.live")}
          value={d.live_facilities}
          detail={t("console.cc.liveDetail", { setup: d.overview.facilities.setup ?? 0 })}
          icon={Buildings}
        />
        <Kpi
          label={t("console.cc.waiting")}
          value={d.waiting_now}
          detail={t("console.cc.waitingDetail")}
          icon={ClockCountdown}
          tone="attention"
        />
        <Kpi
          label={t("console.cc.mfa")}
          value={`${mfaPct}%`}
          detail={t("console.cc.mfaDetail", {
            with: d.security.staff_with_mfa,
            total: d.security.staff_total,
          })}
          icon={ShieldCheck}
          tone={mfaPct < 90 ? "attention" : "brand"}
        />
        <Kpi
          label={t("console.cc.failed")}
          value={d.security.failed_logins_24h}
          detail={t("console.cc.failedDetail", { ok: d.security.successful_logins_24h })}
          icon={WarningOctagon}
          tone={d.security.failed_logins_24h > 10 ? "danger" : "info"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <NetworkMap data={d} />
        <ActionInbox data={d} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Pipeline data={d} />
        <Districts data={d} />
        <Activity data={d} />
      </div>
    </div>
  );
}

function NetworkMap({ data }: { data: CommandCenter }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const points: MapPoint[] = data.map.map((p) => ({
    id: p.id,
    lat: p.lat,
    lng: p.lng,
    kind: kindOf(p.type),
    load: p.stale ? null : p.waiting > 30 ? "high" : p.waiting > 12 ? "medium" : "low",
    label: `${p.name}, ${t("console.cc.waitingCount", { count: p.waiting })}`,
  }));
  const chosen = data.map.find((p) => p.id === selected);
  return (
    <Panel
      title={t("console.cc.map")}
      action={
        <ul className="m-0 flex list-none flex-wrap items-center gap-3 p-0 text-caption text-fg-muted">
          {(
            [
              ["low", "bg-success"],
              ["medium", "bg-warning"],
              ["high", "bg-attention-solid"],
              ["stale", "bg-fg-muted"],
            ] as const
          ).map(([key, dot]) => (
            <li key={key} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={cx("size-2.5 rounded-full", dot)} />
              {t(`console.cc.legend.${key}`)}
            </li>
          ))}
        </ul>
      }
      bodyClassName="p-3"
    >
      <Suspense fallback={<Skeleton className="h-[26rem] rounded-2xl" />}>
        <FacilityMap
          points={points}
          selectedId={selected}
          onSelect={setSelected}
          tilesUrl={env.mapTilesUrl}
          attribution="© OpenStreetMap contributors"
          label={t("console.cc.map")}
          className="h-[26rem]"
          card={
            chosen ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="font-semibold">{chosen.name}</span>
                  <span className="text-body-sm text-fg-secondary">
                    {t(`facility.types.${chosen.type}`, { defaultValue: chosen.type })} ·{" "}
                    {chosen.district}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  {chosen.stale ? (
                    <span className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-attention">
                      <WifiSlash aria-hidden="true" className="size-4" />
                      {t("console.cc.legend.stale")}
                    </span>
                  ) : (
                    <span className="font-heading text-h3 font-bold tabular-nums">
                      {t("console.cc.waitingCount", { count: chosen.waiting })}
                    </span>
                  )}
                  <Link to="/platform/facilities" className="text-body-sm font-semibold">
                    {t("console.open")}
                  </Link>
                </div>
              </div>
            ) : undefined
          }
        />
      </Suspense>
    </Panel>
  );
}

function ActionInbox({ data }: { data: CommandCenter }) {
  const { t } = useTranslation();
  const a = data.attention;
  const items: ActionItem[] = [
    {
      key: "breakGlass",
      count: a.break_glass_to_review,
      icon: Siren,
      to: "/platform/break-glass",
      tone: "danger" as const,
    },
    {
      key: "disputes",
      count: a.disputes_escalated,
      icon: Gavel,
      to: "/platform/disputes",
      tone: "danger" as const,
    },
    {
      key: "licencesExpired",
      count: a.licences_expired,
      icon: Certificate,
      to: "/platform/facilities",
      tone: "danger" as const,
    },
    {
      key: "applications",
      count: a.applications_waiting,
      icon: FileText,
      to: "/platform/applications",
      tone: "attention" as const,
    },
    {
      key: "licencesExpiring",
      count: a.licences_expiring,
      icon: Certificate,
      to: "/platform/facilities",
      tone: "attention" as const,
    },
    {
      key: "stale",
      count: a.stale_facilities,
      icon: WifiSlash,
      to: "/platform/facilities",
      tone: "attention" as const,
    },
    {
      key: "locked",
      count: a.locked_accounts,
      icon: LockKey,
      to: "/platform/users",
      tone: "info" as const,
    },
  ].sort((x, y) => Number(y.count > 0) - Number(x.count > 0));
  const open = items.filter((i) => i.count > 0).length;
  return (
    <Panel
      title={t("console.cc.inbox")}
      action={
        <span className="rounded-full bg-attention-bg px-2.5 py-0.5 text-caption font-bold text-attention tabular-nums">
          {open}
        </span>
      }
    >
      <ul className="m-0 flex list-none flex-col p-2">
        {items.map(({ key, count, icon: ItemIcon, to, tone }) => (
          <li key={key}>
            <Link
              to={to}
              className={cx(
                "group flex items-center gap-3 rounded-xl px-3 py-3 no-underline transition-colors duration-200 ease-out-quint hover:bg-subtle/70",
                count === 0 && "opacity-55",
              )}
            >
              <span
                className={cx(
                  "grid size-10 shrink-0 place-items-center rounded-xl",
                  count === 0
                    ? "bg-subtle text-fg-muted"
                    : tone === "danger"
                      ? "bg-danger-bg text-danger"
                      : tone === "attention"
                        ? "bg-attention-bg text-attention"
                        : "bg-info-bg text-info",
                )}
              >
                <ItemIcon aria-hidden="true" weight="bold" className="size-5" />
              </span>
              <span className="min-w-0 flex-1 text-body-sm font-semibold text-fg">
                {t(`console.cc.items.${key}`, { count })}
              </span>
              <span className="font-heading text-h3 font-bold text-fg tabular-nums">{count}</span>
              <CaretRight
                aria-hidden="true"
                className="size-4 text-fg-muted transition-transform duration-200 ease-out-quint group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const PIPELINE = [
  ["submitted", "bg-info"],
  ["under_review", "bg-primary"],
  ["changes_requested", "bg-attention-solid"],
  ["approved", "bg-success"],
] as const;

function Pipeline({ data }: { data: CommandCenter }) {
  const { t } = useTranslation();
  const counts = data.overview.applications;
  const total = PIPELINE.reduce((sum, [key]) => sum + (counts[key] ?? 0), 0) || 1;
  return (
    <Panel
      title={t("console.cc.pipeline")}
      action={
        <Link
          to="/platform/applications"
          className="inline-flex items-center gap-1 text-body-sm font-semibold"
        >
          {t("console.open")}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      }
      bodyClassName="flex flex-col gap-5 p-5"
    >
      <div aria-hidden="true" className="flex h-3 overflow-hidden rounded-full bg-subtle">
        {PIPELINE.map(([key, color]) => (
          <span
            key={key}
            className={cx("h-full transition-[width] duration-700 ease-out-quint", color)}
            style={{ width: `${((counts[key] ?? 0) / total) * 100}%` }}
          />
        ))}
      </div>
      <dl className="m-0 grid grid-cols-2 gap-4">
        {PIPELINE.map(([key, color]) => (
          <div key={key} className="flex flex-col gap-1">
            <dt className="inline-flex items-center gap-2 text-caption text-fg-muted">
              <span aria-hidden="true" className={cx("size-2 rounded-full", color)} />
              {t(`platform.status.application.${key}`)}
            </dt>
            <dd className="m-0 font-heading text-h2 font-bold tabular-nums">{counts[key] ?? 0}</dd>
          </div>
        ))}
      </dl>
      {data.overview.oldest_waiting_application && (
        <p className="m-0 rounded-xl bg-attention-bg px-4 py-3 text-body-sm text-fg">
          {t("console.cc.oldest")}
        </p>
      )}
    </Panel>
  );
}

function Districts({ data }: { data: CommandCenter }) {
  const { t } = useTranslation();
  const rows = [...data.overview.facilities_by_district]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Panel title={t("console.cc.districts")} bodyClassName="flex flex-col gap-3 p-5">
      {rows.length === 0 ? (
        <p className="m-0 text-fg-muted">{t("console.empty")}</p>
      ) : (
        rows.map((r) => (
          <div
            key={r.district_code}
            className="grid grid-cols-[7rem_minmax(0,1fr)_2rem] items-center gap-3"
          >
            <span className="truncate text-body-sm font-semibold">{r.district}</span>
            <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-subtle">
              <span
                className="block h-full rounded-full bg-primary transition-[width] duration-700 ease-out-quint"
                style={{ width: `${(r.count / max) * 100}%` }}
              />
            </span>
            <span className="text-right text-body-sm font-semibold tabular-nums">{r.count}</span>
          </div>
        ))
      )}
      <div className="mt-2 grid grid-cols-3 gap-2 border-t border-border/60 pt-4 text-center">
        {(["live", "setup", "suspended"] as const).map((key) => (
          <div key={key}>
            <p className="m-0 font-heading text-h3 font-bold tabular-nums">
              {data.overview.facilities[key] ?? 0}
            </p>
            <p className="m-0 text-caption text-fg-muted">{t(`platform.status.facility.${key}`)}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Activity({ data }: { data: CommandCenter }) {
  const { t } = useTranslation();
  const relative = useRelative();
  const label = useActionLabel();
  return (
    <Panel
      title={t("console.cc.activity")}
      action={
        <Link
          to="/platform/security-log"
          className="inline-flex items-center gap-1 text-body-sm font-semibold"
        >
          {t("console.open")}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      }
    >
      <ol className="m-0 flex list-none flex-col p-2">
        {data.activity.map((e) => (
          <li key={e.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
            <OutcomeIcon outcome={e.outcome} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-body-sm font-semibold">{label(e.action)}</span>
              <span className="truncate text-caption text-fg-muted">
                {[e.actor_name || t("console.system"), e.facility_name].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="shrink-0 text-caption text-fg-muted tabular-nums">
              {relative(e.occurred_at)}
            </span>
          </li>
        ))}
        {data.activity.length === 0 && (
          <li className="px-3 py-6 text-center text-fg-muted">
            <UsersThree aria-hidden="true" className="mx-auto mb-2 size-6" />
            {t("console.empty")}
          </li>
        )}
      </ol>
    </Panel>
  );
}
