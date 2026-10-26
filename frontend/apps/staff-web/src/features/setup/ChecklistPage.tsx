import { newIdempotencyKey, type ChecklistCode, type SetupChecklist } from "@medilink/api-client";
import { Alert, Badge, Button, buttonClassName, cx } from "@medilink/ui";
import {
  Buildings,
  CalendarBlank,
  CaretRight,
  Certificate,
  CheckCircle,
  Circle,
  Clock,
  DoorOpen,
  FirstAidKit,
  IdentificationBadge,
  Receipt,
  RocketLaunch,
  ShieldCheck,
  TreeStructure,
  type Icon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { staffMeKey } from "../../auth/queries";
import { PageHeader } from "../../components/PageHeader";
import { useStepUp } from "../lock";
import { errorText, fieldErrors, QueryState, SetupGate, setupKeys, useCan } from "./shared";

export const CHECKLIST_ICONS: Record<ChecklistCode, Icon> = {
  profile: Buildings,
  departments: TreeStructure,
  services: FirstAidKit,
  service_points: DoorOpen,
  opening_hours: Clock,
  staff: IdentificationBadge,
  schedules: CalendarBlank,
  tariff: Receipt,
  insurers: ShieldCheck,
  licence: Certificate,
};

export function useChecklist(enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: setupKeys.checklist,
    queryFn: () => api.setup.checklist(),
    enabled,
  });
}

/** Ring meter for "n of total" (decorative; the numbers are always written next to it). */
export function ProgressRing({
  done,
  total,
  size = 72,
}: {
  done: number;
  total: number;
  size?: number;
}) {
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      className="shrink-0 -rotate-90"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.18"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={length}
        strokeDashoffset={length * (1 - done / Math.max(total, 1))}
        className="transition-[stroke-dashoffset] duration-300 motion-reduce:transition-none"
      />
    </svg>
  );
}

/** /setup (S2-F2, FR-ONB-03): what is left before go-live, each step linked to its page. */
export function ChecklistPage() {
  return (
    <SetupGate codes={["facility.configure"]}>
      <Checklist />
    </SetupGate>
  );
}

