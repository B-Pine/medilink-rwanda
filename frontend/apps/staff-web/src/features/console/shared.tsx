import type { ConsoleEvent, UserKind } from "@medilink/api-client";
import { CheckCircle, Info, WarningCircle, type Icon } from "@phosphor-icons/react";
import { cx } from "@medilink/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** Shared pieces of the super admin console (upgrade 2026-11-02). */

export function useRelative() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage === "rw" ? "en" : (i18n.resolvedLanguage ?? "en");
  const format = new Intl.RelativeTimeFormat(lang, { numeric: "auto", style: "short" });
  return (iso: string | null): string => {
    if (!iso) return "—";
    const seconds = (Date.parse(iso) - Date.now()) / 1000;
    const abs = Math.abs(seconds);
    if (abs < 60) return format.format(Math.round(seconds), "second");
    if (abs < 3600) return format.format(Math.round(seconds / 60), "minute");
    if (abs < 86_400) return format.format(Math.round(seconds / 3600), "hour");
    return format.format(Math.round(seconds / 86_400), "day");
  };
}

export function useDateTime() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage === "rw" ? "en-GB" : (i18n.resolvedLanguage ?? "en");
  const format = new Intl.DateTimeFormat(lang, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Kigali",
  });
  return (iso: string | null) => (iso ? format.format(new Date(iso)) : "—");
}

/** "auth.login.failure" → the translated label, else "Login failure". */
export function useActionLabel() {
  const { t } = useTranslation();
  return (action: string) => {
    const key = action.replace(/\./g, "_");
    const words = action.split(".").slice(-2).join(" ").replace(/_/g, " ");
    return t(`console.actions.${key}`, {
      defaultValue: words.charAt(0).toUpperCase() + words.slice(1),
    });
  };
}

export function initials(name: string): string {
  return name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

const AVATAR_TONES = [
  "bg-brand-subtle text-on-brand-subtle",
  "bg-info-bg text-info",
  "bg-violet-bg text-violet",
  "bg-attention-bg text-attention",
  "bg-success-bg text-success",
];

export function Avatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  const tone =
    AVATAR_TONES[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span
      aria-hidden="true"
      className={cx(
        "grid shrink-0 place-items-center rounded-full font-heading font-bold",
        size === "lg" ? "size-14 text-h3" : "size-9 text-caption",
        tone,
      )}
    >
      {initials(name)}
    </span>
  );
}

const KIND_TONE: Record<UserKind, string> = {
  platform: "bg-violet-bg text-violet",
  staff: "bg-brand-subtle text-on-brand-subtle",
  patient: "bg-subtle text-fg-secondary",
};

export function KindPill({ kind }: { kind: UserKind }) {
  const { t } = useTranslation();
  return (
    <span
      className={cx(
        "inline-flex rounded-full px-2.5 py-0.5 text-caption font-semibold whitespace-nowrap",
        KIND_TONE[kind],
      )}
    >
      {t(`console.kind.${kind}`)}
    </span>
  );
}

/** Status with an icon and a word, never colour alone. */
export function StatusDot({
  tone,
  children,
}: {
  tone: "success" | "danger" | "warning" | "muted";
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 text-body-sm font-semibold whitespace-nowrap",
        tone === "success" && "text-success",
        tone === "danger" && "text-danger",
        tone === "warning" && "text-attention",
        tone === "muted" && "text-fg-muted",
      )}
    >
      <span aria-hidden="true" className="size-2 rounded-full bg-current" />
      {children}
    </span>
  );
}

const OUTCOME_ICON: Record<ConsoleEvent["outcome"], [Icon, string]> = {
  success: [CheckCircle, "bg-success-bg text-success"],
  failure: [WarningCircle, "bg-danger-bg text-danger"],
  info: [Info, "bg-info-bg text-info"],
};

export function OutcomeIcon({ outcome }: { outcome: ConsoleEvent["outcome"] }) {
  const [OutcomeGlyph, tone] = OUTCOME_ICON[outcome];
  return (
    <span className={cx("grid size-8 shrink-0 place-items-center rounded-xl", tone)}>
      <OutcomeGlyph aria-hidden="true" weight="bold" className="size-4" />
    </span>
  );
}

/** A KPI tile: label, a large number, one line of context and an icon chip. */
export function Kpi({
  label,
  value,
  detail,
  icon: KpiIcon,
  tone = "brand",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon: Icon;
  tone?: "brand" | "attention" | "danger" | "info";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl bg-surface p-5 shadow-card transition-shadow duration-200 ease-out-quint hover:shadow-raised">
      <div className="flex items-center justify-between gap-3">
        <span className="text-body-sm font-semibold text-fg-secondary">{label}</span>
        <span
          className={cx(
            "grid size-9 place-items-center rounded-xl",
            tone === "brand" && "bg-brand-subtle text-on-brand-subtle",
            tone === "attention" && "bg-attention-bg text-attention",
            tone === "danger" && "bg-danger-bg text-danger",
            tone === "info" && "bg-info-bg text-info",
          )}
        >
          <KpiIcon aria-hidden="true" weight="bold" className="size-[1.125rem]" />
        </span>
      </div>
      <p className="m-0 font-heading text-[2rem] leading-none font-bold tracking-tight text-fg tabular-nums">
        {value}
      </p>
      {detail && <p className="m-0 text-body-sm text-fg-muted">{detail}</p>}
    </div>
  );
}

/** A titled panel with an optional action in the header. */
export function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx("flex min-w-0 flex-col rounded-2xl bg-surface shadow-card", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
        <h2 className="m-0 text-body font-bold">{title}</h2>
        {action}
      </header>
      <div className={cx("flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}
