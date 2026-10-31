import { CheckCircle, Warning } from "@phosphor-icons/react";

import { cx } from "../utils/cx";

export interface SymptomPickerItem {
  code: string;
  /** Label in the UI language. */
  label: string;
  /** Group key, e.g. the body system (`respiratory`). */
  group: string;
  /** Red-flag symptoms are shown in the danger tone when chosen (FR-AI-01). */
  redFlag?: boolean;
}

export interface SymptomPickerProps {
  items: SymptomPickerItem[];
  /** Groups in display order with their labels; groups not listed come last, by key. */
  groups: { key: string; label: string }[];
  chosen: ReadonlySet<string>;
  onToggle: (code: string) => void;
  /** Accessible name of the whole picker (visually hidden). */
  legend: string;
  /** Visible label for a chosen red-flag chip, e.g. "Urgent". */
  redFlagLabel?: string;
  /** Larger chips for patients (48 px targets); staff use the default. */
  size?: "md" | "lg";
}

/**
 * Structured reason for visit (sprint-05 §2.2, design 07 §3.2): symptom chips grouped by body
 * system, toggle buttons with `aria-pressed`. Presentational; callers pass translated labels.
 */
export function SymptomPicker({
  items,
  groups,
  chosen,
  onToggle,
  legend,
  redFlagLabel,
  size = "md",
}: SymptomPickerProps) {
  const order = new Map(groups.map((g, i) => [g.key, i]));
  const labels = new Map(groups.map((g) => [g.key, g.label]));
  const byGroup = new Map<string, SymptomPickerItem[]>();
  for (const item of items) byGroup.set(item.group, [...(byGroup.get(item.group) ?? []), item]);
  const sorted = [...byGroup.entries()].sort(([a], [b]) => {
    const ia = order.get(a) ?? Number.MAX_SAFE_INTEGER;
    const ib = order.get(b) ?? Number.MAX_SAFE_INTEGER;
    return ia - ib || a.localeCompare(b);
  });

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
      <legend className="sr-only">{legend}</legend>
      {sorted.map(([group, entries]) => (
        <div key={group} className="flex flex-col gap-2">
          <span className="text-body-sm font-semibold text-fg-muted">
            {labels.get(group) ?? group}
          </span>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {entries.map((item) => {
              const on = chosen.has(item.code);
              const danger = on && item.redFlag;
              return (
                <li key={item.code}>
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={
                      danger && redFlagLabel ? `${item.label} (${redFlagLabel})` : undefined
                    }
                    onClick={() => onToggle(item.code)}
                    className={cx(
                      "inline-flex cursor-pointer items-center gap-2 rounded-full border font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none",
                      size === "lg" ? "min-h-target px-4" : "min-h-control px-3 text-body-sm",
                      on
                        ? danger
                          ? "border-danger bg-danger-bg text-danger"
                          : "border-brand bg-brand text-on-primary"
                        : "border-border-input bg-surface text-fg hover:bg-subtle",
                    )}
                  >
                    {on &&
                      (danger ? (
                        <Warning aria-hidden="true" weight="fill" className="size-5" />
                      ) : (
                        <CheckCircle aria-hidden="true" weight="fill" className="size-5" />
                      ))}
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </fieldset>
  );
}
