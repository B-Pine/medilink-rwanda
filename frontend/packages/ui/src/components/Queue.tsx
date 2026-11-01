import {
  ArrowUUpLeft,
  CheckCircle,
  Flask,
  HourglassMedium,
  MegaphoneSimple,
  PersonSimpleWalk,
  Siren,
  Star,
  Stethoscope,
  UserMinus,
  type Icon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { cx } from "../utils/cx";
import { Badge, type BadgeTone } from "./Badge";

export type QueueState =
  | "waiting"
  | "called"
  | "in_service"
  | "no_response"
  | "on_hold"
  | "moved_to_next_stage"
  | "transferred"
  | "cancelled"
  | "left_without_service"
  | "completed";

/** Queue state colours and icons (design 02 §4): every state is an icon + a word. */
const STATES: Record<QueueState, { tone: BadgeTone; icon: Icon }> = {
  waiting: { tone: "info", icon: HourglassMedium },
  called: { tone: "warning", icon: MegaphoneSimple },
  in_service: { tone: "brand", icon: Stethoscope },
  no_response: { tone: "danger", icon: UserMinus },
  on_hold: { tone: "neutral", icon: Flask },
  moved_to_next_stage: { tone: "neutral", icon: CheckCircle },
  transferred: { tone: "neutral", icon: ArrowUUpLeft },
  cancelled: { tone: "neutral", icon: UserMinus },
  left_without_service: { tone: "danger", icon: UserMinus },
  completed: { tone: "success", icon: CheckCircle },
};

export function QueueStateBadge({ state, children }: { state: QueueState; children: ReactNode }) {
  const { tone, icon } = STATES[state];
  return (
    <Badge tone={tone} icon={icon} className={state === "called" ? "font-bold" : undefined}>
      {children}
    </Badge>
  );
}

export type QueueFlag = "emergency" | "priority" | "return" | "stepped_out" | "no_response";

const FLAGS: Record<QueueFlag, { className: string; icon: Icon }> = {
  emergency: { className: "bg-danger-solid text-on-danger-solid", icon: Siren },
  priority: { className: "bg-info-bg text-info", icon: Star },
  return: { className: "bg-brand-subtle text-on-brand-subtle", icon: ArrowUUpLeft },
  stepped_out: { className: "bg-subtle text-fg-secondary", icon: PersonSimpleWalk },
  no_response: { className: "bg-warning-bg text-warning", icon: UserMinus },
};

/** A row flag chip (design 04 §3.1): solid red only for emergency, the one thing never missed. */
export function QueueFlagChip({ flag, children }: { flag: QueueFlag; children: ReactNode }) {
  const { className, icon: FlagIcon } = FLAGS[flag];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold",
        className,
      )}
    >
      <FlagIcon aria-hidden="true" weight="bold" className="size-3.5" />
      {children}
    </span>
  );
}

/** `onForest` and `onSolid` sit on the deep-forest band and on a solid ochre card. */
export type TicketTone = "brand" | "attention" | "danger" | "neutral" | "onForest" | "onSolid";

const TICKET_TONES: Record<TicketTone, string> = {
  brand: "bg-brand-subtle text-on-brand-subtle",
  attention: "bg-attention-bg text-attention",
  danger: "bg-danger-bg text-danger",
  neutral: "bg-subtle text-fg-secondary",
  onForest: "bg-on-forest/10 text-on-forest",
  onSolid: "bg-surface text-fg",
};

const STUB_SIZES = {
  sm: "min-w-14 px-2 py-1 text-body-sm [--ml-notch:0.3125rem]",
  md: "min-w-16 px-2.5 py-1.5 text-body [--ml-notch:0.4375rem]",
  lg: "min-w-32 px-4 py-3 text-h1 [--ml-notch:0.6875rem]",
  display: "min-w-48 px-7 py-5 text-display [--ml-notch:0.875rem]",
} as const;

/**
 * Ticket number (design 03 §1): bold, letter-spaced, tabular; Figtree's zero is open, so 0 and O
 * don't mix. `stub` draws the notched ticket (design 03 §1a), the shape a patient holds, tinted by
 * `tone`: brand by default, attention for "your turn" or next up, danger for emergencies,
 * neutral for someone not yet arrived.
 */
export function TicketNumber({
  number,
  size = "md",
  stub = false,
  tone = "brand",
  className,
}: {
  number: string;
  size?: "sm" | "md" | "lg" | "display";
  stub?: boolean;
  tone?: TicketTone;
  className?: string;
}) {
  const sizes = {
    sm: "text-body font-bold",
    md: "text-h3 font-bold",
    lg: "text-h1 font-bold",
    display: "text-display font-extrabold",
  } as const;
  if (stub) {
    return (
      <span
        className={cx(
          "ml-ticket-stub inline-grid place-items-center rounded-md font-heading font-extrabold",
          "leading-none tracking-wider whitespace-nowrap tabular-nums",
          STUB_SIZES[size],
          TICKET_TONES[tone],
          className,
        )}
      >
        {number}
      </span>
    );
  }
  return (
    <span
      className={cx(
        "font-heading tracking-wider whitespace-nowrap tabular-nums",
        sizes[size],
        className,
      )}
    >
      {number}
    </span>
  );
}

/** People ahead as dots (design 07 §3.3 "simple progress dots, not a percentage"). */
export function ProgressDots({
  ahead,
  max = 5,
  label,
}: {
  ahead: number;
  max?: number;
  label: string;
}) {
  const shown = Math.min(ahead, max);
  return (
    <span role="img" aria-label={label} className="inline-flex items-center gap-1.5">
      {Array.from({ length: max + 1 }, (_, i) => (
        <span
          key={i}
          className={cx(
            "size-3 rounded-full",
            i < shown
              ? "bg-primary"
              : i === shown
                ? "border-2 border-primary bg-surface ring-2 ring-primary/30"
                : "bg-border",
          )}
        />
      ))}
    </span>
  );
}
