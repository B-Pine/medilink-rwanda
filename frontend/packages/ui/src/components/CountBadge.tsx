import { cx } from "../utils/cx";

export interface CountBadgeProps {
  count: number;
  /** Above this, show `max+` ("99+"). */
  max?: number;
  className?: string;
}

/** "99+" for counts above `max`. */
export function formatCount(count: number, max = 99): string {
  return count > max ? `${max}+` : String(Math.max(0, Math.floor(count)));
}

/**
 * Numeric pill on a control (e.g. the notification bell). Hidden at 0, and `aria-hidden`: the
 * control's accessible name carries the count ("Notifications, 3 unread"), so it is not read twice.
 */
export function CountBadge({ count, max = 99, className }: CountBadgeProps) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden="true"
      data-testid="count-badge"
      className={cx(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5",
        "bg-danger-solid text-caption leading-none font-bold text-on-danger-solid tabular-nums",
        "ring-2 ring-surface",
        className,
      )}
    >
      {formatCount(count, max)}
    </span>
  );
}
