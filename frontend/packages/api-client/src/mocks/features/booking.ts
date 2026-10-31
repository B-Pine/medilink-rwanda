import { http, HttpResponse } from "msw";

import type {
  Booking,
  BookingStatus,
  FacilityResult,
  PublicFacility,
  PublicService,
  PublicSlot,
  StaffBooking,
  Symptom,
} from "../../features/booking";
import { NO_SHOW_REVERSAL_REASONS } from "../../features/booking";
import { FACILITIES } from "../data";
import { patientsStore } from "./patients";
import type { FeatureMockFactory } from "../features";
import { id, str } from "./s1-common";
import { SETUP_IDS } from "./setup";

/**
 * S5 mocks (sprint-05 §6.3): six facilities across Gasabo, Kicukiro, Nyarugenge and Musanze with
 * different levels of care and insurers; 14 days of slots (some full, one taken on hold); one
 * upcoming booking for Mukamana and two of today's bookings at Kigali Clinic for reception.
 * Deterministic: no randomness, so tests are stable.
 */
export const MOCK_TAKEN_SLOT_HOUR = 9; // 09:00 on the first bookable day is "just taken"
const MOCK_PATIENT_ID = "9b2f1c3d-1111-4000-8000-000000000001";
const HOLD_MS = 5 * 60_000;

interface MockService extends PublicService {
  doctor: string;
  membership_id: string;
  weekdays: number[];
  from: number;
  to: number;
  minutes: number;
}

interface MockFacility {
  slug: string;
  name: string;
  type: string;
  ownership: string;
  level_of_care: string;
  district: string;
  district_code: string;
  sector: string;
  lat: number;
  lng: number;
  insurers: Record<string, number>; // patient share in basis points
  load: "low" | "medium" | "high";
  description: string;
  services: MockService[];
}

const svc = (
  code: string,
  en: string,
  rw: string,
  fr: string,
  fee: number,
  extra: Partial<MockService> = {},
): MockService => ({
  id: id(),
  code,
  name_i18n: { en, rw, fr },
  fee_rwf: fee,
  insurers: [],
  insurer_shares: {},
  bookable: true,
  remote_join: false,
  walk_in: true,
  queue_load: null,
  next_slot_at: null,
  min_age_months: null,
  max_age_months: null,
  doctor: "Dr Keza Umutoni",
  membership_id: SETUP_IDS.mKeza,
  weekdays: [0, 1, 2, 3, 4],
  from: 8,
  to: 12,
  minutes: 30,
  ...extra,
});

const GENERAL = [
  "general_consultation",
  "General consultation",
  "Ubuvuzi rusange",
  "Consultation générale",
] as const;

