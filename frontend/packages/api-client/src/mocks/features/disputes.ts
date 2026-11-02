import { http, HttpResponse } from "msw";

import type {
  DisputeEvent,
  DisputeMessage,
  DisputeOutcome,
  DisputeStatus,
  DisputeSubjectType,
  DisputeType,
  PatientDispute,
  StaffDispute,
  StaffDisputeRow,
} from "../../features/disputes";
import type { LanguageCode } from "../../types";
import type { FeatureMockFactory } from "../features";
import { MOCK_CLINICAL_FP } from "./clinical";
import { SELF_PATIENT_ID } from "./patients-store";
import { id, now, page, s1, stepUpFailure } from "./s1-common";

/**
 * S10 part 2a mocks (sprint-10b §3), Kigali Clinic. The patient (patient@medilink.test) has one
 * dispute under review about prescription RX-2026-000099 ("fewer tablets"), with an internal
 * note only staff see. Facility admins handle; the platform admin takes escalated ones.
 */
export const MOCK_DISPUTE = "ad000000-0000-4000-8000-000000000001";
export const MOCK_DISPUTE_SUBJECT = "8d000000-0000-4000-8000-000000000105";

const FACILITY = "Kigali Clinic";
const HOURS = 3_600_000;
const DAYS = 24 * HOURS;
const TYPES: Record<DisputeSubjectType, DisputeType> = {
  bill: "billing",
  prescription: "medication",
  visit: "queue_booking",
  ticket: "queue_booking",
  booking: "queue_booking",
  no_show_strike: "queue_booking",
  document: "record_correction",
};

interface MockDispute extends StaffDispute {
  closed_at: string | null;
  reopen_count: number;
}

const iso = (ms: number) => new Date(ms).toISOString();

function seed(): MockDispute[] {
  const raised = Date.now() - 2 * DAYS;
  return [
    {
      id: MOCK_DISPUTE,
      patient_id: SELF_PATIENT_ID,
      patient_display_name: "Mukamana Jeanne",
      facility_name: FACILITY,
      channel: "app",
      type: "medication",
      subject_type: "prescription",
      subject_id: MOCK_DISPUTE_SUBJECT,
      subject_snapshot: { number: "RX-2026-000099", status: "dispensed" },
      status: "under_review",
      handler_level: "facility",
      acknowledge_by: iso(raised + 72 * HOURS),
      decide_by: iso(raised + DAYS + 10 * DAYS),
      is_overdue: false,
      outcome: "",
      created_at: iso(raised),
      version: 3,
      flagged: false,
      description: "I was given 10 tablets but the prescription says 21.",
      decision_reason: "",
      resolved_at: null,
      closed_at: null,
      reopen_count: 0,
      statement: "",
      can_decide: true,
      messages: [
        {
          id: id(),
          author_name: "Uwase Aline",
          author_role: "handler",
          visibility: "internal",
          body: "Check the dispensing record against the shelf count.",
          created_at: iso(raised + DAYS),
        },
      ],
      events: [
        {
          from_status: "",
          to_status: "open",
          actor_name: "Mukamana Jeanne",
          reason: "",
          occurred_at: iso(raised),
        },
        {
          from_status: "open",
          to_status: "under_review",
          actor_name: "Uwase Aline",
          reason: "",
          occurred_at: iso(raised + DAYS),
        },
      ],
      evidence: [
        {
          action: "pharmacy.prescription.issued",
          at: iso(raised - 3 * DAYS),
          actor_name: "Uwimana Keza",
        },
        {
          action: "pharmacy.dispensed",
          at: iso(raised - 3 * DAYS + HOURS),
          actor_name: "Nshimiyimana Patrick",
        },
      ],
      actions: [],
      comment_requests: [],
    },
  ];
}

const MESSAGES = {
  notNow: {
    en: "This dispute can't do that now.",
    fr: "Ce litige ne permet pas cela maintenant.",
    rw: "Iki kirego ntigishobora gukora ibyo ubu.",
  },
  open: {
    en: "A dispute about this is already open.",
    fr: "Un litige à ce sujet est déjà ouvert.",
    rw: "Hari ikirego kuri iki kimaze gufungurwa.",
  },
  stale: {
    en: "Someone changed this dispute. Reload and try again.",
    fr: "Quelqu'un a modifié ce litige. Rechargez et réessayez.",
    rw: "Hari uwahinduye iki kirego. Ongera ufungure ugerageze.",
  },
} as const;

