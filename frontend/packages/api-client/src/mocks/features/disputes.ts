import { http, HttpResponse } from "msw";

import {
  DISPUTE_TYPE_OF,
  outcomesFor,
  type DisputeMessage,
  type DisputeOutcome,
  type DisputeStatus,
  type DisputeSubjectType,
  type PatientDispute,
  type StaffDispute,
  type StaffDisputeRow,
} from "../../features/disputes";
import type { LanguageCode } from "../../types";
import type { FeatureMockFactory } from "../features";
import { id, now, page, stableId } from "./s1-common";
import { MEMBERSHIP_BY_EMAIL, SETUP_IDS } from "./setup";

/**
 * S10b disputes mocks (contract sprint-10b-disputes §3), the backend's state machine in memory.
 * patient@medilink.test (Mukamana Jeanne) has a dispute about today's Kigali Clinic bill under
 * review, and a refused record correction waiting for her answer. The facility queue adds an
 * overdue missed-visit dispute from a flagged patient and an escalated booking dispute, which the
 * platform (admin@medilink.test) decides. Like the billing mocks, any member with
 * `disputes.handle` sees the Kigali Clinic queue.
 */
const FACILITY = "Kigali Clinic";
const MUKAMANA = "9b2f1c3d-1111-4000-8000-000000000001";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ACKNOWLEDGE_WITHIN = 72 * HOUR;
const DECIDE_WITHIN = 10 * DAY;
const DISAGREE_WITHIN = 14 * DAY;
const REOPEN_WITHIN = 30 * DAY;
const MAX_OPEN = 5;
/** A JSON body field as text ("" when missing or not a string). */
const str = (value: unknown): string => (typeof value === "string" ? value : "");
const CLOSED: DisputeStatus[] = ["closed", "final_decision"];

const MEMBER_NAMES: Record<string, string> = {
  [SETUP_IDS.mAdmin]: "Mutesi Diane",
  [SETUP_IDS.mReception]: "Habimana Eric",
  [SETUP_IDS.mKeza]: "Uwimana Keza",
  [SETUP_IDS.mPaul]: "Niyonsenga Paul",
};

const MESSAGES = {
  tooMany: {
    en: "You have 5 open disputes. Wait for one to close before raising another.",
    fr: "Vous avez 5 litiges ouverts. Attendez qu’un soit clos avant d’en ouvrir un autre.",
    rw: "Ufite ibirego 5 bitarafungwa. Tegereza ko kimwe gifungwa mbere yo gutanga ikindi.",
  },
  alreadyOpen: {
    en: "A dispute about this is already open.",
    fr: "Un litige à ce sujet est déjà ouvert.",
    rw: "Hari ikirego kuri iki kitarafungwa.",
  },
  wrongStatus: {
    en: "This dispute can't do that now.",
    fr: "Ce litige ne permet pas cette action maintenant.",
    rw: "Iki kirego ntikibyemera ubu.",
  },
  tooLate: {
    en: "The time to do this has passed.",
    fr: "Le délai pour le faire est dépassé.",
    rw: "Igihe cyo kubikora cyarenze.",
  },
  conflict: {
    en: "You are involved in this dispute: you can comment, not decide.",
    fr: "Vous êtes concerné par ce litige : vous pouvez commenter, pas décider.",
    rw: "Uri muri iki kirego: ushobora gutanga igitekerezo, ntushobora gufata icyemezo.",
  },
  badOutcome: {
    en: "This outcome doesn't fit what the dispute is about.",
    fr: "Cette décision ne correspond pas à l’objet du litige.",
    rw: "Iki cyemezo ntikijyanye n’icyo ikirego kivuga.",
  },
  noStatement: {
    en: "A statement can only follow a refused correction.",
    fr: "Une déclaration ne peut suivre qu’une correction refusée.",
    rw: "Ibisobanuro bitangwa gusa nyuma yo kwanga gukosora.",
  },
} satisfies Record<string, Record<LanguageCode, string>>;

interface MockDispute {
  d: StaffDispute;
  closed_at: string | null;
  reopen_count: number;
  flagged: boolean;
}

function message(
  author_name: string,
  author_role: DisputeMessage["author_role"],
  visibility: DisputeMessage["visibility"],
  body: string,
  at = now(),
): DisputeMessage {
  return { id: id(), author_name, author_role, visibility, body, created_at: at };
}

