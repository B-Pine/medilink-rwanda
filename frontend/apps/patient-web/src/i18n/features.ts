import type { AppResources } from "@medilink/ui/i18n";

// ---- Feature imports: ONLY between the sprint's markers (shared-file protocol) ----
// [S1 imports]
import facilityApplicationEn from "../features/facilityApplication/locales/en.json";
import facilityApplicationFr from "../features/facilityApplication/locales/fr.json";
import facilityApplicationRw from "../features/facilityApplication/locales/rw.json";
// [/S1 imports]
// [S3 imports]
import profileEn from "../features/profile/locales/en.json";
import profileFr from "../features/profile/locales/fr.json";
import profileRw from "../features/profile/locales/rw.json";
// [/S3 imports]
// [S9 imports]
// [/S9 imports]
// [S2 imports]
// [/S2 imports]
// [S10 imports]
// [/S10 imports]

/**
 * Feature translation namespaces: `<feature>` -> `src/features/<feature>/locales/{rw,en,fr}.json`.
 * Shared-file protocol: each sprint adds its imports and entry ONLY between its own markers.
 */
export const FEATURE_LOCALES: Record<string, AppResources> = {
  // [S1]
  facilityApplication: {
    rw: facilityApplicationRw,
    en: facilityApplicationEn,
    fr: facilityApplicationFr,
  },
  // [/S1]
  // [S3]
  profile: { rw: profileRw, en: profileEn, fr: profileFr },
  // [/S3]
  // [S9]
  // [/S9]
  // [S2]
  // [/S2]
  // [S10]
  // [/S10]
};
