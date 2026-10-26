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

/**
 * Ticket number (design 03 §1): large, bold, letter-spaced, tabular; Figtree's zero is open, so 0
 * and O don't mix.
 */
export function TicketNumber({
  number,
  size = "md",
  className,
}: {
  number: string;
  size?: "sm" | "md" | "lg" | "display";
  className?: string;
}) {
  const sizes = {
    sm: "text-body font-bold",
    md: "text-h3 font-bold",
    lg: "text-h1 font-bold",
    display: "text-display font-extrabold",
  } as const;
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
