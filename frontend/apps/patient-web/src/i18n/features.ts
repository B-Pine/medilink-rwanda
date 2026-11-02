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
import notificationsEn from "../features/notifications/locales/en.json";
import notificationsFr from "../features/notifications/locales/fr.json";
import notificationsRw from "../features/notifications/locales/rw.json";
// [/S9 imports]
// [S2 imports]
// [/S2 imports]
// [S10 imports]
import helpEn from "../features/help/locales/en.json";
import helpFr from "../features/help/locales/fr.json";
import helpRw from "../features/help/locales/rw.json";
// [/S10 imports]
// [S4 imports]
import trackerEn from "../features/tracker/locales/en.json";
import trackerFr from "../features/tracker/locales/fr.json";
import trackerRw from "../features/tracker/locales/rw.json";
// [/S4 imports]
// [S5 imports]
import bookingEn from "../features/booking/locales/en.json";
import bookingFr from "../features/booking/locales/fr.json";
import bookingRw from "../features/booking/locales/rw.json";
// [/S5 imports]
// [S6 imports]
import recordsEn from "../features/records/locales/en.json";
import recordsFr from "../features/records/locales/fr.json";
import recordsRw from "../features/records/locales/rw.json";
// [/S6 imports]
// [S7 imports]
import medicinesEn from "../features/medicines/locales/en.json";
import medicinesFr from "../features/medicines/locales/fr.json";
import medicinesRw from "../features/medicines/locales/rw.json";
import documentsEn from "../features/documents/locales/en.json";
import documentsFr from "../features/documents/locales/fr.json";
import documentsRw from "../features/documents/locales/rw.json";
// [/S7 imports]
// [Upgrade U2 imports]
import siteEn from "../features/site/locales/en.json";
import siteFr from "../features/site/locales/fr.json";
import siteRw from "../features/site/locales/rw.json";
// [/Upgrade U2 imports]
// [Upgrade U12 imports]
import dashboardEn from "../features/dashboard/locales/en.json";
import dashboardFr from "../features/dashboard/locales/fr.json";
import dashboardRw from "../features/dashboard/locales/rw.json";
// [/Upgrade U12 imports]
// [PT imports]
import publicEn from "../features/public/locales/en.json";
import publicFr from "../features/public/locales/fr.json";
import publicRw from "../features/public/locales/rw.json";
// [/PT imports]

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
  notifications: { rw: notificationsRw, en: notificationsEn, fr: notificationsFr },
  // [/S9]
  // [S2]
  // [/S2]
  // [S10]
  help: { rw: helpRw, en: helpEn, fr: helpFr },
  // [/S10]
  // [S4]
  tracker: { rw: trackerRw, en: trackerEn, fr: trackerFr },
  // [/S4]
  // [S5]
  booking: { rw: bookingRw, en: bookingEn, fr: bookingFr },
  // [/S5]
  // [S6]
  records: { rw: recordsRw, en: recordsEn, fr: recordsFr },
  // [/S6]
  // [S7]
  medicines: { rw: medicinesRw, en: medicinesEn, fr: medicinesFr },
  documents: { rw: documentsRw, en: documentsEn, fr: documentsFr },
  // [/S7]
  // [Upgrade U2]
  site: { rw: siteRw, en: siteEn, fr: siteFr },
  // [/Upgrade U2]
  // [PT]
  public: { rw: publicRw, en: publicEn, fr: publicFr },
  // [/PT]
  // [Upgrade U12]
  dashboard: { rw: dashboardRw, en: dashboardEn, fr: dashboardFr },
  // [/Upgrade U12]
};
