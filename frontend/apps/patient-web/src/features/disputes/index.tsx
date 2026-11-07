import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";
import { paths } from "../../app/paths";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const pages = () => import("./DisputesPages");

/** S10b `disputes`: raise, follow and answer a dispute (contract sprint-10b §5). */
export const disputesFeature: FeatureRoutes = {
  patient: [
    { path: paths.disputes, lazy: lazy(pages, "DisputesPage") },
    { path: paths.newDispute, lazy: lazy(pages, "NewDisputePage") },
    { path: `${paths.disputes}/:disputeId`, lazy: lazy(pages, "DisputePage") },
  ],
};

/** The "Report a problem" address for a subject (bill, prescription, document, booking…). */
export function reportProblemTo(subjectType: string, subjectId: string, patientId: string) {
  const q = new URLSearchParams({
    subject_type: subjectType,
    subject_id: subjectId,
    patient_id: patientId,
  });
  return `${paths.newDispute}?${q.toString()}`;
}
