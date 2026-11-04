import { http, HttpResponse } from "msw";

import type {
  AccountAction,
  AccountUpdate,
  BreakGlassSession,
  CommandCenter,
  ConsoleEvent,
  ConsoleUser,
  ConsoleUserDetail,
  UserSummary,
} from "../../features/console";
import type { FeatureMockFactory } from "../features";
import { id, page } from "./s1-common";

/**
 * Super admin console mocks (upgrade 2026-11-02). The platform admin (admin@medilink.test) sees a
 * network of eight facilities on the map, twelve accounts, security and access events, and two
 * break-glass sessions waiting for review. Account actions change the in-memory directory.
 */
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

const FACILITIES = [
  {
    name: "Kigali Clinic",
    slug: "kigali-clinic",
    type: "private_clinic",
    district: "Gasabo",
    lat: -1.9441,
    lng: 30.0619,
    waiting: 14,
  },
  {
    name: "Remera Health Center",
    slug: "remera-health-center",
    type: "health_center",
    district: "Gasabo",
    lat: -1.9578,
    lng: 30.1127,
    waiting: 22,
  },
  {
    name: "Kibagabaga Hospital",
    slug: "kibagabaga-hospital",
    type: "district_hospital",
    district: "Gasabo",
    lat: -1.9305,
    lng: 30.1149,
    waiting: 37,
  },
  {
    name: "Nyamirambo Polyclinic",
    slug: "nyamirambo-polyclinic",
    type: "polyclinic",
    district: "Nyarugenge",
    lat: -1.9784,
    lng: 30.0446,
    waiting: 9,
  },
  {
    name: "Kicukiro Health Center",
    slug: "kicukiro-health-center",
    type: "health_center",
    district: "Kicukiro",
    lat: -1.9831,
    lng: 30.1036,
    waiting: 18,
  },
  {
    name: "CHUK",
    slug: "chuk",
    type: "referral_hospital",
    district: "Nyarugenge",
    lat: -1.9536,
    lng: 30.0606,
    waiting: 41,
  },
  {
    name: "Musanze Health Center",
    slug: "musanze-health-center",
    type: "health_center",
    district: "Musanze",
    lat: -1.4996,
    lng: 29.6346,
    waiting: 6,
  },
  {
    name: "Huye District Hospital",
    slug: "huye-hospital",
    type: "district_hospital",
    district: "Huye",
    lat: -2.5967,
    lng: 29.7394,
    waiting: 0,
  },
];

/** Kigali Clinic's facility admin: the platform facility page (onboarding mocks) links here. */
export const MOCK_FACILITY_ADMIN_ID = "0190f1a2-7c3d-7e4f-8a5b-6c7d8e9f0a11";
/** The same IDs as the platform facility mocks, so the facility filter and links agree. */
const FACILITY_IDS: Record<string, string> = {
  "Kigali Clinic": "4f0c1d2e-5b6a-4c7d-8e9f-0a1b2c3d4e01",
};
const facilityId = (name: string) => (FACILITY_IDS[name] ??= id());

