import type { AppResources } from "@medilink/ui/i18n";

// ---- Feature imports: ONLY between the sprint's markers (shared-file protocol) ----
// [S1 imports]
import lockEn from "../features/lock/locales/en.json";
import lockFr from "../features/lock/locales/fr.json";
import lockRw from "../features/lock/locales/rw.json";
import platformEn from "../features/platform/locales/en.json";
import platformFr from "../features/platform/locales/fr.json";
import platformRw from "../features/platform/locales/rw.json";
// [/S1 imports]
// [S3 imports]
import patientsEn from "../features/patients/locales/en.json";
import patientsFr from "../features/patients/locales/fr.json";
import patientsRw from "../features/patients/locales/rw.json";
// [/S3 imports]
// [S9 imports]
// [/S9 imports]

/**
 * Feature translation namespaces: `<feature>` -> `src/features/<feature>/locales/{rw,en,fr}.json`.
 * Shared-file protocol: each sprint adds its imports and entry ONLY between its own markers.
 */
export const FEATURE_LOCALES: Record<string, AppResources> = {
  // [S1]
  lock: { rw: lockRw, en: lockEn, fr: lockFr },
  platform: { rw: platformRw, en: platformEn, fr: platformFr },
  // [/S1]
  // [S3]
  patients: { rw: patientsRw, en: patientsEn, fr: patientsFr },
  // [/S3]
  // [S9]
  // [/S9]
};
