import { Globe } from "@phosphor-icons/react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { SUPPORTED_LANGUAGES } from "../i18n";
import { cx } from "../utils/cx";

export interface LanguageSwitcherProps {
  /** Hide the "Language" text (kept as the accessible name). The globe icon stays visible. */
  compact?: boolean;
  /** For use on deep forest surfaces. */
  onDark?: boolean;
  className?: string;
}

/**
 * Language choice, visible on every auth screen (design 05 §2). Native <select>: works with every
 * keyboard, screen reader and cheap phone. Language names are endonyms with their own `lang`.
 * Changing it updates <html lang> (see createI18n).
 */
export function LanguageSwitcher({
  compact = false,
  onDark = false,
  className,
}: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation("ui");
  const id = `language-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const current = i18n.resolvedLanguage ?? i18n.language;

  return (
    <div className={cx("flex items-center gap-2", className)}>
      <Globe
        aria-hidden="true"
        className={cx("size-5 shrink-0", onDark ? "text-on-forest-muted" : "text-fg-muted")}
      />
      <label
        htmlFor={id}
        className={cx("font-semibold", compact && "sr-only", onDark ? "text-on-forest" : "text-fg")}
      >
        {t("language.label")}
      </label>
      <select
        id={id}
        value={current}
        onChange={(event) => void i18n.changeLanguage(event.target.value)}
        className={cx(
          "min-h-target cursor-pointer rounded-sm border px-2 text-body",
          onDark
            ? "border-on-forest-muted bg-forest text-on-forest"
            : "border-border-input bg-surface text-fg",
        )}
      >
        {SUPPORTED_LANGUAGES.map((language) => (
          <option key={language} value={language} lang={language}>
            {t(`language.names.${language}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
