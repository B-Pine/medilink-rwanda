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
import notificationsEn from "../features/notifications/locales/en.json";
import notificationsFr from "../features/notifications/locales/fr.json";
import notificationsRw from "../features/notifications/locales/rw.json";
// [/S9 imports]
// [S2 imports]
import setupEn from "../features/setup/locales/en.json";
import setupFr from "../features/setup/locales/fr.json";
import setupRw from "../features/setup/locales/rw.json";
// [/S2 imports]
// [S10 imports]
import helpEn from "../features/help/locales/en.json";
import helpFr from "../features/help/locales/fr.json";
import helpRw from "../features/help/locales/rw.json";
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
// [S6 imports]
import clinicalEn from "../features/clinical/locales/en.json";
import clinicalFr from "../features/clinical/locales/fr.json";
import clinicalRw from "../features/clinical/locales/rw.json";
// [/S6 imports]
// [S7 imports]
import pharmacyEn from "../features/pharmacy/locales/en.json";
import pharmacyFr from "../features/pharmacy/locales/fr.json";
import pharmacyRw from "../features/pharmacy/locales/rw.json";
// [/S7 imports]

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
  notifications: { rw: notificationsRw, en: notificationsEn, fr: notificationsFr },
  // [/S9]
  // [S2]
  setup: { rw: setupRw, en: setupEn, fr: setupFr },
  // [/S2]
  // [S10]
  help: { rw: helpRw, en: helpEn, fr: helpFr },
  // [/S10]
  // [S4]
  queue: { rw: queueRw, en: queueEn, fr: queueFr },
  // [/S4]
  // [S5]
  bookings: { rw: bookingsRw, en: bookingsEn, fr: bookingsFr },
  // [/S5]
  // [S6]
  clinical: { rw: clinicalRw, en: clinicalEn, fr: clinicalFr },
  // [/S6]
  // [S7]
  pharmacy: { rw: pharmacyRw, en: pharmacyEn, fr: pharmacyFr },
  // [/S7]
};
