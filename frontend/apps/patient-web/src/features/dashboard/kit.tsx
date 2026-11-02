import type { Booking } from "@medilink/api-client";
import { ArrowLeft, ArrowRight, CaretRight, WarningCircle, type Icon } from "@phosphor-icons/react";
import { Badge, Button, cx, Skeleton, type BadgeTone } from "@medilink/ui";
import { formatDate } from "@medilink/ui/i18n";
import { useQuery } from "@tanstack/react-query";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { PageHeading } from "../../components/PageHeading";

/*
 * Dashboard surfaces (upgrade 12 §6). One small set, used by every patient page:
 *  - Panel: white, 1px border, 16px radius, 20-24px padding, no heavy shadow
 *  - visit panels (journey, ticket) are larger, 20px radius, light green or white with emerald
 *  - RowList: related rows split by hairlines inside one surface, never a card per row
 *  - QuickActionTile: compact white tile, icon + title + one line
 */

export const panelClass = "rounded-2xl border border-border bg-surface";

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export function firstName(name: string): string {
  return name.split(/\s+/).find(Boolean) ?? name;
}

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-brand-subtle font-heading font-bold text-on-brand-subtle",
        size === "sm" && "size-8 text-caption",
        size === "md" && "size-10 text-body-sm",
        size === "lg" && "size-14 text-h3",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Page title block: a modest h1, one line of context, the page's main action on the right. */
export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
}) {
  return (
    <header className="flex flex-col gap-3">
      {back && (
        <Link
          to={back.to}
          className="group inline-flex min-h-target items-center gap-2 self-start text-body-sm font-semibold text-fg-secondary no-underline hover:text-fg"
        >
          <ArrowLeft
            aria-hidden="true"
            className="size-4 transition-transform duration-150 group-hover:-translate-x-0.5"
          />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <PageHeading
            title={title}
            className="font-heading text-h1 font-bold tracking-tight text-fg"
          >
            {title}
          </PageHeading>
          {subtitle && <p className="m-0 max-w-[42rem] text-fg-secondary">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** A titled block of a page; `action` is usually a "View all" link. */
export function Section({
  id,
  title,
  action,
  children,
  className,
}: {
  id: string;
  title: string;
  action?: { to: string; label: string };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cx("flex flex-col gap-3", className)}>
      <div className="flex min-h-target items-center justify-between gap-3">
        <h2 id={id} className="m-0 font-heading text-h3 font-bold text-fg">
          {title}
        </h2>
        {action && (
          <Link
            to={action.to}
            className="group inline-flex items-center gap-1 text-body-sm font-semibold text-link no-underline hover:underline"
          >
            {action.label}
            <ArrowRight
              aria-hidden="true"
              className="size-4 transition-transform duration-150 group-hover:translate-x-0.5"
            />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Standard information card. */
export function Panel({
  as: Component = "div",
  className,
  children,
  ...props
}: { as?: "div" | "section" | "article" | "aside"; children: ReactNode; className?: string } & Omit<
  ComponentPropsWithoutRef<"section">,
  "children" | "className"
>) {
  return (
    <Component className={cx(panelClass, "p-5 sm:p-6", className)} {...props}>
      {children}
    </Component>
  );
}

/** Rows that belong together, split by hairlines inside one surface. */
export function RowList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul
      aria-label={label}
      className={cx(panelClass, "m-0 flex list-none flex-col divide-y divide-border overflow-hidden p-0")}
    >
      {children}
    </ul>
  );
}

/**
 * One row of a RowList: leading (date block or icon), body, trailing (status, action). The whole
 * row is the link; extra actions go in `after`, outside the link.
 */
export function RowLink({
  to,
  leading,
  title,
  meta,
  trailing,
  after,
  unread = false,
}: {
  to: string;
  leading: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  after?: ReactNode;
  unread?: boolean;
}) {
  return (
    <li className="relative flex items-center">
      {unread && (
        <span aria-hidden="true" className="absolute top-1/2 left-1.5 size-2 -translate-y-1/2 rounded-full bg-brand" />
      )}
      <Link
        to={to}
        className="group flex min-h-16 min-w-0 flex-1 items-center gap-4 px-4 py-3 text-fg no-underline transition-colors duration-150 hover:bg-subtle/70 sm:px-5"
      >
        {leading}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cx("truncate", unread ? "font-bold" : "font-semibold")}>{title}</span>
          {meta && <span className="truncate text-body-sm text-fg-secondary">{meta}</span>}
        </span>
        {trailing && <span className="hidden shrink-0 items-center gap-2 sm:flex">{trailing}</span>}
        <CaretRight
          aria-hidden="true"
          className="size-5 shrink-0 text-fg-muted transition-transform duration-150 group-hover:translate-x-0.5"
        />
      </Link>
      {after && <div className="shrink-0 pr-3">{after}</div>}
    </li>
  );
}

/** Leading icon of a row: soft square, brand icon. */
export function RowIcon({ icon: IconComponent, tone = "brand" }: { icon: Icon; tone?: "brand" | "neutral" }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "grid size-11 shrink-0 place-items-center rounded-xl",
        tone === "brand" ? "bg-brand-subtle text-brand" : "bg-subtle text-fg-secondary",
      )}
    >
      <IconComponent weight="duotone" className="size-6" />
    </span>
  );
}

/** Date tile: month, the day emphasised, then the year or weekday. */
export function DateBlock({ iso, size = "md" }: { iso: string; size?: "md" | "lg" }) {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const part = (options: Intl.DateTimeFormatOptions) => formatDate(iso, lang, options);
  return (
    <span
      aria-hidden="true"
      className={cx(
        "flex shrink-0 flex-col items-center justify-center rounded-xl bg-brand-subtle text-center text-on-brand-subtle",
        size === "md" ? "w-14 py-1.5" : "w-20 py-3",
      )}
    >
      <span className="text-caption font-semibold tracking-wide uppercase">{part({ month: "short" })}</span>
      <span
        className={cx(
          "font-heading leading-none font-extrabold tabular-nums text-fg",
          size === "md" ? "text-h2" : "text-display",
        )}
      >
        {part({ day: "numeric" })}
      </span>
      <span className="text-caption tabular-nums opacity-80">
        {size === "md" ? part({ year: "numeric" }) : part({ weekday: "short" })}
      </span>
    </span>
  );
}

export type AppointmentState =
  | "confirmed"
  | "checked_in"
  | "cancelled"
  | "late_cancelled"
  | "no_show"
  | "rescheduled"
  | "answer";

/** What the patient should read for a booking: an open offer outranks the stored status. */
export function appointmentState(booking: Booking): AppointmentState {
  if (booking.pending_change) return "answer";
  if (booking.status === "superseded") return "rescheduled";
  return booking.status;
}

const STATE_TONE: Record<AppointmentState, BadgeTone> = {
  confirmed: "success",
  checked_in: "brand",
  cancelled: "danger",
  late_cancelled: "danger",
  no_show: "neutral",
  rescheduled: "info",
  answer: "warning",
};

/** Small, restrained status: icon + word, never colour alone. */
export function AppointmentBadge({ booking }: { booking: Booking }) {
  const { t } = useTranslation();
  const state = appointmentState(booking);
  return <Badge tone={STATE_TONE[state]}>{t(`dashboard.status.${state}`)}</Badge>;
}

export const isCancelled = (booking: Booking) =>
  booking.status === "cancelled" || booking.status === "late_cancelled";

/** Concise error with a retry; the page around it keeps whatever the patient typed. */
export function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className={cx(panelClass, "flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center")}
    >
      <WarningCircle aria-hidden="true" weight="duotone" className="size-7 shrink-0 text-danger" />
      <p className="m-0 flex-1 font-semibold text-fg">{message}</p>
      <Button variant="secondary" onClick={onRetry}>
        {t("dashboard.retry")}
      </Button>
    </div>
  );
}

