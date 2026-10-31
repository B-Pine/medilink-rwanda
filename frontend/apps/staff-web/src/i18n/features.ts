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
// [S2 imports]
import setupEn from "../features/setup/locales/en.json";
import setupFr from "../features/setup/locales/fr.json";
import setupRw from "../features/setup/locales/rw.json";
// [/S2 imports]
// [S10 imports]
// [/S10 imports]
// [S4 imports]
import queueEn from "../features/queue/locales/en.json";
import queueFr from "../features/queue/locales/fr.json";
import queueRw from "../features/queue/locales/rw.json";
// [/S4 imports]
// [S5 imports]
import bookingsEn from "../features/bookings/locales/en.json";
import bookingsFr from "../features/bookings/locales/fr.json";
import bookingsRw from "../features/bookings/locales/rw.json";
// [/S5 imports]

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
  // [S2]
  setup: { rw: setupRw, en: setupEn, fr: setupFr },
  // [/S2]
  // [S10]
  // [/S10]
  // [S4]
  queue: { rw: queueRw, en: queueEn, fr: queueFr },
  // [/S4]
  // [S5]
  bookings: { rw: bookingsRw, en: bookingsEn, fr: bookingsFr },
  // [/S5]
};
