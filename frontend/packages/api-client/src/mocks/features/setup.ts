import { http, HttpResponse } from "msw";

import type {
  CalendarDay,
  CalendarEvent,
  ChecklistItem,
  ConfigChange,
  Department,
  FacilityProfile,
  FacilitySettings,
  InsurerRule,
  Invitation,
  OpeningDay,
  ScheduleException,
  ScheduleTemplate,
  Service,
  ServicePoint,
  SettingFieldSpec,
  SettingsSection,
  StaffMembership,
  Tariff,
} from "../../features/setup";
import type { LanguageCode } from "../../types";
import { FACILITIES, STAFF_USERS } from "../data";
import type { FeatureMockFactory } from "../features";
import { conflict, fieldError, id, now, page, rule, s1, stepUpFailure, str } from "./s1-common";

/** S2 mocks (sprint-02 §6.2): Kigali Clinic in `setup` with a partly complete checklist. */

export const MOCK_INVITATION_TOKEN = "mock-invitation-token";
export const MOCK_INVITATION_EXISTING_TOKEN = "mock-invitation-existing";
export const MOCK_FACILITY_ADMIN_EMAIL = "facility.admin@medilink.test";

/** The facility being set up (its own facility, so S3's approver rules at Kigali Clinic hold). */
export const SETUP_FACILITY = {
  id: "4f0c1d2e-5b6a-4c7d-8e9f-0a1b2c3d4e10",
  name: "Gasabo Family Clinic",
  slug: "gasabo-family-clinic",
  facility_type: FACILITIES.kigaliClinic.facility_type,
};

// Its facility admin (registered once, like extendMockRoleGrants).
if (!STAFF_USERS.some((u) => u.email === MOCK_FACILITY_ADMIN_EMAIL)) {
  STAFF_USERS.push({
    id: "7a1e0b2c-0000-4000-8000-000000000020",
    email: MOCK_FACILITY_ADMIN_EMAIL,
    full_name: "Mutesi Diane",
    preferred_language: "en",
    is_platform_admin: false,
    mfa_enabled: true,
    memberships: [{ facility: SETUP_FACILITY, roles: ["facility_admin"] }],
  });
}

const SCHEMA: Record<SettingsSection, Record<string, SettingFieldSpec>> = {
  queue: {
    ticket_reset: {
      kind: "choice",
      default: "daily",
      minimum: null,
      maximum: null,
      choices: ["daily", "never"],
    },
    show_names_on_display: {
      kind: "bool",
      default: false,
      minimum: null,
      maximum: null,
      choices: [],
    },
    call_repeat_seconds: { kind: "int", default: 30, minimum: 10, maximum: 300, choices: [] },
    priority_elderly_age: { kind: "int", default: 65, minimum: 50, maximum: 100, choices: [] },
  },
  booking: {
    enabled: { kind: "bool", default: true, minimum: null, maximum: null, choices: [] },
    lead_time_hours: { kind: "int", default: 2, minimum: 0, maximum: 168, choices: [] },
    horizon_days: { kind: "int", default: 30, minimum: 1, maximum: 180, choices: [] },
    cancel_until_hours: { kind: "int", default: 2, minimum: 0, maximum: 72, choices: [] },
    no_show_strikes: { kind: "int", default: 3, minimum: 1, maximum: 10, choices: [] },
  },
  billing: {
    no_insurers: { kind: "bool", default: false, minimum: null, maximum: null, choices: [] },
    pay_before_consultation: {
      kind: "bool",
      default: true,
      minimum: null,
      maximum: null,
      choices: [],
    },
    allow_exemptions: { kind: "bool", default: false, minimum: null, maximum: null, choices: [] },
    receipt_prefix: { kind: "text", default: "RC", minimum: null, maximum: null, choices: [] },
  },
  documents: {
    prescription_valid_days: { kind: "int", default: 30, minimum: 1, maximum: 365, choices: [] },
    show_licence_numbers: {
      kind: "bool",
      default: true,
      minimum: null,
      maximum: null,
      choices: [],
    },
  },
  notifications: {
    reminder_hours_before: { kind: "int", default: 24, minimum: 1, maximum: 72, choices: [] },
    sms_enabled: { kind: "bool", default: false, minimum: null, maximum: null, choices: [] },
  },
};

const defaults = (section: SettingsSection) =>
  Object.fromEntries(Object.entries(SCHEMA[section]).map(([k, v]) => [k, v.default]));

const i18n = (en: string, rw: string, fr: string) => ({ en, rw, fr });
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
/** Monday-based weekday (0 = Monday), as the API. */
const weekdayOf = (d: Date) => (d.getUTCDay() + 6) % 7;

export const SETUP_IDS = {
  dOpd: "5d000000-0000-4000-8000-000000000001",
  dPed: "5d000000-0000-4000-8000-000000000002",
  sGen: "5e000000-0000-4000-8000-000000000001",
  sPed: "5e000000-0000-4000-8000-000000000002",
  pRoom1: "5f000000-0000-4000-8000-000000000001",
  pRoom2: "5f000000-0000-4000-8000-000000000002",
  pDesk: "5f000000-0000-4000-8000-000000000003",
  mAdmin: "60000000-0000-4000-8000-000000000001",
  mReception: "60000000-0000-4000-8000-000000000002",
  mKeza: "60000000-0000-4000-8000-000000000003",
  mPaul: "60000000-0000-4000-8000-000000000004",
};

/** Membership of a signed-in mock user at Kigali Clinic. */
export const MEMBERSHIP_BY_EMAIL: Record<string, string> = {
  [MOCK_FACILITY_ADMIN_EMAIL]: SETUP_IDS.mAdmin,
  "reception@medilink.test": SETUP_IDS.mReception,
  "doctor@medilink.test": SETUP_IDS.mKeza,
};

