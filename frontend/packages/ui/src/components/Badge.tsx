import {
  CheckCircle,
  Circle,
  Info,
  SealCheck,
  Warning,
  WarningOctagon,
  type Icon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { cx } from "../utils/cx";

export type BadgeTone = "neutral" | "brand" | "info" | "success" | "warning" | "danger" | "violet";

/**
 * Tint (default): tinted background. Outline: the tone's colour as text and border on the surface
 * (design 02 §4: "Expected" slate outline, "No-show / Left" red outline, "Awaiting payment" amber
 * outline). Solid: a filled badge with white text (priority violet, emergency red).
 */
export type BadgeVariant = "tint" | "outline" | "solid";

const TONES: Record<BadgeTone, { tint: string; outline: string; solid: string; icon: Icon }> = {
  neutral: {
    tint: "bg-subtle text-fg-secondary border-border",
    outline: "bg-surface text-fg-secondary border-border-input",
    solid: "bg-fg-secondary text-surface border-transparent",
    icon: Circle,
  },
  brand: {
    tint: "bg-brand-subtle text-on-brand-subtle border-transparent",
    outline: "bg-surface text-on-brand-subtle border-current",
    solid: "bg-primary text-on-primary border-transparent",
    icon: SealCheck,
  },
  info: {
    tint: "bg-info-bg text-info border-transparent",
    outline: "bg-surface text-info border-current",
    solid: "bg-info text-surface border-transparent",
    icon: Info,
  },
  success: {
    tint: "bg-success-bg text-success border-transparent",
    outline: "bg-surface text-success border-current",
    solid: "bg-success text-surface border-transparent",
    icon: CheckCircle,
  },
  warning: {
    tint: "bg-warning-bg text-warning border-transparent",
    outline: "bg-surface text-warning border-current",
    solid: "bg-accent text-on-accent border-transparent",
    icon: Warning,
  },
  danger: {
    tint: "bg-danger-bg text-danger border-transparent",
    outline: "bg-surface text-danger border-current",
    solid: "bg-danger-solid text-on-danger-solid border-transparent",
    icon: WarningOctagon,
  },
  violet: {
    tint: "bg-violet-bg text-violet border-transparent",
    outline: "bg-surface text-violet border-current",
    solid: "bg-violet-solid text-on-violet-solid border-transparent",
    icon: Info,
  },
};

/** Tone + variant classes, shared with the queue chips so every badge uses the same colours. */
export function badgeToneClassName(tone: BadgeTone, variant: BadgeVariant = "tint"): string {
  return TONES[tone][variant];
}

export interface BadgeProps {
  tone?: BadgeTone;
  variant?: BadgeVariant;
  /** Override the tone's default icon. Every badge has an icon + label (never colour alone). */
  icon?: Icon;
  children: ReactNode;
  className?: string;
}

/**
 * Status badge: icon + label. The label wraps in narrow containers (design 03 §2: Kinyarwanda runs
 * long, never clip or overflow), so the icon stays on the first line.
 */
export function Badge({
  tone = "neutral",
  variant = "tint",
  icon,
  children,
  className,
}: BadgeProps) {
  const BadgeIcon = icon ?? TONES[tone].icon;
  return (
    <span
      className={cx(
        "inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-left text-caption font-semibold whitespace-nowrap [overflow-wrap:anywhere]",
        badgeToneClassName(tone, variant),
        className,
      )}
    >
      <BadgeIcon
        aria-hidden="true"
        weight="bold"
        className="mt-[calc((1lh-1em)/2)] size-[1em] shrink-0"
      />
      <span className="min-w-0">{children}</span>
    </span>
  );
}
