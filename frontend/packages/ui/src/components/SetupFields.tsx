import { useId, type ReactNode } from "react";

import { cx } from "../utils/cx";
import { Field, inputClassName } from "./Field";

/** `HH:MM` comparison (both values from <input type="time">). */
export const timeBefore = (a: string, b: string) => Boolean(a && b && a < b);

export interface TimeRangeFieldProps {
  /** Group label, e.g. the day name. */
  label: ReactNode;
  start: string;
  end: string;
  onChange: (range: { start: string; end: string }) => void;
  labels: { start: string; end: string; order: string };
  /** Server or form error (shown instead of the order check). */
  error?: string | undefined;
  disabled?: boolean;
  className?: string;
}

/**
 * Two time inputs as one field (sprint-02 §6.2): shows "end must be after start" inline while
 * both are filled and in the wrong order. Native time inputs keep the keyboard and screen-reader
 * behaviour of the platform.
 */
export function TimeRangeField({
  label,
  start,
  end,
  onChange,
  labels,
  error,
  disabled,
  className,
}: TimeRangeFieldProps) {
  const id = useId();
  const orderError = start && end && !timeBefore(start, end) ? labels.order : undefined;
  const shown = error ?? orderError;
  const errorId = `${id}-error`;
  return (
    <fieldset className={cx("m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0", className)}>
      <legend className="mb-1.5 p-0 text-body-sm font-semibold text-fg">{label}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="time"
          aria-label={labels.start}
          value={start}
          disabled={disabled}
          aria-invalid={shown ? true : undefined}
          aria-describedby={shown ? errorId : undefined}
          onChange={(event) => onChange({ start: event.target.value, end })}
          className={cx(inputClassName, "w-32 tabular-nums")}
        />
        <span aria-hidden="true" className="text-fg-muted">
          –
        </span>
        <input
          type="time"
          aria-label={labels.end}
          value={end}
          disabled={disabled}
          aria-invalid={shown ? true : undefined}
          aria-describedby={shown ? errorId : undefined}
          onChange={(event) => onChange({ start, end: event.target.value })}
          className={cx(inputClassName, "w-32 tabular-nums")}
        />
      </div>
      {shown && (
        <p id={errorId} className="m-0 text-body-sm font-semibold text-danger">
          {shown}
        </p>
      )}
    </fieldset>
  );
}

const CURRENCY = "RWF";

/** `12500` → `12,500 RWF` in the given locale (whole francs: RWF has no minor unit). */
export function formatRwf(amount: number | null | undefined, locale = "en"): string {
  if (amount === null || amount === undefined) return "—";
  try {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(amount)} RWF`;
  } catch {
    return `${amount} RWF`;
  }
}

export interface MoneyFieldProps {
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  optional?: boolean;
  /** Whole francs, or null when empty. */
  value: number | null;
  onChange: (value: number | null) => void;
  locale?: string;
  className?: string;
}

/**
 * Amount in Rwandan francs (sprint-02 §6.2): integer only, grouped while typing ("12 500"),
 * the currency shown as a fixed suffix so it is never typed or lost.
 */
export function MoneyField({
  id,
  label,
  hint,
  error,
  optional,
  value,
  onChange,
  locale = "en",
  className,
}: MoneyFieldProps) {
  const display = value === null ? "" : new Intl.NumberFormat(locale).format(value);
  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      error={error}
      optional={optional}
      className={className}
    >
      {(control) => (
        <div className="relative max-w-56">
          <input
            {...control}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-required={!optional || undefined}
            value={display}
            onChange={(event) => {
              const digits = event.target.value.replace(/\D/g, "").slice(0, 9);
              onChange(digits ? Number(digits) : null);
            }}
            className={cx(inputClassName, "pr-14 text-right tabular-nums")}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-body-sm font-semibold text-fg-muted"
          >
            {CURRENCY}
          </span>
        </div>
      )}
    </Field>
  );
}
