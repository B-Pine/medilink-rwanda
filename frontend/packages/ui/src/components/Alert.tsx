import { CheckCircle, Info, Warning, WarningOctagon, type Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { cx } from "../utils/cx";

export type AlertTone = "info" | "success" | "warning" | "danger";

const TONES: Record<AlertTone, { className: string; icon: Icon }> = {
  info: { className: "border-info bg-info-bg text-fg [&_.ml-alert-icon]:text-info", icon: Info },
  success: {
    className: "border-success bg-success-bg text-fg [&_.ml-alert-icon]:text-success",
    icon: CheckCircle,
  },
  warning: {
    className: "border-warning bg-warning-bg text-fg [&_.ml-alert-icon]:text-warning",
    icon: Warning,
  },
  danger: {
    className: "border-danger bg-danger-bg text-fg [&_.ml-alert-icon]:text-danger",
    icon: WarningOctagon,
  },
};

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  /**
   * `status` (polite) or `alert` (assertive) when the alert appears dynamically.
   * Leave undefined for alerts present on page load.
   */
  role?: "status" | "alert";
  className?: string;
  id?: string;
  tabIndex?: number;
}

/** Message with icon + text, never colour alone (design 01 §3). */
export function Alert({
  tone = "info",
  title,
  children,
  role,
  className,
  id,
  tabIndex,
}: AlertProps) {
  const { t } = useTranslation("ui");
  const { className: toneClass, icon: ToneIcon } = TONES[tone];
  return (
    <div
      id={id}
      role={role}
      tabIndex={tabIndex}
      className={cx("flex gap-3 rounded-md border-l-4 p-4", toneClass, className)}
    >
      <ToneIcon
        aria-hidden="true"
        weight="bold"
        className="ml-alert-icon mt-0.5 size-icon shrink-0"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="sr-only">{t(`alert.${tone}`)}</span>
        {title && <p className="m-0 font-semibold">{title}</p>}
        {children && <div className="text-fg-secondary">{children}</div>}
      </div>
    </div>
  );
}
