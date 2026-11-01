import type { Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { cx } from "../utils/cx";

export interface FlowStage {
  key: string;
  label: string;
  count: number;
  /** One line under the count, e.g. "Median 24 min". */
  detail?: ReactNode;
  icon?: Icon;
  /** Fill of the bar under the stage, 0 to 1 (share of capacity or of the busiest stage). */
  share?: number;
  /** The bottleneck: tinted with the attention colour so it is seen first. */
  hot?: boolean;
}

/**
 * Patient flow strip (design 04 §3a): the stages a visit passes through, left to right, with the
 * people in each and one fact about it. The same strip appears on reception and on the facility
 * dashboard, so both see the same picture. Scrolls sideways on narrow screens instead of wrapping.
 */
export function FlowStrip({
  stages,
  label,
  className,
}: {
  stages: FlowStage[];
  /** Accessible name of the list, e.g. "Patients in each stage". */
  label: string;
  className?: string;
}) {
  return (
    <div className={cx("overflow-x-auto rounded-lg bg-surface shadow-card", className)}>
      <ol
        aria-label={label}
        className="m-0 grid min-w-[40rem] list-none p-0"
        style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}
      >
        {stages.map((stage, index) => {
          const StageIcon = stage.icon;
          const share = Math.max(0, Math.min(1, stage.share ?? 0));
          return (
            <li
              key={stage.key}
              className={cx(
                "relative flex min-w-0 flex-col gap-0.5 py-3.5 pr-4",
                index === 0 ? "pl-4" : "pl-7",
                stage.hot && "bg-attention-bg",
              )}
            >
              {index > 0 && (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 12 100"
                  preserveAspectRatio="none"
                  className="absolute inset-y-0 left-0 h-full w-3 text-border"
                >
                  <path
                    d="M0 0 L12 50 L0 100"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}
              <span
                className={cx(
                  "flex items-center gap-1.5 text-caption font-semibold",
                  stage.hot ? "text-attention" : "text-fg-muted",
                )}
              >
                {StageIcon && <StageIcon aria-hidden="true" weight="bold" className="size-3.5" />}
                {stage.label}
              </span>
              <span className="font-heading text-[1.625rem] leading-tight font-bold tracking-tight tabular-nums">
                {stage.count}
              </span>
              {stage.detail && (
                <span
                  className={cx(
                    "truncate text-caption",
                    stage.hot ? "text-attention" : "text-fg-muted",
                  )}
                >
                  {stage.detail}
                </span>
              )}
              <span aria-hidden="true" className="mt-2 h-1 overflow-hidden rounded-full bg-subtle">
                <span
                  className={cx(
                    "block h-full rounded-full transition-[width] duration-500",
                    stage.hot ? "bg-attention-solid" : "bg-brand",
                  )}
                  style={{ width: `${Math.round(share * 100)}%` }}
                />
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
