import type { QueueGroup, StaffBooking, TicketRow } from "@medilink/api-client";
import { cx, FlowStrip, type FlowStage, type TicketTone } from "@medilink/ui";
import {
  CalendarCheck,
  MagnifyingGlass,
  Phone,
  Pill,
  Plus,
  Receipt,
  Stethoscope,
  UsersThree,
  WarningCircle,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

import { minutesSince } from "./shared";

/** Keyboard shortcuts of the check-in bar (design 04 §3.1). */
const SHORTCUT_FIND = "/";
const SHORTCUT_NEW = "N";

/**
 * Ticket tint on the board (design 03 §1a): red for an emergency, grey for a remote joiner
 * reception has not seen yet, ochre for the next one to be called, emerald otherwise.
 */
export function ticketTone(ticket: TicketRow, position: number): TicketTone {
  if (ticket.flags.includes("emergency")) return "danger";
  if (ticket.is_remote && !ticket.remote_arrival_confirmed_at) return "neutral";
  return position === 0 ? "attention" : "brand";
}

/**
 * The check-in bar (design 04 §3.1): the one thing reception does all day, on the deep-forest
 * band. The search opens the check-in dialog with the patient search focused ("/"); "N" starts a
 * new check-in; booking by phone sits beside it.
 */
export function DeskBar({
  onFind,
  onCheckIn,
  onBookByPhone,
}: {
  onFind: () => void;
  onCheckIn: () => void;
  onBookByPhone?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-forest p-3.5 text-on-forest">
      <button
        type="button"
        onClick={onFind}
        aria-keyshortcuts={SHORTCUT_FIND}
        className={cx(
          "flex min-h-11 min-w-0 flex-1 basis-72 cursor-pointer items-center gap-3 rounded-md px-3.5 text-left",
          "border border-on-forest/15 bg-on-forest/[0.07] text-on-forest-muted",
          "transition-colors duration-150 hover:border-on-forest/30 hover:bg-on-forest/[0.11]",
        )}
      >
        <MagnifyingGlass aria-hidden="true" weight="bold" className="size-5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{t("queue.board.findPatient")}</span>
        <kbd className="hidden rounded-sm border border-on-forest/25 px-1.5 font-sans text-caption sm:inline">
          {SHORTCUT_FIND}
        </kbd>
      </button>
      <button
        type="button"
        onClick={onCheckIn}
        aria-keyshortcuts={SHORTCUT_NEW}
        className={cx(
          "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-4 font-semibold",
          "bg-on-forest-accent text-forest transition-[transform,filter] duration-150",
          "hover:brightness-105 active:scale-[0.97]",
        )}
      >
        <Plus aria-hidden="true" weight="bold" className="size-4" />
        {t("queue.board.checkIn")}
        <kbd className="rounded-sm border border-forest/30 px-1 font-sans text-caption">
          {SHORTCUT_NEW}
        </kbd>
      </button>
      {onBookByPhone && (
        <button
          type="button"
          onClick={onBookByPhone}
          className={cx(
            "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-4 font-semibold",
            "border border-on-forest/25 text-on-forest transition-colors duration-150",
            "hover:bg-on-forest/[0.08] active:scale-[0.97]",
          )}
        >
          <Phone aria-hidden="true" weight="bold" className="size-4" />
          {t("bookings.phone.open")}
        </button>
      )}
    </div>
  );
}

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};

/**
 * Where everyone is right now (design 04 §3a): expected, waiting, with a doctor, paying, at the
 * pharmacy. The stage where people wait longest (over a quarter of an hour) is marked hot.
 */
