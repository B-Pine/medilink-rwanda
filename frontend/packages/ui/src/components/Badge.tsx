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

export type BadgeTone = "neutral" | "brand" | "info" | "success" | "warning" | "danger";

const TONES: Record<BadgeTone, { className: string; icon: Icon }> = {
  neutral: { className: "bg-subtle text-fg-secondary border-border", icon: Circle },
  brand: { className: "bg-brand-subtle text-on-brand-subtle border-transparent", icon: SealCheck },
  info: { className: "bg-info-bg text-info border-transparent", icon: Info },
  success: { className: "bg-success-bg text-success border-transparent", icon: CheckCircle },
  warning: { className: "bg-warning-bg text-warning border-transparent", icon: Warning },
  danger: { className: "bg-danger-bg text-danger border-transparent", icon: WarningOctagon },
};

export interface BadgeProps {
  tone?: BadgeTone;
  /** Override the tone's default icon. Every badge has an icon + label (never colour alone). */
  icon?: Icon;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = "neutral", icon, children, className }: BadgeProps) {
  const { className: toneClass, icon: defaultIcon } = TONES[tone];
  const BadgeIcon = icon ?? defaultIcon;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-body-sm font-semibold whitespace-nowrap",
        toneClass,
        className,
      )}
    >
      <BadgeIcon aria-hidden="true" weight="bold" className="size-[1em] shrink-0" />
      <span>{children}</span>
    </span>
  );
}