function seed() {
  const today = new Date(`${isoDate(new Date())}T00:00:00Z`);
  const nextMonday = addDays(today, 7 - weekdayOf(today));
  const facility: FacilityProfile = {
    id: SETUP_FACILITY.id,
    name: SETUP_FACILITY.name,
    slug: SETUP_FACILITY.slug,
    status: "setup",
    facility_type: SETUP_FACILITY.facility_type,
    description_i18n: { en: "Family clinic in Kicukiro." },
    phone: "+250788100200",
    email: "info@kigaliclinic.example",
    website: "",
    address: "KK 15 Rd, Kicukiro",
    village_code: "",
    latitude: "-1.970000",
    longitude: "30.100000",
    photos: [],
    level_of_care: "primary",
    version: 3,
  };
  const departments: Department[] = [
    {
      id: SETUP_IDS.dOpd,
      name_i18n: i18n("General OPD", "Ubuvuzi rusange", "Consultations générales"),
      sort_order: 0,
      is_active: true,
    },
    {
      id: SETUP_IDS.dPed,
      name_i18n: i18n("Pediatrics", "Ubuvuzi bw'abana", "Pédiatrie"),
      sort_order: 1,
      is_active: true,
    },
  ];
  const services: Service[] = [
    {
      id: SETUP_IDS.sGen,
      version: 1,
      department_id: SETUP_IDS.dOpd,
      name_i18n: i18n("General consultation", "Kwisuzumisha rusange", "Consultation générale"),
      duration_minutes: 15,
      is_bookable: true,
      allows_walk_in: true,
      allows_remote_join: true,
      ticket_prefix: "G",
      is_active: true,
    },
    {
      id: SETUP_IDS.sPed,
      version: 1,
      department_id: SETUP_IDS.dPed,
      name_i18n: i18n("Child consultation", "Kuvura abana", "Consultation enfant"),
      duration_minutes: 20,
      is_bookable: true,
      allows_walk_in: true,
      allows_remote_join: false,
      ticket_prefix: "P",
      max_age_months: 192,
      is_active: true,
    },
  ];
  const points: ServicePoint[] = [
    {
      id: SETUP_IDS.pRoom1,
      name: "Room 1",
      kind: "room",
      service_ids: [SETUP_IDS.sGen],
      is_active: true,
    },
    {
      id: SETUP_IDS.pRoom2,
      name: "Room 2",
      kind: "room",
      service_ids: [SETUP_IDS.sPed],
      is_active: true,
    },
    { id: SETUP_IDS.pDesk, name: "Reception desk", kind: "desk", service_ids: [], is_active: true },
  ];
  const weekday = (w: number): OpeningDay => ({
    weekday: w,
    opens_at: "07:30",
    closes_at: "17:00",
    break_starts_at: "12:30",
    break_ends_at: "13:30",
  });
  const hours: Record<string, { days: OpeningDay[]; version: number }> = {
    facility: {
      days: [0, 1, 2, 3, 4]
        .map(weekday)
        .concat({ weekday: 5, opens_at: "08:00", closes_at: "12:00" }),
      version: 1,
    },
  };
  const member = (
    mid: string,
    name: string,
    email: string,
    roles: string[],
    clinician: StaffMembership["clinician"] = null,
  ): StaffMembership => ({
    id: mid,
    user_id: id(),
    full_name: name,
    email,
    roles,
    service_points: [],
    is_active: true,
    mfa_enabled: true,
    clinician,
    joined_at: "2026-09-01T08:00:00Z",
    deactivation_reason: "",
    version: 1,
  });
  const memberships: StaffMembership[] = [
    member(SETUP_IDS.mAdmin, "Mutesi Diane", MOCK_FACILITY_ADMIN_EMAIL, ["facility_admin"]),
    member(SETUP_IDS.mReception, "Habimana Eric", "reception@medilink.test", ["receptionist"]),
    member(SETUP_IDS.mKeza, "Uwimana Keza", "doctor@medilink.test", ["doctor"], {
      council: "rmdc",
      licence_number: "RMDC/1234",
      specialty: "General practice",
      attested_at: "2026-09-02T09:00:00Z",
    }),
    member(SETUP_IDS.mPaul, "Niyonsenga Paul", "paul.niyonsenga@example.test", ["doctor"], {
      council: "rmdc",
      licence_number: "RMDC/5678",
      specialty: "Pediatrics",
      attested_at: null,
    }),
  ];
  const template = (weekday: number, starts_at: string, ends_at: string): ScheduleTemplate => ({
    id: id(),
    version: 1,
    membership_id: SETUP_IDS.mKeza,
    service_id: SETUP_IDS.sGen,
    service_point_id: SETUP_IDS.pRoom1,
    weekday,
    starts_at,
    ends_at,
    slot_minutes: 15,
    capacity: 1,
    bookable_share_pct: 70,
    valid_from: "2026-09-01",
    valid_to: null,
  });
  const templates = [
    template(0, "08:00", "12:00"),
    template(1, "13:30", "17:00"),
    template(2, "08:00", "12:00"),
    template(4, "08:00", "12:00"),
  ];
  const exceptions: ScheduleException[] = [
    {
      id: id(),
      membership_id: SETUP_IDS.mKeza,
      kind: "leave",
      status: "requested",
      reason: "Family event",
      starts_at: `${isoDate(addDays(nextMonday, 2))}T00:00:00Z`,
      ends_at: `${isoDate(addDays(nextMonday, 3))}T00:00:00Z`,
      service_id: null,
      decision_note: "",
      member_name: "Uwimana Keza",
    },
  ];
  const tariffs: Tariff[] = [
    {
      id: id(),
      version: 1,
      code: "CONS-GEN",
      name_i18n: i18n("General consultation", "Kwisuzumisha rusange", "Consultation générale"),
      kind: "service",
      service_id: SETUP_IDS.sGen,
      amount_rwf: 5000,
      valid_from: "2026-09-01",
      valid_to: null,
    },
    {
      id: id(),
      version: 1,
      code: "CONS-PED",
      name_i18n: i18n("Child consultation", "Kuvura abana", "Consultation enfant"),
      kind: "service",
      service_id: SETUP_IDS.sPed,
      amount_rwf: 6000,
      valid_from: "2026-09-01",
      valid_to: null,
    },
    {
      id: id(),
      version: 1,
      code: "LAB-MAL",
      name_i18n: i18n("Malaria rapid test", "Ikizamini cya malariya", "Test rapide du paludisme"),
      kind: "procedure",
      service_id: null,
      amount_rwf: 2500,
      valid_from: "2026-09-01",
      valid_to: null,
    },
  ];
  const rules: InsurerRule[] = [
    {
      id: id(),
      version: 1,
      insurer_code: "rssb",
      applies_to_all_services: true,
      service_ids: [],
      patient_share_bp: 1500,
      requires_referral: false,
      excluded_tariff_codes: [],
      ceiling_per_visit_rwf: null,
      valid_from: "2026-09-01",
      valid_to: null,
    },
  ];
  const invitations: Invitation[] = [
    {
      id: id(),
      email: "nurse.mukamana@example.test",
      role_codes: ["receptionist"],
      service_point_ids: [SETUP_IDS.pDesk],
      status: "pending",
      expires_at: addDays(today, 6).toISOString(),
      invited_by: "Mutesi Diane",
      created_at: addDays(today, -1).toISOString(),
    },
  ];
  const tariffHistory: Tariff[] = [
    {
      ...tariffs[0]!,
      id: id(),
      amount_rwf: 4000,
      valid_from: "2026-01-01",
      valid_to: "2026-08-31",
    },
  ];
  return {
    facility,
    departments,
    services,
    points,
    hours,
    memberships,
    templates,
    exceptions,
    tariffs,
    tariffHistory,
    rules,
    invitations,
    events: [] as CalendarEvent[],
    settings: {
      queue: defaults("queue"),
      booking: defaults("booking"),
      billing: defaults("billing"),
      documents: defaults("documents"),
      notifications: defaults("notifications"),
      version: 1,
    } as Omit<FacilitySettings, "schema" | "umuganda">,
    branding: {
      letterhead_upload_id: null,
      logo_upload_id: null,
      stamp_upload_id: null,
      footer_text: "",
      version: 1,
    },
    changes: [] as ConfigChange[],
    clinician: {
      council: "rmdc" as const,
      licence_number: "RMDC/1234",
      specialty: "General practice",
    },
  };
}

