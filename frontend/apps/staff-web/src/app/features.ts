import type { RouteObject } from "react-router";

/** The routes a feature module contributes (each feature lives in `src/features/<feature>/`). */
export interface FeatureRoutes {
  /** Top-level routes outside the staff shell (full-screen or public pages). */
  public?: RouteObject[];
  /** Routes inside the authenticated staff shell; a route here replaces the nav placeholder. */
  shell?: RouteObject[];
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
