import { Desktop, Moon, Sun, type Icon } from "@phosphor-icons/react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { THEME_PREFERENCES, useTheme, type ThemePreference } from "../theme/theme";
import { cx } from "../utils/cx";

const ICONS: Record<ThemePreference, Icon> = { light: Sun, dark: Moon, system: Desktop };

/**
 * Light / dark / system as a segmented radio group with visible labels (design 04 §2).
 * Arrow keys move between options (native radio behaviour).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useTranslation("ui");
  const { theme, setTheme } = useTheme();
  const name = `theme-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <fieldset className={cx("m-0 min-w-0 border-0 p-0", className)}>
      <legend className="mb-1.5 p-0 font-semibold text-fg">{t("theme.label")}</legend>
      <div className="inline-flex flex-wrap gap-1 rounded-md border border-border bg-subtle p-1">
        {THEME_PREFERENCES.map((option) => {
          const OptionIcon = ICONS[option];
          const id = `${name}-${option}`;
          const checked = theme === option;
          return (
            <div key={option} className="relative">
              <input
                id={id}
                type="radio"
                name={name}
                value={option}
                checked={checked}
                onChange={() => setTheme(option)}
                className="peer absolute inset-0 size-full cursor-pointer opacity-0"
              />
              <label
                htmlFor={id}
                className={cx(
                  "flex min-h-target cursor-pointer items-center gap-1.5 rounded-sm px-3 font-semibold",
                  "peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
                  checked ? "bg-surface text-fg shadow-raised" : "text-fg-muted hover:text-fg",
                )}
              >
                <OptionIcon
                  aria-hidden="true"
                  weight={checked ? "fill" : "regular"}
                  className="size-5"
                />
                {t(`theme.${option}`)}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
