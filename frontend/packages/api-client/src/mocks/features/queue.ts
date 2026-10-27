import { http, HttpResponse, ws } from "msw";

import type {
  DisplayLink,
  DutyRow,
  DutyState,
  Estimate,
  PatientVisit,
  Stage,
  TicketRow,
  TicketState,
} from "../../features/queue";
import type { LanguageCode } from "../../types";
import { FACILITIES } from "../data";
import type { FeatureMockFactory } from "../features";
import { fieldError, id, now, rule, s1, str } from "./s1-common";
import { checkInMockBooking } from "./booking";
import { MEMBERSHIP_BY_EMAIL, SETUP_IDS } from "./setup";

/**
 * S4 mocks (sprint-04 §6.3): today's queue at Kigali Clinic. General (G) and Pediatrics (P), six
 * waiting incl. one priority and one emergency, one called, one in service; Dr Keza on duty in
 * Room 1; display token `MOCK_DISPLAY_TOKEN`; patient Mukamana with an active ticket.
 */
export const MOCK_DISPLAY_TOKEN = "mock-display-token";
const MOCK_PATIENT_ID = "9b2f1c3d-1111-4000-8000-000000000001";

interface MockTicket extends TicketRow {
  patient_id: string;
  full_name: string;
  started_at: string | null;
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function seed() {
  let seq = { [SETUP_IDS.sGen]: 16, [SETUP_IDS.sPed]: 3 } as Record<string, number>;
  const make = (
    service: string,
    name: string,
    age: number,
    sex: "female" | "male",
    arrived: number,
    extra: Partial<MockTicket> = {},
  ): MockTicket => {
    seq[service] = (seq[service] ?? 0) + 1;
    const prefix = service === SETUP_IDS.sGen ? "G" : "P";
    return {
      id: id(),
      visit_id: id(),
      patient_id: id(),
      full_name: name,
      number: `${prefix}-${String(seq[service]).padStart(3, "0")}`,
      state: "waiting",
      stage: "consultation",
      service_id: service,
      display_name: `${name.split(" ")[0]} ${name.split(" ").at(-1)?.[0] ?? ""}.`,
      age_years: age,
      sex,
      flags: [],
      priority_rank: 3,
      arrival_at: minutesAgo(arrived),
      called_at: null,
      assigned_membership_id: null,
      service_point: null,
      step_out_until: null,
      position: null,
      version: 1,
      started_at: null,
      ...extra,
    };
  };
  const tickets: MockTicket[] = [
    make(SETUP_IDS.sGen, "Uwase Claudine", 34, "female", 70, {
      state: "in_service",
      called_at: minutesAgo(12),
      started_at: minutesAgo(11),
      assigned_membership_id: SETUP_IDS.mKeza,
      service_point: "Room 1",
    }),
    make(SETUP_IDS.sGen, "Habimana Eric", 41, "male", 62),
    make(SETUP_IDS.sGen, "Nshimiyimana Patrick", 72, "male", 55, {
      flags: ["priority:elderly"],
      priority_rank: 2,
    }),
    make(SETUP_IDS.sGen, "Mukamana Jeanne", 42, "female", 40, { patient_id: MOCK_PATIENT_ID }),
    make(SETUP_IDS.sGen, "Ingabire Divine", 25, "female", 31),
    make(SETUP_IDS.sGen, "Kamanzi Olivier", 19, "male", 8, {
      flags: ["emergency"],
      priority_rank: 0,
    }),
    make(SETUP_IDS.sPed, "Keza Aline", 6, "female", 35, {
      state: "called",
      called_at: minutesAgo(1),
      service_point: "Room 2",
    }),
    make(SETUP_IDS.sPed, "Mugisha Ivan", 3, "male", 20),
  ];
  const duty: DutyRow[] = [
    {
      membership_id: SETUP_IDS.mKeza,
      full_name: "Uwimana Keza",
      state: "on_duty",
      service_point_id: SETUP_IDS.pRoom1,
      service_point: "Room 1",
      until_at: null,
    },
  ];
  seq = { ...seq };
  return {
    tickets,
    duty,
    seq,
    events: [] as {
      id: string;
      ticket_id: string;
      action: string;
      from_state: string;
      to_state: string;
      actor_name: string | null;
      reason_code: string;
      reason_text: string;
      occurred_at: string;
      metadata: Record<string, string>;
    }[],
    reviews: new Set<string>(),
    links: [
      {
        id: id(),
        label: "Main waiting room",
        service_ids: [SETUP_IDS.sGen, SETUP_IDS.sPed],
        revoked_at: null,
        last_seen_at: minutesAgo(1),
        created_at: minutesAgo(60 * 24 * 3),
      },
    ] as (DisplayLink & { token?: string })[],
    travel: new Map<string, number>(),
  };
}

const ORDER = (a: MockTicket, b: MockTicket) =>
  a.priority_rank - b.priority_rank || a.arrival_at.localeCompare(b.arrival_at);

export const queueMocks: FeatureMockFactory = (context) => {
  const { api } = context;
  let db = seed();
  db.links[0]!.token = MOCK_DISPLAY_TOKEN;

  const staff = (request: Request, codes: string[]) => {
    const lang = context.languageFrom(request);
    const result = context.authenticatedStaff(lang);
    if ("error" in result) return { error: result.error };
    const granted = result.me.permissions as readonly string[];
    if (!result.me.active_facility_id || !codes.some((c) => granted.includes(c)))
      return {
        error: context.errorResponse(403, "permission_denied", s1("permissionDenied", lang)),
      };
    return { lang, me: result.me, granted };
  };
  const waiting = (service: string, stage: Stage = "consultation") =>
    db.tickets
      .filter(
        (t) =>
          t.service_id === service &&
          t.stage === stage &&
          t.state === "waiting" &&
          !(t.step_out_until && t.step_out_until > now()),
      )
      .sort(ORDER);
  const position = (t: MockTicket) =>
    t.state === "waiting"
      ? db.tickets.filter(
          (o) =>
            o.service_id === t.service_id &&
            o.stage === t.stage &&
            o.state === "waiting" &&
            ORDER(o, t) < 0,
        ).length
      : 0;
  const row = (t: MockTicket): TicketRow => {
    const { patient_id: _p, full_name: _n, started_at: _s, ...rest } = t;
    return { ...rest, position: position(t) };
  };
  const estimate = (t: MockTicket | undefined): Estimate => {
    const onDuty = db.duty.filter((d) => d.state === "on_duty").length;
    if (!onDuty) {
      const brk = db.duty.find((d) => d.state === "break");
      if (brk) return { min: null, max: null, status: "break", until: brk.until_at };
      return { min: null, max: null, status: "none_on_duty", until: null };
    }
    const minutes = ((t ? position(t) : 0) * 15) / onDuty;
    return {
      min: Math.floor((minutes * 0.8) / 5) * 5,
      max: Math.max(Math.ceil((minutes * 1.25) / 5) * 5, 5),
      status: db.duty.some((d) => d.state === "emergency") ? "emergency" : null,
      until: null,
    };
  };
  const event = (
    t: MockTicket,
    action: string,
    from: string,
    actor: string | null,
    reason = "",
    metadata: Record<string, string> = {},
  ) =>
    db.events.push({
      id: id(),
      ticket_id: t.id,
      action,
      from_state: from,
      to_state: t.state,
      actor_name: actor,
      reason_code: reason,
      reason_text: "",
      occurred_at: now(),
      metadata,
    });
  const notFound = (lang: LanguageCode) =>
    context.errorResponse(404, "not_found", context.message("notFound", lang));
  const stale = (lang: LanguageCode) =>
    context.errorResponse(409, "conflict", s1("conflict", lang));

  return {
    reset() {
      db = seed();
      db.links[0]!.token = MOCK_DISPLAY_TOKEN;
    },
    handlers: [
      // Live sockets (contract §3.3): accepted and kept quiet; the mocks change data on request
      // only, so screens poll instead of waiting for notifications.
      ws.link("*/ws/v1/*").addEventListener("connection", () => undefined),
      http.get(`${api}/staff/reports/operations/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, ["reports.view", "facility.configure"]);
        if ("error" in ok) return ok.error;
        // Deterministic synthetic history (no randomness, so tests are stable)
        const day = (back: number) => {
          const date = new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);
          const weekday = new Date(date).getUTCDay();
          const patients = weekday === 0 ? 0 : weekday === 6 ? 9 : 18 + ((back * 7) % 9);
          return {
            date,
            patients,
            completed: Math.max(0, patients - 2),
            median_wait_min: patients ? 34 + ((back * 5) % 21) : null,
            p90_wait_min: patients ? 70 + ((back * 3) % 25) : null,
            avg_consult_min: patients ? 13 + (back % 4) : null,
            left_rate_pct: patients ? back % 5 : null,
            walk_ins: patients,
            emergencies: back % 3 === 0 ? 1 : 0,
          };
        };
        const trend = Array.from({ length: 14 }, (_, i) => day(13 - i));
        const waitingNow = db.tickets.filter((t) => t.state === "waiting");
        const today = {
          ...trend[13]!,
          patients: db.tickets.length,
          completed: db.tickets.filter((t) => t.state === "completed").length,
        };
        const heat = [];
        for (let w = 0; w < 6; w++)
          for (const h of [7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
            heat.push({
              weekday: w,
              hour: h,
              count: Math.max(0, (w < 5 ? 9 : 4) - Math.abs(h - 8) * (w < 5 ? 1.4 : 1)) | 0,
            });
        const services = [SETUP_IDS.sGen, SETUP_IDS.sPed].map((service_id) => {
          const wait = waitingNow.filter((t) => t.service_id === service_id);
          const doctors =
            service_id === SETUP_IDS.sGen ? db.duty.filter((d) => d.state === "on_duty").length : 0;
          return {
            service_id,
            name_i18n:
              service_id === SETUP_IDS.sGen
                ? {
                    en: "General consultation",
                    rw: "Kwisuzumisha rusange",
                    fr: "Consultation générale",
                  }
                : { en: "Child consultation", rw: "Kuvura abana", fr: "Consultation enfant" },
            waiting: wait.length,
            in_service: db.tickets.filter(
              (t) =>
                t.service_id === service_id && (t.state === "called" || t.state === "in_service"),
            ).length,
            longest_wait_min: Math.max(
              0,
              ...wait.map((t) =>
                Math.round((Date.now() - new Date(t.arrival_at).getTime()) / 60_000),
              ),
            ),
            doctors_on_duty: doctors,
            load:
              wait.length === 0
                ? "low"
                : doctors === 0
                  ? "high"
                  : wait.length / doctors < 4
                    ? "low"
                    : wait.length / doctors < 8
                      ? "medium"
                      : "high",
          };
        });
        return HttpResponse.json({
          today,
          same_day_last_week: day(7),
          trend: [...trend.slice(0, 13), today],
          now: {
            waiting: waitingNow.length,
            in_service: db.tickets.filter((t) => t.state === "called" || t.state === "in_service")
              .length,
            doctors_on_duty: db.duty.filter((d) => d.state === "on_duty").length,
            doctors_on_break: db.duty.filter((d) => d.state === "break").length,
          },
          services,
          arrivals_heatmap: heat,
          attention: {
            unreviewed_reorders: db.events.filter(
              (e) => e.action === "reorder" && !db.reviews.has(e.id),
            ).length,
          },
          updated_at: now(),
        });
      }),
      http.get(`${api}/staff/queue/board/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, ["queue.operate", "queue.call", "pharmacy.dispense"]);
        if ("error" in ok) return ok.error;
        const keys = [
          ...new Set(
            db.tickets
              .filter((t) => ["waiting", "called", "in_service", "on_hold"].includes(t.state))
              .map((t) => `${t.service_id}|${t.stage}`),
          ),
        ];
        const queues = keys.map((key) => {
          const [service_id, stage] = key.split("|") as [string, Stage];
          const rows = db.tickets.filter((t) => t.service_id === service_id && t.stage === stage);
          const wait = waiting(service_id, stage);
          return {
            service_id,
            stage,
            waiting: wait.map(row),
            called: rows.filter((t) => t.state === "called").map(row),
            in_service: rows
              .filter((t) => t.state === "in_service" || t.state === "on_hold")
              .map(row),
            average_minutes: 15,
            estimate_next: estimate(wait.at(-1)),
          };
        });
        return HttpResponse.json({ queues, duty: db.duty, updated_at: now() });
      }),
      http.get(`${api}/staff/queue/mine/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, ["queue.call"]);
        if ("error" in ok) return ok.error;
        const me = MEMBERSHIP_BY_EMAIL[ok.me.email] ?? "unknown";
        const current = db.tickets.find(
          (t) =>
            t.assigned_membership_id === me && (t.state === "called" || t.state === "in_service"),
        );
        const list = waiting(SETUP_IDS.sGen).filter(
          (t) => !t.assigned_membership_id || t.assigned_membership_id === me,
        );
        return HttpResponse.json({
          current: current ? row(current) : null,
          waiting: list.map(row),
          duty: db.duty.find((d) => d.membership_id === me) ?? null,
          service_ids: [SETUP_IDS.sGen],
        });
      }),
      http.post(`${api}/staff/queue/call-next/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, ["queue.call", "queue.operate", "pharmacy.dispense"]);
        if ("error" in ok) return ok.error;
        const body = (await context.readJson(request)) ?? {};
        const me = MEMBERSHIP_BY_EMAIL[ok.me.email] ?? "unknown";
        const duty = db.duty.find((d) => d.membership_id === me);
        if (!duty || duty.state !== "on_duty")
          return context.errorResponse(
            422,
            "business_rule_violation",
            "Set yourself on duty before calling patients.",
          );
        if (
          db.tickets.some(
            (t) =>
              t.assigned_membership_id === me && (t.state === "called" || t.state === "in_service"),
          )
        )
          return context.errorResponse(
            409,
            "conflict",
            "Finish or release your current patient first.",
          );
        const next = waiting(
          str(body.service_id),
          (str(body.stage) || "consultation") as Stage,
        ).find((t) => !t.assigned_membership_id || t.assigned_membership_id === me);
        if (!next) return new HttpResponse(null, { status: 204 });
        next.state = "called";
        next.called_at = now();
        next.assigned_membership_id = me;
        next.service_point = duty.service_point;
        next.version += 1;
        event(next, "call", "waiting", ok.me.full_name);
        return HttpResponse.json(row(next));
      }),
      http.post(`${api}/staff/tickets/:ticketId/:action/`, async ({ request, params }) => {
        await context.settle();
        const action = str(params.action);
        const operate = ["transfer", "cancel", "left", "step-out", "priority", "reorder"].includes(
          action,
        );
        const ok = staff(request, operate ? ["queue.operate"] : ["queue.call"]);
        if ("error" in ok) return ok.error;
        const t = db.tickets.find((x) => x.id === params.ticketId);
        if (!t) return notFound(ok.lang);
        const body = (await context.readJson(request)) ?? {};
        if (Number(body.version) !== t.version) return stale(ok.lang);
        const before = t.state;
        const reason = str(body.reason_code);
        const need = (...states: TicketState[]) => states.includes(t.state);
        const set = (state: TicketState) => {
          t.state = state;
        };
        switch (action) {
          case "start":
            if (!need("called")) return rule(context, ok.lang);
            set("in_service");
            t.started_at = now();
            break;
          case "recall":
            if (!need("called")) return rule(context, ok.lang);
            t.called_at = now();
            break;
          case "no-response":
            if (!need("called")) return rule(context, ok.lang);
            set("waiting");
            t.assigned_membership_id = null;
            t.flags = [...new Set([...t.flags, "no_response"])];
            t.arrival_at = new Date(Date.now()).toISOString();
            break;
          case "hold":
            if (!need("in_service")) return rule(context, ok.lang);
            set("on_hold");
            break;
          case "return":
            if (!need("on_hold")) return rule(context, ok.lang);
            set("waiting");
            t.priority_rank = Math.min(t.priority_rank, 1);
            t.flags = [...new Set([...t.flags, "return"])];
            break;
          case "complete":
            if (!need("in_service")) return rule(context, ok.lang);
            set("completed");
            break;
          case "next-stage": {
            if (!need("in_service", "waiting")) return rule(context, ok.lang);
            set("moved_to_next_stage");
            const next = {
              ...t,
              id: id(),
              state: "waiting" as TicketState,
              stage: str(body.stage) as Stage,
              version: 1,
              assigned_membership_id: null,
              called_at: null,
              service_point: null,
            };
            db.tickets.push(next);
            t.version += 1;
            event(t, "next_stage", before, ok.me.full_name);
            return HttpResponse.json(row(next));
          }
          case "transfer": {
            if (!need("waiting")) return rule(context, ok.lang);
            const service = str(body.service_id);
            if (!service || service === t.service_id)
              return fieldError(context, ok.lang, { service_id: "Choose another service." });
            set("transferred");
            db.seq[service] = (db.seq[service] ?? 0) + 1;
            const prefix = service === SETUP_IDS.sGen ? "G" : "P";
            const next = {
              ...t,
              id: id(),
              state: "waiting" as TicketState,
              service_id: service,
              number: `${prefix}-${String(db.seq[service]).padStart(3, "0")}`,
              version: 1,
            };
            db.tickets.push(next);
            t.version += 1;
            event(t, "transfer", before, ok.me.full_name);
            return HttpResponse.json(row(next));
          }
          case "cancel":
          case "left":
            if (!reason)
              return context.errorResponse(422, "business_rule_violation", "Give a reason.", {
                fields: { reason_code: ["Give a reason."] },
              });
            set(action === "cancel" ? "cancelled" : "left_without_service");
            break;
          case "step-out":
            t.step_out_until = new Date(
              Date.now() + Number(body.minutes ?? 10) * 60_000,
            ).toISOString();
            t.flags = [...new Set([...t.flags, "stepped_out"])];
            break;
          case "priority": {
            const klass = body.priority_class ? str(body.priority_class) : null;
            if (klass && !reason)
              return context.errorResponse(422, "business_rule_violation", "Give a reason.", {
                fields: { reason_code: ["Give a reason."] },
              });
            t.flags = t.flags.filter((f) => !f.startsWith("priority:"));
            if (klass) {
              t.flags.push(`priority:${klass}`);
              t.priority_rank = Math.min(t.priority_rank, 2);
            } else if (t.priority_rank === 2) t.priority_rank = 3;
            break;
          }
          case "reorder": {
            const target = db.tickets.find((x) => x.id === body.before_ticket_id);
            if (!reason)
              return context.errorResponse(422, "business_rule_violation", "Give a reason.", {
                fields: { reason_code: ["Give a reason."] },
              });
            if (!target || target.state !== "waiting" || target.service_id !== t.service_id)
              return fieldError(context, ok.lang, {
                before_ticket_id: "Both tickets must wait in the same queue.",
              });
            const old = position(t);
            t.priority_rank = target.priority_rank;
            t.arrival_at = new Date(new Date(target.arrival_at).getTime() - 1).toISOString();
            t.version += 1;
            event(t, "reorder", before, ok.me.full_name, reason, {
              old_position: String(old),
              new_position: String(position(t)),
            });
            return HttpResponse.json(row(t));
          }
          default:
            return notFound(ok.lang);
        }
        t.version += 1;
        event(t, action.replace("-", "_"), before, ok.me.full_name, reason);
        return HttpResponse.json(row(t));
      }),
      http.post(`${api}/staff/visits/check-in/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, ["queue.operate"]);
        if ("error" in ok) return ok.error;
        const body = (await context.readJson(request)) ?? {};
        const booked = body.booking_id ? checkInMockBooking(str(body.booking_id)) : null;
        if (body.booking_id && !booked)
          return context.errorResponse(404, "not_found", "Not found.");
        if (booked) body.facility_patient_id = `booking-${str(body.booking_id)}`;
        const service = booked ? booked.service_id : str(body.service_id);
        const emergency = body.source === "emergency";
        if ((emergency || body.priority_class) && !str(body.priority_reason_code))
          return context.errorResponse(422, "business_rule_violation", "Give a reason.", {
            fields: { priority_reason_code: ["Give a reason."] },
          });
        const existing = db.tickets.find(
          (t) =>
            t.visit_id === `fp-${str(body.facility_patient_id)}` &&
            ["waiting", "called", "in_service", "on_hold"].includes(t.state),
        );
        if (existing)
          return HttpResponse.json({
            visit_id: existing.visit_id,
            created: false,
            ticket: row(existing),
          });
        db.seq[service] = (db.seq[service] ?? 0) + 1;
        const prefix = service === SETUP_IDS.sPed ? "P" : "G";
        const ticket: MockTicket = {
          id: id(),
          visit_id: `fp-${str(body.facility_patient_id)}`,
          patient_id: id(),
          full_name: booked ? booked.name : "Walk-in patient",
          number: `${prefix}-${String(db.seq[service]).padStart(3, "0")}`,
          state: "waiting",
          stage: "consultation",
          service_id: service,
          display_name: booked
            ? `${booked.name.split(" ")[0]} ${booked.name.split(" ").at(-1)?.[0] ?? ""}.`
            : "New patient",
          age_years: null,
          sex: null,
          flags: emergency
            ? ["emergency"]
            : body.priority_class
              ? [`priority:${str(body.priority_class)}`]
              : [],
          priority_rank: emergency ? 0 : body.priority_class ? 2 : 3,
          arrival_at: now(),
          called_at: null,
          assigned_membership_id: null,
          service_point: null,
          step_out_until: null,
          position: null,
          version: 1,
          started_at: null,
        };
        db.tickets.push(ticket);
        event(ticket, "check_in", "", ok.me.full_name);
        return HttpResponse.json(
          { visit_id: ticket.visit_id, created: true, ticket: row(ticket) },
          { status: 201 },
        );
      }),
      http.get(`${api}/staff/visits/:visitId/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["queue.operate", "queue.call"]);
        if ("error" in ok) return ok.error;
        const tickets = db.tickets.filter((t) => t.visit_id === params.visitId);
        if (!tickets.length) return notFound(ok.lang);
        const first = tickets[0]!;
        return HttpResponse.json({
          id: first.visit_id,
          facility_patient_id: id(),
          display_name: first.full_name,
          source: first.flags.includes("emergency") ? "emergency" : "walk_in",
          status: "on_site",
          is_emergency: first.flags.includes("emergency"),
          priority_class: first.flags.find((f) => f.startsWith("priority:"))?.split(":")[1] ?? null,
          checked_in_at: first.arrival_at,
          tickets: tickets.map(row),
          events: db.events
            .filter((e) => tickets.some((t) => t.id === e.ticket_id))
            .map((e) => ({
              ...e,
              ticket_number: tickets.find((t) => t.id === e.ticket_id)!.number,
            })),
        });
      }),
      http.get(`${api}/staff/duty-status/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, ["queue.call"]);
        if ("error" in ok) return ok.error;
        const me = MEMBERSHIP_BY_EMAIL[ok.me.email] ?? "unknown";
        return HttpResponse.json(
          db.duty.find((d) => d.membership_id === me) ?? {
            membership_id: me,
            full_name: ok.me.full_name,
            state: "off",
            service_point_id: null,
            service_point: null,
            until_at: null,
          },
        );
      }),
      http.put(`${api}/staff/duty-status/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, ["queue.call"]);
        if ("error" in ok) return ok.error;
        const body = (await context.readJson(request)) ?? {};
        const me = MEMBERSHIP_BY_EMAIL[ok.me.email] ?? "unknown";
        let row_ = db.duty.find((d) => d.membership_id === me);
        if (!row_) {
          row_ = {
            membership_id: me,
            full_name: ok.me.full_name,
            state: "off",
            service_point_id: null,
            service_point: null,
            until_at: null,
          };
          db.duty.push(row_);
        }
        row_.state = str(body.state) as DutyState;
        if (body.service_point_id) {
          row_.service_point_id = str(body.service_point_id);
          row_.service_point = row_.service_point_id === SETUP_IDS.pRoom2 ? "Room 2" : "Room 1";
        }
        row_.until_at = row_.state === "break" ? (body.until_at ? str(body.until_at) : null) : null;
        return HttpResponse.json(row_);
      }),
      http.get(`${api}/staff/queue/reorders/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, ["facility.configure"]);
        if ("error" in ok) return ok.error;
        const reviewed = new URL(request.url).searchParams.get("reviewed");
        const rows = db.events
          .filter((e) => e.action === "reorder")
          .filter((e) => reviewed === null || (reviewed === "true") === db.reviews.has(e.id))
          .map((e) => ({
            event_id: e.id,
            ticket_number: db.tickets.find((t) => t.id === e.ticket_id)?.number ?? "",
            actor_name: e.actor_name,
            reason_code: e.reason_code,
            reason_text: e.reason_text,
            old_position: e.metadata.old_position ?? null,
            new_position: e.metadata.new_position ?? null,
            occurred_at: e.occurred_at,
            reviewed: db.reviews.has(e.id),
          }));
        return HttpResponse.json({ results: rows });
      }),
      http.post(`${api}/staff/queue/reorders/:eventId/review/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["facility.configure"]);
        if ("error" in ok) return ok.error;
        db.reviews.add(str(params.eventId));
        return new HttpResponse(null, { status: 201 });
      }),
      http.get(`${api}/staff/display-links/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, ["facility.configure"]);
        if ("error" in ok) return ok.error;
        return HttpResponse.json({ results: db.links.map(({ token: _t, ...l }) => l) });
      }),
      http.post(`${api}/staff/display-links/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, ["facility.configure"]);
        if ("error" in ok) return ok.error;
        const body = (await context.readJson(request)) ?? {};
        const services = (body.service_ids as string[] | undefined) ?? [];
        if (!str(body.label).trim()) return fieldError(context, ok.lang, { label: "Required." });
        if (!services.length)
          return fieldError(context, ok.lang, { service_ids: "Choose at least one service." });
        const token = `display-${id()}`;
        const link = {
          id: id(),
          label: str(body.label),
          service_ids: services,
          revoked_at: null,
          last_seen_at: null,
          created_at: now(),
          token,
        };
        db.links.unshift(link);
        const { token: _t, ...out } = link;
        return HttpResponse.json({ link: out, token }, { status: 201 });
      }),
      http.post(`${api}/staff/display-links/:linkId/revoke/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["facility.configure"]);
        if ("error" in ok) return ok.error;
        const link = db.links.find((l) => l.id === params.linkId);
        if (!link) return notFound(ok.lang);
        link.revoked_at = now();
        const { token: _t, ...out } = link;
        return HttpResponse.json(out);
      }),
      http.get(`${api}/display/:token/`, async ({ request, params }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const link = db.links.find((l) => l.token === params.token && !l.revoked_at);
        if (!link) return notFound(lang);
        const names: Record<string, Record<string, string>> = {
          [SETUP_IDS.sGen]: {
            en: "General consultation",
            rw: "Kwisuzumisha rusange",
            fr: "Consultation générale",
          },
          [SETUP_IDS.sPed]: {
            en: "Child consultation",
            rw: "Kuvura abana",
            fr: "Consultation enfant",
          },
        };
        return HttpResponse.json(
          {
            facility_name: FACILITIES.kigaliClinic.name,
            services: link.service_ids.map((service_id) => ({
              service_id,
              name_i18n: names[service_id] ?? { en: "Service" },
              now_serving: db.tickets
                .filter(
                  (t) =>
                    t.service_id === service_id &&
                    (t.state === "called" || t.state === "in_service"),
                )
                .sort((a, b) => (b.called_at ?? "").localeCompare(a.called_at ?? ""))
                .map((t) => ({ number: t.number, service_point: t.service_point, state: t.state })),
              next: waiting(service_id)
                .slice(0, 5)
                .map((t) => t.number),
            })),
            updated_at: now(),
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }),
      http.get(`${api}/patient/visits/active/`, async ({ request }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const result = context.authenticatedPatient(lang);
        if ("error" in result) return result.error;
        const mine = db.tickets.filter(
          (t) =>
            t.patient_id === MOCK_PATIENT_ID &&
            ["waiting", "called", "in_service", "on_hold"].includes(t.state),
        );
        const out: PatientVisit[] = mine.map((t) => {
          const est = estimate(t);
          const travel = db.travel.get(FACILITIES.kigaliClinic.id) ?? null;
          return {
            visit_id: t.visit_id,
            patient_id: t.patient_id,
            patient_display_name: t.full_name,
            facility_id: FACILITIES.kigaliClinic.id,
            facility_name: FACILITIES.kigaliClinic.name,
            service_name_i18n: {
              en: "General consultation",
              rw: "Kwisuzumisha rusange",
              fr: "Consultation générale",
            },
            ticket_number: t.number,
            state: t.state,
            stage: t.stage,
            service_point: t.service_point,
            ahead: position(t),
            estimate: est,
            leave_by:
              travel !== null && est.min !== null && t.state === "waiting"
                ? new Date(Date.now() + (est.min - travel - 10) * 60_000).toISOString()
                : null,
            travel_minutes: travel,
            version: t.version,
            updated_at: now(),
          };
        });
        return HttpResponse.json({ results: out });
      }),
      http.post(`${api}/patient/visits/:visitId/cancel/`, async ({ request, params }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const result = context.authenticatedPatient(lang);
        if ("error" in result) return result.error;
        const t = db.tickets.find(
          (x) => x.visit_id === params.visitId && x.patient_id === MOCK_PATIENT_ID,
        );
        if (!t) return notFound(lang);
        if (t.state !== "waiting") return rule(context, lang);
        t.state = "cancelled";
        t.version += 1;
        return HttpResponse.json({ visit_id: t.visit_id });
      }),
      http.get(`${api}/patient/travel-times/:facilityId/`, async ({ request, params }) => {
        await context.settle();
        const result = context.authenticatedPatient(context.languageFrom(request));
        if ("error" in result) return result.error;
        return HttpResponse.json({ minutes: db.travel.get(str(params.facilityId)) ?? null });
      }),
      http.put(`${api}/patient/travel-times/:facilityId/`, async ({ request, params }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const result = context.authenticatedPatient(lang);
        if ("error" in result) return result.error;
        const body = (await context.readJson(request)) ?? {};
        const minutes = Number(body.minutes);
        if (!Number.isInteger(minutes) || minutes < 0 || minutes > 600)
          return fieldError(context, lang, { minutes: "Use 0 to 600 minutes." });
        db.travel.set(str(params.facilityId), minutes);
        return HttpResponse.json({ minutes });
      }),
    ],
  };
};
