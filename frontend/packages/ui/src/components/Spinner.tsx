import { useTranslation } from "react-i18next";

import { cx } from "../utils/cx";

export interface SpinnerProps {
  /** Accessible status text. Omit for a decorative spinner (e.g. inside a busy button). */
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = { sm: "size-4", md: "size-6", lg: "size-10" } as const;

export function Spinner({ label, size = "md", className }: SpinnerProps) {
  const icon = (
    <svg
      className={cx(SIZES[size], "shrink-0 animate-spin motion-reduce:animate-none", className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
  if (!label) return icon;
  return (
    <span role="status" className="inline-flex items-center gap-2">
      {icon}
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Full-area loading state with a visible label. */
export function LoadingState({ label, className }: { label?: string; className?: string }) {
  const { t } = useTranslation("ui");
  const text = label ?? t("loading");
  return (
    <div
      role="status"
      className={cx("flex items-center justify-center gap-3 p-8 text-fg-muted", className)}
    >
      <Spinner size="md" />
      <span>{text}</span>
    </div>
  );
}