function seedUsers(): ConsoleUserDetail[] {
  const row = (
    full_name: string,
    email: string,
    kind: ConsoleUser["kind"],
    facilities: [string, string[]][],
    extra: Partial<ConsoleUserDetail> = {},
  ): ConsoleUserDetail => ({
    id: id(),
    full_name,
    email,
    phone: kind === "patient" ? "" : `+25078810${String(email.length).padStart(4, "0")}`,
    profession: facilities.some(([, roles]) => roles.includes("doctor")) ? "medical_doctor" : "",
    licence_state: facilities.some(([, roles]) => roles.includes("doctor")) ? "valid" : null,
    kind,
    is_active: true,
    mfa_enabled: kind !== "patient",
    facilities: facilities.map(([facility_name, roles]) => ({
      facility_id: facilityId(facility_name),
      facility_name,
      roles,
      is_active: true,
      deactivated_at: null,
      deactivation_reason: "",
    })),
    last_login: minutesAgo(Math.floor(Math.random() * 600) + 5),
    created_at: daysAgo(Math.floor(Math.random() * 200) + 10),
    email_verified: true,
    verification_pending: false,
    preferred_language: "rw",
    sign_in_blocked_for: 0,
    sessions: [],
    invitations: [],
    events: [],
    changes: [],
    ...extra,
  });
  return [
    row("Mugisha Eric", "admin@medilink.test", "platform", []),
    row("Ingabire Diane", "diane.ingabire@medilink.rw", "platform", [], {
      preferred_language: "en",
    }),
    row(
      "Mutesi Diane",
      "facility.admin@medilink.test",
      "staff",
      [["Kigali Clinic", ["facility_admin"]]],
      { id: MOCK_FACILITY_ADMIN_ID },
    ),
    row(
      "Uwimana Grace",
      "reception@medilink.test",
      "staff",
      [["Kigali Clinic", ["receptionist"]]],
      {
        sign_in_blocked_for: 11 * 60,
      },
    ),
    row("Dr Habimana Jean", "doctor@medilink.test", "staff", [
      ["Kigali Clinic", ["doctor"]],
      ["Remera Health Center", ["doctor", "facility_admin"]],
    ]),
    row("Mutesi Alice", "pharmacist@medilink.test", "staff", [["Kigali Clinic", ["pharmacist"]]]),
    row("Nkurunziza Paul", "paul.n@kibagabaga.rw", "staff", [
      ["Kibagabaga Hospital", ["facility_admin"]],
    ]),
    row("Umutoni Claire", "claire.u@chuk.rw", "staff", [["CHUK", ["doctor"]]], {
      mfa_enabled: false,
      invitations: [
        {
          facility_id: facilityId("Kibagabaga Hospital"),
          facility_name: "Kibagabaga Hospital",
          roles: ["doctor"],
          invited_at: daysAgo(2),
          expires_at: daysAgo(-5),
        },
      ],
    }),
    row(
      "Habyarimana Joseph",
      "joseph.h@remera.rw",
      "staff",
      [["Remera Health Center", ["receptionist"]]],
      {
        is_active: false,
      },
    ),
    row("Uwase Aline", "aline.uwase@gmail.com", "patient", []),
    row("Mukamana Jeanne", "jeanne.m@gmail.com", "patient", []),
    row("Niyonsaba Claudine", "claudine.n@yahoo.fr", "patient", [], {
      email_verified: false,
      verification_pending: true,
      last_login: null,
    }),
    row("Iradukunda Kevin", "kevin.ira@gmail.com", "patient", []),
  ];
}

const AUDIT_ACTION: Record<AccountAction, string> = {
  lock: "platform.user.locked",
  unlock: "platform.user.unlocked",
  "reset-mfa": "platform.user.mfa_reset",
  "revoke-sessions": "platform.user.sessions_revoked",
  "send-password-reset": "platform.user.password_reset_sent",
  "resend-verification": "platform.user.verification_resent",
  "clear-sign-in-block": "platform.user.sign_in_unblocked",
};

const ACTIONS: [string, ConsoleEvent["outcome"]][] = [
  ["auth.login.success", "success"],
  ["auth.mfa.success", "success"],
  ["auth.login.failure", "failure"],
  ["auth.step_up.success", "success"],
  ["auth.logout", "info"],
  ["auth.mfa.failure", "failure"],
  ["auth.account.locked", "failure"],
  ["auth.password_reset.requested", "info"],
];
const DEVICES = [
  "Chrome · Windows",
  "Chrome · Android",
  "Safari · iPhone",
  "Edge · Windows",
  "Firefox · Linux",
];

