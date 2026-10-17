import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import { createI18n, type Language } from "../i18n";
import { ThemeProvider } from "../theme/theme";

/** Render with an English (or given language) i18n instance and the theme provider. */
export function renderWithProviders(
  ui: ReactElement,
  { language = "en", ...options }: RenderOptions & { language?: Language } = {},
) {
  const i18n = createI18n({ rw: {}, en: {}, fr: {} }, { language, persist: false });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider>{children}</ThemeProvider>
    </I18nextProvider>
  );
  return { i18n, ...render(ui, { wrapper: Wrapper, ...options }) };
}
