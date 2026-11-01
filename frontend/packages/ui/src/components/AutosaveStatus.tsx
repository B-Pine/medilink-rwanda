import { CheckCircle, CircleNotch, CloudSlash, PencilSimple } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { cx } from "../utils/cx";

export type AutosaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export interface AutosaveStatusProps {
  state: AutosaveState;
  /** Text for the current state in the UI language, e.g. "Draft · saved 09:12". */
  label: string;
  /** Shown next to the error state, e.g. a Retry button. */
  action?: ReactNode;
  className?: string;
}

const ICONS = {
  idle: CheckCircle,
  dirty: PencilSimple,
  saving: CircleNotch,
  saved: CheckCircle,
  error: CloudSlash,
} as const;

/**
 * Always-visible autosave status of a draft (design 04 §3.2). A polite live region, so screen
 * readers hear "Saving…" and "Saved" without moving focus; the error state is a warning with an
 * action. Icon + text for every state; the spinner stops under reduced motion.
 */
export function AutosaveStatus({ state, label, action, className }: AutosaveStatusProps) {
  const Icon = ICONS[state];
  return (
    <div
      className={cx(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-body-sm",
        state === "error"
          ? "border-warning bg-warning-bg text-fg"
          : "border-border bg-surface text-fg-secondary",
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        weight="bold"
        className={cx(
          "size-icon shrink-0",
          state === "saving" && "animate-spin motion-reduce:animate-none",
          state === "error" && "text-warning",
          state === "saved" && "text-success",
        )}
      />
      <span role="status" aria-live="polite">
        {label}
      </span>
      {action}
    </div>
  );
}