function seedEvents(users: ConsoleUserDetail[]): {
  security: ConsoleEvent[];
  access: ConsoleEvent[];
} {
  const staff = users.filter((u) => u.kind !== "patient");
  const security: ConsoleEvent[] = Array.from({ length: 46 }, (_, i) => {
    const [action, outcome] = ACTIONS[i % ACTIONS.length]!;
    const user = staff[i % staff.length]!;
    return {
      id: id(),
      occurred_at: minutesAgo(i * 23 + 2),
      action,
      outcome,
      actor_id: user.id,
      actor_name: user.full_name,
      actor_email: user.email,
      actor_role: user.facilities[0]?.roles[0] ?? "platform_admin",
      facility_name: user.facilities[0]?.facility_name ?? "",
      object_type: "",
      object_ref: "",
      reason: "",
      ip: `41.186.${(i * 7) % 255}.${(i * 13) % 255}`,
      device: DEVICES[i % DEVICES.length]!,
    };
  });
  const doctors = staff.filter((u) => u.facilities.some((f) => f.roles.includes("doctor")));
  const access: ConsoleEvent[] = Array.from({ length: 28 }, (_, i) => {
    const user = doctors[i % doctors.length]!;
    const action =
      i % 9 === 0
        ? "authz.break_glass.opened"
        : i % 4 === 0
          ? "clinical.access_reason.given"
          : "patients.record.viewed";
    return {
      id: id(),
      occurred_at: minutesAgo(i * 41 + 7),
      action,
      outcome: "info",
      actor_id: user.id,
      actor_name: user.full_name,
      actor_email: user.email,
      actor_role: "doctor",
      facility_name: user.facilities[i % user.facilities.length]!.facility_name,
      object_type: "patient",
      object_ref: id().slice(0, 8),
      reason:
        action === "authz.break_glass.opened"
          ? "Unconscious patient, no consent possible."
          : action === "clinical.access_reason.given"
            ? "Referred for follow-up"
            : "",
      ip: `41.186.${(i * 11) % 255}.${(i * 17) % 255}`,
      device: DEVICES[(i + 2) % DEVICES.length]!,
    };
  });
  return { security, access };
}

function seedBreakGlass(): BreakGlassSession[] {
  return [
    {
      id: id(),
      user_name: "Umutoni Claire",
      patient_id: id(),
      facility_id: id(),
      facility_name: "CHUK",
      reason_code: "emergency",
      reason_text: "Unconscious patient brought by ambulance; allergies needed before treatment.",
      starts_at: minutesAgo(180),
      expires_at: minutesAgo(120),
      ended_at: minutesAgo(140),
      is_open: false,
      reviewed_by_name: null,
      reviewed_at: null,
      review_outcome: "",
      review_note: "",
    },
    {
      id: id(),
      user_name: "Dr Habimana Jean",
      patient_id: id(),
      facility_id: id(),
      facility_name: "Remera Health Center",
      reason_code: "continuity",
      reason_text: "Transferred patient; previous facility record needed to continue treatment.",
      starts_at: minutesAgo(1500),
      expires_at: minutesAgo(1440),
      ended_at: minutesAgo(1460),
      is_open: false,
      reviewed_by_name: null,
      reviewed_at: null,
      review_outcome: "",
      review_note: "",
    },
  ];
}

