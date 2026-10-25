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
// [/S9 imports]

/** What a feature module contributes (each feature lives in `src/features/<feature>/`). */
export interface FeatureRoutes {
  /** Public routes (no login): public pages, wizards. */
  public?: RouteObject[];
  /** Routes that need a logged-in patient. */
  patient?: RouteObject[];
  /** Items in the logged-in header, before the log-out button (e.g. the notification bell). */
  headerItems?: ComponentType[];
  /** Cards on the patient home page, after "Find care" (e.g. "My profile", "Family"). */
  homeCards?: ComponentType[];
}

export const FEATURE_HEADER_ITEMS = (): ComponentType[] =>
  FEATURES.flatMap((feature) => feature.headerItems ?? []);
export const FEATURE_HOME_CARDS = (): ComponentType[] =>
  FEATURES.flatMap((feature) => feature.homeCards ?? []);

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
  // [/S9]
];
