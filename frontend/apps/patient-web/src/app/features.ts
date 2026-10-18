import type { RouteObject } from "react-router";

/** The routes a feature module contributes (each feature lives in `src/features/<feature>/`). */
export interface FeatureRoutes {
  /** Public routes (no login): public pages, wizards. */
  public?: RouteObject[];
  /** Routes that need a logged-in patient. */
  patient?: RouteObject[];
}

/**
 * Feature registry. Shared-file protocol (docs/architecture/contracts/README.md): each sprint
 * adds its import and its entry ONLY between its own markers.
 */
export const FEATURES: FeatureRoutes[] = [
  // [S1]
  // [/S1]
  // [S3]
  // [/S3]
  // [S9]
  // [/S9]
];
