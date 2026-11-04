import type { HttpHandler, WebSocketHandler } from "msw";

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
import { notificationsMocks } from "./features/notifications";
// [/S9 imports]
// [S2 imports]
import { setupMocks } from "./features/setup";
// [/S2 imports]
// [S10 imports]
import { helpMocks } from "./features/help";
// [/S10 imports]
// [PT imports]
import { assistantMocks, triageMocks } from "./features/triage";
// [/PT imports]
// [S4 imports]
import { queueMocks } from "./features/queue";
// [/S4 imports]
// [S5 imports]
import { bookingMocks } from "./features/booking";
// [/S5 imports]
// [S6 imports]
import { clinicalMocks } from "./features/clinical";
import { labMocks } from "./features/lab";
// [/S6 imports]
// [S7 imports]
import { documentsMocks } from "./features/documents";
import { pharmacyMocks } from "./features/pharmacy";
// [/S7 imports]
// [S8 imports]
import { billingMocks } from "./features/billing";
// [/S8 imports]
// [S11 imports]
import { consoleMocks } from "./features/console";
// [/S11 imports]

/** A feature's MSW handlers, plus how to reset its in-memory state between tests. */
export interface FeatureMock {
  handlers: (HttpHandler | WebSocketHandler)[];
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
  notificationsMocks,
  // [/S9]
  // [S2]
  setupMocks,
  // [/S2]
  // [S10]
  helpMocks,
  // [/S10]
  // [PT]
  triageMocks,
  assistantMocks,
  // [/PT]
  // [S4]
  queueMocks,
  // [/S4]
  // [S5]
  bookingMocks,
  // [/S5]
  // [S6]
  clinicalMocks,
  labMocks, // upgrade 06 §3 (#201)
  // [/S6]
  // [S7]
  pharmacyMocks,
  documentsMocks,
  // [/S7]
  // [S8]
  billingMocks,
  // [/S8]
  // [S11]
  consoleMocks,
  // [/S11]
];
