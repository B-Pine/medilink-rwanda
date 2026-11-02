import type { FeatureRoutes } from "../../app/features";

export { LettersSection } from "./LettersSection";
export { PatientDocuments } from "./PatientDocuments";

/**
 * S7b `documents` (contract sprint-07 §6.1, S7-F7): no pages of its own. The consultation page
 * mounts `LettersSection` and the patient record mounts `PatientDocuments`, both in `[S7]` slots.
 */
export const documentsFeature: FeatureRoutes = {};
