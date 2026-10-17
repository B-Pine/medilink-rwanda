import type { CSSProperties } from "react";

import { cx } from "../utils/cx";

export interface SkeletonProps {
  className?: string;
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  /** Rounded like a pill or avatar. */
  round?: boolean;
}

/**
 * Placeholder that matches the final layout (design 01 §3). Decorative: pair it with a
 * LoadingState or an aria-busy region so screen readers know content is loading.
 */
export function Skeleton({ className, width, height = "1em", round = false }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "block animate-pulse bg-subtle motion-reduce:animate-none",
        round ? "rounded-full" : "rounded-sm",
        className,
      )}
      style={{ width, height }}
    />
  );
}
