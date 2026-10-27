import { ArrowDownRight, ArrowUpRight, Minus } from "@phosphor-icons/react";
import { useId, useState, type ReactNode } from "react";

import { cx } from "../utils/cx";

/**
 * Chart kit (design 02 §6, design 04 §4). Rules: one y-axis; thin 2 px lines; text in ink colours,
 * never series colours; a hover readout on every chart; every chart has a table equivalent for
 * screen readers. Colours come from the validated `--color-chart-*` / `--color-seq-*` tokens.
 */

const SERIES = ["var(--ml-chart-1)", "var(--ml-chart-2)", "var(--ml-chart-3)", "var(--ml-chart-4)"];

function points(values: (number | null)[], width: number, height: number, pad = 2) {
  const known = values.filter((v): v is number => v !== null);
  const max = Math.max(...known, 1);
  const min = Math.min(...known, 0);
  const span = max - min || 1;
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  return values.map((v, i) =>
    v === null ? null : { x: pad + i * step, y: pad + (height - pad * 2) * (1 - (v - min) / span) },
  );
}

/** Small trend line for stat tiles (decorative: the tile states the numbers in text). */
export function Sparkline({
  values,
  color = "var(--ml-chart-1)",
  className,
}: {
  values: (number | null)[];
  color?: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const pts = points(values, 120, 36);
  const known = pts.filter((p): p is { x: number; y: number } => p !== null);
  if (known.length < 2)
    return <svg aria-hidden="true" className={className} viewBox="0 0 120 36" />;
  const line = known.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const last = known.at(-1)!;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 120 36"
      preserveAspectRatio="none"
      className={cx("overflow-visible", className)}
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${last.x},36 L${known[0]!.x},36 Z`} fill={`url(#spark-${id})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last.x} cy={last.y} r="2.6" fill={color} />
    </svg>
  );
}

export interface StatTileProps {
  label: string;
  value: ReactNode;
  unit?: string;
  /** Change vs the comparison period, in %; null hides it. */
  deltaPct?: number | null;
  /** Text after the delta, e.g. "vs last Tuesday". */
  deltaLabel?: string;
  /** For waits and no-shows a fall is good. */
  lowerIsBetter?: boolean;
  trend?: (number | null)[];
  /** Shown instead of a value when the metric is not available yet. */
  note?: string;
  icon?: ReactNode;
}

/**
 * KPI tile (design 04 §3.4): hero number, change with an arrow + word (never colour alone) and a
 * sparkline. A metric that isn't measured yet says so instead of inventing a number (design 06 H6).
 */
export function StatTile({
  label,
  value,
  unit,
  deltaPct,
  deltaLabel,
  lowerIsBetter,
  trend,
  note,
  icon,
}: StatTileProps) {
  const good =
    deltaPct === null || deltaPct === undefined || deltaPct === 0
      ? null
      : deltaPct < 0 === Boolean(lowerIsBetter);
  const Arrow = !deltaPct ? Minus : deltaPct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-body-sm font-semibold text-fg-secondary">{label}</span>
        {icon && <span className="text-fg-muted">{icon}</span>}
      </div>
      {note ? (
        <p className="m-0 text-body-sm text-fg-muted">{note}</p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-3">
            <p className="m-0 flex items-baseline gap-1 font-heading text-display leading-none font-semibold text-fg tabular-nums">
              {value}
              {unit && <span className="text-body font-semibold text-fg-secondary">{unit}</span>}
            </p>
            {trend && <Sparkline values={trend} className="h-9 w-24 shrink-0" />}
          </div>
          {deltaPct !== undefined && deltaPct !== null && (
            <p
              className={cx(
                "m-0 inline-flex items-center gap-1 text-body-sm font-semibold tabular-nums",
                good === null ? "text-fg-secondary" : good ? "text-success" : "text-danger",
              )}
            >
              <Arrow aria-hidden="true" weight="bold" className="size-4" />
              {deltaPct > 0 ? "+" : ""}
              {deltaPct}%
              <span className="font-normal text-fg-secondary">
                {deltaLabel ? ` ${deltaLabel}` : ""}
              </span>
            </p>
          )}
        </>
      )}
    </div>
  );
}

export interface TrendSeries {
  name: string;
  values: (number | null)[];
}

