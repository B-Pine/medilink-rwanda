import type { ComponentType } from "react";
import type { RouteObject } from "react-router";

// ---- Feature imports: ONLY between the sprint's markers (shared-file protocol) ----
// [S1 imports]
import { lockFeature } from "../features/lock";
// [/S1 imports]
// [S3 imports]
// [/S3 imports]
// [S9 imports]
// [/S9 imports]

/** What a feature module contributes (each feature lives in `src/features/<feature>/`). */
export interface FeatureRoutes {
  /** Top-level routes outside the staff shell (full-screen or public pages). */
  public?: RouteObject[];
  /** Routes inside the authenticated staff shell; a route here replaces the nav placeholder. */
  shell?: RouteObject[];
  /** Items in the shell header, before the user menu (e.g. the notification bell). */
  headerItems?: ComponentType[];
  /** Components mounted once inside the authenticated shell (e.g. the idle lock overlay). */
  shellOverlays?: ComponentType[];
}

export const FEATURE_HEADER_ITEMS = (): ComponentType[] =>
  FEATURES.flatMap((feature) => feature.headerItems ?? []);
export const FEATURE_SHELL_OVERLAYS = (): ComponentType[] =>
  FEATURES.flatMap((feature) => feature.shellOverlays ?? []);

/**
 * Feature registry. Shared-file protocol (docs/architecture/contracts/README.md): each sprint
 * adds its import and its entry ONLY between its own markers.
 */
export const FEATURES: FeatureRoutes[] = [
  // [S1]
  lockFeature,
  // [/S1]
  // [S3]
  // [/S3]
  // [S9]
  // [/S9]
];
