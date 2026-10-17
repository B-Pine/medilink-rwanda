import { useId } from "react";

import { cx } from "../utils/cx";

export interface ImigongoPatternProps {
  className?: string;
  /** Pattern opacity; design 06 §5 asks for 4-8%. */
  opacity?: number;
}

/**
 * Restrained line pattern inspired by Imigongo (zig-zag bands and nested diamonds, design 01 §4),
 * drawn in currentColor at low opacity. Decorative only: hidden from assistive technology.
 * Put it inside a `relative` container with `text-on-forest` (white) or emerald text.
 */
export function ImigongoPattern({ className, opacity = 0.06 }: ImigongoPatternProps) {
  const id = `imigongo-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={cx("pointer-events-none absolute inset-0 size-full", className)}
    >
      <defs>
        <pattern id={id} width="96" height="96" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="miter">
            {/* zig-zag bands */}
            <path d="M0 12 L12 0 L24 12 L36 0 L48 12 L60 0 L72 12 L84 0 L96 12" />
            <path d="M0 22 L12 10 L24 22 L36 10 L48 22 L60 10 L72 22 L84 10 L96 22" />
            <path d="M0 84 L12 96 L24 84 L36 96 L48 84 L60 96 L72 84 L84 96 L96 84" />
            <path d="M0 74 L12 86 L24 74 L36 86 L48 74 L60 86 L72 74 L84 86 L96 74" />
            {/* nested diamonds */}
            <path d="M48 30 L66 48 L48 66 L30 48 Z" />
            <path d="M48 38 L58 48 L48 58 L38 48 Z" />
            <path d="M0 30 L18 48 L0 66" />
            <path d="M96 30 L78 48 L96 66" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} opacity={opacity} />
    </svg>
  );
}
