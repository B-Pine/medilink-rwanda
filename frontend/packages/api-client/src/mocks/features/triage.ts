import { http, HttpResponse } from "msw";

import type {
  AssistantInput,
  AssistantState,
  AssistantTurn,
  TriageInput,
  TriageResult,
} from "../../features/triage";
import type { FeatureMockFactory } from "../features";
import { SYMPTOMS } from "./booking";

/** The backend's rules `2026.11-p1` (medilink/triage/rules.py), so the mock answers the same. */
const KNOWN = new Set(SYMPTOMS.map((s) => s.code));
const RED_FLAGS = new Set(SYMPTOMS.filter((s) => s.is_red_flag).map((s) => s.code));
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
      if (body.symptoms.some((code) => !KNOWN.has(code)))
        return context.errorResponse(400, "validation_error", "Unknown symptom.");
      if (!body.duration || !body.age_group)
        return context.errorResponse(400, "validation_error", "Say how long and who it is for.");
      return HttpResponse.json(mockTriage(body as TriageInput));
    }),
  ],
});

// ---- AI symptom assistant (issue #159): a scripted conversation for dev and tests -----------

const WORDS: [RegExp, string][] = [
  [/fever|hot|umuriro|fièvre/i, "fever"],
  [/head|umutwe|tête/i, "headache"],
  [/chill|cold|frisson/i, "chills"],
  [/vomit|kuruka/i, "vomiting"],
  [/cough|inkorora|toux/i, "cough"],
  [/chest pain|douleur thoracique|igituza/i, "sharp chest pain"],
  [/breath|guhumeka|respir/i, "difficulty breathing"],
];

/** Fever + headache, a "yes" to vomiting, then a hedged answer naming malaria as possible. */
export function mockAssistantTurn(body: AssistantInput): AssistantTurn {
  const state: AssistantState = {
    present: [...(body.state?.present ?? [])],
    absent: [...(body.state?.absent ?? [])],
    asked: [...(body.state?.asked ?? [])],
    pending: null,
  };
  const text = body.message.trim();
  const pending = body.state?.pending ?? null;
  if (pending && /^(yes|yego|oui)\b/i.test(text)) state.present.push(pending);
  else if (pending && /^(no|oya|non)\b/i.test(text)) state.absent.push(pending);
  for (const [pattern, name] of WORDS)
    if (pattern.test(text) && !state.present.includes(name)) state.present.push(name);
  const base = {
    state,
    red_flags: [] as string[],
    condition: null,
    named: false,
    service_code: null,
    urgency: null,
    matcher_version: "nb-2026.11-1",
    test_phase: true,
  };
  const flags = state.present.filter(
    (s) => s === "sharp chest pain" || s === "difficulty breathing",
  );
  if (flags.length)
    return {
      ...base,
      kind: "emergency",
      reply: null,
      red_flags: flags,
      service_code: "emergency_care",
    };
  if (!state.present.length) return { ...base, kind: "clarify", reply: null };
  if (state.present.length < 3 && state.asked.length < 4) {
    const next = ["vomiting", "chills", "cough"].find(
      (s) => !state.present.includes(s) && !state.asked.includes(s) && !state.absent.includes(s),
    );
    if (next) {
      state.asked.push(next);
      state.pending = next;
      return { ...base, kind: "question", reply: `Do you also have ${next}?` };
    }
  }
  return {
    ...base,
    kind: "answer",
    reply:
      `You told me about ${state.present.join(", ")}. You may have malaria, but only a doctor ` +
      "can tell after a test. It is best to see a doctor today at a health facility, where they " +
      "can examine you and help you further. The facilities below can help you.",
    condition: "malaria",
    named: true,
    service_code: "general_consultation",
    urgency: "today",
  };
}

export const assistantMocks: FeatureMockFactory = (context) => ({
  handlers: [
    http.post(`${context.api}/public/assistant/`, async ({ request }) => {
      await context.settle();
      const body = ((await context.readJson(request)) ?? {}) as Partial<AssistantInput>;
      if (typeof body.message !== "string" || !body.message.trim() || body.message.length > 600)
        return context.errorResponse(400, "validation_error", "Write up to 600 characters.");
      if (!body.language || !["rw", "en", "fr"].includes(body.language))
        return context.errorResponse(400, "validation_error", "Unknown language.");
      return HttpResponse.json(mockAssistantTurn(body as AssistantInput));
    }),
  ],
});
