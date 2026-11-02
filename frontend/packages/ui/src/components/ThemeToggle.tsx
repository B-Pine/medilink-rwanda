import { Desktop, Moon, Sun, type Icon } from "@phosphor-icons/react";
import { useId, useSyncExternalStore } from "react";
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

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeToScheme(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches;
}

/**
 * One-click light / dark switch for headers and toolbars: a toggle button pressed when the page is
 * dark. Until it is used the page follows the system; after that it remembers the choice.
 */
export function ThemeSwitch({ className }: { className?: string }) {
  const { t } = useTranslation("ui");
  const { theme, setTheme } = useTheme();
  const systemDark = useSyncExternalStore(subscribeToScheme, systemPrefersDark, () => false);
  const dark = theme === "dark" || (theme === "system" && systemDark);

  return (
    <button
      type="button"
      aria-pressed={dark}
      aria-label={t("theme.dark")}
      title={dark ? t("theme.light") : t("theme.dark")}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={cx(
        "relative inline-flex size-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border bg-surface text-fg-secondary transition-[background-color,border-color,color,transform] duration-150 ease-out-quint hover:border-border-input hover:bg-subtle hover:text-fg active:scale-[0.94] motion-reduce:active:scale-100",
        className,
      )}
    >
      <Sun
        aria-hidden="true"
        weight="bold"
        className={cx(
          "absolute size-[1.125rem] transition-[opacity,rotate,scale] duration-300 ease-out-quint motion-reduce:transition-none",
          dark ? "scale-100 rotate-0 opacity-100" : "scale-50 -rotate-90 opacity-0",
        )}
      />
      <Moon
        aria-hidden="true"
        weight="bold"
        className={cx(
          "absolute size-[1.125rem] transition-[opacity,rotate,scale] duration-300 ease-out-quint motion-reduce:transition-none",
          dark ? "scale-50 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100",
        )}
      />
    </button>
  );
}
