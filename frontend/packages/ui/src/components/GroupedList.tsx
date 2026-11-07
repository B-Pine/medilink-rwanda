import type { ReactNode } from "react";

import { cx } from "../utils/cx";

export interface GroupedListProps {
  /** Optional group label above the card (small, muted, as in the app's settings lists). */
  label?: ReactNode;
  /** Accessible name of the list when there is no visible label. */
  "aria-label"?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Rows grouped in one white card with hairlines between them (the app's grouped list). Children
 * are <GroupedRow>s or any <li>.
 */
export function GroupedList({ label, children, className, ...rest }: GroupedListProps) {
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      {label && (
        <p className="m-0 px-1 text-caption font-semibold tracking-wide text-fg-muted uppercase">
          {label}
        </p>
      )}
      <ul
        aria-label={rest["aria-label"]}
        className="m-0 list-none overflow-hidden rounded-xl bg-surface p-0 shadow-[0_0_0_1px_var(--color-hairline,var(--color-border))]"
      >
        {children}
      </ul>
    </div>
  );
}

export interface GroupedRowProps {
  /** Leading avatar, initials or a small illustration; no icon tile on every row. */
  leading?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  /** Right side: a status pill, a time, a count. */
  trailing?: ReactNode;
  className?: string;
  /** Render the row content inside a link or button (the whole row is the target). */
  wrap?: (content: ReactNode, className: string) => ReactNode;
}

/** One row: at least 56 px (the app's row height), the whole row is the target when wrapped. */
export function GroupedRow({ leading, title, detail, trailing, className, wrap }: GroupedRowProps) {
  const inner = "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left text-fg no-underline";
  const content = (
    <>
      {leading && <span className="flex shrink-0">{leading}</span>}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-semibold">{title}</span>
        {detail && <span className="truncate text-body-sm text-fg-secondary">{detail}</span>}
      </span>
      {trailing && <span className="flex shrink-0 items-center gap-2">{trailing}</span>}
    </>
  );
  return (
    <li
      className={cx(
        "border-b border-[var(--color-hairline,var(--color-border))] last:border-b-0",
        className,
      )}
    >
      {wrap ? (
        wrap(content, cx(inner, "ml-press transition-colors duration-150 hover:bg-page"))
      ) : (
        <div className={inner}>{content}</div>
      )}
    </li>
  );
}
