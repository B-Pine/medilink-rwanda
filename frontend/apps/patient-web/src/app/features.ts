import type { ComponentType } from "react";
import type { RouteObject } from "react-router";

// ---- Feature imports: ONLY between the sprint's markers (shared-file protocol) ----
// [S1 imports]
import { facilityApplicationFeature } from "../features/facilityApplication";
// [/S1 imports]
// [S3 imports]
import { profileFeature } from "../features/profile";
// [/S3 imports]
// [S9 imports]
import { notificationsFeature } from "../features/notifications";
// [/S9 imports]
// [S2 imports]
// [/S2 imports]
// [S10 imports]
import { helpFeature } from "../features/help";
// [/S10 imports]
// [Upgrade U2 imports]
import { siteFeature } from "../features/site";
// [/Upgrade U2 imports]
// [PT imports]
import { publicFeature } from "../features/public";
// [/PT imports]
// [S4 imports]
import { trackerFeature } from "../features/tracker";
// [/S4 imports]
// [S5 imports]
import { bookingFeature } from "../features/booking";
// [/S5 imports]
// [S6 imports]
import { recordsFeature } from "../features/records";
// [/S6 imports]
// [S7 imports]
import { documentsFeature } from "../features/documents";
import { medicinesFeature } from "../features/medicines";
// [/S7 imports]
// [Upgrade U12 imports]
import { dashboardFeature } from "../features/dashboard";
// [/Upgrade U12 imports]

/** What a feature module contributes (each feature lives in `src/features/<feature>/`). */
export interface FeatureRoutes {
  /** Public routes (no login): public pages, wizards. */
  public?: RouteObject[];
  /** Routes that need a logged-in patient. */
  patient?: RouteObject[];
  /** Items in the dashboard top bar, before the language and account (e.g. the notification bell). */
  headerItems?: ComponentType[];
}

// upgrade 12: the overview (/dashboard) composes its sections itself, so the old home slots are gone
export const FEATURE_HEADER_ITEMS = (): ComponentType[] =>
  FEATURES.flatMap((feature) => feature.headerItems ?? []);

/**
 * Feature registry. Shared-file protocol (docs/architecture/contracts/README.md): each sprint
 * adds its import and its entry ONLY between its own markers.
 */
export const FEATURES: FeatureRoutes[] = [
  // [S1]
  facilityApplicationFeature,
  // [/S1]
  // [S3]
  profileFeature,
  // [/S3]
  // [S9]
  notificationsFeature,
  // [/S9]
  // [S2]
  // [/S2]
  // [S10]
  helpFeature,
  // [/S10]
  // [Upgrade U2]
  siteFeature,
  // [/Upgrade U2]
  // [PT]
  publicFeature,
  // [/PT]
  // [S4]
  trackerFeature,
  // [/S4]
  // [S5]
  bookingFeature,
  // [/S5]
  // [S6]
  recordsFeature,
  // [/S6]
  // [S7]
  medicinesFeature,
  documentsFeature,
  // [/S7]
  // [Upgrade U12]
  dashboardFeature,
  // [/Upgrade U12]
];
