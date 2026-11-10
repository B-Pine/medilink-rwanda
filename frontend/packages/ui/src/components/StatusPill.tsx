import type { ReactNode } from "react";

import { cx } from "../utils/cx";

export type StatusTone = "open" | "busy" | "closed" | "emergency" | "waiting";

const TONES: Record<StatusTone, string> = {
  open: "bg-success-bg text-success",
  busy: "bg-attention-bg text-attention",
  closed: "bg-subtle text-fg-secondary",
  emergency: "bg-danger-bg text-danger",
  waiting: "bg-attention-bg text-attention",
};

export interface StatusPillProps {
  tone: StatusTone;
  /** Always a word: colour is never the only signal (WCAG 1.4.1). */
  children: ReactNode;
  /** A pulsing dot for live states (open now). Still with reduced motion. */
  live?: boolean;
  className?: string;
}

/**
 * Open / Busy / Closed / Emergency / a waiting count: one pill shape, a dot and a word, the tone
 * from the status palette. Numbers inside are tabular.
 */
export function StatusPill({ tone, children, live = false, className }: StatusPillProps) {
  return (
    <span
      className={cx(
        "inline-flex min-h-6 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-semibold whitespace-nowrap tabular-nums",
        TONES[tone],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "size-1.5 shrink-0 rounded-full bg-current",
          live && "motion-safe:animate-[ml-live-pulse_2s_ease-out_infinite]",
        )}
      />
      {children}
    </span>
  );
}
