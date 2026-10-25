import type { HttpHandler } from "msw";

import type { MockContext } from "./handlers";

// ---- Feature imports: ONLY between the sprint's markers (shared-file protocol) ----
// [S1 imports]
import { masterDataMocks } from "./features/masterdata";
import { onboardingMocks } from "./features/onboarding";
import { securityMocks } from "./features/security";
import { uploadsMocks } from "./features/uploads";
// [/S1 imports]
// [S3 imports]
import { patientsMocks } from "./features/patients";
import { profileMocks } from "./features/profile";
// [/S3 imports]
// [S9 imports]
// [/S9 imports]

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
  securityMocks,
  uploadsMocks,
  masterDataMocks,
  onboardingMocks,
  // [/S1]
  // [S3]
  patientsMocks,
  profileMocks,
  // [/S3]
  // [S9]
  // [/S9]
];