export const consoleMocks: FeatureMockFactory = (context) => {
  const { api } = context;
  const fresh = () => {
    const users = seedUsers();
    return { users, ...seedEvents(users), breakGlass: seedBreakGlass() };
  };
  let db = fresh();
  const PL = `${api}/platform`;
  const guard = (request: Request) => {
    const lang = context.languageFrom(request);
    const result = context.authenticatedStaff(lang);
    if ("error" in result) return { error: result.error };
    if (!result.me.is_platform_admin)
      return {
        error: context.errorResponse(403, "permission_denied", context.message("notFound", lang)),
      };
    return { lang, me: result.me };
  };
  const row = (u: ConsoleUserDetail): ConsoleUser => {
    const {
      sessions: _s,
      events: _e,
      email_verified: _v,
      verification_pending: _p,
      preferred_language: _l,
      sign_in_blocked_for: _b,
      invitations: _i,
      changes: _c,
      ...rest
    } = u;
    return rest;
  };
  const listed = (url: URL) => {
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const digits = q.replace(/\D/g, "").replace(/^0/, "250");
    const get = (key: string) => url.searchParams.get(key) ?? "";
    return db.users
      .filter(
        (u) =>
          !q ||
          `${u.full_name} ${u.email}`.toLowerCase().includes(q) ||
          (digits.length >= 4 && u.phone.replace(/\D/g, "").includes(digits)),
      )
      .filter((u) => !get("kind") || u.kind === get("kind"))
      .filter((u) => !get("status") || (get("status") === "active" ? u.is_active : !u.is_active))
      .filter(
        (u) =>
          !get("mfa") ||
          (get("mfa") === "on" ? u.mfa_enabled : !u.mfa_enabled && u.kind !== "patient"),
      )
      .filter((u) => !get("verification") || u.verification_pending)
      .filter(
        (u) =>
          (!get("facility") && !get("role")) ||
          u.facilities.some(
            (f) =>
              (!get("facility") || f.facility_id === get("facility")) &&
              (!get("role") || f.roles.includes(get("role"))),
          ),
      );
  };
  /** Account actions: the reason rule, never on yourself, and an audit line on the account. */
  const audited = async (
    request: Request,
    userId: unknown,
    action: string,
  ): Promise<{ error: Response } | { user: ConsoleUserDetail; reason: string }> => {
    const ok = guard(request);
    if ("error" in ok) return { error: ok.error as Response };
    const user = db.users.find((u) => u.id === userId);
    if (!user)
      return {
        error: context.errorResponse(404, "not_found", context.message("notFound", ok.lang)),
      };
    const body = (await request.json()) as { reason?: string };
    if (!body.reason || body.reason.trim().length < 5)
      return {
        error: context.errorResponse(
          400,
          "validation_error",
          "Give a reason of 5 characters or more.",
          { fields: { reason: ["Give a reason of 5 characters or more."] } },
        ),
      };
    if (user.email === ok.me.email)
      return {
        error: context.errorResponse(
          422,
          "business_rule_violation",
          "You can't change your own account here.",
        ),
      };
    const entry: ConsoleEvent = {
      id: id(),
      occurred_at: new Date().toISOString(),
      action,
      outcome: "info",
      actor_id: null,
      actor_name: ok.me.full_name,
      actor_email: ok.me.email,
      actor_role: "platform_admin",
      facility_name: "",
      object_type: "user",
      object_ref: user.id.slice(0, 8),
      reason: body.reason,
      ip: "41.186.1.10",
      device: "Chrome · Windows",
    };
    db.security.unshift(entry);
    user.changes.unshift(entry);
    return { user, reason: body.reason };
  };
  const detail = (user: ConsoleUserDetail): ConsoleUserDetail => ({
    ...user,
    sessions:
      user.is_active && user.last_login
        ? [
            {
              ref: "3f9a1c07be",
              audience: user.kind === "patient" ? "patient" : "staff",
              created_at: minutesAgo(42),
              expires_at: minutesAgo(-480),
            },
            {
              ref: "8d02e45a11",
              audience: user.kind === "patient" ? "patient" : "staff",
              created_at: minutesAgo(1300),
              expires_at: minutesAgo(-60),
            },
          ]
        : [],
    events: db.security.filter((e) => e.actor_id === user.id).slice(0, 12),
  });
  const filterEvents = (rows: ConsoleEvent[], url: URL) => {
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const action = url.searchParams.get("action") ?? "";
    const outcome = url.searchParams.get("outcome");
    return rows.filter(
      (e) =>
        (!q || `${e.actor_name} ${e.actor_email} ${e.ip}`.toLowerCase().includes(q)) &&
        (!action || e.action.startsWith(action)) &&
        (!outcome || e.outcome === outcome),
    );
  };

  const handlers = [
    http.get(`${PL}/command-center/`, ({ request }) => {
      const ok = guard(request);
      if ("error" in ok) return ok.error;
      const staff = db.users.filter((u) => u.kind === "staff" && u.is_active);
      const body: CommandCenter = {
        generated_at: new Date().toISOString(),
        overview: {
          applications: {
            submitted: 3,
            under_review: 2,
            changes_requested: 1,
            approved: 9,
            rejected: 1,
          },
          licences: { expiring_60: 4, expiring_30: 2, expired: 1 },
          facilities: { approved: 1, setup: 2, live: 8, suspended: 1, deactivated: 0 },
          oldest_waiting_application: { id: id(), submitted_at: daysAgo(6) },
          facilities_by_district: [
            { district_code: "12", district: "Gasabo", count: 3 },
            { district_code: "11", district: "Nyarugenge", count: 2 },
            { district_code: "13", district: "Kicukiro", count: 1 },
            { district_code: "43", district: "Musanze", count: 1 },
            { district_code: "24", district: "Huye", count: 1 },
          ],
        },
        waiting_now: FACILITIES.reduce((sum, f) => sum + f.waiting, 0),
        live_facilities: FACILITIES.length,
        attention: {
          applications_waiting: 5,
          licences_expiring: 2,
          licences_expired: 1,
          disputes_escalated: 2,
          break_glass_to_review: db.breakGlass.filter((b) => !b.reviewed_at).length,
          stale_facilities: 1,
          locked_accounts: db.users.filter((u) => !u.is_active).length,
        },
        security: {
          failed_logins_24h: db.security.filter((e) => e.outcome === "failure").length,
          successful_logins_24h: db.security.filter((e) => e.action === "auth.login.success")
            .length,
          staff_total: staff.length,
          staff_with_mfa: staff.filter((u) => u.mfa_enabled).length,
          active_sessions: 23,
        },
        map: FACILITIES.map((f) => ({ id: id(), ...f, stale: f.slug === "huye-hospital" })),
        activity: [...db.security.slice(0, 4), ...db.access.slice(0, 4)].sort((a, b) =>
          b.occurred_at.localeCompare(a.occurred_at),
        ),
      };
      return HttpResponse.json(body);
    }),
    http.get(`${PL}/users/`, ({ request }) => {
      const ok = guard(request);
      if ("error" in ok) return ok.error;
      const url = new URL(request.url);
      return HttpResponse.json(page(listed(url).map(row), url));
    }),
    http.get(`${PL}/users/summary/`, ({ request }) => {
      const ok = guard(request);
      if ("error" in ok) return ok.error;
      const count = (test: (u: ConsoleUserDetail) => boolean) => db.users.filter(test).length;
      const facilities = new Map<string, string>();
      for (const u of db.users)
        for (const f of u.facilities) facilities.set(f.facility_id, f.facility_name);
      return HttpResponse.json({
        total: db.users.length,
        platform: count((u) => u.kind === "platform"),
        staff: count((u) => u.kind === "staff"),
        patient: count((u) => u.kind === "patient"),
        locked: count((u) => !u.is_active),
        without_mfa: count((u) => u.kind !== "patient" && !u.mfa_enabled),
        verification_pending: count((u) => u.verification_pending),
        facilities: [...facilities]
          .map(([facilityId, name]) => ({ id: facilityId, name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      } satisfies UserSummary);
    }),
    http.get(`${PL}/users/export/`, ({ request }) => {
      const ok = guard(request);
      if ("error" in ok) return ok.error;
      const rows = listed(new URL(request.url)).filter((u) => u.kind !== "patient");
      const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
      const csv = [
        ["Name", "Email", "Work phone", "Account", "Facilities and roles", "Status"],
        ...rows.map((u) => [
          u.full_name,
          u.email,
          u.phone,
          u.kind,
          u.facilities.map((f) => `${f.facility_name} (${f.roles.join(", ")})`).join("; "),
          u.is_active ? "active" : "locked",
        ]),
      ]
        .map((line) => line.map(cell).join(","))
        .join("\r\n");
      // UTF-8 byte order mark, as the API sends: spreadsheets then read Kinyarwanda names
      return new HttpResponse(String.fromCharCode(0xfeff) + csv, {
        headers: { "Content-Type": "text/csv; charset=utf-8" },
      });
    }),
    http.get(`${PL}/users/:id/`, ({ request, params }) => {
      const ok = guard(request);
      if ("error" in ok) return ok.error;
      const user = db.users.find((u) => u.id === params.id);
      if (!user)
        return context.errorResponse(404, "not_found", context.message("notFound", ok.lang));
      return HttpResponse.json(detail(user));
    }),
    http.patch(`${PL}/users/:id/`, async ({ request, params }) => {
      const body = (await request.clone().json()) as AccountUpdate;
      const target = db.users.find((u) => u.id === params.id);
      if (body.phone !== undefined && target?.kind === "patient")
        return context.errorResponse(
          400,
          "validation_error",
          "A patient's phone is kept on their patient record, not on the account.",
          {
            fields: {
              phone: ["A patient's phone is kept on their patient record, not on the account."],
            },
          },
        );
      const done = await audited(request, params.id, "platform.user.updated");
      if ("error" in done) return done.error;
      const { user } = done;
      if (body.full_name !== undefined) user.full_name = body.full_name.trim();
      if (body.phone !== undefined)
        user.phone = body.phone.replace(/\s/g, "").replace(/^0/, "+250");
      if (body.preferred_language) user.preferred_language = body.preferred_language;
      return HttpResponse.json(detail(user));
    }),
    http.post(`${PL}/users/:id/facilities/:facilityId/:access/`, async ({ request, params }) => {
      const done = await audited(
        request,
        params.id,
        params.access === "remove" ? "staff.membership.deactivated" : "staff.membership.updated",
      );
      if ("error" in done) return done.error;
      const { user, reason } = done;
      const membership = user.facilities.find((f) => f.facility_id === params.facilityId);
      if (!membership) return context.errorResponse(404, "not_found", "Not found.");
      const admins = db.users.filter((u) =>
        u.facilities.some(
          (f) =>
            f.facility_id === membership.facility_id &&
            f.is_active &&
            f.roles.includes("facility_admin"),
        ),
      );
      if (
        params.access === "remove" &&
        membership.roles.includes("facility_admin") &&
        admins.length <= 1
      ) {
        user.changes.shift();
        return context.errorResponse(
          422,
          "business_rule_violation",
          "The facility needs at least one active facility admin.",
        );
      }
      membership.is_active = params.access !== "remove";
      membership.deactivated_at = membership.is_active ? null : new Date().toISOString();
      membership.deactivation_reason = membership.is_active ? "" : reason;
      user.changes[0]!.facility_name = membership.facility_name;
      return HttpResponse.json(detail(user));
    }),
    http.post(`${PL}/users/:id/:action/`, async ({ request, params }) => {
      const action = String(params.action) as AccountAction;
      if (!(action in AUDIT_ACTION)) return context.errorResponse(404, "not_found", "Not found.");
      const target = db.users.find((u) => u.id === params.id);
      if (action === "resend-verification" && target && !target.verification_pending)
        return context.errorResponse(
          422,
          "business_rule_violation",
          "This person has already confirmed their email.",
        );
      if (action === "send-password-reset" && target && !target.is_active)
        return context.errorResponse(422, "business_rule_violation", "Unlock the account first.");
      if (action === "send-password-reset" && target?.verification_pending)
        return context.errorResponse(
          422,
          "business_rule_violation",
          "This person hasn't confirmed their email yet: resend the confirmation email.",
        );
      const done = await audited(request, params.id, AUDIT_ACTION[action]);
      if ("error" in done) return done.error;
      const { user } = done;
      if (action === "lock") user.is_active = false;
      if (action === "unlock") user.is_active = true;
      if (action === "reset-mfa") user.mfa_enabled = false;
      if (action === "clear-sign-in-block") user.sign_in_blocked_for = 0;
      return HttpResponse.json(row(user));
    }),
    http.get(`${PL}/security-events/`, ({ request }) => {
      const ok = guard(request);
      if ("error" in ok) return ok.error;
      const url = new URL(request.url);
      return HttpResponse.json(page(filterEvents(db.security, url), url));
    }),
    http.get(`${PL}/access-events/`, ({ request }) => {
      const ok = guard(request);
      if ("error" in ok) return ok.error;
      const url = new URL(request.url);
      return HttpResponse.json(page(filterEvents(db.access, url), url));
    }),
    http.get(`${PL}/break-glass/`, ({ request }) => {
      const ok = guard(request);
      if ("error" in ok) return ok.error;
      const url = new URL(request.url);
      const needs = url.searchParams.get("needs_review") === "true";
      return HttpResponse.json(
        page(
          db.breakGlass.filter((b) => !needs || !b.reviewed_at),
          url,
        ),
      );
    }),
    http.post(`${PL}/break-glass/:id/review/`, async ({ request, params }) => {
      const ok = guard(request);
      if ("error" in ok) return ok.error;
      const session = db.breakGlass.find((b) => b.id === params.id);
      if (!session)
        return context.errorResponse(404, "not_found", context.message("notFound", ok.lang));
      const body = (await request.json()) as { outcome: string; note?: string };
      session.review_outcome = body.outcome;
      session.review_note = body.note ?? "";
      session.reviewed_at = new Date().toISOString();
      session.reviewed_by_name = ok.me.full_name;
      return HttpResponse.json(session);
    }),
  ];
  return {
    handlers,
    reset: () => {
      db = fresh();
    },
  };
};
