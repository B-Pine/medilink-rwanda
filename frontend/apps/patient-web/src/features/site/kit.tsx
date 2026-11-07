import type { FacilityResult } from "@medilink/api-client";
import { CaretDown, CaretRight, MagnifyingGlass, MapPin } from "@phosphor-icons/react";
import { Button, cx, Skeleton } from "@medilink/ui";
import type { FormEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { PageHeading } from "../../components/PageHeading";
import { useInDashboard } from "../../layout/DashboardContext";
import { DISTRICT_KEYS, type DistrictKey } from "../booking/discovery";
import { insurerNames } from "../booking/Places";
import { EmptyIllustration } from "./illustrations";

/**
 * Shared building blocks of the public site (upgrade 11 §10). Every public page composes these,
 * so widths, headings, states and facility facts look the same everywhere.
 */

/** Page width and side gutters; `narrow` for reading pages (help, legal, about). */
export function PageContainer({
  children,
  narrow = false,
  className,
}: {
  children: ReactNode;
  narrow?: boolean;
  className?: string;
}) {
  // The dashboard shell already sets the width and gutters
  const inDashboard = useInDashboard();
  return (
    <div
      className={cx(
        // one template for every public page: 1408 px wide, 24 px gutters (16 px on phones)
        inDashboard ? "w-full" : "mx-auto w-full px-4 sm:px-6",
        narrow ? "max-w-[48rem]" : "max-w-[88rem]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface Crumb {
  to?: string;
  label: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("site.breadcrumb")}>
      <ol className="m-0 flex list-none flex-wrap items-center gap-1 p-0 text-body-sm text-fg-muted">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1">
            {index > 0 && <CaretRight aria-hidden="true" className="size-3.5" />}
            {item.to ? (
              <Link
                to={item.to}
                viewTransition
                className="text-fg-muted no-underline hover:text-fg hover:underline"
              >
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-fg-secondary">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Breadcrumb, the page <h1> (document title, focus after navigation), one line, actions. */
export function PageHeader({
  title,
  lead,
  crumbs,
  actions,
  art,
  titleTransition,
}: {
  title: string;
  lead?: ReactNode;
  crumbs?: Crumb[];
  actions?: ReactNode;
  /** A decorative drawing on the right of the band (wide screens), e.g. the facility building. */
  art?: ReactNode;
  /** View-transition name of the title, so a card's name flows into it. */
  titleTransition?: string;
}) {
  const { t } = useTranslation();
  // Inside the dashboard the shell shows the breadcrumb and the top spacing
  const inDashboard = useInDashboard();
  if (inDashboard)
    return (
      <div className="flex flex-col gap-3 pb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex max-w-[44rem] flex-col gap-2">
            <PageHeading title={title} className="text-h1 tracking-tight text-fg">
              {title}
            </PageHeading>
            {lead && <p className="m-0 text-body text-fg-secondary">{lead}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    );
  // public pages (one template, upgrade 14 G3): breadcrumb → fluid H1 → one-line lead on a white
  // band the width of the screen, a hairline under it
  return (
    <div
      className={cx(
        "ml-page-band mb-10 grid gap-x-10 pt-10 pb-10 sm:pt-14 sm:pb-12",
        Boolean(art) && "lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end",
      )}
    >
      <div className="flex min-w-0 flex-col gap-5">
        {crumbs && <Breadcrumbs items={[{ to: "/", label: t("nav.home") }, ...crumbs]} />}
        <div className="flex animate-enter flex-wrap items-end justify-between gap-6">
          <div className="flex max-w-[48rem] flex-col gap-4">
            <PageHeading
              title={title}
              className="font-heading text-page-title font-bold text-balance text-fg"
            >
              <span style={titleTransition ? { viewTransitionName: titleTransition } : undefined}>
                {title}
              </span>
            </PageHeading>
            {lead && (
              <p className="m-0 max-w-[42rem] text-[1.125rem] leading-relaxed text-pretty text-fg-secondary">
                {lead}
              </p>
            )}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
      {art && (
        <div
          aria-hidden="true"
          className="hidden overflow-hidden rounded-panel shadow-[var(--site-edge),var(--shadow-e2)] lg:block"
        >
          {art}
        </div>
      )}
    </div>
  );
}

/** One quiet surface for a block of content (lists, panels); never nested. */
export function Panel({
  children,
  className,
  as: Tag = "section",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "aside";
  "aria-labelledby"?: string;
}) {
  // the site elevation: a hairline ring and a soft layered shadow (e2), no hard border
  return (
    <Tag
      className={cx(
        "rounded-panel bg-surface shadow-[var(--site-edge),var(--shadow-e2)]",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Rows that load: grey bars the size of real rows, so nothing shifts (upgrade 11 §8). */
export function LoadingRows({ rows = 4, className }: { rows?: number; className?: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t("site.loading")} className={cx("flex flex-col", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 border-b border-hairline px-5 py-4 last:border-b-0"
        >
          <Skeleton className="h-5 w-1/3 rounded-md" />
          <Skeleton className="h-4 w-2/3 rounded-md" />
        </div>
      ))}
    </div>
  );
}

/** Something failed: what happened and one way to try again. */
export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <p className="m-0 font-semibold text-fg">{message ?? t("site.error")}</p>
      {onRetry && (
        <Button variant="secondary" pill onClick={onRetry}>
          {t("site.retry")}
        </Button>
      )}
    </div>
  );
}

/** Nothing to show: a small illustration, one line and one action (upgrade 02 §8). */
export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
      <EmptyIllustration className="h-24 w-auto" />
      <p className="m-0 max-w-sm font-semibold text-fg">{title}</p>
      {action}
    </div>
  );
}

/** Open or closed, always with a word and a dot, never colour alone. */
export function FacilityStatus({ open }: { open: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 text-body-sm font-semibold whitespace-nowrap",
        open ? "text-success" : "text-fg-muted",
      )}
    >
      <span
        aria-hidden="true"
        className={open ? "ml-live-dot" : "size-1.5 rounded-full bg-current"}
      />
      {open ? t("site.open") : t("site.closed")}
    </span>
  );
}

/** Live wait in the ochre time colour; nothing at all when no live figure exists. */
export function WaitingTime({
  result,
}: {
  result: Pick<FacilityResult, "waiting" | "wait_range">;
}) {
  const { t } = useTranslation();
  if (result.waiting === null || result.waiting === undefined) return null;
  return (
    <span className="inline-flex items-center gap-1 text-body-sm font-semibold text-attention tabular-nums">
      {result.waiting === 0
        ? t("home.noWait")
        : result.wait_range
          ? t("home.wait", {
              count: result.waiting,
              min: result.wait_range.min,
              max: result.wait_range.max,
            })
          : t("home.waiting", { count: result.waiting })}
    </span>
  );
}

export function InsuranceList({ codes, className }: { codes: string[]; className?: string }) {
  const { t } = useTranslation();
  if (!codes.length)
    return <span className="text-body-sm text-fg-muted">{t("site.noInsurers")}</span>;
  return (
    <ul className={cx("m-0 flex list-none flex-wrap gap-1.5 p-0", className)}>
      {insurerNames(codes, t).map((name) => (
        <li
          key={name}
          className="rounded-md bg-surface px-2 py-0.5 text-caption font-medium text-fg-secondary shadow-e1"
        >
          {name}
        </li>
      ))}
    </ul>
  );
}

/** Search field with a leading icon; the label is visible to screen readers. */
export function SearchBar({
  id,
  label,
  value,
  onChange,
  placeholder,
  className,
  onSubmit,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Standalone search: Enter submits (a search landmark of its own). */
  onSubmit?: () => void;
}) {
  const Wrapper = onSubmit ? "form" : "div";
  return (
    <Wrapper
      {...(onSubmit
        ? {
            role: "search",
            onSubmit: (event: FormEvent) => {
              event.preventDefault();
              onSubmit();
            },
          }
        : {})}
      className={cx(
        "flex min-h-12 items-center gap-2 rounded-full bg-surface pr-1.5 pl-4 shadow-e1",
        "transition-[box-shadow] duration-200 ease-out-quint hover:shadow-e2",
        "focus-within:shadow-[0_0_0_1px_var(--color-primary),0_0_0_4px_color-mix(in_srgb,var(--color-primary)_16%,transparent)]",
        className,
      )}
    >
      <MagnifyingGlass aria-hidden="true" className="size-5 shrink-0 text-fg-muted" />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        maxLength={120}
        className="min-h-11 min-w-0 flex-1 border-0 bg-transparent text-body text-fg outline-none placeholder:text-fg-muted"
      />
    </Wrapper>
  );
}

/** District choice (NISR districts in the listing); "" = all of Rwanda. */
export function LocationSelector({
  id,
  value,
  onChange,
  className,
}: {
  id: string;
  value: DistrictKey | "";
  onChange: (value: DistrictKey | "") => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cx(
        "relative flex min-h-12 items-center rounded-full bg-surface shadow-e1",
        "transition-[box-shadow] duration-200 ease-out-quint hover:shadow-e2",
        "focus-within:shadow-[0_0_0_1px_var(--color-primary),0_0_0_4px_color-mix(in_srgb,var(--color-primary)_16%,transparent)]",
        className,
      )}
    >
      <MapPin
        aria-hidden="true"
        className="pointer-events-none absolute left-4 size-5 text-fg-muted"
      />
      <label htmlFor={id} className="sr-only">
        {t("site.location")}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as DistrictKey | "")}
        className="min-h-11 w-full cursor-pointer appearance-none rounded-full border-0 bg-transparent pr-10 pl-11 text-body text-fg outline-none"
      >
        <option value="">{t("site.allRwanda")}</option>
        {DISTRICT_KEYS.map((key) => (
          <option key={key} value={key}>
            {t(`landing.districts.${key}`)}
          </option>
        ))}
      </select>
      <CaretDown
        aria-hidden="true"
        className="pointer-events-none absolute right-4 size-4 text-fg-muted"
      />
    </div>
  );
}