export const disputesMocks: FeatureMockFactory = (context) => {
  const { api } = context;
  let db = seed();
  const msg = (key: keyof typeof MESSAGES, lang: LanguageCode) => MESSAGES[key][lang];
  const rule = (lang: LanguageCode, key: keyof typeof MESSAGES = "notNow") =>
    context.errorResponse(422, "business_rule_violation", msg(key, lang));
  const stale = (lang: LanguageCode) => context.errorResponse(409, "conflict", msg("stale", lang));
  const notFound = (lang: LanguageCode) =>
    context.errorResponse(404, "not_found", context.message("notFound", lang));
  const staff = (request: Request, codes: string[]) => {
    const lang = context.languageFrom(request);
    const result = context.authenticatedStaff(lang);
    if ("error" in result) return { error: result.error };
    const granted = result.me.permissions as readonly string[];
    if (!result.me.active_facility_id || !codes.some((c) => granted.includes(c)))
      return {
        error: context.errorResponse(403, "permission_denied", s1("permissionDenied", lang)),
      };
    return { lang, me: result.me };
  };
  const platform = (request: Request) => {
    const lang = context.languageFrom(request);
    const result = context.authenticatedStaff(lang);
    if ("error" in result) return { error: result.error };
    if (!result.me.is_platform_admin)
      return {
        error: context.errorResponse(403, "permission_denied", s1("permissionDenied", lang)),
      };
    return { lang, me: result.me };
  };
  const patient = (request: Request) => {
    const lang = context.languageFrom(request);
    const auth = context.authenticatedPatient(lang);
    if ("error" in auth) return { error: auth.error };
    return { lang, me: auth.me, profiles: new Set(auth.me.profiles.map((p) => p.patient_id)) };
  };
  const move = (d: MockDispute, to: DisputeStatus, actor: string, reason = "") => {
    d.events.push({
      from_status: d.status,
      to_status: to,
      actor_name: actor,
      reason,
      occurred_at: now(),
    });
    d.status = to;
    d.version += 1;
  };
  const say = (
    d: MockDispute,
    author: string,
    role: DisputeMessage["author_role"],
    visibility: DisputeMessage["visibility"],
    body: string,
  ) => {
    d.messages.push({
      id: id(),
      author_name: author,
      author_role: role,
      visibility,
      body,
      created_at: now(),
    });
  };
  const row = ({
    description: _d,
    decision_reason: _r,
    resolved_at: _ra,
    closed_at: _c,
    reopen_count: _rc,
    statement: _s,
    can_decide: _cd,
    messages: _m,
    events: _e,
    evidence: _ev,
    actions: _a,
    comment_requests: _cr,
    ...out
  }: MockDispute): StaffDisputeRow => out;
  const forPatient = (d: MockDispute): PatientDispute => {
    const { flagged: _f, ...base } = row(d);
    const t = Date.now();
    return {
      ...base,
      description: d.description,
      decision_reason: d.decision_reason,
      resolved_at: d.resolved_at,
      closed_at: d.closed_at,
      can_accept: d.status === "resolved" || d.status === "final_decision",
      can_escalate: d.status === "resolved" && t <= Date.parse(d.resolved_at ?? now()) + 14 * DAYS,
      can_reopen: d.status === "closed" && d.reopen_count === 0,
      can_add_statement: d.outcome === "correction_refused" && !d.statement,
      statement: d.statement,
      messages: d.messages.filter((m) => m.visibility === "thread"),
      events: d.events,
    };
  };
  const forStaff = ({ closed_at: _c, reopen_count: _r, ...d }: MockDispute): StaffDispute => d;
  const body = async (request: Request) =>
    ((await context.readJson(request)) ?? {}) as {
      version?: number;
      body?: string;
      visibility?: "thread" | "internal";
      outcome?: DisputeOutcome;
      reason?: string;
      statement?: string;
      membership_id?: string;
      patient_id?: string;
      facility_patient_id?: string;
      subject_type?: DisputeSubjectType;
      subject_id?: string;
      description?: string;
    };
  const create = (
    lang: LanguageCode,
    input: { subject_type: DisputeSubjectType; subject_id: string; description: string },
    who: { name: string; channel: "app" | "counter" },
  ) => {
    const live = ["closed", "final_decision"];
    if (db.some((d) => d.subject_id === input.subject_id && !live.includes(d.status)))
      return { error: context.errorResponse(409, "conflict", msg("open", lang)) };
    const t = Date.now();
    const d: MockDispute = {
      ...seed()[0]!,
      id: id(),
      channel: who.channel,
      type: TYPES[input.subject_type],
      subject_type: input.subject_type,
      subject_id: input.subject_id,
      subject_snapshot: {},
      status: "open",
      acknowledge_by: iso(t + 72 * HOURS),
      decide_by: null,
      created_at: iso(t),
      version: 1,
      description: input.description,
      messages: [],
      events: [
        {
          from_status: "",
          to_status: "open",
          actor_name: who.name,
          reason: "",
          occurred_at: iso(t),
        },
      ],
      evidence: [],
    };
    db.unshift(d);
    return { d };
  };

  const P = `${api}/patient/disputes`;
  const S = `${api}/staff/disputes`;
  const PL = `${api}/platform/disputes`;

  return {
    reset: () => {
      db = seed();
    },
    handlers: [
      // ---- patient
      http.get(`${P}/`, async ({ request }) => {
        await context.settle();
        const ok = patient(request);
        if ("error" in ok) return ok.error;
        const url = new URL(request.url);
        const wanted = url.searchParams.get("patient_id");
        const rows = db
          .filter((d) => ok.profiles.has(d.patient_id) && (!wanted || d.patient_id === wanted))
          .map((d) => {
            const { flagged: _f, ...r } = row(d);
            return r;
          });
        return HttpResponse.json(page(rows, url));
      }),
      http.post(`${P}/`, async ({ request }) => {
        await context.settle();
        const ok = patient(request);
        if ("error" in ok) return ok.error;
        const b = await body(request);
        if (!b.patient_id || !ok.profiles.has(b.patient_id)) return notFound(ok.lang);
        if (!b.subject_type || !b.subject_id) return notFound(ok.lang);
        if ((b.description ?? "").trim().length < 10)
          return context.validationError(ok.lang, {
            description: ["Say what went wrong in a sentence or two."],
          });
        const made = create(
          ok.lang,
          {
            subject_type: b.subject_type,
            subject_id: b.subject_id,
            description: b.description!.trim(),
          },
          { name: ok.me.full_name, channel: "app" },
        );
        if ("error" in made) return made.error;
        made.d.patient_id = b.patient_id;
        return HttpResponse.json(forPatient(made.d), { status: 201 });
      }),
      http.get(`${P}/:id/`, async ({ request, params }) => {
        await context.settle();
        const ok = patient(request);
        if ("error" in ok) return ok.error;
        const d = db.find((x) => x.id === params.id && ok.profiles.has(x.patient_id));
        return d ? HttpResponse.json(forPatient(d)) : notFound(ok.lang);
      }),
      http.post(`${P}/:id/:step/`, async ({ request, params }) => {
        await context.settle();
        const ok = patient(request);
        if ("error" in ok) return ok.error;
        const d = db.find((x) => x.id === params.id && ok.profiles.has(x.patient_id));
        if (!d) return notFound(ok.lang);
        const b = await body(request);
        const step = String(params.step);
        if (step === "messages") {
          if (d.status === "closed") return rule(ok.lang);
          say(d, ok.me.full_name, "patient", "thread", (b.body ?? "").trim());
          if (d.status === "info_requested")
            move(d, "under_review", ok.me.full_name, "patient replied");
          else d.version += 1;
          return HttpResponse.json(forPatient(d), { status: 201 });
        }
        if (step === "disagreement") {
          if (d.outcome !== "correction_refused" || d.statement) return rule(ok.lang);
          d.statement = (b.statement ?? "").trim();
          return HttpResponse.json(forPatient(d), { status: 201 });
        }
        if (b.version !== d.version) return stale(ok.lang);
        const view = forPatient(d);
        if (step === "accept") {
          if (!view.can_accept) return rule(ok.lang);
          move(d, "closed", ok.me.full_name);
          d.closed_at = now();
        } else if (step === "escalate") {
          if (!view.can_escalate) return rule(ok.lang);
          move(d, "escalated", ok.me.full_name, "patient disagrees");
          d.handler_level = "platform";
        } else if (step === "reopen") {
          if (!view.can_reopen) return rule(ok.lang);
          move(d, "reopened", ok.me.full_name);
          d.reopen_count += 1;
          d.closed_at = null;
        } else return notFound(ok.lang);
        return HttpResponse.json(forPatient(d));
      }),

      // ---- staff
      http.get(`${S}/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, ["disputes.handle"]);
        if ("error" in ok) return ok.error;
        const url = new URL(request.url);
        const status = url.searchParams.get("status");
        const overdue = url.searchParams.get("overdue") === "true";
        const rows = db
          .filter((d) =>
            status === "open"
              ? !["closed", "final_decision"].includes(d.status)
              : !status || d.status === status,
          )
          .filter((d) => !overdue || d.is_overdue)
          .sort((a, b) => a.acknowledge_by.localeCompare(b.acknowledge_by))
          .map(row);
        return HttpResponse.json(page(rows, url));
      }),
      http.post(`${S}/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, ["queue.operate"]);
        if ("error" in ok) return ok.error;
        const b = await body(request);
        if (b.facility_patient_id !== MOCK_CLINICAL_FP || !b.subject_type || !b.subject_id)
          return notFound(ok.lang);
        const made = create(
          ok.lang,
          {
            subject_type: b.subject_type,
            subject_id: b.subject_id,
            description: (b.description ?? "").trim(),
          },
          { name: ok.me.full_name, channel: "counter" },
        );
        if ("error" in made) return made.error;
        return HttpResponse.json(row(made.d), { status: 201 });
      }),
      http.get(`${S}/:id/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["disputes.handle", "disputes.comment"]);
        if ("error" in ok) return ok.error;
        const d = db.find((x) => x.id === params.id);
        return d ? HttpResponse.json(forStaff(d)) : notFound(ok.lang);
      }),
      http.post(`${S}/:id/:step/`, async ({ request, params }) => {
        await context.settle();
        const step = String(params.step);
        const ok = staff(
          request,
          step === "comments" ? ["disputes.comment", "disputes.handle"] : ["disputes.handle"],
        );
        if ("error" in ok) return ok.error;
        const d = db.find((x) => x.id === params.id);
        if (!d) return notFound(ok.lang);
        const b = await body(request);
        const who = ok.me.full_name;
        if (step === "messages") {
          say(d, who, "handler", b.visibility ?? "thread", (b.body ?? "").trim());
          d.version += 1;
          return HttpResponse.json(forStaff(d), { status: 201 });
        }
        if (step === "comments") {
          say(d, who, "staff", "staff_comment", (b.body ?? "").trim());
          return HttpResponse.json(forStaff(d), { status: 201 });
        }
        if (step === "comment-requests") {
          d.comment_requests.push({
            id: id(),
            member_name: "Nshimiyimana Patrick",
            membership_id: b.membership_id ?? id(),
            responded_at: null,
          });
          return HttpResponse.json(forStaff(d), { status: 201 });
        }
        if (b.version !== d.version) return stale(ok.lang);
        if (step === "acknowledge") {
          if (!["open", "reopened"].includes(d.status)) return rule(ok.lang);
          move(d, "under_review", who);
          d.decide_by = iso(Date.now() + 10 * DAYS);
        } else if (step === "request-info") {
          if (d.status !== "under_review") return rule(ok.lang);
          say(d, who, "handler", "thread", (b.body ?? "").trim());
          move(d, "info_requested", who);
        } else if (step === "resolve") {
          if (!["under_review", "info_requested"].includes(d.status) || !b.outcome)
            return rule(ok.lang);
          move(d, "resolved", who, b.reason ?? "");
          d.outcome = b.outcome;
          d.decision_reason = (b.reason ?? "").trim();
          d.resolved_at = now();
          if (b.outcome !== "rejected" && b.outcome !== "correction_refused")
            d.actions.push({
              id: id(),
              outcome: b.outcome,
              linked_object_type: d.subject_type,
              linked_object_id: d.subject_id,
              status: b.outcome === "no_show_reversed" ? "done" : "pending",
              done_at: b.outcome === "no_show_reversed" ? now() : null,
            });
        } else return notFound(ok.lang);
        return HttpResponse.json(forStaff(d));
      }),

      // ---- platform
      http.get(`${PL}/`, async ({ request }) => {
        await context.settle();
        const ok = platform(request);
        if ("error" in ok) return ok.error;
        const rows = db
          .filter(
            (d) =>
              d.handler_level === "platform" || ["escalated", "final_decision"].includes(d.status),
          )
          .map(row);
        return HttpResponse.json(page(rows, new URL(request.url)));
      }),
      http.get(`${PL}/:id/`, async ({ request, params }) => {
        await context.settle();
        const ok = platform(request);
        if ("error" in ok) return ok.error;
        const d = db.find((x) => x.id === params.id);
        return d
          ? HttpResponse.json({ ...forStaff(d), can_decide: d.status === "escalated" })
          : notFound(ok.lang);
      }),
      http.post(`${PL}/:id/:step/`, async ({ request, params }) => {
        await context.settle();
        const ok = platform(request);
        if ("error" in ok) return ok.error;
        const d = db.find((x) => x.id === params.id);
        if (!d) return notFound(ok.lang);
        const b = await body(request);
        if (params.step === "messages") {
          say(d, ok.me.full_name, "platform", b.visibility ?? "thread", (b.body ?? "").trim());
          return HttpResponse.json(forStaff(d), { status: 201 });
        }
        const step = stepUpFailure(context, ok.lang);
        if (step) return step;
        if (b.version !== d.version) return stale(ok.lang);
        if (d.status !== "escalated" || !b.outcome) return rule(ok.lang);
        move(d, "final_decision", ok.me.full_name, b.reason ?? "");
        d.outcome = b.outcome;
        d.decision_reason = (b.reason ?? "").trim();
        d.resolved_at = now();
        return HttpResponse.json(forStaff(d));
      }),
    ],
  };
};

export type { DisputeEvent };
