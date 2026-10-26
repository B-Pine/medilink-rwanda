import { CalendarBlank, Plus, Rows } from "@phosphor-icons/react";
import { useState } from "react";

import { cx } from "../utils/cx";

export interface WeekGridBlock {
  id: string;
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
  start: string;
  end: string;
  title: string;
  subtitle?: string | undefined;
  /** `brand` session, `pending` awaiting decision, `off` leave/closed (hatched, design 04 §1). */
  tone?: "brand" | "pending" | "off";
}

export interface WeekGridLabels {
  /** Accessible name of the whole grid, e.g. "Week of Uwimana Keza". */
  caption: string;
  gridView: string;
  tableView: string;
  day: string;
  time: string;
  session: string;
  actions: string;
  add: (day: string) => string;
  edit: string;
  empty: string;
}

export interface WeekGridProps {
  blocks: WeekGridBlock[];
  /** Seven day names, Monday first. */
  dayLabels: string[];
  labels: WeekGridLabels;
  onSelect?: ((block: WeekGridBlock) => void) | undefined;
  onAdd?: ((weekday: number) => void) | undefined;
  startHour?: number;
  endHour?: number;
  /** Highlight today's column (0 = Monday). */
  today?: number | undefined;
}

const minutes = (hhmm: string) => {
  const [h = "0", m = "0"] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
};

const TONES = {
  brand: "border-primary/40 bg-brand-subtle text-on-brand-subtle hover:border-primary",
  pending: "border-warning/50 bg-warning-bg text-warning hover:border-warning",
  off: "border-border-input bg-subtle text-fg-secondary",
} as const;

const HATCH = {
  backgroundImage:
    "repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, currentColor 14%, transparent) 6px 8px)",
};

/**
 * A doctor's week (sprint-02 §6.2, design 04 §1 "schedule as a picture"): 7 day columns × a time
 * axis, sessions drawn to scale as buttons. Leave is hatched, not coloured. A table view offers
 * the same actions for keyboard and screen-reader users (design 10); every name says day + time.
 */