function Checklist() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const checklist = useChecklist();
  const facility = useQuery({ queryKey: setupKeys.facility, queryFn: () => api.setup.facility() });
  const key = useRef(newIdempotencyKey());
  const [refused, setRefused] = useState<string[]>([]);

  const goLive = useMutation({
    mutationFn: () => withStepUp(() => api.setup.goLive(facility.data?.version ?? 0, key.current)),
    onSuccess: () => {
      setRefused([]);
      void queryClient.invalidateQueries({ queryKey: ["setup"] });
      void queryClient.invalidateQueries({ queryKey: staffMeKey });
    },
    onError: (error) =>
      setRefused(Object.keys(fieldErrors(error)).map((field) => field.replace(/^setup\./, ""))),
  });

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader title={t("setup.checklist.title")} description={t("setup.checklist.intro")} />
      <QueryState query={checklist}>
        {(data) => (
          <>
            {data.status !== "live" && <ChecklistSummary data={data} />}
            {data.status === "live" ? (
              <Alert tone="success" role="status" title={t("setup.checklist.liveTitle")}>
                {t("setup.checklist.liveBody")}
              </Alert>
            ) : (
              <section
                aria-labelledby="go-live"
                className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface p-5"
              >
                <div className="flex max-w-xl flex-col gap-1">
                  <h2 id="go-live" className="m-0 font-heading text-h3">
                    {t("setup.checklist.goLiveTitle")}
                  </h2>
                  <p className="m-0 text-fg-secondary">
                    {data.complete
                      ? t("setup.checklist.readyBody")
                      : t("setup.checklist.notReadyBody")}
                  </p>
                </div>
                <Button
                  size="lg"
                  disabled={!data.complete || goLive.isPending}
                  onClick={() => goLive.mutate()}
                >
                  <RocketLaunch aria-hidden="true" />
                  {t("setup.checklist.goLive")}
                </Button>
              </section>
            )}
            {goLive.isError && errorText(goLive.error, t("setup.failed")) && (
              <Alert tone="danger" role="alert" title={errorText(goLive.error, t("setup.failed"))}>
                {refused.length > 0 && (
                  <ul className="m-0 mt-1 pl-5">
                    {refused.map((code) => (
                      <li key={code}>
                        {t(`setup.checklist.items.${code}`, { defaultValue: code })}
                      </li>
                    ))}
                  </ul>
                )}
              </Alert>
            )}
            <ol className="m-0 flex list-none flex-col overflow-hidden rounded-lg border border-border bg-surface p-0">
              {data.items.map((item) => {
                const ItemIcon = CHECKLIST_ICONS[item.code];
                return (
                  <li
                    key={item.code}
                    className="flex flex-wrap items-center gap-4 border-b border-border px-4 py-3.5 last:border-0 sm:flex-nowrap"
                  >
                    <span
                      className={cx(
                        "inline-flex size-10 shrink-0 items-center justify-center rounded-md",
                        item.done ? "bg-success-bg text-success" : "bg-subtle text-fg-secondary",
                      )}
                    >
                      <ItemIcon aria-hidden="true" weight="duotone" className="size-5" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold">
                        {t(`setup.checklist.items.${item.code}`)}
                      </span>
                      <span className="text-body-sm text-fg-secondary">
                        {t(`setup.checklist.hints.${item.code}`, { count: item.count })}
                      </span>
                    </div>
                    <Badge
                      tone={item.done ? "success" : "warning"}
                      icon={item.done ? CheckCircle : Circle}
                    >
                      {item.done ? t("setup.checklist.done") : t("setup.checklist.todo")}
                    </Badge>
                    <Link
                      to={item.link}
                      className={buttonClassName({ variant: item.done ? "ghost" : "secondary" })}
                      aria-label={`${item.done ? t("setup.checklist.review") : t("setup.checklist.setUp")}: ${t(`setup.checklist.items.${item.code}`)}`}
                    >
                      {item.done ? t("setup.checklist.review") : t("setup.checklist.setUp")}
                      <CaretRight aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </QueryState>
    </div>
  );
}

function ChecklistSummary({ data }: { data: SetupChecklist }) {
  const { t } = useTranslation();
  const done = data.items.filter((i) => i.done).length;
  const next = data.items.find((i) => !i.done);
  return (
    <section
      aria-label={t("setup.checklist.progress", { done, total: data.items.length })}
      className="relative flex flex-wrap items-center gap-5 overflow-hidden rounded-lg bg-forest p-5 text-on-forest"
    >
      <div className="text-on-forest-accent">
        <ProgressRing done={done} total={data.items.length} size={84} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="m-0 font-heading text-h2 tabular-nums">
          {t("setup.checklist.progress", { done, total: data.items.length })}
        </p>
        <p className="m-0 text-on-forest-muted">
          {next
            ? t("setup.checklist.nextStep", { step: t(`setup.checklist.items.${next.code}`) })
            : t("setup.checklist.allDone")}
        </p>
      </div>
      {next && (
        <Link
          to={next.link}
          className="inline-flex min-h-target items-center gap-2 rounded-md bg-on-forest px-4 font-semibold text-forest no-underline hover:bg-on-forest-muted"
        >
          {t("setup.checklist.continue")}
          <CaretRight aria-hidden="true" weight="bold" />
        </Link>
      )}
    </section>
  );
}

/** Today card for facility admins until the facility is live (contract §6.1 setup banner). */
export function SetupTodayCard() {
  const { t } = useTranslation();
  const allowed = useCan("facility.configure");
  const checklist = useChecklist(allowed);
  const data = checklist.data;
  if (!allowed || !data || data.status === "live") return null;
  const done = data.items.filter((i) => i.done).length;
  const left = data.items.filter((i) => !i.done);
  return (
    <section
      aria-labelledby="today-setup"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 lg:col-span-2"
    >
      <div className="flex items-center gap-4">
        <div className="text-primary">
          <ProgressRing done={done} total={data.items.length} size={56} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 id="today-setup" className="m-0 font-heading text-h3">
            {t("setup.today.title")}
          </h2>
          <p className="m-0 text-body-sm text-fg-secondary tabular-nums">
            {t("setup.checklist.progress", { done, total: data.items.length })}
          </p>
        </div>
        <Link to="/setup" className={buttonClassName({ variant: "secondary" })}>
          {t("setup.today.open")}
        </Link>
      </div>
      {left.length > 0 && (
        <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
          {left.slice(0, 4).map((item) => {
            const ItemIcon = CHECKLIST_ICONS[item.code];
            return (
              <li key={item.code}>
                <Link
                  to={item.link}
                  className="flex min-h-target items-center gap-3 rounded-md border border-border px-3 py-2 text-fg no-underline hover:border-border-input hover:bg-subtle"
                >
                  <ItemIcon aria-hidden="true" className="size-5 shrink-0 text-warning" />
                  <span className="flex-1 font-medium">
                    {t(`setup.checklist.items.${item.code}`)}
                  </span>
                  <CaretRight aria-hidden="true" className="size-4 text-fg-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