export const setupMocks: FeatureMockFactory = (context) => {
  const { api } = context;
  let db = seed();

  type Ok = { lang: LanguageCode; email: string; permissions: string[] };
  /** Staff in Kigali Clinic with any of `codes` (`[]` = any member). */
  const guard = (request: Request, codes: string[] = []): Ok | Response => {
    const lang = context.languageFrom(request);
    const result = context.authenticatedStaff(lang);
    if ("error" in result) return result.error;
    const { me } = result;
    const granted = me.permissions as readonly string[];
    if (me.active_facility_id === null || (codes.length && !codes.some((c) => granted.includes(c))))
      return context.errorResponse(403, "permission_denied", s1("permissionDenied", lang));
    return { lang, email: me.email, permissions: [...granted] };
  };
  const body = async (request: Request): Promise<Record<string, unknown>> =>
    (await context.readJson(request)) ?? {};
  const notFound = (lang: LanguageCode) =>
    context.errorResponse(404, "not_found", context.message("notFound", lang));
  const log = (
    entity: string,
    entityId: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    actor: string,
  ) => {
    for (const field of Object.keys(after)) {
      if (JSON.stringify(before[field]) === JSON.stringify(after[field])) continue;
      db.changes.unshift({
        id: id(),
        entity,
        entity_id: entityId,
        field,
        old_value: before[field] ?? null,
        new_value: after[field],
        actor_name: actor,
        changed_at: now(),
      });
    }
  };
  const actorName = (email: string) =>
    STAFF_USERS.find((u) => u.email === email)?.full_name ?? email;
  const versionCheck = (current: number, sent: unknown, lang: LanguageCode) =>
    Number(sent) !== current ? conflict(context, lang) : null;

  const checklist = (): { items: ChecklistItem[]; complete: boolean; status: string } => {
    const active = db.services.filter((s) => s.is_active);
    const attested = db.memberships.filter(
      (m) => m.is_active && m.roles.includes("doctor") && m.clinician?.attested_at,
    );
    const scheduled = new Set(db.templates.filter((t) => !t.valid_to).map((t) => t.service_id));
    const priced = new Set(db.tariffs.map((t) => t.service_id).filter(Boolean));
    const noInsurers = Boolean(db.settings.billing.no_insurers);
    const items: ChecklistItem[] = [
      {
        code: "profile",
        done: Boolean(db.facility.phone && db.facility.address),
        count: 1,
        link: "/settings/profile",
      },
      {
        code: "departments",
        done: db.departments.some((d) => d.is_active),
        count: db.departments.filter((d) => d.is_active).length,
        link: "/settings/services",
      },
      {
        code: "services",
        done: active.length > 0,
        count: active.length,
        link: "/settings/services",
      },
      {
        code: "service_points",
        done: db.points.some((p) => p.is_active),
        count: db.points.filter((p) => p.is_active).length,
        link: "/settings/services",
      },
      {
        code: "opening_hours",
        done: (db.hours.facility?.days.length ?? 0) > 0,
        count: db.hours.facility?.days.length ?? 0,
        link: "/settings/hours",
      },
      { code: "staff", done: attested.length > 0, count: attested.length, link: "/staff" },
      {
        code: "schedules",
        done: active.filter((s) => s.is_bookable).every((s) => scheduled.has(s.id)),
        count: scheduled.size,
        link: "/settings/schedules",
      },
      {
        code: "tariff",
        done: active.length > 0 && active.every((s) => priced.has(s.id)),
        count: priced.size,
        link: "/settings/tariffs",
      },
      {
        code: "insurers",
        done: noInsurers || db.rules.length > 0,
        count: db.rules.length,
        link: "/settings/insurers",
      },
      { code: "licence", done: true, count: 0, link: "/settings/profile" },
    ];
    return { items, complete: items.every((i) => i.done), status: db.facility.status };
  };

  const calendar = (from: string, to: string): CalendarDay[] => {
    const days: CalendarDay[] = [];
    const end = new Date(`${to}T00:00:00Z`);
    for (let d = new Date(`${from}T00:00:00Z`); d <= end && days.length < 92; d = addDays(d, 1)) {
      const date = isoDate(d);
      const closure = db.events.find(
        (e) =>
          e.kind === "closure" &&
          e.starts_at.slice(0, 10) <= date &&
          e.ends_at.slice(0, 10) >= date,
      );
      const day = db.hours.facility?.days.find((x) => x.weekday === weekdayOf(d));
      const lastSaturday = weekdayOf(d) === 5 && addDays(d, 7).getUTCMonth() !== d.getUTCMonth();
      const open =
        closure || !day
          ? []
          : day.break_starts_at && day.break_ends_at
            ? [
                { starts: day.opens_at, ends: day.break_starts_at },
                { starts: day.break_ends_at, ends: day.closes_at },
              ]
            : [{ starts: day.opens_at, ends: day.closes_at }];
      days.push({
        date,
        open: lastSaturday ? [] : open,
        closed_reason: closure
          ? closure.reason || "closure"
          : lastSaturday
            ? "umuganda"
            : day
              ? null
              : "closed",
        holiday_name: null,
        umuganda: lastSaturday,
      });
    }
    return days;
  };

  const overview = (from: string, to: string, onlyMembership?: string) => {
    const doctors = db.memberships.filter(
      (m) =>
        m.is_active && m.roles.includes("doctor") && (!onlyMembership || m.id === onlyMembership),
    );
    const end = new Date(`${to}T00:00:00Z`);
    return {
      members: doctors.map((m) => {
        const blocks = [];
        for (let d = new Date(`${from}T00:00:00Z`); d <= end; d = addDays(d, 1)) {
          for (const t of db.templates.filter(
            (x) => x.membership_id === m.id && !x.valid_to && x.weekday === weekdayOf(d),
          )) {
            blocks.push({
              membership_id: m.id,
              template_id: t.id,
              service_id: t.service_id,
              service_point_id: t.service_point_id ?? null,
              starts_at: `${isoDate(d)}T${t.starts_at}:00+02:00`,
              ends_at: `${isoDate(d)}T${t.ends_at}:00+02:00`,
              slot_minutes: t.slot_minutes,
              capacity: t.capacity ?? 1,
              bookable_share_pct: t.bookable_share_pct ?? 100,
            });
          }
        }
        return {
          membership_id: m.id,
          full_name: m.full_name,
          blocks,
          exceptions: db.exceptions.filter(
            (e) => e.membership_id === m.id && e.status !== "cancelled",
          ),
        };
      }),
    };
  };

  const ownMembership = (email: string) => MEMBERSHIP_BY_EMAIL[email];
  const isManager = (ok: Ok) => ok.permissions.includes("schedule.manage");

  return {
    reset() {
      db = seed();
    },
    handlers: [
      // ---- facility ------------------------------------------------------------------------
      http.get(`${api}/staff/facility/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request);
        return ok instanceof Response ? ok : HttpResponse.json(db.facility);
      }),
      http.patch(`${api}/staff/facility/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request, ["facility.configure"]);
        if (ok instanceof Response) return ok;
        const data = await body(request);
        const stale = versionCheck(db.facility.version, data.version, ok.lang);
        if (stale) return stale;
        const { version: _v, ...fields } = data;
        if ("phone" in fields && str(fields.phone) && !/^\+2507\d{8}$/.test(str(fields.phone)))
          return fieldError(context, ok.lang, { phone: "Use +2507XXXXXXXX." });
        const before = { ...db.facility } as Record<string, unknown>;
        db.facility = {
          ...db.facility,
          ...(fields as Partial<FacilityProfile>),
          version: db.facility.version + 1,
        };
        log("facility", db.facility.id, before, fields, actorName(ok.email));
        return HttpResponse.json(db.facility);
      }),
      http.post(`${api}/staff/facility/photos/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request, ["facility.configure"]);
        if (ok instanceof Response) return ok;
        if (db.facility.photos.length >= 6) return rule(context, ok.lang);
        db.facility = { ...db.facility, photos: [...db.facility.photos, id()] };
        return HttpResponse.json(db.facility, { status: 201 });
      }),
      http.delete(`${api}/staff/facility/photos/:uploadId/`, async ({ request, params }) => {
        await context.settle();
        const ok = guard(request, ["facility.configure"]);
        if (ok instanceof Response) return ok;
        db.facility = {
          ...db.facility,
          photos: db.facility.photos.filter((p) => p !== params.uploadId),
        };
        return new HttpResponse(null, { status: 204 });
      }),
      http.get(`${api}/staff/facility/opening-hours/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request);
        if (ok instanceof Response) return ok;
        const serviceId = new URL(request.url).searchParams.get("service_id");
        const row = db.hours[serviceId ?? "facility"] ?? { days: [], version: 0 };
        return HttpResponse.json({ service_id: serviceId, ...row });
      }),
      http.put(`${api}/staff/facility/opening-hours/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request, ["facility.configure"]);
        if (ok instanceof Response) return ok;
        const data = await body(request);
        const key = str(data.service_id) || "facility";
        const current = db.hours[key] ?? { days: [], version: 0 };
        const stale = versionCheck(current.version, data.version ?? 0, ok.lang);
        if (stale && current.version !== 0) return stale;
        const days = (data.days as OpeningDay[]) ?? [];
        for (const day of days) {
          if (day.opens_at >= day.closes_at)
            return fieldError(context, ok.lang, {
              [`days.${day.weekday}`]: "Closing time must be after opening time.",
            });
          if (
            day.break_starts_at &&
            day.break_ends_at &&
            !(
              day.opens_at < day.break_starts_at &&
              day.break_starts_at < day.break_ends_at &&
              day.break_ends_at < day.closes_at
            )
          )
            return fieldError(context, ok.lang, {
              [`days.${day.weekday}`]: "The break must sit inside opening hours.",
            });
        }
        db.hours[key] = { days, version: current.version + 1 };
        log("opening_hours", key, { days: current.days }, { days }, actorName(ok.email));
        return HttpResponse.json({ service_id: data.service_id ?? null, ...db.hours[key] });
      }),
      http.get(`${api}/staff/facility/calendar-events/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request);
        return ok instanceof Response ? ok : HttpResponse.json({ results: db.events });
      }),
      http.post(`${api}/staff/facility/calendar-events/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request, ["facility.configure", "schedule.manage"]);
        if (ok instanceof Response) return ok;
        const data = await body(request);
        if (str(data.starts_at) >= str(data.ends_at))
          return fieldError(context, ok.lang, { ends_at: "The end must be after the start." });
        const event = { ...(data as Omit<CalendarEvent, "id">), id: id() } as CalendarEvent;
        db.events.push(event);
        return HttpResponse.json(event, { status: 201 });
      }),
      http.patch(`${api}/staff/facility/calendar-events/:eventId/`, async ({ request, params }) => {
        await context.settle();
        const ok = guard(request, ["facility.configure", "schedule.manage"]);
        if (ok instanceof Response) return ok;
        const index = db.events.findIndex((e) => e.id === params.eventId);
        if (index < 0) return notFound(ok.lang);
        db.events[index] = {
          ...db.events[index]!,
          ...((await body(request)) as Partial<CalendarEvent>),
        };
        return HttpResponse.json(db.events[index]);
      }),
      http.delete(
        `${api}/staff/facility/calendar-events/:eventId/`,
        async ({ request, params }) => {
          await context.settle();
          const ok = guard(request, ["facility.configure", "schedule.manage"]);
          if (ok instanceof Response) return ok;
          db.events = db.events.filter((e) => e.id !== params.eventId);
          return new HttpResponse(null, { status: 204 });
        },
      ),
      http.get(`${api}/staff/facility/calendar/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request);
        if (ok instanceof Response) return ok;
        const url = new URL(request.url);
        const from = url.searchParams.get("from") ?? isoDate(new Date());
        const to = url.searchParams.get("to") ?? from;
        return HttpResponse.json({ days: calendar(from, to) });
      }),
      http.get(`${api}/staff/facility/settings/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request);
        return ok instanceof Response
          ? ok
          : HttpResponse.json({ ...db.settings, umuganda: "close", schema: SCHEMA });
      }),
      http.patch(`${api}/staff/facility/settings/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request, ["facility.configure"]);
        if (ok instanceof Response) return ok;
        const data = await body(request);
        const section = str(data.section) as SettingsSection;
        if (!(section in SCHEMA))
          return fieldError(context, ok.lang, { section: "Unknown section." });
        if (section === "billing") {
          const step = stepUpFailure(context, ok.lang);
          if (step) return step;
        }
        const stale = versionCheck(db.settings.version, data.version, ok.lang);
        if (stale) return stale;
        const values = (data.values as Record<string, boolean | number | string>) ?? {};
        const errors: Record<string, string> = {};
        for (const [name, value] of Object.entries(values)) {
          const spec = SCHEMA[section][name];
          if (!spec) errors[name] = "Unknown field.";
          else if (
            spec.kind === "int" &&
            (typeof value !== "number" ||
              (spec.minimum !== null && value < spec.minimum) ||
              (spec.maximum !== null && value > spec.maximum))
          )
            errors[name] = `Use a number from ${spec.minimum} to ${spec.maximum}.`;
        }
        if (Object.keys(errors).length) return fieldError(context, ok.lang, errors);
        log(
          `settings.${section}`,
          db.facility.id,
          db.settings[section],
          values,
          actorName(ok.email),
        );
        db.settings = {
          ...db.settings,
          [section]: { ...db.settings[section], ...values },
          version: db.settings.version + 1,
        };
        return HttpResponse.json({ ...db.settings, umuganda: "close", schema: SCHEMA });
      }),
      http.get(`${api}/staff/facility/branding/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request);
        return ok instanceof Response ? ok : HttpResponse.json(db.branding);
      }),
      http.put(`${api}/staff/facility/branding/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request, ["facility.configure"]);
        if (ok instanceof Response) return ok;
        const data = await body(request);
        const stale = versionCheck(db.branding.version, data.version, ok.lang);
        if (stale) return stale;
        db.branding = { ...db.branding, ...(data as object), version: db.branding.version + 1 };
        return HttpResponse.json(db.branding);
      }),
      http.get(`${api}/staff/facility/config-changes/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request, ["facility.configure"]);
        if (ok instanceof Response) return ok;
        const url = new URL(request.url);
        const entity = url.searchParams.get("entity");
        return HttpResponse.json(
          page(
            db.changes.filter((c) => !entity || c.entity.startsWith(entity)),
            url,
          ),
        );
      }),
      http.get(`${api}/staff/facility/setup-checklist/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request, ["facility.configure"]);
        return ok instanceof Response ? ok : HttpResponse.json(checklist());
      }),
      http.post(`${api}/staff/facility/go-live/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request, ["facility.configure"]);
        if (ok instanceof Response) return ok;
        const step = stepUpFailure(context, ok.lang);
        if (step) return step;
        const result = checklist();
        if (!result.complete) {
          const fields = Object.fromEntries(
            result.items
              .filter((i) => !i.done)
              .map((i) => [`setup.${i.code}`, [`Setup step not complete: ${i.code}`]]),
          );
          return context.errorResponse(
            422,
            "business_rule_violation",
            "Some setup steps are not complete.",
            { fields },
          );
        }
        db.facility = { ...db.facility, status: "live", version: db.facility.version + 1 };
        return HttpResponse.json(db.facility);
      }),

      // ---- catalogue -----------------------------------------------------------------------
      http.get(`${api}/staff/departments/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request);
        return ok instanceof Response ? ok : HttpResponse.json({ results: db.departments });
      }),
      http.post(`${api}/staff/departments/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request, ["facility.configure"]);
        if (ok instanceof Response) return ok;
        const data = await body(request);
        const names = (data.name_i18n ?? {}) as Record<string, string>;
        const missing = ["rw", "en", "fr"].filter((l) => !names[l]?.trim());
        if (missing.length)
          return fieldError(
            context,
            ok.lang,
            Object.fromEntries(missing.map((l) => [`name_i18n.${l}`, "Required."])),
          );
        const row = {
          id: id(),
          name_i18n: names as Department["name_i18n"],
          sort_order: db.departments.length,
          is_active: true,
        };
        db.departments.push(row);
        return HttpResponse.json(row, { status: 201 });
      }),
      http.patch(`${api}/staff/departments/:id/`, async ({ request, params }) => {
        await context.settle();
        const ok = guard(request, ["facility.configure"]);
        if (ok instanceof Response) return ok;
        const index = db.departments.findIndex((d) => d.id === params.id);
        if (index < 0) return notFound(ok.lang);
        const data = (await body(request)) as Partial<Department>;
        if (
          data.is_active === false &&
          db.services.some((s) => s.is_active && s.department_id === params.id)
        )
          return context.errorResponse(
            422,
            "business_rule_violation",
            "Retire its services first.",
            { fields: { is_active: ["Retire its services first."] } },
          );
        db.departments[index] = { ...db.departments[index]!, ...data };
        return HttpResponse.json(db.departments[index]);
      }),
      http.get(`${api}/staff/services/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request);
        return ok instanceof Response ? ok : HttpResponse.json({ results: db.services });
      }),
      http.post(`${api}/staff/services/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request, ["facility.configure"]);
        if (ok instanceof Response) return ok;
        const data = (await body(request)) as Partial<Service>;
        const prefix = str(data.ticket_prefix).toUpperCase();
        if (!/^[A-Z]{1,3}$/.test(prefix))
          return fieldError(context, ok.lang, { ticket_prefix: "Use 1 to 3 letters." });
        if (db.services.some((s) => s.is_active && s.ticket_prefix === prefix))
          return context.errorResponse(409, "conflict", "This ticket prefix is already used.", {
            fields: { ticket_prefix: ["This ticket prefix is already used."] },
          });
        const row = {
          duration_minutes: 15,
          is_bookable: true,
          allows_walk_in: true,
          allows_remote_join: false,
          ...data,
          ticket_prefix: prefix,
          id: id(),
          version: 1,
          is_active: true,
        } as Service;
        db.services.push(row);
        return HttpResponse.json({ service: row, warnings: [] }, { status: 201 });
      }),
      http.patch(`${api}/staff/services/:id/`, async ({ request, params }) => {
        await context.settle();
        const ok = guard(request, ["facility.configure"]);
        if (ok instanceof Response) return ok;
        const index = db.services.findIndex((s) => s.id === params.id);
        if (index < 0) return notFound(ok.lang);
        const data = await body(request);
        const stale = versionCheck(db.services[index]!.version, data.version, ok.lang);
        if (stale) return stale;
        const { version: _v, ...fields } = data;
        const warnings = [];
        if (fields.is_active === false) {
          const ended = db.templates.filter((t) => t.service_id === params.id && !t.valid_to);
          for (const t of ended) t.valid_to = isoDate(new Date());
          if (ended.length) warnings.push({ kind: "templates_ended", count: ended.length });
        }
        db.services[index] = {
          ...db.services[index]!,
          ...(fields as Partial<Service>),
          version: db.services[index]!.version + 1,
        };
        return HttpResponse.json({ service: db.services[index], warnings });
      }),
      http.get(`${api}/staff/service-points/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request);
        return ok instanceof Response ? ok : HttpResponse.json({ results: db.points });
      }),
      http.post(`${api}/staff/service-points/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request, ["facility.configure"]);
        if (ok instanceof Response) return ok;
        const data = (await body(request)) as Partial<ServicePoint>;
        if (!str(data.name).trim()) return fieldError(context, ok.lang, { name: "Required." });
        const row = {
          service_ids: [],
          is_active: true,
          kind: "room",
          ...data,
          id: id(),
        } as ServicePoint;
        db.points.push(row);
        return HttpResponse.json(row, { status: 201 });
      }),
      http.patch(`${api}/staff/service-points/:id/`, async ({ request, params }) => {
        await context.settle();
        const ok = guard(request, ["facility.configure"]);
        if (ok instanceof Response) return ok;
        const index = db.points.findIndex((p) => p.id === params.id);
        if (index < 0) return notFound(ok.lang);
        db.points[index] = {
          ...db.points[index]!,
          ...((await body(request)) as Partial<ServicePoint>),
        };
        return HttpResponse.json(db.points[index]);
      }),

      // ---- schedules -----------------------------------------------------------------------
      http.get(`${api}/staff/schedule-templates/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request);
        if (ok instanceof Response) return ok;
        const url = new URL(request.url);
        const own = ownMembership(ok.email);
        const canRead = isManager(ok) || ok.permissions.includes("schedule.view");
        const membership = canRead ? url.searchParams.get("membership_id") : own;
        const service = url.searchParams.get("service_id");
        return HttpResponse.json({
          results: db.templates.filter(
            (t) =>
              !t.valid_to &&
              (!membership || t.membership_id === membership) &&
              (!service || t.service_id === service),
          ),
        });
      }),
      http.post(`${api}/staff/schedule-templates/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request, ["schedule.manage"]);
        if (ok instanceof Response) return ok;
        const data = (await body(request)) as Partial<ScheduleTemplate>;
        const doctor = db.memberships.find((m) => m.id === data.membership_id);
        if (!doctor) return fieldError(context, ok.lang, { membership_id: "Choose a doctor." });
        if (!doctor.clinician?.attested_at)
          return context.errorResponse(
            422,
            "business_rule_violation",
            "This doctor's licence is not attested yet.",
            { fields: { membership_id: ["licence_not_attested"] } },
          );
        if (str(data.starts_at) >= str(data.ends_at))
          return fieldError(context, ok.lang, { ends_at: "The end must be after the start." });
        const clash = db.templates.some(
          (t) =>
            !t.valid_to &&
            t.membership_id === data.membership_id &&
            t.weekday === data.weekday &&
            t.starts_at < str(data.ends_at) &&
            str(data.starts_at) < t.ends_at,
        );
        if (clash)
          return context.errorResponse(
            422,
            "business_rule_violation",
            "This overlaps another session of the same doctor.",
            { fields: { starts_at: ["overlap"] } },
          );
        const row = {
          capacity: 1,
          bookable_share_pct: 100,
          valid_from: isoDate(new Date()),
          ...data,
          id: id(),
          version: 1,
          valid_to: null,
        } as ScheduleTemplate;
        db.templates.push(row);
        // Keza also works at Remera on Thursday mornings: the warning other facilities produce.
        const warnings =
          data.membership_id === SETUP_IDS.mKeza && data.weekday === 3
            ? [{ kind: "busy_elsewhere", weekday: 3, starts_at: "08:00", ends_at: "12:00" }]
            : [];
        return HttpResponse.json({ template: row, warnings }, { status: 201 });
      }),
      http.patch(`${api}/staff/schedule-templates/:id/`, async ({ request, params }) => {
        await context.settle();
        const ok = guard(request, ["schedule.manage"]);
        if (ok instanceof Response) return ok;
        const index = db.templates.findIndex((t) => t.id === params.id);
        if (index < 0) return notFound(ok.lang);
        const data = await body(request);
        const stale = versionCheck(db.templates[index]!.version, data.version, ok.lang);
        if (stale) return stale;
        const { version: _v, ...fields } = data;
        db.templates[index] = {
          ...db.templates[index]!,
          ...(fields as Partial<ScheduleTemplate>),
          version: db.templates[index]!.version + 1,
        };
        return HttpResponse.json({ template: db.templates[index], warnings: [] });
      }),
      http.delete(`${api}/staff/schedule-templates/:id/`, async ({ request, params }) => {
        await context.settle();
        const ok = guard(request, ["schedule.manage"]);
        if (ok instanceof Response) return ok;
        const row = db.templates.find((t) => t.id === params.id);
        if (!row) return notFound(ok.lang);
        row.valid_to = isoDate(new Date());
        return new HttpResponse(null, { status: 204 });
      }),
      http.get(`${api}/staff/schedule-exceptions/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request);
        if (ok instanceof Response) return ok;
        const url = new URL(request.url);
        const status = url.searchParams.get("status");
        const own = ownMembership(ok.email);
        const all = isManager(ok) || ok.permissions.includes("schedule.view");
        return HttpResponse.json({
          results: db.exceptions.filter(
            (e) => (all || e.membership_id === own) && (!status || e.status === status),
          ),
        });
      }),
      http.post(`${api}/staff/schedule-exceptions/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request, ["schedule.manage", "leave.request"]);
        if (ok instanceof Response) return ok;
        const data = (await body(request)) as Partial<ScheduleException>;
        if (
          !isManager(ok) &&
          (data.membership_id !== ownMembership(ok.email) || data.kind !== "leave")
        )
          return context.errorResponse(403, "permission_denied", s1("permissionDenied", ok.lang));
        if (str(data.starts_at) >= str(data.ends_at))
          return fieldError(context, ok.lang, { ends_at: "The end must be after the start." });
        const member = db.memberships.find((m) => m.id === data.membership_id);
        const row = {
          reason: "",
          service_id: null,
          ...data,
          id: id(),
          status: isManager(ok) ? "approved" : "requested",
          decision_note: "",
          member_name: member?.full_name ?? "",
        } as ScheduleException;
        db.exceptions.push(row);
        return HttpResponse.json({ exception: row, warnings: [] }, { status: 201 });
      }),
      http.post(`${api}/staff/schedule-exceptions/:id/:action/`, async ({ request, params }) => {
        await context.settle();
        const ok = guard(request);
        if (ok instanceof Response) return ok;
        const row = db.exceptions.find((e) => e.id === params.id);
        if (!row) return notFound(ok.lang);
        const action = str(params.action);
        const data = await body(request);
        if (action === "cancel") {
          if (!isManager(ok) && row.membership_id !== ownMembership(ok.email))
            return context.errorResponse(403, "permission_denied", s1("permissionDenied", ok.lang));
          row.status = "cancelled";
        } else {
          if (!isManager(ok))
            return context.errorResponse(403, "permission_denied", s1("permissionDenied", ok.lang));
          if (row.status !== "requested") return rule(context, ok.lang);
          if (action === "reject" && !str(data.decision_note).trim())
            return fieldError(context, ok.lang, { decision_note: "Give a reason." });
          row.status = action === "approve" ? "approved" : "rejected";
          row.decision_note = str(data.decision_note);
        }
        return HttpResponse.json(row);
      }),
      http.get(`${api}/staff/schedule-overview/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request);
        if (ok instanceof Response) return ok;
        const url = new URL(request.url);
        const from = url.searchParams.get("from") ?? isoDate(new Date());
        const to = url.searchParams.get("to") ?? isoDate(addDays(new Date(from), 6));
        const all = isManager(ok) || ok.permissions.includes("schedule.view");
        const own = ownMembership(ok.email);
        if (!all && !own) return HttpResponse.json({ members: [] });
        return HttpResponse.json(overview(from, to, all ? undefined : own));
      }),

      // ---- billing setup -------------------------------------------------------------------
      http.get(`${api}/staff/tariff-items/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request, ["facility.configure", "billing.record_payment"]);
        return ok instanceof Response ? ok : HttpResponse.json({ results: db.tariffs });
      }),
      http.post(`${api}/staff/tariff-items/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request, ["facility.configure"]);
        if (ok instanceof Response) return ok;
        const step = stepUpFailure(context, ok.lang);
        if (step) return step;
        const data = (await body(request)) as Partial<Tariff>;
        if (db.tariffs.some((t) => t.code === data.code))
          return context.errorResponse(409, "conflict", "This code is already in the price list.", {
            fields: { code: ["This code is already in the price list."] },
          });
        const row = {
          valid_from: isoDate(new Date()),
          ...data,
          id: id(),
          version: 1,
          valid_to: null,
        } as Tariff;
        db.tariffs.push(row);
        return HttpResponse.json(row, { status: 201 });
      }),
      http.patch(`${api}/staff/tariff-items/:id/`, async ({ request, params }) => {
        await context.settle();
        const ok = guard(request, ["facility.configure"]);
        if (ok instanceof Response) return ok;
        const step = stepUpFailure(context, ok.lang);
        if (step) return step;
        const index = db.tariffs.findIndex((t) => t.id === params.id);
        if (index < 0) return notFound(ok.lang);
        const data = await body(request);
        const previous = db.tariffs[index]!;
        const stale = versionCheck(previous.version, data.version, ok.lang);
        if (stale) return stale;
        const validFrom = str(data.valid_from) || isoDate(new Date());
        const closed = {
          ...previous,
          valid_to: isoDate(addDays(new Date(`${validFrom}T00:00:00Z`), -1)),
        };
        db.tariffHistory.push(closed);
        const current = {
          ...previous,
          id: id(),
          version: previous.version + 1,
          amount_rwf: Number(data.amount_rwf ?? previous.amount_rwf),
          valid_from: validFrom,
          valid_to: null,
        };
        db.tariffs[index] = current;
        log(
          "tariff",
          previous.code,
          { amount_rwf: previous.amount_rwf },
          { amount_rwf: current.amount_rwf },
          actorName(ok.email),
        );
        return HttpResponse.json({ previous: closed, current });
      }),
      http.get(`${api}/staff/tariff-items/:code/history/`, async ({ request, params }) => {
        await context.settle();
        const ok = guard(request, ["facility.configure"]);
        if (ok instanceof Response) return ok;
        const code = decodeURIComponent(str(params.code));
        const rows = [...db.tariffs, ...db.tariffHistory]
          .filter((t) => t.code === code)
          .sort((a, b) => str(b.valid_from).localeCompare(str(a.valid_from)));
        return HttpResponse.json({ results: rows });
      }),
      http.get(`${api}/staff/insurer-rules/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request, ["facility.configure", "billing.record_payment"]);
        return ok instanceof Response ? ok : HttpResponse.json({ results: db.rules });
      }),
      http.post(`${api}/staff/insurer-rules/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request, ["facility.configure"]);
        if (ok instanceof Response) return ok;
        const step = stepUpFailure(context, ok.lang);
        if (step) return step;
        const data = (await body(request)) as Partial<InsurerRule>;
        const share = Number(data.patient_share_bp);
        if (!Number.isInteger(share) || share < 0 || share > 10_000)
          return fieldError(context, ok.lang, { patient_share_bp: "Use 0 to 100 %." });
        const row = {
          applies_to_all_services: true,
          service_ids: [],
          requires_referral: false,
          excluded_tariff_codes: [],
          ceiling_per_visit_rwf: null,
          valid_from: isoDate(new Date()),
          ...data,
          id: id(),
          version: 1,
          valid_to: null,
        } as InsurerRule;
        db.rules.push(row);
        return HttpResponse.json(row, { status: 201 });
      }),
      http.patch(`${api}/staff/insurer-rules/:id/`, async ({ request, params }) => {
        await context.settle();
        const ok = guard(request, ["facility.configure"]);
        if (ok instanceof Response) return ok;
        const step = stepUpFailure(context, ok.lang);
        if (step) return step;
        const index = db.rules.findIndex((r) => r.id === params.id);
        if (index < 0) return notFound(ok.lang);
        const data = await body(request);
        const previous = db.rules[index]!;
        const stale = versionCheck(previous.version, data.version, ok.lang);
        if (stale) return stale;
        const { version: _v, ...fields } = data;
        const validFrom = str(fields.valid_from) || isoDate(new Date());
        const closed = {
          ...previous,
          valid_to: isoDate(addDays(new Date(`${validFrom}T00:00:00Z`), -1)),
        };
        const current = {
          ...previous,
          ...(fields as Partial<InsurerRule>),
          id: id(),
          version: previous.version + 1,
          valid_from: validFrom,
          valid_to: null,
        };
        db.rules[index] = current;
        return HttpResponse.json({ previous: closed, current });
      }),

      // ---- staff ---------------------------------------------------------------------------
      http.get(`${api}/staff/roles/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request);
        if (ok instanceof Response) return ok;
        const names: Record<string, string> = {
          facility_admin: "Facility admin",
          receptionist: "Receptionist",
          doctor: "Doctor",
          pharmacist: "Pharmacist",
        };
        return HttpResponse.json({
          results: Object.entries(names).map(([code, name]) => ({ code, name, permissions: [] })),
        });
      }),
      http.get(`${api}/staff/memberships/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request, ["staff.manage"]);
        if (ok instanceof Response) return ok;
        const url = new URL(request.url);
        const status = url.searchParams.get("status");
        const role = url.searchParams.get("role");
        const q = (url.searchParams.get("q") ?? "").toLowerCase();
        return HttpResponse.json({
          results: db.memberships.filter(
            (m) =>
              (!status || (status === "active") === m.is_active) &&
              (!role || m.roles.includes(role)) &&
              (!q || m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)),
          ),
        });
      }),
      http.get(`${api}/staff/memberships/:id/`, async ({ request, params }) => {
        await context.settle();
        const ok = guard(request, ["staff.manage"]);
        if (ok instanceof Response) return ok;
        const row = db.memberships.find((m) => m.id === params.id);
        return row ? HttpResponse.json(row) : notFound(ok.lang);
      }),
      http.patch(`${api}/staff/memberships/:id/`, async ({ request, params }) => {
        await context.settle();
        const ok = guard(request, ["staff.manage"]);
        if (ok instanceof Response) return ok;
        const step = stepUpFailure(context, ok.lang);
        if (step) return step;
        const index = db.memberships.findIndex((m) => m.id === params.id);
        if (index < 0) return notFound(ok.lang);
        const data = await body(request);
        const row = db.memberships[index]!;
        const stale = versionCheck(row.version, data.version, ok.lang);
        if (stale) return stale;
        const roles = (data.role_codes as string[] | undefined) ?? row.roles;
        if (
          row.roles.includes("facility_admin") &&
          !roles.includes("facility_admin") &&
          lastAdmin(row.id)
        )
          return context.errorResponse(
            422,
            "business_rule_violation",
            "The facility needs at least one admin.",
            { fields: { role_codes: ["last_admin"] } },
          );
        db.memberships[index] = {
          ...row,
          roles,
          service_points: (data.service_point_ids as string[] | undefined) ?? row.service_points,
          version: row.version + 1,
        };
        return HttpResponse.json(db.memberships[index]);
      }),
      http.post(`${api}/staff/memberships/:id/:action/`, async ({ request, params }) => {
        await context.settle();
        const ok = guard(request, ["staff.manage"]);
        if (ok instanceof Response) return ok;
        const action = str(params.action);
        if (action !== "attest-licence") {
          const step = stepUpFailure(context, ok.lang);
          if (step) return step;
        }
        const index = db.memberships.findIndex((m) => m.id === params.id);
        if (index < 0) return notFound(ok.lang);
        const row = db.memberships[index]!;
        const data = await body(request);
        if (action === "deactivate") {
          if (!str(data.reason).trim())
            return fieldError(context, ok.lang, { reason: "Give a reason." });
          if (row.roles.includes("facility_admin") && lastAdmin(row.id))
            return context.errorResponse(
              422,
              "business_rule_violation",
              "The facility needs at least one admin.",
              { fields: { role_codes: ["last_admin"] } },
            );
          db.memberships[index] = {
            ...row,
            is_active: false,
            deactivation_reason: str(data.reason),
            version: row.version + 1,
          };
        } else if (action === "reactivate") {
          db.memberships[index] = {
            ...row,
            is_active: true,
            deactivation_reason: "",
            version: row.version + 1,
          };
        } else if (action === "attest-licence") {
          if (!row.clinician) return rule(context, ok.lang);
          db.memberships[index] = {
            ...row,
            clinician: { ...row.clinician, attested_at: now() },
            version: row.version + 1,
          };
        } else if (action === "mfa-reset") {
          if (row.email === ok.email) return rule(context, ok.lang);
          db.memberships[index] = { ...row, mfa_enabled: false, version: row.version + 1 };
        } else return notFound(ok.lang);
        return HttpResponse.json(db.memberships[index]);
      }),
      http.get(`${api}/staff/invitations/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request, ["staff.manage"]);
        return ok instanceof Response ? ok : HttpResponse.json({ results: db.invitations });
      }),
      http.post(`${api}/staff/invitations/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request, ["staff.manage"]);
        if (ok instanceof Response) return ok;
        const step = stepUpFailure(context, ok.lang);
        if (step) return step;
        const data = await body(request);
        const email = str(data.email).trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
          return fieldError(context, ok.lang, { email: "Enter a valid email address." });
        const roles = (data.role_codes as string[] | undefined) ?? [];
        if (!roles.length)
          return fieldError(context, ok.lang, { role_codes: "Choose at least one role." });
        if (db.memberships.some((m) => m.is_active && m.email === email))
          return context.errorResponse(409, "conflict", "This person already works here.", {
            fields: { email: ["This person already works here."] },
          });
        const row: Invitation = {
          id: id(),
          email,
          role_codes: roles,
          service_point_ids: (data.service_point_ids as string[]) ?? [],
          status: "pending",
          expires_at: addDays(new Date(), 7).toISOString(),
          invited_by: actorName(ok.email),
          created_at: now(),
        };
        db.invitations.unshift(row);
        return HttpResponse.json(row, { status: 201 });
      }),
      http.post(`${api}/staff/invitations/:id/:action/`, async ({ request, params }) => {
        await context.settle();
        const ok = guard(request, ["staff.manage"]);
        if (ok instanceof Response) return ok;
        const row = db.invitations.find((i) => i.id === params.id);
        if (!row) return notFound(ok.lang);
        if (row.status !== "pending" && params.action === "revoke") return rule(context, ok.lang);
        if (params.action === "revoke") row.status = "revoked";
        else {
          row.status = "pending";
          row.expires_at = addDays(new Date(), 7).toISOString();
        }
        return HttpResponse.json(row);
      }),
      http.get(`${api}/staff/clinician-profile/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request);
        return ok instanceof Response ? ok : HttpResponse.json(db.clinician);
      }),
      http.patch(`${api}/staff/clinician-profile/`, async ({ request }) => {
        await context.settle();
        const ok = guard(request);
        if (ok instanceof Response) return ok;
        const data = await body(request);
        if ("licence_number" in data && !/^[A-Za-z0-9/._-]{2,40}$/.test(str(data.licence_number)))
          return fieldError(context, ok.lang, {
            licence_number: "Use letters, numbers and / . _ -",
          });
        db.clinician = { ...db.clinician, ...(data as object) };
        const own = ownMembership(ok.email);
        const m = db.memberships.find((x) => x.id === own);
        if (m?.clinician) m.clinician = { ...m.clinician, ...(data as object), attested_at: null };
        return HttpResponse.json(db.clinician);
      }),
      http.post(`${api}/staff/auth/invitations/lookup/`, async ({ request }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const token = str((await body(request)).token);
        const found = invitationFor(token);
        if (!found) return context.errorResponse(400, "invalid_token", INVALID[lang]);
        return HttpResponse.json(found.lookup);
      }),
      http.post(`${api}/staff/auth/invitations/accept/`, async ({ request }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const data = await body(request);
        const found = invitationFor(str(data.token));
        if (!found) return context.errorResponse(400, "invalid_token", INVALID[lang]);
        if (found.existing) {
          const result = context.authenticatedStaff(lang);
          if ("error" in result) return result.error;
          return HttpResponse.json(result.me);
        }
        if (!str(data.full_name).trim())
          return fieldError(context, lang, { full_name: "Enter your full name." });
        if (str(data.password).length < 12)
          return fieldError(context, lang, { password: "Use at least 12 characters." });
        const email = "new.nurse@medilink.test";
        if (!STAFF_USERS.some((u) => u.email === email))
          STAFF_USERS.push({
            id: id(),
            email,
            full_name: str(data.full_name),
            preferred_language: lang,
            is_platform_admin: false,
            mfa_enabled: false,
            memberships: [{ facility: SETUP_FACILITY, roles: ["receptionist"] }],
          });
        context.beginStaffMfaSetup(email, SETUP_FACILITY.id);
        return HttpResponse.json({ status: "mfa_setup_required", user: null });
      }),
      http.post(`${api}/platform/memberships/:id/mfa-reset/`, async ({ request }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const result = context.authenticatedStaff(lang);
        if ("error" in result) return result.error;
        if (!result.me.is_platform_admin)
          return context.errorResponse(403, "permission_denied", s1("permissionDenied", lang));
        return new HttpResponse(null, { status: 204 });
      }),
    ],
  };

  function lastAdmin(membershipId: string) {
    return !db.memberships.some(
      (m) => m.id !== membershipId && m.is_active && m.roles.includes("facility_admin"),
    );
  }

  function invitationFor(token: string) {
    const expires = addDays(new Date(), 6).toISOString();
    if (token === MOCK_INVITATION_TOKEN)
      return {
        existing: false,
        lookup: {
          facility_name: SETUP_FACILITY.name,
          invited_by: "Mutesi Diane",
          role_codes: ["receptionist"],
          email_masked: "n•••@medilink.test",
          account_exists: false,
          expires_at: expires,
        },
      };
    if (token === MOCK_INVITATION_EXISTING_TOKEN)
      return {
        existing: true,
        lookup: {
          facility_name: SETUP_FACILITY.name,
          invited_by: "Mutesi Diane",
          role_codes: ["pharmacist"],
          email_masked: "p•••@medilink.test",
          account_exists: true,
          expires_at: expires,
        },
      };
    return null;
  }
};

const INVALID: Record<LanguageCode, string> = {
  en: "This invitation link is not valid. Ask the facility for a new one.",
  fr: "Ce lien d’invitation n’est pas valide. Demandez-en un nouveau à l’établissement.",
  rw: "Iyi link y’ubutumire ntikora. Saba ikigo indi nshya.",
};