function seed(): MockDispute[] {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const base = (
    key: string,
    patient: [string, string],
    subject_type: DisputeSubjectType,
    snapshot: StaffDispute["subject_snapshot"],
    created: number,
  ): StaffDispute => ({
    id: stableId(`dispute/${key}`),
    patient_id: patient[0],
    patient_display_name: patient[1],
    facility_name: FACILITY,
    channel: "app",
    type: DISPUTE_TYPE_OF[subject_type],
    subject_type,
    subject_id: stableId(`dispute/${key}/subject`),
    subject_snapshot: snapshot,
    status: "open",
    handler_level: "facility",
    acknowledge_by: new Date(Date.now() - created + ACKNOWLEDGE_WITHIN).toISOString(),
    decide_by: null,
    is_overdue: false,
    outcome: "",
    created_at: ago(created),
    version: 1,
    flagged: false,
    description: "",
    decision_reason: "",
    resolved_at: null,
    statement: "",
    can_decide: true,
    messages: [],
    events: [],
    evidence: [],
    actions: [],
    comment_requests: [],
  });
  const event = (from: string, to: DisputeStatus, actor: string, at: number, reason = "") => ({
    from_status: from,
    to_status: to,
    actor_name: actor,
    reason,
    occurred_at: ago(at),
  });

  // 1. Mukamana: a malaria test charged but not done; under review with a note inside
  const bill = base(
    "mukamana-bill",
    [MUKAMANA, "Mukamana Jeanne"],
    "bill",
    { status: "open", total_rwf: 8_000, patient_share_rwf: 1_200, paid_rwf: 0, balance_rwf: 1_200 },
    26 * HOUR,
  );
  bill.subject_id = stableId("bill/mukamana/today");
  Object.assign(bill, {
    status: "under_review",
    description: "I was charged for a malaria test that was never done. Please remove it.",
    decide_by: new Date(Date.now() - 20 * HOUR + DECIDE_WITHIN).toISOString(),
    version: 3,
    events: [
      event("", "open", "Mukamana Jeanne", 26 * HOUR),
      event("open", "under_review", "Mutesi Diane", 20 * HOUR),
    ],
    evidence: [
      { action: "billing.bill_opened", at: ago(30 * HOUR), actor_name: "Habimana Eric" },
      { action: "billing.line_added", at: ago(29 * HOUR), actor_name: "Uwimana Keza" },
    ],
    messages: [
      message(
        "Mutesi Diane",
        "handler",
        "thread",
        "Thank you. We are checking the laboratory register for that day.",
        ago(20 * HOUR),
      ),
      message(
        "Mutesi Diane",
        "handler",
        "internal",
        "Lab register: no RDT recorded for this ticket.",
        ago(19 * HOUR),
      ),
    ],
  });

  // 2. Mukamana: a record correction refused, waiting for her answer
  const doc = base(
    "mukamana-document",
    [MUKAMANA, "Mukamana Jeanne"],
    "document",
    {
      number: "DOC-2026-000412",
      kind: "medical_certificate",
      document_date: ago(9 * DAY).slice(0, 10),
      consultation_id: stableId("dispute/mukamana-document/consultation"),
    },
    9 * DAY,
  );
  Object.assign(doc, {
    status: "resolved",
    outcome: "correction_refused",
    description: "My certificate says three days of rest; the doctor told me five days.",
    decision_reason: "The signed consultation records three days of rest.",
    resolved_at: ago(2 * DAY),
    decide_by: ago(-5 * DAY),
    version: 4,
    events: [
      event("", "open", "Mukamana Jeanne", 9 * DAY),
      event("open", "under_review", "Mutesi Diane", 8 * DAY),
      event(
        "under_review",
        "resolved",
        "Mutesi Diane",
        2 * DAY,
        "The signed consultation records three days of rest.",
      ),
    ],
    messages: [
      message(
        "Mutesi Diane",
        "handler",
        "thread",
        "We read the signed record with Dr Uwimana.",
        ago(3 * DAY),
      ),
    ],
  });

  // 3. Niyonsaba: a missed-visit strike she says was wrong; overdue, flagged patient
  const strike = base(
    "niyonsaba-strike",
    ["9b2f1c3d-1111-4000-8000-000000000009", "Niyonsaba Claudine"],
    "no_show_strike",
    {
      booking_code: "KC-7Q2M",
      starts_at: ago(5 * DAY),
      occurred_at: ago(5 * DAY),
      reversed_at: null,
    },
    4 * DAY,
  );
  Object.assign(strike, {
    description: "I was in the waiting room at 9:00 and nobody called my name.",
    is_overdue: true,
    events: [event("", "open", "Niyonsaba Claudine", 4 * DAY)],
    evidence: [
      { action: "scheduling.no_show_marked", at: ago(5 * DAY), actor_name: "Habimana Eric" },
    ],
  });

  // 4. Habimana Eric: a booking moved twice; escalated past its deadline, for the platform
  const booking = base(
    "habimana-booking",
    ["9b2f1c3d-1111-4000-8000-000000000014", "Habimana Eric"],
    "booking",
    { booking_code: "KC-3H8D", starts_at: ago(12 * DAY), status: "cancelled" },
    15 * DAY,
  );
  Object.assign(booking, {
    status: "escalated",
    description: "My appointment was moved twice without asking me, and I lost a day of work.",
    decide_by: ago(DAY),
    is_overdue: false,
    version: 3,
    events: [
      event("", "open", "Habimana Eric", 15 * DAY),
      event("open", "under_review", "Mutesi Diane", 14 * DAY),
      event("under_review", "escalated", "", DAY, "decision overdue"),
    ],
  });

  return [
    { d: bill, closed_at: null, reopen_count: 0, flagged: false },
    { d: doc, closed_at: null, reopen_count: 0, flagged: false },
    { d: strike, closed_at: null, reopen_count: 0, flagged: true },
    { d: booking, closed_at: null, reopen_count: 0, flagged: false },
  ];
}

