import type { ComponentType } from "react";
import type { RouteObject } from "react-router";

import type { CommandProvider } from "../layout/commands";

// ---- Feature imports: ONLY between the sprint's markers (shared-file protocol) ----
// [S1 imports]
import { lockFeature } from "../features/lock";
import { platformFeature } from "../features/platform";
// [/S1 imports]
// [S3 imports]
import { patientsFeature } from "../features/patients";
// [/S3 imports]
// [S9 imports]
// [/S9 imports]
// [S2 imports]
// [/S2 imports]
// [S10 imports]
// [/S10 imports]

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
  /** Actions and searches in the command palette (Ctrl+K). */
  commands?: CommandProvider[];
}

export const FEATURE_HEADER_ITEMS = (): ComponentType[] =>
  FEATURES.flatMap((feature) => feature.headerItems ?? []);
export const FEATURE_COMMANDS = (): CommandProvider[] =>
  FEATURES.flatMap((feature) => feature.commands ?? []);
export const FEATURE_SHELL_OVERLAYS = (): ComponentType[] =>
  FEATURES.flatMap((feature) => feature.shellOverlays ?? []);

/**
 * Feature registry. Shared-file protocol (docs/architecture/contracts/README.md): each sprint
 * adds its import and its entry ONLY between its own markers.
 */
export const FEATURES: FeatureRoutes[] = [
  // [S1]
  lockFeature,
  platformFeature,
  // [/S1]
  // [S3]
  patientsFeature,
  // [/S3]
  // [S9]
  // [/S9]
  // [S2]
  // [/S2]
  // [S10]
  // [/S10]
];
