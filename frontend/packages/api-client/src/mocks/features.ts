import type { HttpHandler } from "msw";

import type { MockContext } from "./handlers";

/** A feature's MSW handlers, plus how to reset its in-memory state between tests. */
export interface FeatureMock {
  handlers: HttpHandler[];
  reset?: () => void;
}

export type FeatureMockFactory = (context: MockContext) => FeatureMock;

/**
 * Feature mock registry (one factory per feature, in `src/mocks/features/<feature>.ts`).
 * Shared-file protocol (docs/architecture/contracts/README.md): each sprint adds its import
 * and its factory ONLY between its own markers.
 */
export const FEATURE_MOCKS: FeatureMockFactory[] = [
  // [S1]
  // [/S1]
  // [S3]
  // [/S3]
  // [S9]
  // [/S9]
];
