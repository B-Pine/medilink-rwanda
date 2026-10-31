import type { ReactNode } from "react";

import { Badge, type BadgeTone } from "./Badge";
import { dateFormat } from "../i18n/dates";

export interface TimelineEvent {
  id: string;
  /** ISO timestamp; shown in Kigali time. */
  at: string;
  title: ReactNode;
  actor?: ReactNode;
  badge?: { label: ReactNode; tone?: BadgeTone };
  text?: ReactNode;
}

export interface TimelineProps {
  events: TimelineEvent[];
  /** BCP 47 locale for dates (`rw`, `en`, `fr`). */
  locale: string;
  emptyMessage?: ReactNode;
  className?: string;
}

const KIGALI = "Africa/Kigali";

export function formatKigaliTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return dateFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: KIGALI,
    }).format(date);
  } catch {
    // `rw` may be missing from the runtime's ICU data: fall back to English formatting.
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: KIGALI,
    }).format(date);
  }
}

/** Ordered history: time (Kigali), actor, status badge and text, oldest first. */
export function Timeline({ events, locale, emptyMessage, className }: TimelineProps) {
  if (events.length === 0) {
    return emptyMessage ? <p className="m-0 text-fg-muted">{emptyMessage}</p> : null;
  }
  return (
    <ol className={["m-0 flex list-none flex-col gap-0 p-0", className].filter(Boolean).join(" ")}>
      {events.map((event) => (
        <li key={event.id} className="relative border-l-2 border-border pb-5 pl-5 last:pb-0">
          <span
            aria-hidden="true"
            className="absolute top-1 -left-[7px] size-3 rounded-full border-2 border-surface bg-primary"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{event.title}</span>
            {event.badge && <Badge tone={event.badge.tone ?? "neutral"}>{event.badge.label}</Badge>}
          </div>
          <p className="m-0 text-body-sm text-fg-muted">
            <time dateTime={event.at}>{formatKigaliTime(event.at, locale)}</time>
            {event.actor && <> · {event.actor}</>}
          </p>
          {event.text && <div className="mt-1 text-body">{event.text}</div>}
        </li>
      ))}
    </ol>
  );
}
