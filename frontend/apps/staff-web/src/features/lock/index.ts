import type { FeatureRoutes } from "../../app/features";
import { IdleLock } from "./IdleLock";

/** S1 `lock` feature: idle lock overlay, step-up (see StepUp.tsx) and /account/security. */
export const lockFeature: FeatureRoutes = {
  shell: [
    {
      path: "/account/security",
      lazy: async () => ({ Component: (await import("./SecurityPage")).SecurityPage }),
    },
  ],
  shellOverlays: [IdleLock],
};

export { LockScreen } from "./LockScreen";
export { createLockStore, useLocked, type LockStore } from "./store";
export { isStepUpCancelled, StepUpCancelled, StepUpProvider, useStepUp } from "./StepUp";