/** One row in a list of links: an icon, a name, one line and a caret. */
export function LinkRow({
  to,
  icon,
  title,
  detail,
  meta,
}: {
  to: string;
  icon?: ReactNode;
  title: string;
  detail?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <li className="border-b border-hairline last:border-b-0">
      <Link
        to={to}
        viewTransition
        className="group flex items-center gap-4 px-5 py-4 text-fg no-underline transition-colors duration-200 ease-out-quint hover:bg-page/70"
      >
        {icon && (
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[linear-gradient(140deg,var(--color-brand-subtle),var(--color-surface))] text-on-brand-subtle shadow-e1">
            {icon}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-semibold">{title}</span>
          {detail && <span className="text-body-sm text-fg-secondary">{detail}</span>}
        </span>
        {meta && (
          <span className="hidden shrink-0 text-body-sm text-fg-muted sm:block">{meta}</span>
        )}
        <CaretRight
          aria-hidden="true"
          className="size-4 shrink-0 text-fg-muted transition-transform duration-200 ease-out-quint group-hover:translate-x-0.5"
        />
      </Link>
    </li>
  );
}

/** Expandable question (native details: keyboard and screen readers for free). */
export function Faq({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className="ml-faq group border-b border-hairline last:border-b-0">
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 font-semibold text-fg transition-colors duration-150 hover:bg-page/70 [&::-webkit-details-marker]:hidden">
        {question}
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-subtle text-fg-secondary transition-[transform,background-color] duration-200 ease-out-quint group-open:rotate-180 group-open:bg-brand-subtle group-open:text-on-brand-subtle"
        >
          <CaretDown className="size-4" />
        </span>
      </summary>
      <div className="animate-enter px-6 pb-6 leading-relaxed text-fg-secondary">{children}</div>
    </details>
  );
}

/** A labelled section heading inside a page. */
export function SectionTitle({
  id,
  children,
  action,
}: {
  id: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <h2 id={id} className="m-0 font-heading text-title font-bold text-balance">
        {children}
      </h2>
      {action}
    </div>
  );
}
