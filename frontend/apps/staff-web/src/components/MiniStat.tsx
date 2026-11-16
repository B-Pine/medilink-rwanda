import { cx } from "@medilink/ui";
import type { ReactNode } from "react";

/**
 * The small stat card of the staff app (audit 2026-11-16): label, number, one line of context.
 * The big card with a trend is `StatTile` (@medilink/ui); these two are the only stat styles.
 */
export function MiniStat({
  label,
  value,
  hint,
  tone,
  as: Tag = "div",
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  /** Colour the number only when it needs attention. */
  tone?: "warning" | "success" | "danger" | undefined;
  as?: "div" | "li";
}) {
  return (
    <Tag className="flex min-w-0 flex-col gap-1 rounded-2xl bg-surface p-4 shadow-card">
      <span className="text-body-sm font-semibold text-fg-secondary">{label}</span>
      <span
        className={cx(
          "font-heading text-h2 leading-tight font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger",
          tone === "warning" && "text-attention",
        )}
      >
        {value}
      </span>
      {hint && <span className="text-caption text-fg-muted">{hint}</span>}
    </Tag>
  );
}