function facilities(): MockFacility[] {
  return [
    {
      slug: FACILITIES.kigaliClinic.slug,
      name: FACILITIES.kigaliClinic.name,
      type: "private_clinic",
      ownership: "private",
      level_of_care: "primary",
      district: "Gasabo",
      district_code: "12",
      sector: "Kimihurura",
      lat: -1.9536,
      lng: 30.0919,
      insurers: { rama: 1500, mmi: 1000 },
      load: "medium",
      description: "Private clinic with general and children's consultations.",
      services: [
        { ...svc(...GENERAL, 8000, { remote_join: true }), id: SETUP_IDS.sGen },
        {
          ...svc(
            "paediatric_consultation",
            "Paediatric consultation",
            "Ubuvuzi bw'abana",
            "Consultation pédiatrique",
            10000,
            {
              doctor: "Dr Paul Nkusi",
              membership_id: SETUP_IDS.mPaul,
              weekdays: [1, 3],
              from: 14,
              to: 17,
              max_age_months: 180,
            },
          ),
          id: SETUP_IDS.sPed,
        },
      ],
    },
    {
      slug: FACILITIES.remera.slug,
      name: FACILITIES.remera.name,
      type: "health_center",
      ownership: "public",
      level_of_care: "primary",
      district: "Gasabo",
      district_code: "12",
      sector: "Remera",
      lat: -1.9577,
      lng: 30.1127,
      insurers: { mutuelle: 1000, rama: 1500 },
      load: "high",
      description: "Public health centre. Mutuelle accepted.",
      services: [
        svc(...GENERAL, 2000, {
          doctor: "Dr Alice Mukamana",
          membership_id: id(),
          remote_join: true,
        }),
        svc("antenatal_care", "Antenatal care", "Kwita ku babyeyi", "Soins prénatals", 1000, {
          doctor: "Midwife Grace Uwera",
          membership_id: id(),
          weekdays: [1, 3],
        }),
      ],
    },
    {
      slug: FACILITIES.nyamirambo.slug,
      name: FACILITIES.nyamirambo.name,
      type: "polyclinic",
      ownership: "private",
      level_of_care: "primary",
      district: "Nyarugenge",
      district_code: "11",
      sector: "Nyamirambo",
      lat: -1.9798,
      lng: 30.0444,
      insurers: { rama: 1500, mmi: 1000, private_other: 2000 },
      load: "low",
      description: "Polyclinic with dental and eye care.",
      services: [
        svc(...GENERAL, 7000, { doctor: "Dr Eric Habimana", membership_id: id() }),
        svc("dental_care", "Dental care", "Kuvura amenyo", "Soins dentaires", 15000, {
          doctor: "Dr Diane Keza",
          membership_id: id(),
          weekdays: [0, 2, 4],
          from: 9,
        }),
        svc("eye_care", "Eye care", "Kuvura amaso", "Soins des yeux", 12000, {
          doctor: "Dr Jean Mugabo",
          membership_id: id(),
          weekdays: [1, 4],
          from: 13,
          to: 16,
        }),
      ],
    },
    {
      slug: "kicukiro-health-center",
      name: "Kicukiro Health Center",
      type: "health_center",
      ownership: "public",
      level_of_care: "primary",
      district: "Kicukiro",
      district_code: "13",
      sector: "Kicukiro",
      lat: -1.9706,
      lng: 30.1036,
      insurers: { mutuelle: 1000 },
      load: "medium",
      description: "Public health centre with maternal care.",
      services: [
        svc(...GENERAL, 2000, {
          doctor: "Dr Claude Ndayisaba",
          membership_id: id(),
          remote_join: true,
        }),
        svc("antenatal_care", "Antenatal care", "Kwita ku babyeyi", "Soins prénatals", 1000, {
          doctor: "Midwife Ange Mutesi",
          membership_id: id(),
        }),
      ],
    },
    {
      slug: "kibagabaga-hospital",
      name: "Kibagabaga District Hospital",
      type: "district_hospital",
      ownership: "public",
      level_of_care: "secondary",
      district: "Gasabo",
      district_code: "12",
      sector: "Kimironko",
      lat: -1.9327,
      lng: 30.1183,
      insurers: { mutuelle: 1000, rama: 1500, mmi: 1000 },
      load: "high",
      description: "District hospital. Mutuelle patients need a transfer from a health centre.",
      services: [
        svc(
          "internal_medicine",
          "Internal medicine",
          "Indwara zo mu mubiri",
          "Médecine interne",
          5000,
          {
            doctor: "Dr Patrick Nshimiyimana",
            membership_id: id(),
          },
        ),
        svc(...GENERAL, 3000, { doctor: "Dr Solange Uwimana", membership_id: id() }),
      ],
    },
    {
      slug: "musanze-health-center",
      name: "Musanze Health Center",
      type: "health_center",
      ownership: "faith_based",
      level_of_care: "primary",
      district: "Musanze",
      district_code: "43",
      sector: "Muhoza",
      lat: -1.499,
      lng: 29.634,
      insurers: { mutuelle: 1000 },
      load: "low",
      description: "Faith-based health centre in Musanze town.",
      services: [svc(...GENERAL, 1500, { doctor: "Dr Jean Bosco Habimana", membership_id: id() })],
    },
  ];
}

const SYMPTOMS: Symptom[] = [
  ["fever", "Fever", "Umuriro", "Fièvre", "general", false],
  ["cough", "Cough", "Inkorora", "Toux", "respiratory", false],
  ["headache", "Headache", "Kuribwa umutwe", "Mal de tête", "nervous", false],
  ["diarrhoea", "Diarrhoea", "Impiswi", "Diarrhée", "digestive", false],
  ["vomiting", "Vomiting", "Kuruka", "Vomissements", "digestive", false],
  ["abdominal_pain", "Abdominal pain", "Kuribwa mu nda", "Douleur abdominale", "digestive", false],
  ["chest_pain", "Chest pain", "Kuribwa mu gatuza", "Douleur thoracique", "circulatory", true],
  [
    "shortness_of_breath",
    "Shortness of breath",
    "Guhumeka nabi",
    "Essoufflement",
    "respiratory",
    true,
  ],
  ["sore_throat", "Sore throat", "Kuribwa mu muhogo", "Mal de gorge", "respiratory", false],
  ["rash", "Skin rash", "Uduheri ku ruhu", "Éruption cutanée", "skin", false],
  ["fatigue", "Tiredness", "Umunaniro", "Fatigue", "general", false],
  [
    "joint_pain",
    "Joint pain",
    "Kuribwa mu ngingo",
    "Douleur articulaire",
    "musculoskeletal",
    false,
  ],
  ["toothache", "Toothache", "Kuribwa iryinyo", "Mal de dents", "dental", false],
  ["eye_pain", "Eye pain", "Kuribwa ijisho", "Douleur oculaire", "eye", false],
  ["bleeding", "Bleeding", "Kuva amaraso", "Saignement", "general", true],
].map(([code, en, rw, fr, body_system, red]) => ({
  code: code as string,
  name_i18n: { en: en as string, rw: rw as string, fr: fr as string },
  body_system: body_system as string,
  is_red_flag: red as boolean,
}));

