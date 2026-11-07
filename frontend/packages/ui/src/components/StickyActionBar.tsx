import type { ReactNode } from "react";

import { cx } from "../utils/cx";

export interface StickyActionBarProps {
  children: ReactNode;
  /** Shown beside the action, e.g. "Open · 4 waiting". */
  summary?: ReactNode;
  className?: string;
}

/**
 * The page's main action pinned to the bottom on phones (hidden from `md` up, where the action sits
 * in the header). It marks the page with `data-action-bar`, so floating buttons (the assistant)
 * keep clear of it.
 */
export function StickyActionBar({ children, summary, className }: StickyActionBarProps) {
  return (
    <div
      data-action-bar=""
      className={cx(
        "fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-[var(--color-hairline,var(--color-border))] bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden print:hidden",
        className,
      )}
    >
      {summary && <div className="min-w-0 flex-1 text-body-sm text-fg-secondary">{summary}</div>}
      <div className={cx("flex gap-2", summary ? "shrink-0" : "flex-1 [&>*]:flex-1")}>
        {children}
      </div>
    </div>
  );
}

/** Space at the end of a page with a sticky action bar, so the bar never covers the last lines. */
export function StickyActionBarSpacer() {
  return <div aria-hidden="true" className="h-24 md:hidden" />;
}