/** Line chart with hover readout and a table for assistive technology (design 04 §4). */
export function TrendChart({
  title,
  labels,
  series,
  unit = "",
  height = 200,
}: {
  title: string;
  labels: string[];
  series: TrendSeries[];
  unit?: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const pad = { l: 36, r: 12, t: 12, b: 26 };
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const max = Math.max(...all, 1);
  // whole-number ticks: round the top up to a multiple of 2, 10 or 20 so the middle tick is whole
  const unitStep = max <= 10 ? 2 : max <= 50 ? 10 : 20;
  const top = Math.ceil(max / unitStep) * unitStep;
  const x = (i: number) =>
    pad.l + (labels.length > 1 ? (i * (width - pad.l - pad.r)) / (labels.length - 1) : 0);
  const y = (v: number) => pad.t + (height - pad.t - pad.b) * (1 - v / top);
  const ticks = [0, top / 2, top];
  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 font-heading text-h3">{title}</h2>
        {series.length > 1 && (
          <span className="flex flex-wrap gap-3 text-caption text-fg-secondary">
            {series.map((s, i) => (
              <span key={s.name} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-0.5 w-4 rounded-full"
                  style={{ background: SERIES[i] }}
                />
                {s.name}
              </span>
            ))}
          </span>
        )}
      </figcaption>
      <div className="relative">
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full"
          onPointerLeave={() => setHover(null)}
          onPointerMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const rel = ((e.clientX - box.left) / box.width) * width;
            const i = Math.round(((rel - pad.l) / (width - pad.l - pad.r)) * (labels.length - 1));
            setHover(Math.max(0, Math.min(labels.length - 1, i)));
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={pad.l}
                x2={width - pad.r}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--ml-chart-grid)"
                strokeWidth="1"
              />
              <text
                x={pad.l - 6}
                y={y(t) + 4}
                textAnchor="end"
                className="fill-fg-muted text-[11px] tabular-nums"
              >
                {t}
              </text>
            </g>
          ))}
          {labels.map((l, i) =>
            i % Math.ceil(labels.length / 7) === 0 || i === labels.length - 1 ? (
              <text
                key={l + i}
                x={x(i)}
                y={height - 6}
                textAnchor="middle"
                className="fill-fg-muted text-[11px]"
              >
                {l}
              </text>
            ) : null,
          )}
          {series.map((s, si) => {
            const d = s.values
              .map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
              .reduce<string>(
                (acc, p, i, arr) =>
                  p === null ? acc : acc + (arr[i - 1] === null || i === 0 ? ` M${p}` : ` L${p}`),
                "",
              );
            return (
              <path
                key={s.name}
                d={d}
                fill="none"
                stroke={SERIES[si]}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })}
          {hover !== null && (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={pad.t}
                y2={height - pad.b}
                stroke="var(--ml-border-input)"
                strokeDasharray="3 3"
              />
              {series.map((s, si) => {
                const v = s.values[hover];
                return v === null || v === undefined ? null : (
                  <circle
                    key={s.name}
                    cx={x(hover)}
                    cy={y(v)}
                    r="4"
                    fill="var(--ml-bg-surface)"
                    stroke={SERIES[si]}
                    strokeWidth="2"
                  />
                );
              })}
            </g>
          )}
        </svg>
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-0 rounded-md border border-border bg-raised px-3 py-2 text-body-sm shadow-raised"
            style={{
              left: `${(x(hover) / width) * 100}%`,
              transform: `translateX(${hover > labels.length / 2 ? "-105%" : "5%"})`,
            }}
          >
            <p className="m-0 font-semibold">{labels[hover]}</p>
            {series.map((s, si) => (
              <p
                key={s.name}
                className="m-0 inline-flex w-full items-center justify-between gap-3 tabular-nums"
              >
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full"
                    style={{ background: SERIES[si] }}
                  />
                  {s.name}
                </span>
                <span className="font-semibold">
                  {s.values[hover] ?? "—"}
                  {s.values[hover] !== null ? unit : ""}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">{title}</th>
            {series.map((s) => (
              <th key={s.name} scope="col">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((l, i) => (
            <tr key={l + i}>
              <th scope="row">{l}</th>
              {series.map((s) => (
                <td key={s.name}>{s.values[i] ?? "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Weekday × hour heat map, sequential emerald (design 04 §4 "arrivals by weekday × hour"). */
export function HeatMap({
  title,
  rows,
  columns,
  value,
  legend,
}: {
  title: string;
  rows: string[];
  columns: number[];
  value: (row: number, column: number) => number;
  legend: { less: string; more: string };
}) {
  const max = Math.max(1, ...rows.flatMap((_, r) => columns.map((c) => value(r, c))));
  const step = (v: number) => (v === 0 ? 0 : Math.min(5, Math.ceil((v / max) * 5)));
  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption>
        <h2 className="m-0 font-heading text-h3">{title}</h2>
      </figcaption>
      <div className="overflow-x-auto" aria-hidden="true">
        <div
          className="grid min-w-[30rem] gap-1"
          style={{ gridTemplateColumns: `2.5rem repeat(${columns.length}, minmax(0, 1fr))` }}
        >
          <span />
          {columns.map((c) => (
            <span key={c} className="text-center text-caption text-fg-muted tabular-nums">
              {c}
            </span>
          ))}
          {rows.map((r, ri) => (
            <div key={r} className="contents">
              <span className="self-center text-caption text-fg-muted">{r}</span>
              {columns.map((c) => {
                const v = value(ri, c);
                const s = step(v);
                return (
                  <span
                    key={c}
                    title={`${r} ${c}:00 · ${v}`}
                    className="aspect-[1.6] rounded-sm"
                    style={{ background: s ? `var(--ml-seq-${s})` : "var(--ml-bg-subtle)" }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div
        className="flex items-center gap-1.5 self-end text-caption text-fg-muted"
        aria-hidden="true"
      >
        {legend.less}
        {[1, 2, 3, 4, 5].map((s) => (
          <span
            key={s}
            className="size-3 rounded-sm"
            style={{ background: `var(--ml-seq-${s})` }}
          />
        ))}
        {legend.more}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <td />
            {columns.map((c) => (
              <th key={c} scope="col">{`${c}:00`}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r}>
              <th scope="row">{r}</th>
              {columns.map((c) => (
                <td key={c}>{value(ri, c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export type Load = "low" | "medium" | "high";

/** Queue pressure bar (design 04 §3.4 "coloured by pressure", icon + label, never colour alone). */
export function LoadMeter({
  load,
  label,
  value,
  max,
}: {
  load: Load;
  label: string;
  value: number;
  max: number;
}) {
  const tone = { low: "bg-success", medium: "bg-warning", high: "bg-danger" }[load];
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="flex h-2 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
        <span
          className={cx(
            "rounded-full transition-[width] duration-500 motion-reduce:transition-none",
            tone,
          )}
          style={{ width: `${Math.min(100, (value / Math.max(max, 1)) * 100)}%` }}
        />
      </span>
      <span
        className={cx(
          "text-caption font-semibold",
          { low: "text-success", medium: "text-warning", high: "text-danger" }[load],
        )}
      >
        {label}
      </span>
    </span>
  );
}
