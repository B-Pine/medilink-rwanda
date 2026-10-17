import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { readPreference, writePreference } from "../preferences/storage";

/** Light / dark / follow the system (design 04 §2, design 02 §7). */
export type ThemePreference = "light" | "dark" | "system";
export const THEME_PREFERENCES: readonly ThemePreference[] = ["light", "dark", "system"];

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function storedTheme(): ThemePreference {
  const value = readPreference("theme");
  return isThemePreference(value) ? value : "system";
}

/** Apply a theme to <html>: `data-theme` overrides the system preference; none = follow it. */
export function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}

/** Apply the stored theme before the first render (avoids a flash of the wrong theme). */
export function initTheme(): ThemePreference {
  const theme = storedTheme();
  applyTheme(theme);
  return theme;
}

interface ThemeContextValue {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(storedTheme);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    applyTheme(next);
    writePreference("theme", next === "system" ? null : next);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside <ThemeProvider>");
  return context;
}
