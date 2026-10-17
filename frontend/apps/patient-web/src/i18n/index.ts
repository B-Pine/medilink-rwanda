import { createI18n, type AppResources, type CreateI18nOptions } from "@medilink/ui/i18n";

import en from "./locales/en.json";
import fr from "./locales/fr.json";
import rw from "./locales/rw.json";

/**
 * Patient app strings. Kinyarwanda (rw.json) is a first draft that needs native-speaker review
 * before release (see frontend/i18n-review.md).
 */
export const patientResources: AppResources = { rw, en, fr };

export function createPatientI18n(options?: CreateI18nOptions) {
  return createI18n(patientResources, options);
}