interface MockSlot extends PublicSlot {
  slug: string;
  service_id: string;
  capacity: number;
  held: number;
  booked: number;
}

interface MockBooking extends Booking {
  account_patient: boolean;
}

/** Kigali midnight of a day offset from today (Kigali is UTC+2, no daylight saving). */
function kigaliDay(offset: number): Date {
  const local = new Date(Date.now() + 2 * 3600_000);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + offset) -
      2 * 3600_000,
  );
}
const isoDate = (d: Date) => new Date(d.getTime() + 2 * 3600_000).toISOString().slice(0, 10);
const weekday = (d: Date) => (new Date(d.getTime() + 2 * 3600_000).getUTCDay() + 6) % 7;

function makeSlots(all: MockFacility[]): MockSlot[] {
  const out: MockSlot[] = [];
  const earliest = Date.now() + 2 * 3600_000; // 2-hour lead time
  for (const f of all) {
    for (const s of f.services) {
      for (let day = 0; day < 14; day++) {
        const midnight = kigaliDay(day);
        if (!s.weekdays.includes(weekday(midnight))) continue;
        for (let h = s.from * 60; h + s.minutes <= s.to * 60; h += s.minutes) {
          const start = new Date(midnight.getTime() + h * 60_000);
          if (start.getTime() < earliest) continue;
          // every fourth slot is full, so the grid has gaps like a real week
          const full = (day * 7 + h / s.minutes) % 4 === 3;
          out.push({
            id: id(),
            slug: f.slug,
            service_id: s.id,
            starts_at: start.toISOString(),
            ends_at: new Date(start.getTime() + s.minutes * 60_000).toISOString(),
            doctor: s.doctor,
            membership_id: s.membership_id,
            open_places: full ? 0 : 1,
            capacity: 1,
            held: 0,
            booked: full ? 1 : 0,
          });
        }
      }
    }
  }
  return out;
}

function seed() {
  const all = facilities();
  const slots = makeSlots(all);
  // the first open General slot at Kigali Clinic at 09:00 is "just taken" (held by someone else)
  const taken = slots.find(
    (s) =>
      s.slug === FACILITIES.kigaliClinic.slug &&
      s.service_id === SETUP_IDS.sGen &&
      s.open_places > 0 &&
      new Date(new Date(s.starts_at).getTime() + 2 * 3600_000).getUTCHours() ===
        MOCK_TAKEN_SLOT_HOUR,
  );
  if (taken) {
    taken.held = 1;
    taken.open_places = 0;
  }
  return {
    all,
    slots,
    taken: taken?.id ?? null,
    holds: new Map<string, { slot: string; expires: number; staff: boolean }>(),
    bookings: [] as MockBooking[],
  };
}

const share = (fee: number | null, bp: number | undefined) =>
  fee === null ? null : bp === undefined ? fee : Math.round((fee * bp) / 10_000);