/** Skeleton rows shaped like a RowList. */
export function RowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className={cx(panelClass, "flex flex-col divide-y divide-border overflow-hidden")}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 px-5 py-3">
          <Skeleton width="3.5rem" height="3.5rem" className="rounded-xl" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton height="1rem" width="55%" />
            <Skeleton height="0.875rem" width="35%" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Quiet empty block for a section (pages use the shared EmptyState). */
export function EmptyRow({
  icon: IconComponent,
  title,
  body,
  action,
}: {
  icon: Icon;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cx(panelClass, "flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center")}>
      <RowIcon icon={IconComponent} tone="neutral" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="m-0 font-semibold text-fg">{title}</p>
        {body && <p className="m-0 text-body-sm text-fg-secondary">{body}</p>}
      </div>
      {action}
    </div>
  );
}

/** Quick action tile: same size everywhere, white, one icon. */
export function QuickActionTile({
  to,
  icon: IconComponent,
  title,
  description,
}: {
  to: string;
  icon: Icon;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className={cx(
        panelClass,
        "group flex h-full min-h-28 flex-col gap-3 p-4 text-fg no-underline",
        "transition-[border-color,box-shadow] duration-200 hover:border-brand/40 hover:shadow-card",
      )}
    >
      <span className="grid size-10 place-items-center rounded-xl bg-brand-subtle text-brand transition-transform duration-200 group-hover:-translate-y-0.5">
        <IconComponent aria-hidden="true" weight="duotone" className="size-6" />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="font-semibold">{title}</span>
        <span className="text-body-sm text-fg-secondary">{description}</span>
      </span>
    </Link>
  );
}

/** Public facility profile; same cache key as the public pages, so it is fetched once. */
export function useFacilityProfile(slug: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: ["discovery", "facility", slug],
    queryFn: () => api.booking.facility(slug!),
    enabled: Boolean(slug),
    staleTime: 60_000,
  });
}
