import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { cx } from "../utils/cx";

export interface DatePartsProps {
  label: string;
  /** ISO date (yyyy-mm-dd), or "" while incomplete. */
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  className?: string;
}

const split = (iso: string) => {
  const [y = "", m = "", d = ""] = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-") : [];
  return { d, m, y };
};

/**
 * A date typed as Day / Month / Year (Rwanda's order, in every language): three labelled numeric
 * boxes in a fieldset. A native date input shows the browser's region format instead (often
 * mm/dd/yyyy, which swaps day and month). Emits an ISO date once all three parts form a real
 * date, otherwise "".
 */
export function DateParts({ label, value, onChange, error, hint, className }: DatePartsProps) {
  const { t } = useTranslation("ui");
  const id = `date-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [parts, setParts] = useState(() => split(value));
  // the form reset the value (e.g. a new walk-in): follow it
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value === "" || value !== toIso(parts)) setParts(split(value));
  }

  const update = (key: "d" | "m" | "y", raw: string) => {
    const next = { ...parts, [key]: raw.replace(/\D/g, "").slice(0, key === "y" ? 4 : 2) };
    setParts(next);
    const iso = toIso(next);
    setSeen(iso);
    onChange(iso);
  };
  const described = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");
  const box = (key: "d" | "m" | "y", width: string, placeholder: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-caption text-fg-muted">{t(`dateParts.${keyName[key]}`)}</span>
      <input
        inputMode="numeric"
        autoComplete="off"
        value={parts[key]}
        placeholder={placeholder}
        onChange={(e) => update(key, e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={described || undefined}
        className={cx(
          "min-h-control rounded-lg border bg-surface px-3 text-body tabular-nums text-fg",
          "focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
          error ? "border-danger" : "border-border-input",
          width,
        )}
      />
    </label>
  );
  return (
    <fieldset className={cx("m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0", className)}>
      <legend className="mb-1.5 p-0 text-body-sm font-semibold text-fg">{label}</legend>
      <div className="flex items-end gap-2">
        {box("d", "w-16", "DD")}
        {box("m", "w-16", "MM")}
        {box("y", "w-24", "YYYY")}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="m-0 text-caption text-fg-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="m-0 text-caption font-semibold text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

const keyName = { d: "day", m: "month", y: "year" } as const;

function toIso({ d, m, y }: { d: string; m: string; y: string }): string {
  if (y.length !== 4 || !d || !m) return "";
  const day = Number(d);
  const month = Number(m);
  const date = new Date(Date.UTC(Number(y), month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