export const disputesMocks: FeatureMockFactory = (context) => {
  const { api } = context;
  let db = seed();

  const say = (lang: LanguageCode, key: keyof typeof MESSAGES, status = 422) =>
    context.errorResponse(
      status,
      status === 409 ? "conflict" : "business_rule_violation",
      MESSAGES[key][lang],
    );
  const notFound = (lang: LanguageCode) =>
    context.errorResponse(404, "not_found", context.message("notFound", lang));
  const forbidden = (lang: LanguageCode) =>
    context.errorResponse(403, "permission_denied", context.message("notFound", lang));

  const move = (m: MockDispute, to: DisputeStatus, actor: string, reason = "") => {
    m.d.events.push({
      from_status: m.d.status,
      to_status: to,
      actor_name: actor,
      reason,
      occurred_at: now(),
    });
    m.d.status = to;
    m.d.version += 1;
  };
  const isOpen = (m: MockDispute) => !CLOSED.includes(m.d.status);

  const patientView = (m: MockDispute): PatientDispute => {
    const d = m.d;
    const t = Date.now();
    return {
      id: d.id,
      patient_id: d.patient_id,
      patient_display_name: d.patient_display_name,
      facility_name: d.facility_name,
      channel: d.channel,
      type: d.type,
      subject_type: d.subject_type,
      subject_id: d.subject_id,
      subject_snapshot: Object.fromEntries(
        Object.entries(d.subject_snapshot).filter(([k]) => k !== "consultation_id"),
      ),
      status: d.status,
      handler_level: d.handler_level,
      acknowledge_by: d.acknowledge_by,
      decide_by: d.decide_by,
      is_overdue: d.is_overdue,
      outcome: d.outcome,
      created_at: d.created_at,
      version: d.version,
      description: d.description,
      decision_reason: d.decision_reason,
      resolved_at: d.resolved_at,
      closed_at: m.closed_at,
      can_accept: d.status === "resolved" || d.status === "final_decision",
      can_escalate:
        d.status === "resolved" &&
        !!d.resolved_at &&
        t <= Date.parse(d.resolved_at) + DISAGREE_WITHIN,
      can_reopen:
        d.status === "closed" &&
        m.reopen_count === 0 &&
        !!m.closed_at &&
        t <= Date.parse(m.closed_at) + REOPEN_WITHIN,
      can_add_statement: d.outcome === "correction_refused" && !d.statement,
      statement: d.statement,
      // patients never read internal notes or staff comments
      messages: d.messages.filter((x) => x.visibility === "thread"),
      events: d.events,
    };
  };
  const staffRow = (m: MockDispute): StaffDisputeRow => ({
    id: m.d.id,
    patient_id: m.d.patient_id,
    patient_display_name: m.d.patient_display_name,
    facility_name: m.d.facility_name,
    channel: m.d.channel,
    type: m.d.type,
    subject_type: m.d.subject_type,
    subject_id: m.d.subject_id,
    subject_snapshot: m.d.subject_snapshot,
    status: m.d.status,
    handler_level: m.d.handler_level,
    acknowledge_by: m.d.acknowledge_by,
    decide_by: m.d.decide_by,
    is_overdue: m.d.is_overdue,
    outcome: m.d.outcome,
    created_at: m.d.created_at,
    version: m.d.version,
    flagged: m.flagged,
  });
  const staffView = (m: MockDispute, email: string, name: string): StaffDispute => {
    const mine = MEMBERSHIP_BY_EMAIL[email];
    const involved =
      m.d.comment_requests.some((r) => r.membership_id === mine) ||
      m.d.evidence.some((e) => e.actor_name === name);
    return { ...m.d, flagged: m.flagged, can_decide: !involved };
  };

  // ---- patient (P1–P5)
  const patient = (request: Request) => {
    const lang = context.languageFrom(request);
    const auth = context.authenticatedPatient(lang);
    if ("error" in auth) return { error: auth.error };
    return { lang, me: auth.me, profiles: new Set(auth.me.profiles.map((p) => p.patient_id)) };
  };
  const mineFor = (profiles: Set<string>, disputeId: unknown) =>
    db.find((m) => m.d.id === disputeId && profiles.has(m.d.patient_id));
  const patientStep = (
    step: string,
    run: (
      m: MockDispute,
      body: Record<string, unknown>,
      lang: LanguageCode,
      who: string,
    ) => Response | null,
  ) =>
    http.post(`${api}/patient/disputes/:id/${step}/`, async ({ request, params }) => {
      await context.settle();
      const ok = patient(request);
      if ("error" in ok) return ok.error;
      const m = mineFor(ok.profiles, params.id);
      if (!m) return notFound(ok.lang);
      const body = await context.readJson(request);
      if ("version" in body && Number(body.version) !== m.d.version)
        return context.errorResponse(409, "conflict", MESSAGES.wrongStatus[ok.lang]);
      const failed = run(m, body, ok.lang, ok.me.full_name);
      return failed ?? HttpResponse.json(patientView(m));
    });

  // ---- staff (S1–S8) and platform (PL1, PL2)
  const staff = (request: Request, need: "handle" | "comment" | "platform") => {
    const lang = context.languageFrom(request);
    const auth = context.authenticatedStaff(lang);
    if ("error" in auth) return { error: auth.error };
    const me = auth.me;
    const allowed =
      need === "platform"
        ? me.is_platform_admin
        : need === "handle"
          ? me.permissions.includes("disputes.handle")
          : me.permissions.includes("disputes.handle") ||
            me.permissions.includes("disputes.comment");
    if (!allowed) return { error: forbidden(lang) };
    return { lang, email: me.email, name: me.full_name };
  };
  const staffStep = (
    step: string,
    need: "handle" | "comment",
    run: (
      m: MockDispute,
      body: Record<string, unknown>,
      lang: LanguageCode,
      who: { email: string; name: string },
    ) => Response | null,
  ) =>
    http.post(`${api}/staff/disputes/:id/${step}/`, async ({ request, params }) => {
      await context.settle();
      const ok = staff(request, need);
      if ("error" in ok) return ok.error;
      const m = db.find((x) => x.d.id === params.id);
      if (!m) return notFound(ok.lang);
      const body = await context.readJson(request);
      if ("version" in body && Number(body.version) !== m.d.version)
        return context.errorResponse(409, "conflict", MESSAGES.wrongStatus[ok.lang]);
      const failed = run(m, body, ok.lang, ok);
      return failed ?? HttpResponse.json(staffView(m, ok.email, ok.name));
    });
  const decide = (
    m: MockDispute,
    body: Record<string, unknown>,
    lang: LanguageCode,
    name: string,
    final: boolean,
  ): Response | null => {
    const allowed: DisputeStatus[] = final ? ["escalated"] : ["under_review", "info_requested"];
    if (!allowed.includes(m.d.status)) return say(lang, "wrongStatus");
    const outcome = str(body.outcome) as DisputeOutcome;
    const reason = str(body.reason).trim();
    if (reason.length < 5) return context.validationError(lang, { reason: ["Give a reason."] });
    if (
      !outcomesFor(m.d.subject_type, Boolean(m.d.subject_snapshot.consultation_id)).includes(
        outcome,
      )
    )
      return say(lang, "badOutcome");
    if (outcome === "no_show_reversed") {
      m.d.subject_snapshot = { ...m.d.subject_snapshot, reversed_at: now() };
      m.d.actions.push({
        id: id(),
        outcome,
        linked_object_type: "scheduling.no_show_strike",
        linked_object_id: m.d.subject_id,
        status: "done",
        done_at: now(),
      });
    } else if (outcome !== "rejected" && outcome !== "correction_refused") {
      m.d.actions.push({
        id: id(),
        outcome,
        linked_object_type:
          outcome === "record_corrected" ? "clinical.consultation" : m.d.subject_type,
        linked_object_id:
          outcome === "record_corrected"
            ? String(m.d.subject_snapshot.consultation_id)
            : m.d.subject_id,
        status: "pending",
        done_at: null,
      });
    }
    m.d.outcome = outcome;
    m.d.decision_reason = reason;
    m.d.resolved_at = now();
    if (
      outcome === "rejected" &&
      db.filter((x) => x.d.patient_id === m.d.patient_id && x.d.outcome === "rejected").length >= 3
    )
      for (const x of db) if (x.d.patient_id === m.d.patient_id) x.flagged = true;
    move(m, final ? "final_decision" : "resolved", name, reason);
    if (final) m.closed_at = null;
    return null;
  };

  const handlers = [
    http.get(`${api}/patient/disputes/`, async ({ request }) => {
      await context.settle();
      const ok = patient(request);
      if ("error" in ok) return ok.error;
      const url = new URL(request.url);
      const wanted = url.searchParams.get("patient_id");
      const rows = db
        .filter((m) => ok.profiles.has(m.d.patient_id) && (!wanted || m.d.patient_id === wanted))
        .sort((a, b) => b.d.created_at.localeCompare(a.d.created_at))
        .map((m) => {
          const { flagged: _flagged, ...row } = staffRow(m);
          return { ...row, subject_snapshot: patientView(m).subject_snapshot };
        });
      return HttpResponse.json(page(rows, url));
    }),
    http.post(`${api}/patient/disputes/`, async ({ request }) => {
      await context.settle();
      const ok = patient(request);
      if ("error" in ok) return ok.error;
      const body = await context.readJson(request);
      const patientId = str(body.patient_id);
      const subjectType = str(body.subject_type) as DisputeSubjectType;
      const subjectId = str(body.subject_id);
      const text = str(body.description).trim();
      if (!ok.profiles.has(patientId) || !(subjectType in DISPUTE_TYPE_OF) || !subjectId)
        return notFound(ok.lang);
      if (text.length < 10)
        return context.validationError(ok.lang, {
          description: ["Say what went wrong in at least 10 characters."],
        });
      if (db.filter((m) => m.d.patient_id === patientId && isOpen(m)).length >= MAX_OPEN)
        return say(ok.lang, "tooMany");
      if (db.some((m) => m.d.subject_id === subjectId && isOpen(m)))
        return say(ok.lang, "alreadyOpen", 409);
      const created = Date.now();
      const name =
        ok.me.profiles.find((p) => p.patient_id === patientId)?.display_name ?? ok.me.full_name;
      const m: MockDispute = {
        d: {
          id: id(),
          patient_id: patientId,
          patient_display_name: name,
          facility_name: FACILITY,
          channel: "app",
          type: DISPUTE_TYPE_OF[subjectType],
          subject_type: subjectType,
          subject_id: subjectId,
          subject_snapshot: {},
          status: "open",
          handler_level: "facility",
          acknowledge_by: new Date(created + ACKNOWLEDGE_WITHIN).toISOString(),
          decide_by: null,
          is_overdue: false,
          outcome: "",
          created_at: new Date(created).toISOString(),
          version: 1,
          flagged: false,
          description: text,
          decision_reason: "",
          resolved_at: null,
          statement: "",
          can_decide: true,
          messages: [],
          events: [
            {
              from_status: "",
              to_status: "open",
              actor_name: ok.me.full_name,
              reason: "",
              occurred_at: now(),
            },
          ],
          evidence: [],
          actions: [],
          comment_requests: [],
        },
        closed_at: null,
        reopen_count: 0,
        flagged: false,
      };
      db.push(m);
      return HttpResponse.json(patientView(m), { status: 201 });
    }),
    http.get(`${api}/patient/disputes/:id/`, async ({ request, params }) => {
      await context.settle();
      const ok = patient(request);
      if ("error" in ok) return ok.error;
      const m = mineFor(ok.profiles, params.id);
      return m ? HttpResponse.json(patientView(m)) : notFound(ok.lang);
    }),
    patientStep("messages", (m, body, lang, who) => {
      if (m.d.status === "closed") return say(lang, "wrongStatus");
      const text = str(body.body).trim();
      if (text.length < 2) return context.validationError(lang, { body: ["Write a message."] });
      m.d.messages.push(message(who, "patient", "thread", text));
      if (m.d.status === "info_requested") move(m, "under_review", who, "patient replied");
      return null;
    }),
    patientStep("accept", (m, _body, lang, who) => {
      if (m.d.status !== "resolved" && m.d.status !== "final_decision")
        return say(lang, "wrongStatus");
      move(m, "closed", who);
      m.closed_at = now();
      return null;
    }),
    patientStep("escalate", (m, _body, lang, who) => {
      if (m.d.status !== "resolved") return say(lang, "wrongStatus");
      if (m.d.resolved_at && Date.now() > Date.parse(m.d.resolved_at) + DISAGREE_WITHIN)
        return say(lang, "tooLate");
      move(m, "escalated", who, "patient disagreed");
      return null;
    }),
    patientStep("reopen", (m, _body, lang, who) => {
      if (m.d.status !== "closed" || m.reopen_count >= 1) return say(lang, "wrongStatus");
      if (m.closed_at && Date.now() > Date.parse(m.closed_at) + REOPEN_WITHIN)
        return say(lang, "tooLate");
      m.reopen_count += 1;
      m.closed_at = null;
      m.d.acknowledge_by = new Date(Date.now() + ACKNOWLEDGE_WITHIN).toISOString();
      move(m, "reopened", who);
      return null;
    }),
    patientStep("disagreement", (m, body, lang) => {
      if (m.d.outcome !== "correction_refused" || m.d.statement) return say(lang, "noStatement");
      const text = str(body.statement).trim();
      if (text.length < 10)
        return context.validationError(lang, { statement: ["Write at least 10 characters."] });
      m.d.statement = text;
      return null;
    }),

    // ---- staff
    http.get(`${api}/staff/disputes/`, async ({ request }) => {
      await context.settle();
      const ok = staff(request, "handle");
      if ("error" in ok) return ok.error;
      const url = new URL(request.url);
      const status = url.searchParams.get("status");
      const overdue = ["true", "1"].includes(url.searchParams.get("overdue") ?? "");
      const rows = db
        .filter((m) => (status === "open" ? isOpen(m) : !status || m.d.status === status))
        .filter((m) => !overdue || m.d.is_overdue)
        .sort((a, b) => a.d.acknowledge_by.localeCompare(b.d.acknowledge_by))
        .map(staffRow);
      return HttpResponse.json(page(rows, url));
    }),
    http.get(`${api}/staff/disputes/:id/`, async ({ request, params }) => {
      await context.settle();
      const ok = staff(request, "comment");
      if ("error" in ok) return ok.error;
      const m = db.find((x) => x.d.id === params.id);
      return m ? HttpResponse.json(staffView(m, ok.email, ok.name)) : notFound(ok.lang);
    }),
    staffStep("acknowledge", "handle", (m, _body, lang, who) => {
      if (m.d.status !== "open" && m.d.status !== "reopened") return say(lang, "wrongStatus");
      if (!staffView(m, who.email, who.name).can_decide) return say(lang, "conflict");
      m.d.decide_by = new Date(Date.now() + DECIDE_WITHIN).toISOString();
      m.d.is_overdue = false;
      move(m, "under_review", who.name);
      return null;
    }),
    staffStep("request-info", "handle", (m, body, lang, who) => {
      if (m.d.status !== "under_review" && m.d.status !== "escalated")
        return say(lang, "wrongStatus");
      const text = str(body.body).trim();
      if (text.length < 2) return context.validationError(lang, { body: ["Write what you need."] });
      m.d.messages.push(message(who.name, "handler", "thread", text));
      move(m, "info_requested", who.name);
      return null;
    }),
    staffStep("messages", "handle", (m, body, lang, who) => {
      if (m.d.status === "closed") return say(lang, "wrongStatus");
      const text = str(body.body).trim();
      if (text.length < 2) return context.validationError(lang, { body: ["Write a message."] });
      const internal = body.visibility === "internal";
      m.d.messages.push(message(who.name, "handler", internal ? "internal" : "thread", text));
      return null;
    }),
    staffStep("comment-requests", "handle", (m, body, lang) => {
      const member = str(body.membership_id);
      const name = MEMBER_NAMES[member];
      if (!name)
        return context.validationError(lang, { membership_id: ["Choose a member of staff."] });
      if (!m.d.comment_requests.some((r) => r.membership_id === member && !r.responded_at))
        m.d.comment_requests.push({
          id: id(),
          member_name: name,
          membership_id: member,
          responded_at: null,
        });
      return null;
    }),
    staffStep("comments", "comment", (m, body, lang, who) => {
      const mine = MEMBERSHIP_BY_EMAIL[who.email];
      const request = m.d.comment_requests.find((r) => r.membership_id === mine && !r.responded_at);
      if (!request) return forbidden(lang);
      const text = str(body.body).trim();
      if (text.length < 2) return context.validationError(lang, { body: ["Write your comment."] });
      m.d.messages.push(message(who.name, "staff", "staff_comment", text));
      request.responded_at = now();
      return null;
    }),
    staffStep("resolve", "handle", (m, body, lang, who) => {
      if (!staffView(m, who.email, who.name).can_decide) return say(lang, "conflict");
      return decide(m, body, lang, who.name, false);
    }),

    // ---- platform
    http.get(`${api}/platform/disputes/`, async ({ request }) => {
      await context.settle();
      const ok = staff(request, "platform");
      if ("error" in ok) return ok.error;
      const url = new URL(request.url);
      const rows = db
        .filter(
          (m) =>
            m.d.status === "escalated" ||
            m.d.status === "final_decision" ||
            m.d.handler_level === "platform",
        )
        .sort((a, b) => a.d.created_at.localeCompare(b.d.created_at))
        .map(staffRow);
      return HttpResponse.json(page(rows, url));
    }),
    http.get(`${api}/platform/disputes/:id/`, async ({ request, params }) => {
      await context.settle();
      const ok = staff(request, "platform");
      if ("error" in ok) return ok.error;
      const m = db.find((x) => x.d.id === params.id);
      return m ? HttpResponse.json(staffView(m, ok.email, ok.name)) : notFound(ok.lang);
    }),
    ...(["messages", "final-decision"] as const).map((step) =>
      http.post(`${api}/platform/disputes/:id/${step}/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, "platform");
        if ("error" in ok) return ok.error;
        const m = db.find((x) => x.d.id === params.id);
        if (!m) return notFound(ok.lang);
        const body = await context.readJson(request);
        if (step === "messages") {
          const text = str(body.body).trim();
          if (text.length < 2)
            return context.validationError(ok.lang, { body: ["Write a message."] });
          m.d.messages.push(message(ok.name, "platform", "thread", text));
        } else {
          if (Number(body.version) !== m.d.version)
            return context.errorResponse(409, "conflict", MESSAGES.wrongStatus[ok.lang]);
          const failed = decide(m, body, ok.lang, ok.name, true);
          if (failed) return failed;
        }
        return HttpResponse.json(staffView(m, ok.email, ok.name));
      }),
    ),
  ];

  return {
    handlers,
    reset: () => {
      db = seed();
    },
  };
};
