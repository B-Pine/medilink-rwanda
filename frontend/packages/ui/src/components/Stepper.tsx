import { Check, WarningCircle } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { cx } from "../utils/cx";

export type StepState = "complete" | "current" | "upcoming" | "error";

export interface StepperStep {
  id: string;
  label: ReactNode;
  state: StepState;
  /** When set, the step is a link/button to go back to it. */
  onSelect?: () => void;
  /** Screen-reader text for the state ("completed", "needs attention"). */
  stateText?: string;
}

export interface StepperProps {
  steps: StepperStep[];
  /** Accessible name of the list, e.g. "Application steps". */
  label: string;
  className?: string;
}

/**
 * Wizard progress (design 05 §3): an ordered list, the current step has aria-current="step",
 * states have an icon and text (not colour alone). Wraps on small screens (320 px).
 */
export function Stepper({ steps, label, className }: StepperProps) {
  return (
    <nav aria-label={label} className={className}>
      <ol className="m-0 flex list-none flex-wrap gap-x-4 gap-y-2 p-0">
        {steps.map((step, index) => {
          const content = (
            <>
              <span
                aria-hidden="true"
                className={cx(
                  "inline-flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-body-sm font-bold",
                  step.state === "complete" && "border-primary bg-primary text-on-primary",
                  step.state === "current" && "border-primary text-primary",
                  step.state === "upcoming" && "border-border-input text-fg-muted",
                  step.state === "error" && "border-danger text-danger",
                )}
              >
                {step.state === "complete" ? (
                  <Check weight="bold" />
                ) : step.state === "error" ? (
                  <WarningCircle weight="bold" />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={cx(step.state === "current" ? "font-bold text-fg" : "text-fg-secondary")}
              >
                {step.label}
              </span>
              {step.stateText && <span className="sr-only"> ({step.stateText})</span>}
            </>
          );
          return (
            <li
              key={step.id}
              aria-current={step.state === "current" ? "step" : undefined}
              className="flex items-center gap-2"
            >
              {step.onSelect && step.state !== "current" ? (
                <button
                  type="button"
                  onClick={step.onSelect}
                  className="inline-flex min-h-control cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left underline-offset-2 hover:underline"
                >
                  {content}
                </button>
              ) : (
                <span className="inline-flex min-h-control items-center gap-2">{content}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
