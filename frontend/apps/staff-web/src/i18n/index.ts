import {
  createI18n,
  withFeatureResources,
  type AppResources,
  type CreateI18nOptions,
} from "@medilink/ui/i18n";

import { FEATURE_LOCALES } from "./features";

import en from "./locales/en.json";
import fr from "./locales/fr.json";
import rw from "./locales/rw.json";

/**
 * Staff app strings. Kinyarwanda (rw.json) is a first draft that needs native-speaker review
 * before release (see frontend/i18n-review.md).
 */
export const staffResources: AppResources = withFeatureResources({ rw, en, fr }, FEATURE_LOCALES);

export function createStaffI18n(options?: CreateI18nOptions) {
  return createI18n(staffResources, options);
}
