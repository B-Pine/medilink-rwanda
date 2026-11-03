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

// ---- AI symptom assistant (issue #159, test phase) ------------------------------------------

export type AssistantLanguage = "rw" | "en" | "fr";
export type AssistantKind = "question" | "answer" | "emergency" | "clarify";

/** Symptom names the server keeps between turns; the client only sends it back. */
export interface AssistantState {
  present: string[];
  absent: string[];
  asked: string[];
  pending: string | null;
}

export interface AssistantInput {
  /** What the person typed, at most 600 characters. Never their name or an identifier. */
  message: string;
  language: AssistantLanguage;
  state?: AssistantState;
}

export interface AssistantTurn {
  kind: AssistantKind;
  /** The model's words for `question` and `answer`; null for `emergency` and `clarify`. */
  reply: string | null;
  state: AssistantState;
  red_flags: string[];
  /** The possible cause, only when the matcher was confident (`named`). English dataset name. */
  condition: string | null;
  named: boolean;
  /** A service-catalogue code to search facilities with. */
  service_code: string | null;
  urgency: "today" | "soon" | null;
  matcher_version: string;
  /** Always true for now: the hosted test model, not for real patients. */
  test_phase: boolean;
}

export const assistantPaths = { turn: "/api/v1/public/assistant/" } as const;

export const triagePaths = { run: "/api/v1/public/triage/" } as const;

export function createTriageApi(client: ApiClient) {
  return {
    run: (body: TriageInput) => client.post<TriageResult>(triagePaths.run, body),
    /** One assistant turn. 503 `assistant_unavailable` when it is switched off. */
    assistant: (body: AssistantInput) => client.post<AssistantTurn>(assistantPaths.turn, body),
  };
}
