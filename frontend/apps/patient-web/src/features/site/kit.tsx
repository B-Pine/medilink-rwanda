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
  eyebrow,
}: {
  title: string;
  lead?: ReactNode;
  crumbs?: Crumb[];
  actions?: ReactNode;
  eyebrow?: string;
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
  // public pages (one template): breadcrumb → H1 (Figtree 44 px, 800) → one-line lead, on a band
  // with the brand mesh and the Imigongo pattern fading in on the right (base.css .ml-band)
  return (
    <div className="mb-8 flex animate-enter flex-col gap-4 border-b border-border pt-8 pb-8 sm:pt-12 sm:pb-10">
      {crumbs && <Breadcrumbs items={[{ to: "/", label: t("nav.home") }, ...crumbs]} />}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex max-w-[46rem] flex-col gap-3">
          {eyebrow && (
            <p className="m-0 text-caption font-semibold tracking-[0.14em] text-primary uppercase">
              {eyebrow}
            </p>
          )}
          <PageHeading
            title={title}
            className="font-heading text-[2rem] leading-[1.12] font-extrabold tracking-tight text-balance text-fg sm:text-[2.75rem]"
          >
            {title}
          </PageHeading>
          {lead && (
            <p className="m-0 max-w-[40rem] text-[1.0625rem] leading-relaxed text-pretty text-fg-secondary">
              {lead}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
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
  // inside the dashboard, the dashboard's surfaces: a hairline border instead of a shadow
  const inDashboard = useInDashboard();
  return (
    <Tag
      className={cx(
        "rounded-2xl bg-surface",
        // public panels rise into view as the page scrolls (base.css .ml-reveal)
        inDashboard ? "border border-border" : "ml-reveal border border-border",
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
          className="flex flex-col gap-2 border-b border-border/50 px-5 py-4 last:border-b-0"
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
          className="rounded-full bg-brand-subtle px-2.5 py-0.5 text-caption font-semibold text-on-brand-subtle"
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
        "flex min-h-12 items-center gap-2 rounded-full border border-border-input bg-surface pr-1.5 pl-4",
        "transition-[border-color,box-shadow] duration-200 ease-out-quint",
        "focus-within:border-primary focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_18%,transparent)]",
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
        "relative flex min-h-12 items-center rounded-full border border-border-input bg-surface",
        "transition-[border-color] duration-200 ease-out-quint focus-within:border-primary",
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
    <li className="border-b border-border/50 last:border-b-0">
      <Link
        to={to}
        viewTransition
        className="group flex items-center gap-4 px-5 py-4 text-fg no-underline transition-colors duration-200 ease-out-quint hover:bg-subtle/60"
      >
        {icon && (
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-subtle text-on-brand-subtle">
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
    <details className="group border-b border-border/60 last:border-b-0">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 font-semibold text-fg [&::-webkit-details-marker]:hidden">
        {question}
        <CaretDown
          aria-hidden="true"
          className="size-4 shrink-0 text-fg-muted transition-transform duration-200 ease-out-quint group-open:rotate-180"
        />
      </summary>
      <div className="animate-enter px-5 pb-5 text-fg-secondary">{children}</div>
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
    <div className="ml-reveal mb-5 flex flex-wrap items-end justify-between gap-3">
      <h2 id={id} className="m-0 text-h2 tracking-tight text-balance">
        {children}
      </h2>
      {action}
    </div>
  );
}
