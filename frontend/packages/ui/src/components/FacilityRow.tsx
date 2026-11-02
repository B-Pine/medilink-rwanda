import { useEffect, useRef, type ReactNode } from "react";

import { cx } from "../utils/cx";

export type WaitTone = "low" | "medium" | "high";

/** Columns shared by the header and every row, so values line up down the list (upgrade 02 §3). */
const COLUMNS = "lg:grid-cols-[minmax(0,1fr)_8rem_5rem_6rem_minmax(0,12rem)]";

const TONE_DOT: Record<WaitTone, string> = {
  low: "text-success",
  medium: "text-warning",
  high: "text-attention",
};

export interface FacilityListLabels {
  /** Accessible name of the list, e.g. "Facilities". */
  list: string;
  name: string;
  type: string;
  distance: string;
  status: string;
  wait: string;
}

/**
 * The live list of places (upgrade 03 §2): a flat list with hairline dividers and one column
 * header on wide screens. Rows are `FacilityRow`s.
 */
export function FacilityList({
  labels,
  children,
  className,
}: {
  labels: FacilityListLabels;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col", className)}>
      <div
        aria-hidden="true"
        className={cx(
          "hidden gap-x-6 border-b border-border px-4 pb-2 text-caption font-semibold text-fg-muted lg:grid",
          COLUMNS,
        )}
      >
        <span>{labels.name}</span>
        <span>{labels.type}</span>
        <span className="text-right">{labels.distance}</span>
        <span>{labels.status}</span>
        <span>{labels.wait}</span>
      </div>
      <ul aria-label={labels.list} className="m-0 flex list-none flex-col p-0">
        {children}
      </ul>
    </div>
  );
}

export interface FacilityRowProps {
  /** The name, usually a link to the facility page (the app passes its router link). */
  title: ReactNode;
  type: string;
  /** "1.2 km", or nothing before the person shares a location. */
  distance?: string | null;
  open: { label: string; isOpen: boolean };
  /** "6 waiting · ~25 min" or "Next 10:30"; `tone` colours the dot (wait level). */
  wait?: { text: string; tone?: WaitTone | null } | null;
  /** Accepted insurer names. No prices, ever (U-01). */
  insurers: string[];
  /** One primary action (Join or Book) and View. */
  actions?: ReactNode;
  /** Highlighted because its map pin is selected. */
  selected?: boolean;
  /** Pointer or focus on the row: the map highlights the pin. */
  onActivate?: () => void;
}

/**
 * One place in the list (upgrade 02 §3 `FacilityRow`): name · type · distance · open · wait, then
 * the accepted insurers and one action. On phones the same facts stack in reading order.
 */
export function FacilityRow({
  title,
  type,
  distance,
  open,
  wait,
  insurers,
  actions,
  selected = false,
  onActivate,
}: FacilityRowProps) {
  return (
    // Pointer and focus only highlight the map pin; the links and buttons inside are the controls.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <li
      onMouseEnter={onActivate}
      onFocus={onActivate}
      className={cx(
        "relative grid gap-x-6 gap-y-2 border-b border-border px-4 py-4 last:border-b-0",
        "transition-[background-color,box-shadow] duration-200 ease-out-quint hover:bg-subtle/50",
        COLUMNS,
        // the selected place (pin or row): a tint and an emerald edge, no layout shift
        selected &&
          "bg-brand-subtle/50 shadow-[inset_3px_0_0_var(--color-primary)] hover:bg-brand-subtle/50",
      )}
    >
      <h3 className="m-0 min-w-0 truncate text-body font-semibold">{title}</h3>
      {/* phones: one line of facts; wide screens: each fact in its own column */}
      <p className="m-0 flex flex-wrap items-center gap-x-2 text-body-sm text-fg-secondary lg:contents">
        <span className="lg:truncate">{type}</span>
        {distance ? (
          <span className="font-semibold text-fg tabular-nums lg:text-right">{distance}</span>
        ) : (
          <span aria-hidden="true" className="hidden lg:block" />
        )}
        <span
          className={cx(
            "inline-flex items-center gap-1.5 font-semibold whitespace-nowrap",
            open.isOpen ? "text-success" : "text-fg-muted",
          )}
        >
          {open.isOpen && <span aria-hidden="true" className="ml-live-dot" />}
          {open.label}
        </span>
      </p>
      <p className="m-0 flex items-center gap-1.5 text-body-sm font-semibold text-fg tabular-nums">
        {wait ? (
          <>
            {wait.tone && (
              <span
                aria-hidden="true"
                className={cx("size-2 rounded-full bg-current", TONE_DOT[wait.tone])}
              />
            )}
            <LiveText text={wait.text} />
          </>
        ) : null}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-5">
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {insurers.map((name) => (
            <li
              key={name}
              className="rounded-full bg-subtle px-2.5 py-0.5 text-caption font-semibold text-fg-secondary"
            >
              {name}
            </li>
          ))}
        </ul>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </li>
  );
}

/**
 * A live value that glows once when it changes (upgrade 02 §5 "Live without noise"); never on the
 * first render, never when the person prefers less motion.
 */
function LiveText({ text }: { text: string }) {
  const node = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const element = node.current;
    if (!element || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    element.animate(
      [
        { backgroundColor: "color-mix(in srgb, var(--color-attention-solid) 22%, transparent)" },
        {},
      ],
      { duration: 1500, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
    );
  }, [text]);
  return (
    <span ref={node} className="-mx-1 rounded-sm px-1">
      {text}
    </span>
  );
}
