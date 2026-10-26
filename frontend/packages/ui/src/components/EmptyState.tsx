import type { Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { cx } from "../utils/cx";

export interface EmptyStateProps {
  icon: Icon;
  title: ReactNode;
  /** What to do next, in one or two sentences. */
  description?: ReactNode;
  /** One action (a button or link); design 01 §5. */
  action?: ReactNode;
  /** "page" fills a section; "inline" sits inside a card or panel. */
  size?: "page" | "inline";
  className?: string;
}

/**
 * Designed empty state (design 04 §6): an icon, a plain statement of what is empty, and the next
 * step. Used for empty lists, no search results and sections not yet available.
 */
export function EmptyState({
  icon: StateIcon,
  title,
  description,
  action,
  size = "page",
  className,
}: EmptyStateProps) {
  const page = size === "page";
  return (
    <div
      className={cx(
        "flex flex-col items-center gap-3 text-center",
        page ? "rounded-lg border border-dashed border-border bg-surface px-6 py-12" : "px-4 py-8",
        className,
      )}
    >
      <span
        className={cx(
          "inline-flex items-center justify-center rounded-full bg-brand-subtle text-on-brand-subtle",
          page ? "size-14" : "size-11",
        )}
      >
        <StateIcon aria-hidden="true" weight="duotone" className={page ? "size-7" : "size-6"} />
      </span>
      <p className="m-0 max-w-md font-heading text-h3 text-fg">{title}</p>
      {description && <p className="m-0 max-w-md text-fg-secondary">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