export function WeekGrid({
  blocks,
  dayLabels,
  labels,
  onSelect,
  onAdd,
  startHour = 7,
  endHour = 19,
  today,
}: WeekGridProps) {
  const [view, setView] = useState<"grid" | "table">("grid");
  const span = (endHour - startHour) * 60;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const name = (b: WeekGridBlock) =>
    `${dayLabels[b.weekday]}, ${b.start}–${b.end}, ${b.title}${b.subtitle ? `, ${b.subtitle}` : ""}`;
  const sorted = [...blocks].sort(
    (a, b) => a.weekday - b.weekday || minutes(a.start) - minutes(b.start),
  );

  return (
    <section aria-label={labels.caption} className="flex flex-col gap-3">
      <div
        role="group"
        aria-label={labels.caption}
        className="inline-flex self-end rounded-md border border-border bg-surface p-0.5"
      >
        {(
          [
            ["grid", CalendarBlank, labels.gridView],
            ["table", Rows, labels.tableView],
          ] as const
        ).map(([key, ViewIcon, text]) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            onClick={() => setView(key)}
            className={cx(
              "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-sm px-3 text-body-sm font-semibold",
              view === key
                ? "bg-brand-subtle text-on-brand-subtle"
                : "text-fg-secondary hover:text-fg",
            )}
          >
            <ViewIcon aria-hidden="true" className="size-4" />
            {text}
          </button>
        ))}
      </div>

      {view === "grid" ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <div className="grid min-w-[44rem] grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
            <div className="border-b border-border" />
            {dayLabels.map((day, weekday) => (
              <div
                key={day}
                className={cx(
                  "flex items-center justify-between gap-1 border-b border-l border-border px-2 py-2",
                  today === weekday && "bg-brand-subtle/60",
                )}
              >
                <span
                  className={cx(
                    "truncate text-body-sm font-semibold",
                    today === weekday ? "text-on-brand-subtle" : "text-fg",
                  )}
                >
                  {day}
                </span>
                {onAdd && (
                  <button
                    type="button"
                    onClick={() => onAdd(weekday)}
                    aria-label={labels.add(day)}
                    title={labels.add(day)}
                    className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-sm text-fg-muted hover:bg-subtle hover:text-fg"
                  >
                    <Plus aria-hidden="true" weight="bold" className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
            <div className="relative" style={{ height: `${(endHour - startHour) * 3}rem` }}>
              {hours.slice(0, -1).map((h, i) => (
                <span
                  key={h}
                  className="absolute right-2 -translate-y-1/2 text-caption text-fg-muted tabular-nums first:translate-y-0"
                  style={{ top: `${i * 3}rem` }}
                  aria-hidden="true"
                >
                  {String(h).padStart(2, "0")}:00
                </span>
              ))}
            </div>
            {dayLabels.map((day, weekday) => (
              <div
                key={day}
                className={cx(
                  "relative border-l border-border",
                  today === weekday && "bg-brand-subtle/25",
                )}
                style={{
                  backgroundImage:
                    "linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)",
                  backgroundSize: "100% 3rem",
                }}
              >
                {blocks
                  .filter((b) => b.weekday === weekday)
                  .map((b) => {
                    const top = Math.max(0, minutes(b.start) - startHour * 60) / span;
                    const height =
                      (Math.min(span, minutes(b.end) - startHour * 60) -
                        Math.max(0, minutes(b.start) - startHour * 60)) /
                      span;
                    const tone = b.tone ?? "brand";
                    const content = (
                      <>
                        <span className="block truncate text-body-sm font-semibold">{b.title}</span>
                        <span className="block text-caption tabular-nums opacity-90">
                          {b.start}–{b.end}
                        </span>
                        {b.subtitle && (
                          <span className="block truncate text-caption opacity-90">
                            {b.subtitle}
                          </span>
                        )}
                      </>
                    );
                    const style = {
                      top: `${top * 100}%`,
                      height: `${Math.max(height * 100, 4)}%`,
                      ...(tone === "off" ? HATCH : {}),
                    };
                    const className = cx(
                      "absolute inset-x-1 overflow-hidden rounded-md border px-2 py-1 text-left",
                      TONES[tone],
                    );
                    return onSelect ? (
                      <button
                        key={b.id}
                        type="button"
                        aria-label={name(b)}
                        onClick={() => onSelect(b)}
                        className={cx(className, "cursor-pointer transition-colors")}
                        style={style}
                      >
                        {content}
                      </button>
                    ) : (
                      <div
                        key={b.id}
                        role="img"
                        aria-label={name(b)}
                        className={className}
                        style={style}
                      >
                        {content}
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">{labels.caption}</caption>
            <thead className="bg-subtle text-body-sm text-fg-secondary">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {labels.day}
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {labels.time}
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {labels.session}
                </th>
                {(onSelect || onAdd) && (
                  <th scope="col" className="px-3 py-2 font-semibold">
                    {labels.actions}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {dayLabels.map((day, weekday) => {
                const rows = sorted.filter((b) => b.weekday === weekday);
                return (rows.length ? rows : [null]).map((b, index) => (
                  <tr key={b?.id ?? `${day}-empty`} className="border-t border-border">
                    {index === 0 && (
                      <th
                        scope="row"
                        rowSpan={Math.max(rows.length, 1)}
                        className="px-3 py-2 align-top font-semibold"
                      >
                        {day}
                      </th>
                    )}
                    <td className="px-3 py-2 tabular-nums">{b ? `${b.start}–${b.end}` : "—"}</td>
                    <td className="px-3 py-2">
                      {b ? (
                        <>
                          {b.title}
                          {b.subtitle && <span className="text-fg-muted"> · {b.subtitle}</span>}
                        </>
                      ) : (
                        <span className="text-fg-muted">{labels.empty}</span>
                      )}
                    </td>
                    {(onSelect || onAdd) && (
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          {b && onSelect && (
                            <button
                              type="button"
                              onClick={() => onSelect(b)}
                              aria-label={`${labels.edit}: ${name(b)}`}
                              className="cursor-pointer font-semibold text-link underline-offset-2 hover:underline"
                            >
                              {labels.edit}
                            </button>
                          )}
                          {index === 0 && onAdd && (
                            <button
                              type="button"
                              onClick={() => onAdd(weekday)}
                              className="cursor-pointer font-semibold text-link underline-offset-2 hover:underline"
                            >
                              {labels.add(day)}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
