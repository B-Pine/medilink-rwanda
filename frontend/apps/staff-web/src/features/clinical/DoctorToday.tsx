import type { MyDay } from "@medilink/api-client";
import { buttonClassName, cx, Skeleton, StatTile, TicketNumber } from "@medilink/ui";
import {
  CaretRight,
  ChatCircleDots,
  CheckCircle,
  ClipboardText,
  ClockCountdown,
  Flask,
  MegaphoneSimple,
  Notepad,
  Signature,
  Stethoscope,
  CalendarCheck,
  type Icon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { useCan } from "./shared";

export const myDayKey = ["clinical", "my-day"] as const;

/** The clinician's own day, refreshed every minute (counts only). */
export function useMyDay(enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: myDayKey,
    queryFn: () => api.clinical.myDay(),
    enabled,
    refetchInterval: 60_000,
  });
}

/** Seen today, average consult time and records waiting: shared by Today and My queue. */
export function MyDayStrip({ data, compact = false }: { data: MyDay; compact?: boolean }) {
  const { t } = useTranslation();
  const items = [
    {
      key: "seen",
      icon: Stethoscope,
      value: data.seen_today,
      label: t("clinical.today.seen"),
    },
    {
      key: "avg",
      icon: ClockCountdown,
      value:
        data.avg_consult_min === null ? "—" : `${data.avg_consult_min} ${t("clinical.today.min")}`,
      label: t("clinical.today.avg"),
    },
    {
      key: "signed",
      icon: CheckCircle,
      value: data.signed_today,
      label: t("clinical.today.signed"),
    },
    {
      key: "unsigned",
      icon: Signature,
      value: data.unsigned,
      label: t("clinical.today.unsigned"),
      warn: data.unsigned_overdue > 0,
    },
  ];
  return (
    <ul
      aria-label={t("clinical.today.title")}
      className={cx(
        "m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-4",
        compact ? "" : "rounded-2xl bg-surface p-2 shadow-card",
      )}
    >
      {items.map(({ key, icon: ItemIcon, value, label, warn }) => (
        <li
          key={key}
          className={cx(
            "flex items-center gap-3 rounded-xl px-3 py-2.5",
            compact ? "bg-surface shadow-card" : "",
          )}
        >
          <span
            className={cx(
              "grid size-9 shrink-0 place-items-center rounded-lg",
              warn ? "bg-attention-bg text-attention" : "bg-brand-subtle text-on-brand-subtle",
            )}
          >
            <ItemIcon aria-hidden="true" weight="bold" className="size-[1.125rem]" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="font-heading text-h3 leading-tight font-semibold tabular-nums">
              {value}
            </span>
            <span className="truncate text-caption text-fg-secondary">{label}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

interface NeedItem {
  key: string;
  to: string;
  icon: Icon;
  label: string;
  detail?: string;
  urgent: boolean;
}

/** Things that wait for this doctor: overdue records first, then pharmacy questions. */
function NeedsYou({ data }: { data: MyDay }) {
  const { t, i18n } = useTranslation();
  const time = (iso: string) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage === "rw" ? "en" : i18n.resolvedLanguage, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Kigali",
    }).format(new Date(iso));
  const items: NeedItem[] = [
    ...(data.unsigned_overdue > 0
      ? [
          {
            key: "overdue",
            to: "/clinical/unsigned",
            icon: Signature,
            label: t("clinical.today.overdue", { count: data.unsigned_overdue }),
            urgent: true,
          },
        ]
      : []),
    ...data.open_questions.map((q) => ({
      key: q.id,
      to: "/clinical/questions",
      icon: ChatCircleDots,
      label: t("clinical.today.question", { name: q.patient_display_name }),
      detail: t("clinical.today.askedAt", { time: time(q.raised_at) }),
      urgent: true,
    })),
    ...(data.results_waiting > 0
      ? [
          {
            key: "results",
            to: "/clinical/results",
            icon: Flask,
            label: t("clinical.today.results", { count: data.results_waiting }),
            urgent: false,
          },
        ]
      : []),
    ...(data.unsigned > data.unsigned_overdue
      ? [
          {
            key: "unsigned",
            to: "/clinical/unsigned",
            icon: ClipboardText,
            label: t("clinical.today.toSign", { count: data.unsigned - data.unsigned_overdue }),
            urgent: false,
          },
        ]
      : []),
    ...(data.follow_ups_today > 0
      ? [
          {
            key: "followUps",
            to: "/clinical/follow-ups",
            icon: CalendarCheck,
            label: t("clinical.today.followUps", { count: data.follow_ups_today }),
            urgent: false,
          },
        ]
      : []),
  ];
  return (
    <section
      aria-labelledby="doctor-needs"
      className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-card"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="doctor-needs" className="m-0 font-heading text-h3 tracking-tight">
          {t("clinical.today.needsYou")}
        </h2>
        {items.length > 0 && (
          <span className="grid min-w-7 place-items-center rounded-full bg-attention-bg px-2 py-0.5 text-body-sm font-bold text-attention tabular-nums">
            {items.length}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-subtle px-4 py-8 text-center">
          <CheckCircle aria-hidden="true" weight="fill" className="size-8 text-success" />
          <p className="m-0 text-fg-secondary">{t("clinical.today.allClear")}</p>
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {items.map(({ key, to, icon: ItemIcon, label, detail, urgent }) => (
            <li key={key}>
              <Link
                to={to}
                className="group flex min-h-target items-center gap-3 rounded-xl px-2.5 py-2 text-fg no-underline transition-colors duration-150 hover:bg-subtle"
              >
                <span
                  className={cx(
                    "grid size-9 shrink-0 place-items-center rounded-lg",
                    urgent ? "bg-attention-bg text-attention" : "bg-subtle text-fg-secondary",
                  )}
                >
                  <ItemIcon aria-hidden="true" weight="bold" className="size-[1.125rem]" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body-sm font-semibold">{label}</span>
                  {detail && (
                    <span className="text-caption text-fg-secondary tabular-nums">{detail}</span>
                  )}
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

/** The patient in the room, or the way to call the next one. */
function InTheRoom() {
  const { t } = useTranslation();
  const api = useApi();
  const mine = useQuery({
    queryKey: ["queue", "mine"],
    queryFn: () => api.queue.mine(),
    refetchInterval: 15_000,
  });
  const current = mine.data?.current ?? null;
  const next = mine.data?.waiting ?? [];
  return (
    <section
      aria-labelledby="doctor-room"
      className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="doctor-room" className="m-0 font-heading text-h3 tracking-tight">
          {current ? t("clinical.today.inRoom") : t("clinical.today.upNext")}
        </h2>
        <span className="rounded-full bg-subtle px-3 py-1 text-body-sm text-fg-secondary tabular-nums">
          {t("clinical.today.waiting", { count: next.length })}
        </span>
      </div>
      {current ? (
        <div className="flex flex-wrap items-center gap-4 rounded-xl bg-brand-subtle/60 p-4">
          <TicketNumber number={current.number} size="md" stub />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-heading text-h3 font-semibold">
              {current.display_name}
            </span>
            <span className="text-body-sm text-fg-secondary">
              {[
                current.age_years !== null ? t("clinical.age", { count: current.age_years }) : null,
                current.service_point,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <Link
            to={`/clinical/visits/${current.visit_id}/consultation`}
            className={buttonClassName({ pill: true })}
          >
            <Notepad aria-hidden="true" weight="bold" />
            {t("clinical.today.openRecord")}
          </Link>
        </div>
      ) : next.length > 0 ? (
        <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
          {next.slice(0, 3).map((ticket, index) => (
            <li
              key={ticket.id}
              className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-subtle/60"
            >
              <TicketNumber
                number={ticket.number}
                size="sm"
                stub
                tone={index === 0 ? "attention" : "brand"}
              />
              <span className="truncate font-semibold">{ticket.display_name}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-0 rounded-xl bg-subtle px-4 py-6 text-center text-fg-muted">
          {t("clinical.today.nobody")}
        </p>
      )}
      <Link
        to="/queue/mine"
        className={buttonClassName({ variant: current ? "secondary" : "primary", pill: true })}
      >
        <MegaphoneSimple aria-hidden="true" weight="bold" />
        {t("clinical.today.openQueue")}
      </Link>
    </section>
  );
}

/** Doctor Today (upgrade 05 §3): the room, my day in numbers, and what waits for me. */
export function DoctorTodayCard() {
  const { t } = useTranslation();
  const allowed = useCan("clinical.write");
  const day = useMyDay(allowed);
  if (!allowed) return null;
  const data = day.data;
  return (
    <section aria-labelledby="doctor-today" className="flex flex-col gap-4 lg:col-span-3">
      <h2 id="doctor-today" className="m-0 font-heading text-h2 tracking-tight">
        {t("clinical.today.title")}
      </h2>
      {!data ? (
        <div className="grid gap-4 lg:grid-cols-3" aria-busy="true">
          <Skeleton height="12rem" className="rounded-2xl" />
          <Skeleton height="12rem" className="rounded-2xl" />
          <Skeleton height="12rem" className="rounded-2xl" />
        </div>
      ) : (
        <div className="ml-stagger flex flex-col gap-4">
          <MyDayStrip data={data} />
          <div className="grid gap-4 lg:grid-cols-3">
            <InTheRoom />
            <NeedsYou data={data} />
            <StatTile
              label={t("clinical.today.week")}
              value={data.trend.reduce((n, d) => n + d.seen, 0)}
              caption={t("clinical.today.weekCaption")}
              trend={data.trend.map((d) => d.seen)}
              icon={<Stethoscope aria-hidden="true" className="size-5" />}
            />
          </div>
        </div>
      )}
    </section>
  );
}