export function DeskFlow({
  queues,
  expected,
  className,
}: {
  queues: QueueGroup[];
  expected: StaffBooking[] | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const { stages } = useFlowModel(queues, expected);
  return <FlowStrip stages={stages} label={t("queue.flow.label")} className={className} />;
}

export type FlowBottleneck = {
  stage: "waiting" | "payment" | "pharmacy";
  /** Median minutes since arrival, for the waiting stage only. */
  minutes: number | null;
  people: number;
};

/** A median wait from arrival this long marks waiting as the slow step. */
const SLOW_WAIT_MINUTES = 20;
/** This many people at payment or the pharmacy is a queue forming there. */
const QUEUE_FORMING = 3;

/** The numbers behind the flow strip, shared by reception and the facility dashboard. */
export function useFlowModel(
  queues: QueueGroup[],
  expected: StaffBooking[] | undefined,
): { stages: FlowStage[]; bottleneck: FlowBottleneck | null } {
  const { t } = useTranslation();
  const inStage = (stages: string[], pick: (q: QueueGroup) => TicketRow[]) =>
    queues.filter((q) => stages.includes(q.stage)).flatMap(pick);
  // Remote joiners reception has not seen yet are not on site (S5 D-10)
  const onSite = (r: TicketRow) => !r.is_remote || Boolean(r.remote_arrival_confirmed_at);

  // Waiting: everyone on site before the doctor, including those at the reception desk
  const waiting = inStage(["reception", "consultation"], (q) => q.waiting).filter(onSite);
  const atDesk = inStage(["reception"], (q) => [...q.called, ...q.in_service]);
  const withDoctor = inStage(["consultation"], (q) => [...q.called, ...q.in_service]);
  const paying = inStage(["payment"], (q) => [...q.waiting, ...q.called, ...q.in_service]);
  const pharmacy = inStage(["pharmacy"], (q) => [...q.waiting, ...q.called, ...q.in_service]);
  const booked = (expected ?? []).filter((b) => b.status === "confirmed");
  const late = booked.filter((b) => b.late).length;

  // Minutes since arrival is a patient's whole wait, so it only measures the first stage. Later
  // stages have no stage-entry time on the row, so they are judged by how many people queue.
  const waitingMedian = median(waiting.map((r) => minutesSince(r.arrival_at)));
  const candidates: [FlowBottleneck["stage"], boolean, number][] = [
    ["waiting", waitingMedian >= SLOW_WAIT_MINUTES, waiting.length],
    ["payment", paying.length >= QUEUE_FORMING, paying.length],
    ["pharmacy", pharmacy.length >= QUEUE_FORMING, pharmacy.length],
  ];
  const slowest = candidates.filter(([, slow]) => slow).sort((a, b) => b[2] - a[2])[0]?.[0];

  const waitingCount = waiting.length + atDesk.length;
  const counts = [booked.length, waitingCount, withDoctor.length, paying.length, pharmacy.length];
  const top = Math.max(1, ...counts);
  const stages: FlowStage[] = [
    {
      key: "expected",
      label: t("queue.flow.expected"),
      icon: CalendarCheck,
      count: booked.length,
      detail: late
        ? t("queue.flow.late", { count: late })
        : booked.length
          ? t("queue.flow.booked")
          : t("queue.flow.none"),
      share: booked.length / top,
    },
    {
      key: "waiting",
      label: t("queue.flow.waiting"),
      icon: UsersThree,
      count: waitingCount,
      detail: waiting.length
        ? t("queue.flow.median", { count: waitingMedian })
        : t("queue.flow.none"),
      share: waitingCount / top,
      hot: slowest === "waiting",
    },
    {
      key: "doctor",
      label: t("queue.flow.withDoctor"),
      icon: Stethoscope,
      count: withDoctor.length,
      detail: withDoctor.length
        ? t("queue.flow.called", { count: withDoctor.filter((r) => r.state === "called").length })
        : t("queue.flow.none"),
      share: withDoctor.length / top,
    },
    {
      key: "payment",
      label: t("queue.flow.payment"),
      icon: Receipt,
      count: paying.length,
      detail: paying.length
        ? t("queue.flow.people", { count: paying.length })
        : t("queue.flow.none"),
      share: paying.length / top,
      hot: slowest === "payment",
    },
    {
      key: "pharmacy",
      label: t("queue.flow.pharmacy"),
      icon: Pill,
      count: pharmacy.length,
      detail: pharmacy.length
        ? t("queue.flow.people", { count: pharmacy.length })
        : t("queue.flow.none"),
      share: pharmacy.length / top,
      hot: slowest === "pharmacy",
    },
  ];
  const people = { waiting: waiting.length, payment: paying.length, pharmacy: pharmacy.length };
  return {
    stages,
    bottleneck: slowest
      ? {
          stage: slowest,
          minutes: slowest === "waiting" ? waitingMedian : null,
          people: people[slowest],
        }
      : null,
  };
}

/**
 * The slow step in words (design 04 §3.4): "Payment is the slow step today", with how long and
 * how many, so the facility admin knows where to send help.
 */
export function BottleneckCallout({ bottleneck }: { bottleneck: FlowBottleneck | null }) {
  const { t } = useTranslation();
  if (!bottleneck) return null;
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-attention-bg px-4 py-3 text-attention">
      <WarningCircle aria-hidden="true" weight="bold" className="size-5 shrink-0" />
      <strong className="font-semibold text-fg">{t(`queue.flow.slow.${bottleneck.stage}`)}</strong>
      <span>
        {bottleneck.minutes === null
          ? t("queue.flow.people", { count: bottleneck.people })
          : t("queue.flow.slowDetail", { count: bottleneck.people, minutes: bottleneck.minutes })}
      </span>
    </p>
  );
}

/** Service filter (design 04 §3.1): one segmented row, the waiting count on each. */
export function ServiceFilter({
  services,
  value,
  onChange,
  serviceName,
  label,
  allLabel,
}: {
  services: { id: string; waiting: number }[];
  value: string | null;
  onChange: (id: string | null) => void;
  serviceName: (id: string) => string;
  label: string;
  allLabel: string;
}) {
  const total = services.reduce((n, s) => n + s.waiting, 0);
  const options = [
    { id: null, name: allLabel, waiting: total },
    ...services.map((s) => ({ ...s, name: serviceName(s.id) })),
  ];
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex max-w-full flex-wrap gap-0.5 self-start rounded-lg bg-subtle p-1"
    >
      {options.map((option) => (
        <button
          key={option.id ?? "all"}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={cx(
            "inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-3 text-body-sm font-semibold",
            "text-fg-secondary transition-[background-color,color,box-shadow] duration-150 hover:text-fg",
            "aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:shadow-card",
          )}
        >
          {option.name}
          <span className="text-caption text-fg-muted tabular-nums">{option.waiting}</span>
        </button>
      ))}
    </div>
  );
}