export const bookingMocks: FeatureMockFactory = (context) => {
  const { api } = context;
  let db = seed();

  const facility = (slug: string) => db.all.find((f) => f.slug === slug);
  const nextSlot = (slug: string, service: string) =>
    db.slots.find((s) => s.slug === slug && s.service_id === service && s.open_places > 0)
      ?.starts_at ?? null;
  const publicSlot = (s: MockSlot): PublicSlot => ({
    id: s.id,
    starts_at: s.starts_at,
    ends_at: s.ends_at,
    doctor: s.doctor,
    membership_id: s.membership_id,
    open_places: s.open_places,
  });

  const makeBooking = (
    slot: MockSlot,
    patientId: string,
    name: string,
    status: BookingStatus,
    symptoms: { code: string; duration_days?: number }[],
    insurer: string | null,
    source: Booking["source"] = "online",
  ): MockBooking => {
    const f = facility(slot.slug)!;
    const s = f.services.find((x) => x.id === slot.service_id)!;
    const accepted = insurer ? insurer in f.insurers : null;
    const change = new Date(new Date(slot.starts_at).getTime() - 2 * 3600_000);
    return {
      id: id(),
      booking_code: `K${String(db.bookings.length + 3).padStart(2, "0")}M7Q`.slice(0, 6),
      status,
      source,
      patient_id: patientId,
      patient_display_name: name,
      facility_slug: f.slug,
      facility_name: f.name,
      service_id: s.id,
      service_name_i18n: s.name_i18n,
      doctor: s.doctor,
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
      service_point: f.slug === FACILITIES.kigaliClinic.slug ? "Room 1" : null,
      cost: {
        fee_rwf: s.fee_rwf,
        patient_share_rwf: share(s.fee_rwf, insurer && accepted ? f.insurers[insurer] : undefined),
        insurer_code: insurer,
        insurer_accepted: accepted,
      },
      symptoms: symptoms.map((x) => ({
        code: x.code,
        label: SYMPTOMS.find((y) => y.code === x.code)?.name_i18n.en ?? x.code,
        duration_days: x.duration_days ?? null,
        severity: "",
      })),
      can_change: status === "confirmed" && Date.now() < change.getTime(),
      change_until: change.toISOString(),
      rescheduled_to_id: null,
      pending_change: null,
      version: 1,
      account_patient: patientId === MOCK_PATIENT_ID,
    };
  };

  const seedBookings = () => {
    // Mukamana: one upcoming booking at Kigali Clinic in three days
    const upcoming = db.slots.find(
      (s) =>
        s.slug === FACILITIES.kigaliClinic.slug &&
        s.service_id === SETUP_IDS.sGen &&
        s.open_places > 0 &&
        new Date(s.starts_at).getTime() > Date.now() + 3 * 86_400_000,
    );
    if (upcoming) {
      upcoming.booked += 1;
      upcoming.open_places -= 1;
      db.bookings.push(
        makeBooking(
          upcoming,
          MOCK_PATIENT_ID,
          "Mukamana Jeanne",
          "confirmed",
          [{ code: "cough", duration_days: 4 }, { code: "fever" }],
          "rama",
        ),
      );
    }
    // reception's Expected list: two bookings today at Kigali Clinic (one already late)
    const today = (h: number, m: number) =>
      new Date(kigaliDay(0).getTime() + (h * 60 + m) * 60_000).toISOString();
    const expected: [string, string, number, number][] = [
      ["Mutesi Ange", "f9e00000-0000-4000-8000-000000000001", 10, 30],
      ["Niyonzima Paul", "f9e00000-0000-4000-8000-000000000002", 8, 0],
    ];
    for (const [name, patientId, h, m] of expected) {
      const slot: MockSlot = {
        id: id(),
        slug: FACILITIES.kigaliClinic.slug,
        service_id: SETUP_IDS.sGen,
        starts_at: today(h, m),
        ends_at: today(h, m + 30),
        doctor: "Dr Keza Umutoni",
        membership_id: SETUP_IDS.mKeza,
        open_places: 0,
        capacity: 1,
        held: 0,
        booked: 1,
      };
      db.bookings.push(
        makeBooking(slot, patientId, name, "confirmed", [{ code: "headache" }], null, "phone"),
      );
    }
    // …and one that was marked a no-show this morning (reversal, contract R5)
    {
      const slot: MockSlot = {
        id: id(),
        slug: FACILITIES.kigaliClinic.slug,
        service_id: SETUP_IDS.sGen,
        starts_at: today(7, 30),
        ends_at: today(8, 0),
        doctor: "Dr Keza Umutoni",
        membership_id: SETUP_IDS.mKeza,
        open_places: 0,
        capacity: 1,
        held: 0,
        booked: 1,
      };
      db.bookings.push(
        makeBooking(
          slot,
          "f9e00000-0000-4000-8000-000000000003",
          "Uwase Aline",
          "no_show",
          [{ code: "fever" }],
          null,
          "online",
        ),
      );
    }
  };
  seedBookings();

  const staffRow = (b: MockBooking): StaffBooking => {
    const parts = b.patient_display_name.split(" ");
    return {
      id: b.id,
      booking_code: b.booking_code,
      status: b.status,
      source: b.source,
      patient_id: b.patient_id,
      facility_patient_id: `fp-${b.patient_id}`,
      display_name: `${parts[0]} ${parts.at(-1)?.[0] ?? ""}.`,
      age_years: 34,
      sex: "female",
      service_id: b.service_id,
      membership_id: SETUP_IDS.mKeza,
      doctor: b.doctor,
      starts_at: b.starts_at,
      symptoms: b.symptoms,
      late: b.status === "confirmed" && Date.now() > new Date(b.starts_at).getTime() + 15 * 60_000,
      visit_id: null,
      version: b.version,
    };
  };

  const patientOnly = (request: Request) => {
    const lang = context.languageFrom(request);
    const result = context.authenticatedPatient(lang);
    return "error" in result ? { error: result.error } : { lang, me: result.me };
  };
  const staffOnly = (request: Request, codes: string[]) => {
    const lang = context.languageFrom(request);
    const result = context.authenticatedStaff(lang);
    if ("error" in result) return { error: result.error };
    const granted = result.me.permissions as readonly string[];
    if (!codes.some((c) => granted.includes(c)))
      return { error: context.errorResponse(403, "permission_denied", "Not allowed.") };
    return { lang, me: result.me };
  };
  const ruleError = (code: string, message: string) => context.errorResponse(422, code, message);

  const holdSlot = (slotId: string, staff: boolean) => {
    const slot = db.slots.find((s) => s.id === slotId);
    if (!slot) return context.errorResponse(404, "not_found", "Not found.");
    if (slot.open_places < 1) {
      const alternatives = db.slots
        .filter(
          (s) => s.slug === slot.slug && s.service_id === slot.service_id && s.open_places > 0,
        )
        .filter((s) => s.starts_at > slot.starts_at)
        .slice(0, 3)
        .map(publicSlot);
      return HttpResponse.json(
        {
          error: {
            code: "slot_taken",
            message: "Someone just took this time. Choose another one.",
            fields: {},
            request_id: "mock",
          },
          alternatives,
        },
        { status: 409 },
      );
    }
    for (const [holdId, h] of db.holds) {
      if (h.staff === staff) {
        const old = db.slots.find((s) => s.id === h.slot);
        if (old) {
          old.held -= 1;
          old.open_places += 1;
        }
        db.holds.delete(holdId);
      }
    }
    slot.held += 1;
    slot.open_places -= 1;
    const holdId = id();
    const expires = Date.now() + HOLD_MS;
    db.holds.set(holdId, { slot: slot.id, expires, staff });
    return HttpResponse.json(
      { hold_id: holdId, expires_at: new Date(expires).toISOString() },
      { status: 201 },
    );
  };

  const confirm = (
    holdId: string,
    patientId: string,
    name: string,
    symptoms: { code: string; duration_days?: number }[],
    insurer: string | null,
    source: Booking["source"],
  ): MockBooking | Response => {
    const h = db.holds.get(holdId);
    if (!h || h.expires < Date.now())
      return ruleError("hold_expired", "We couldn't keep this time for you. Choose a time again.");
    if (!symptoms.length)
      return context.errorResponse(400, "validation_error", "Choose at least one symptom.", {
        fields: { symptoms: ["Choose at least one symptom."] },
      });
    const slot = db.slots.find((s) => s.id === h.slot)!;
    const active = db.bookings.filter(
      (b) =>
        b.patient_id === patientId &&
        b.status === "confirmed" &&
        b.starts_at > new Date().toISOString(),
    );
    if (active.length >= 3)
      return ruleError(
        "limit_active",
        "You already have the most upcoming bookings allowed. Cancel one to book another.",
      );
    if (
      active.some(
        (b) =>
          b.service_id === slot.service_id &&
          b.starts_at.slice(0, 10) === slot.starts_at.slice(0, 10),
      )
    )
      return ruleError(
        "same_day_service",
        "This person already has a booking for this service on that day.",
      );
    slot.held -= 1;
    slot.booked += 1;
    db.holds.delete(holdId);
    const booking = makeBooking(slot, patientId, name, "confirmed", symptoms, insurer, source);
    db.bookings.push(booking);
    return booking;
  };

  const strip = ({ account_patient: _a, ...b }: MockBooking): Booking => b;

  checkInMockBooking = (bookingId) => {
    const b = db.bookings.find((x) => x.id === bookingId);
    if (!b) return null;
    if (b.status === "confirmed") {
      b.status = "checked_in";
      b.version += 1;
    }
    return { name: b.patient_display_name, service_id: b.service_id, slot_starts_at: b.starts_at };
  };

  return {
    reset: () => {
      db = seed();
      seedBookings();
    },
    handlers: [
      // ---- public
      http.post(`${api}/public/facilities/search/`, async ({ request }) => {
        await context.settle();
        const body = (await context.readJson(request)) ?? {};
        const service = str(body.service_code);
        const district = str(body.district_code);
        const insurer = str(body.insurer_code);
        const level = str(body.level_of_care);
        const near = body.near as { lat: number; lng: number } | null | undefined;
        const results: FacilityResult[] = [];
        for (const f of db.all) {
          if (district && f.district_code !== district) continue;
          if (level && f.level_of_care !== level) continue;
          const s = service ? f.services.find((x) => x.code === service) : f.services[0];
          if (!s) continue;
          const km = near
            ? Math.round(
                Math.hypot((f.lat - near.lat) * 111, (f.lng - near.lng) * 111 * 0.999) * 10,
              ) / 10
            : null;
          results.push({
            slug: f.slug,
            name: f.name,
            type: f.type,
            ownership: f.ownership,
            level_of_care: f.level_of_care,
            district: f.district,
            sector: f.sector,
            distance_km: km,
            open_now: true,
            service_code: s.code,
            service_name_i18n: s.name_i18n,
            accepts_insurance: insurer ? (insurer in f.insurers ? "yes" : "no") : "unknown",
            fee_rwf: s.fee_rwf,
            patient_share_rwf: share(s.fee_rwf, insurer ? f.insurers[insurer] : undefined),
            next_slot_at: s.bookable ? nextSlot(f.slug, s.id) : null,
            queue_load: f.load,
            allows_remote_join: s.remote_join,
            referral_hint: insurer === "mutuelle" && f.level_of_care !== "primary",
            lat: f.lat,
            lng: f.lng,
          });
        }
        if (near) results.sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0));
        return HttpResponse.json({ count: results.length, page: 1, results });
      }),
      http.get(`${api}/public/facilities/:slug/slots/`, async ({ request, params }) => {
        await context.settle();
        const url = new URL(request.url);
        const f = facility(str(params.slug));
        const service = url.searchParams.get("service_id") ?? "";
        if (!f || !f.services.some((s) => s.id === service))
          return context.errorResponse(404, "not_found", "Not found.");
        const doctor = url.searchParams.get("membership_id");
        const start = url.searchParams.get("date") ?? isoDate(kigaliDay(0));
        const offset = Math.round(
          (Date.parse(`${start}T00:00:00+02:00`) - kigaliDay(0).getTime()) / 86_400_000,
        );
        const days = Array.from({ length: 7 }, (_, i) => {
          const date = isoDate(kigaliDay(offset + i));
          return {
            date,
            slots: db.slots
              .filter(
                (s) =>
                  s.slug === f.slug &&
                  s.service_id === service &&
                  s.open_places > 0 &&
                  isoDate(new Date(s.starts_at)) === date &&
                  (!doctor || s.membership_id === doctor),
              )
              .map(publicSlot),
          };
        });
        return HttpResponse.json({ service_id: service, days });
      }),
      http.get(`${api}/public/facilities/:slug/`, async ({ params }) => {
        await context.settle();
        const f = facility(str(params.slug));
        if (!f) return context.errorResponse(404, "not_found", "Not found.");
        const hours: [string, string, string][] = Array.from({ length: 7 }, (_, i) => {
          const d = kigaliDay(i);
          return weekday(d) < 5
            ? ([isoDate(d), "07:30", "17:00"] as [string, string, string])
            : null;
        }).filter((x): x is [string, string, string] => x !== null);
        const body: PublicFacility = {
          slug: f.slug,
          name: f.name,
          type: f.type,
          ownership: f.ownership,
          level_of_care: f.level_of_care,
          verified: true,
          description_i18n: { en: f.description },
          address: `${f.sector}, ${f.district}`,
          phone: "+250788000000",
          district: f.district,
          sector: f.sector,
          lat: f.lat,
          lng: f.lng,
          open_now: true,
          hours,
          closures: [],
          services: f.services.map(
            ({
              doctor: _d,
              membership_id: _m,
              weekdays: _w,
              from: _f,
              to: _t,
              minutes: _n,
              ...s
            }) => ({
              ...s,
              insurers: Object.keys(f.insurers),
              insurer_shares: f.insurers,
              queue_load: f.load,
              next_slot_at: nextSlot(f.slug, s.id),
            }),
          ),
          doctors: f.services.map((s) => ({
            membership_id: s.membership_id,
            name: s.doctor,
            days: s.weekdays,
            service_ids: [s.id],
          })),
        };
        return HttpResponse.json(body);
      }),
      http.get(`${api}/public/symptoms/`, async () => {
        await context.settle();
        return HttpResponse.json(SYMPTOMS);
      }),

      // ---- patient
      http.post(`${api}/patient/slots/:slotId/hold/`, async ({ request, params }) => {
        await context.settle();
        const ok = patientOnly(request);
        if ("error" in ok) return ok.error;
        return holdSlot(str(params.slotId), false);
      }),
      http.delete(`${api}/patient/holds/:holdId/`, async ({ params }) => {
        await context.settle();
        const h = db.holds.get(str(params.holdId));
        if (h) {
          const slot = db.slots.find((s) => s.id === h.slot);
          if (slot) {
            slot.held -= 1;
            slot.open_places += 1;
          }
          db.holds.delete(str(params.holdId));
        }
        return new HttpResponse(null, { status: 204 });
      }),
      http.get(`${api}/patient/bookings/`, async ({ request }) => {
        await context.settle();
        const ok = patientOnly(request);
        if ("error" in ok) return ok.error;
        const upcoming = new URL(request.url).searchParams.get("when") !== "past";
        const mine = db.bookings.filter((b) => b.account_patient);
        const results = mine
          .filter((b) => (b.status === "confirmed") === upcoming)
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
          .map(strip);
        return HttpResponse.json({ results: upcoming ? results : results.reverse() });
      }),
      http.post(`${api}/patient/bookings/`, async ({ request }) => {
        await context.settle();
        const ok = patientOnly(request);
        if ("error" in ok) return ok.error;
        const body = (await context.readJson(request)) ?? {};
        const profile = ok.me.profiles.find((p) => p.patient_id === str(body.patient_id));
        if (!profile) return context.errorResponse(404, "not_found", "Not found.");
        const insurer = body.insurance_profile_id ? "rama" : null;
        const made = confirm(
          str(body.hold_id),
          profile.patient_id,
          profile.display_name,
          (body.symptoms as { code: string }[] | undefined) ?? [],
          insurer,
          "online",
        );
        if (made instanceof Response) return made;
        made.account_patient = true;
        return HttpResponse.json(strip(made), { status: 201 });
      }),
      http.get(`${api}/patient/bookings/:id/`, async ({ request, params }) => {
        await context.settle();
        const ok = patientOnly(request);
        if ("error" in ok) return ok.error;
        const b = db.bookings.find((x) => x.id === params.id && x.account_patient);
        return b
          ? HttpResponse.json(strip(b))
          : context.errorResponse(404, "not_found", "Not found.");
      }),
      http.post(`${api}/patient/bookings/:id/cancel/`, async ({ request, params }) => {
        await context.settle();
        const ok = patientOnly(request);
        if ("error" in ok) return ok.error;
        const body = (await context.readJson(request)) ?? {};
        const b = db.bookings.find((x) => x.id === params.id && x.account_patient);
        if (!b) return context.errorResponse(404, "not_found", "Not found.");
        if (b.version !== body.version)
          return context.errorResponse(409, "stale", "Someone else changed this booking.");
        if (b.status !== "confirmed")
          return ruleError("cancel_closed", "This booking can't be changed any more.");
        b.status = b.can_change ? "cancelled" : "late_cancelled";
        b.can_change = false;
        b.version += 1;
        return HttpResponse.json(strip(b));
      }),
      http.post(`${api}/patient/bookings/:id/reschedule/`, async ({ request, params }) => {
        await context.settle();
        const ok = patientOnly(request);
        if ("error" in ok) return ok.error;
        const body = (await context.readJson(request)) ?? {};
        const old = db.bookings.find((x) => x.id === params.id && x.account_patient);
        if (!old) return context.errorResponse(404, "not_found", "Not found.");
        if (old.version !== body.version)
          return context.errorResponse(409, "stale", "Someone else changed this booking.");
        const symptoms = old.symptoms.map((s) => ({ code: s.code }));
        old.status = "superseded";
        const made = confirm(
          str(body.hold_id),
          old.patient_id,
          old.patient_display_name,
          symptoms,
          old.cost.insurer_code,
          old.source,
        );
        if (made instanceof Response) {
          old.status = "confirmed";
          return made;
        }
        made.account_patient = true;
        old.rescheduled_to_id = made.id;
        old.version += 1;
        return HttpResponse.json(strip(made));
      }),

      // ---- staff
      http.get(`${api}/staff/bookings/`, async ({ request }) => {
        await context.settle();
        const ok = staffOnly(request, ["queue.operate", "schedule.view"]);
        if ("error" in ok) return ok.error;
        const url = new URL(request.url);
        const date = url.searchParams.get("date") ?? isoDate(kigaliDay(0));
        const status = url.searchParams.get("status")?.split(",");
        const rows = db.bookings
          .filter((b) => b.facility_slug === FACILITIES.kigaliClinic.slug)
          .filter((b) => isoDate(new Date(b.starts_at)) === date)
          .filter((b) => (status ? status.includes(b.status) : b.status !== "superseded"))
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
          .map(staffRow);
        return HttpResponse.json({ count: rows.length, results: rows });
      }),
      http.get(`${api}/staff/slots/`, async ({ request }) => {
        await context.settle();
        const ok = staffOnly(request, ["queue.operate", "schedule.view"]);
        if ("error" in ok) return ok.error;
        const url = new URL(request.url);
        const service = url.searchParams.get("service_id") ?? "";
        const from = url.searchParams.get("date");
        const offset = from
          ? Math.max(
              0,
              Math.round(
                (new Date(`${from}T00:00:00+02:00`).getTime() - kigaliDay(0).getTime()) /
                  86_400_000,
              ),
            )
          : 0;
        const days = Array.from({ length: 7 }, (_, i) => {
          const date = isoDate(kigaliDay(offset + i));
          return {
            date,
            slots: db.slots
              .filter(
                (s) =>
                  s.slug === FACILITIES.kigaliClinic.slug &&
                  s.service_id === service &&
                  s.open_places > 0 &&
                  isoDate(new Date(s.starts_at)) === date,
              )
              .map(publicSlot),
          };
        });
        return HttpResponse.json({ service_id: service, days });
      }),
      http.post(`${api}/staff/slots/:slotId/hold/`, async ({ request, params }) => {
        await context.settle();
        const ok = staffOnly(request, ["queue.operate"]);
        if ("error" in ok) return ok.error;
        return holdSlot(str(params.slotId), true);
      }),
      http.post(`${api}/staff/bookings/`, async ({ request }) => {
        await context.settle();
        const ok = staffOnly(request, ["queue.operate"]);
        if ("error" in ok) return ok.error;
        const body = (await context.readJson(request)) ?? {};
        const store = patientsStore();
        const record = store.records.find((r) => r.id === str(body.facility_patient_id));
        const patient = record ? store.patients.get(record.patient_id) : undefined;
        const made = confirm(
          str(body.hold_id),
          patient?.id ?? str(body.facility_patient_id),
          patient?.full_name ?? "Phone patient",
          (body.symptoms as { code: string }[] | undefined) ?? [],
          null,
          "phone",
        );
        if (made instanceof Response) return made;
        return HttpResponse.json(staffRow(made), { status: 201 });
      }),
      http.post(`${api}/staff/bookings/:id/reschedule/`, async ({ request, params }) => {
        await context.settle();
        const ok = staffOnly(request, ["queue.operate"]);
        if ("error" in ok) return ok.error;
        const body = (await context.readJson(request)) ?? {};
        const old = db.bookings.find((x) => x.id === params.id);
        if (!old) return context.errorResponse(404, "not_found", "Not found.");
        if (old.version !== body.version)
          return context.errorResponse(409, "stale", "Someone else changed this booking.");
        const symptoms = old.symptoms.map((x) => ({ code: x.code }));
        old.status = "superseded";
        const made = confirm(
          str(body.hold_id),
          old.patient_id,
          old.patient_display_name,
          symptoms,
          old.cost.insurer_code,
          old.source,
        );
        if (made instanceof Response) {
          old.status = "confirmed";
          return made;
        }
        old.rescheduled_to_id = made.id;
        old.version += 1;
        return HttpResponse.json(staffRow(made));
      }),
      http.post(`${api}/staff/bookings/:id/cancel/`, async ({ request, params }) => {
        await context.settle();
        const ok = staffOnly(request, ["queue.operate"]);
        if ("error" in ok) return ok.error;
        const b = db.bookings.find((x) => x.id === params.id);
        if (!b) return context.errorResponse(404, "not_found", "Not found.");
        const body = (await context.readJson(request)) ?? {};
        const code = str(body.reason_code);
        if (
          !(NO_SHOW_REVERSAL_REASONS as readonly string[]).includes(code) ||
          (code === "other" && !str(body.reason_text).trim())
        )
          return context.errorResponse(422, "business_rule_violation", "Give a reason.", {
            fields: { reason_code: ["Give a reason."] },
          });
        if (b.status !== "no_show")
          return context.errorResponse(422, "business_rule_violation", "Not allowed.", {
            fields: { booking: ["not_allowed"] },
          });
        b.status = "cancelled";
        b.version += 1;
        return HttpResponse.json(staffRow(b));
      }),
      http.post(`${api}/staff/bookings/:id/reverse-no-show/`, async ({ request, params }) => {
        await context.settle();
        const ok = staffOnly(request, ["queue.operate"]);
        if ("error" in ok) return ok.error;
        const b = db.bookings.find((x) => x.id === params.id);
        if (!b) return context.errorResponse(404, "not_found", "Not found.");
        const body = (await context.readJson(request)) ?? {};
        const code = str(body.reason_code);
        if (
          !(NO_SHOW_REVERSAL_REASONS as readonly string[]).includes(code) ||
          (code === "other" && !str(body.reason_text).trim())
        )
          return context.errorResponse(422, "business_rule_violation", "Give a reason.", {
            fields: { reason_code: ["Give a reason."] },
          });
        if (b.status !== "no_show")
          return context.errorResponse(422, "business_rule_violation", "Not allowed.", {
            fields: { booking: ["not_allowed"] },
          });
        b.status = "cancelled";
        b.version += 1;
        return HttpResponse.json(staffRow(b));
      }),
    ],
  };
};

/**
 * Booked check-in for the S4 check-in mock (contract sprint-05 R6): marks the booking checked in
 * and returns who and which service, or null when the booking is unknown.
 */
export let checkInMockBooking: (
  bookingId: string,
) => { name: string; service_id: string; slot_starts_at: string } | null = () => null;
