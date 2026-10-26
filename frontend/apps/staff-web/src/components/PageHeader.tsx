import { ArrowLeft } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { PageHeading } from "./PageHeading";

/**
 * Page header (design 04 §3): optional back link, the <h1> with status badges next to it, one
 * line of context, and the page actions on the right. Put at most one primary button in
 * `actions` (design 01 §5: one primary action per view).
 */
export function PageHeader({
  title,
  description,
  back,
  badges,
  actions,
}: {
  title: string;
  description?: ReactNode;
  back?: { to: string; label: string };
  badges?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-border pb-5">
      {back && (
        <Link
          to={back.to}
          className="inline-flex items-center gap-1.5 self-start text-body-sm font-semibold text-link"
        >
          <ArrowLeft aria-hidden="true" weight="bold" className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <PageHeading title={title}>{title}</PageHeading>
            {badges}
          </div>
          {description && <div className="m-0 max-w-3xl text-fg-secondary">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
