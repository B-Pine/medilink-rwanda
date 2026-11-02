/**
 * Rules-based symptom triage (contract public-pages-and-triage §2.2): care navigation, not a
 * diagnosis. No account and no personal data.
 */

import type { ApiClient } from "../client";

export type TriageDuration = "today" | "days" | "week";
export type TriageAgeGroup = "infant" | "child" | "teen" | "adult" | "older";
export type TriageUrgency = "emergency" | "today" | "soon" | "self_care";

export interface TriageInput {
  /** 1-8 symptom codes from `GET /public/symptoms/`. */
  symptoms: string[];
  duration: TriageDuration;
  age_group: TriageAgeGroup;
  /** Only read for `teen` and `adult`. */
  pregnant?: boolean;
}

export interface TriageResult {
  urgency: TriageUrgency;
  /** A service-catalogue code to search with. */
  service_code: string;
  /** `primary`, `secondary` or `tertiary`, as the search filter. */
  level_of_care: string;
  /** Symptoms that triggered the emergency rule. */
  red_flags: string[];
  /** Rule keys the page turns into one plain sentence. */
  reasons: string[];
  rules_version: string;
  /** False until a clinician signs this rules version off (#93). */
  signed_off: boolean;
}

export const triagePaths = { run: "/api/v1/public/triage/" } as const;

export function createTriageApi(client: ApiClient) {
  return {
    run: (body: TriageInput) => client.post<TriageResult>(triagePaths.run, body),
  };
}
