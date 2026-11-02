import { http, HttpResponse } from "msw";

import type { TriageInput, TriageResult } from "../../features/triage";
import type { FeatureMockFactory } from "../features";

/** The backend's rules `2026.11-p1` (medilink/triage/rules.py), so the mock answers the same. */
const RED_FLAGS = new Set(["chest_pain", "shortness_of_breath", "bleeding"]);
const ORDER = ["self_care", "soon", "today", "emergency"] as const;

export function mockTriage(input: TriageInput): TriageResult {
  const s = new Set(input.symptoms);
  const young = input.age_group === "infant" || input.age_group === "child";
  const pregnant = Boolean(input.pregnant) && ["teen", "adult"].includes(input.age_group);
  const general = young ? "paediatric_consultation" : "general_consultation";
  const base = { rules_version: "2026.11-p1", signed_off: false } as const;

  const flags = [...s].filter((code) => RED_FLAGS.has(code)).sort();
  if (flags.length)
    return {
      ...base,
      urgency: "emergency",
      service_code: "emergency_care",
      level_of_care: "secondary",
      red_flags: flags,
      reasons: ["red_flag"],
    };

  const rules: [boolean, TriageResult["urgency"], string, string][] = [
    [
      pregnant &&
        (s.has("abdominal_pain") || s.has("vomiting") || (s.has("headache") && s.has("dizziness"))),
      "today",
      "antenatal_care",
      "pregnancy_warning",
    ],
    [
      input.age_group === "infant" && (s.has("fever") || s.has("diarrhoea") || s.has("vomiting")),
      "today",
      "paediatric_consultation",
      "infant_illness",
    ],
    [s.has("fever"), "today", general, "fever"],
    [s.has("diarrhoea") && s.has("vomiting"), "today", general, "fluid_loss"],
    [s.has("cough") && input.duration === "week", "today", "general_consultation", "long_cough"],
    [s.has("toothache"), "soon", "dental_care", "teeth"],
    [s.has("eye_pain"), "soon", "eye_care", "eyes"],
    [s.has("rash"), "soon", young ? "paediatric_consultation" : "dermatology", "skin"],
    [s.has("painful_urination"), "soon", "general_consultation", "urine"],
    [
      input.age_group === "adult" &&
        input.duration !== "week" &&
        s.size === 1 &&
        (s.has("sore_throat") || s.has("back_pain")),
      "self_care",
      "general_consultation",
      "self_care",
    ],
  ];
  const [, ruleUrgency, service, reason] = rules.find(([when]) => when) ?? [
    true,
    "soon",
    general,
    "see_clinician",
  ];
  let urgency: TriageResult["urgency"] = ruleUrgency;
  const reasons = [reason];
  const atLeast = (u: TriageResult["urgency"]) =>
    ORDER.indexOf(u) > ORDER.indexOf(urgency) ? u : urgency;
  if ((input.age_group === "infant" || input.age_group === "older") && urgency === "self_care") {
    urgency = atLeast("soon");
    reasons.push("safety_age");
  }
  if (input.age_group === "infant" && input.duration === "week" && atLeast("today") !== urgency) {
    urgency = atLeast("today");
    reasons.push("safety_duration");
  }
  return {
    ...base,
    urgency,
    service_code: service,
    level_of_care: "primary",
    red_flags: [],
    reasons,
  };
}

export const triageMocks: FeatureMockFactory = (context) => ({
  handlers: [
    http.post(`${context.api}/public/triage/`, async ({ request }) => {
      await context.settle();
      const body = ((await context.readJson(request)) ?? {}) as Partial<TriageInput>;
      if (!Array.isArray(body.symptoms) || body.symptoms.length < 1 || body.symptoms.length > 8)
        return context.errorResponse(400, "validation_error", "Choose 1 to 8 symptoms.");
      if (!body.duration || !body.age_group)
        return context.errorResponse(400, "validation_error", "Say how long and who it is for.");
      return HttpResponse.json(mockTriage(body as TriageInput));
    }),
  ],
});
