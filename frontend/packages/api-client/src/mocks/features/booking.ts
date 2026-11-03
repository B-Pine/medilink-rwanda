import { http, HttpResponse } from "msw";

import type {
  Booking,
  BookingStatus,
  CalendarFeedStatus,
  Disruption,
  DisruptionAction,
  DisruptionItem,
  DisruptionProblem,
  FacilityResult,
  FollowUp,
  PendingChange,
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
import { MEMBERSHIP_BY_EMAIL, SETUP_IDS } from "./setup";

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
  extra: Partial<MockService> = {},
): MockService => ({
  id: id(),
  code,
  name_i18n: { en, rw, fr },
  insurers: [],
  bookable: true,
  remote_join: false,
  walk_in: true,
  queue_load: null,
  waiting: null,
  wait_range: null,
  next_slot_at: null,
  min_age_months: null,
  max_age_months: null,
  doctor: "Dr Uwimana Keza",
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
        { ...svc(...GENERAL, { remote_join: true }), id: SETUP_IDS.sGen },
        {
          ...svc(
            "paediatric_consultation",
            "Paediatric consultation",
            "Ubuvuzi bw'abana",
            "Consultation pédiatrique",
            {
              doctor: "Dr Niyonsenga Paul",
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
        svc(...GENERAL, {
          doctor: "Dr Alice Mukamana",
          membership_id: id(),
          remote_join: true,
        }),
        svc("antenatal_care", "Antenatal care", "Kwita ku babyeyi", "Soins prénatals", {
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
        svc(...GENERAL, { doctor: "Dr Eric Habimana", membership_id: id() }),
        svc("dental_care", "Dental care", "Kuvura amenyo", "Soins dentaires", {
          doctor: "Dr Diane Keza",
          membership_id: id(),
          weekdays: [0, 2, 4],
          from: 9,
        }),
        svc("eye_care", "Eye care", "Kuvura amaso", "Soins des yeux", {
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
        svc(...GENERAL, {
          doctor: "Dr Claude Ndayisaba",
          membership_id: id(),
          remote_join: true,
        }),
        svc("antenatal_care", "Antenatal care", "Kwita ku babyeyi", "Soins prénatals", {
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
        svc("internal_medicine", "Internal medicine", "Indwara zo mu mubiri", "Médecine interne", {
          doctor: "Dr Patrick Nshimiyimana",
          membership_id: id(),
        }),
        svc(...GENERAL, { doctor: "Dr Solange Uwimana", membership_id: id() }),
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
      services: [svc(...GENERAL, { doctor: "Dr Jean Bosco Habimana", membership_id: id() })],
    },
  ];
}

/** Shared with the triage mock, which reads the red flags from it as the backend reads master data. */
export const SYMPTOMS: Symptom[] = [
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
  /** The booked doctor (S5b moves change it). */
  membership_id?: string;
}

type MockItem = DisruptionItem & { disruption_id: string };

/** S5b: the second doctor at Kigali Clinic, the target of "move to another doctor". */
const MOCK_OTHER_DOCTOR = { membership_id: SETUP_IDS.mPaul, name: "Dr Niyonsenga Paul" };
const DOCTOR_NAMES: Record<string, string> = {
  [SETUP_IDS.mKeza]: "Dr Uwimana Keza",
  [SETUP_IDS.mPaul]: MOCK_OTHER_DOCTOR.name,
};

/** Kigali midnight of a day offset from today (Kigali is UTC+2, no daylight saving). */
function kigaliDay(offset: number): Date {
  const local = new Date(Date.now() + 2 * 3600_000);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + offset) -
      2 * 3600_000,
  );
}
const isoDate = (d: Date) => new Date(d.getTime() + 2 * 3600_000).toISOString().slice(0, 10);
/**
 * Mock public queue by load (contract public-pages §2.1): low 2, medium 6, high 11 waiting, one
 * doctor, 15-minute consultations, the backend's -20 % / +25 % rounded to 5.
 */
const MOCK_WAITING = { low: 2, medium: 6, high: 11 } as const;
const liveQueue = (load: string | null | undefined) => {
  // no load: the facility publishes no queue, so no count (contract PT §2.1)
  if (!load || !(load in MOCK_WAITING)) return { waiting: null, wait_range: null };
  const waiting = MOCK_WAITING[load as keyof typeof MOCK_WAITING];
  const minutes = waiting * 15;
  return {
    waiting,
    wait_range: {
      min: Math.floor((minutes * 0.8) / 5) * 5,
      max: Math.max(Math.ceil((minutes * 1.25) / 5) * 5, 5),
    },
  };
};
const weekday = (d: Date) => (new Date(d.getTime() + 2 * 3600_000).getUTCDay() + 6) % 7;
/** Mock opening hours, the same the profile shows: Monday to Friday 07:30-17:00, Kigali time. */
const openNow = (now = new Date()) => {
  const kigali = new Date(now.getTime() + 2 * 3600_000);
  const minutes = kigali.getUTCHours() * 60 + kigali.getUTCMinutes();
  return weekday(now) < 5 && minutes >= 7 * 60 + 30 && minutes < 17 * 60;
};

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
    /** `Idempotency-Key` to booking id (B3, R3: a repeated request returns the same booking). */
    keys: new Map<string, string>(),
    // S5b
    disruptions: [] as Disruption[],
    items: [] as MockItem[],
    followUps: new Map<string, FollowUp>(),
    feed: { is_active: false, created_at: null, last_accessed_at: null } as CalendarFeedStatus,
  };
}

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
        doctor: "Dr Uwimana Keza",
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
        doctor: "Dr Uwimana Keza",
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

  // ---- S5b state: one disruption offer for Mukamana (contract §6.3) ----
  const counts = (disruptionId: string): Disruption["counts"] => {
    const c = {
      total: 0,
      not_applied: 0,
      pending: 0,
      accepted: 0,
      declined: 0,
      rebooked_other: 0,
      cancelled: 0,
    };
    for (const i of db.items.filter((x) => x.disruption_id === disruptionId)) {
      c.total += 1;
      if (i.action === null && i.resolved_at === null) c.not_applied += 1;
      else c[i.patient_response] += 1;
    }
    return c;
  };
  const refresh = (d: Disruption) => {
    d.counts = counts(d.id);
    const open = db.items.some((i) => i.disruption_id === d.id && i.resolved_at === null);
    if (d.status === "open" && !open) {
      d.status = "resolved";
      d.resolved_at = new Date().toISOString();
      d.version += 1;
    }
  };
  const itemFor = (b: MockBooking, disruptionId: string): MockItem => {
    const parts = b.patient_display_name.split(" ");
    return {
      disruption_id: disruptionId,
      id: id(),
      target: "booking",
      booking_id: b.id,
      booking_code: b.booking_code,
      ticket_id: null,
      ticket_number: null,
      facility_patient_id: `fp-${b.patient_id}`,
      display_name: `${parts[0]} ${parts.at(-1)?.[0] ?? ""}.`,
      contact_phone: b.source === "phone" ? "+250788123456" : null,
      service_id: b.service_id,
      starts_at: b.starts_at,
      doctor: b.doctor,
      previous_starts_at: null,
      previous_doctor: null,
      action: null,
      patient_response: "pending",
      reply_by: null,
      auto_accept: null,
      new_booking_id: null,
      applied_at: null,
      resolved_at: null,
      version: 1,
    };
  };
  const offerFor = (b: MockBooking, item: MockItem, d: Disruption): PendingChange => ({
    item_id: item.id,
    disruption_kind: d.kind,
    action: item.action ?? "move_doctor",
    previous_starts_at: item.previous_starts_at,
    previous_doctor: item.previous_doctor,
    reply_by: new Date(Date.now() + 24 * 3600_000).toISOString(),
    // as the backend: further than a day away, silence counts as yes
    auto_accept: new Date(b.starts_at).getTime() - Date.now() > 86_400_000,
  });
  /** Move a booking in place (same ID and code) and attach the offer. */
  const moveBooking = (
    b: MockBooking,
    item: MockItem,
    d: Disruption,
    action: DisruptionAction,
    target: { starts_at: string; membership_id: string; doctor: string },
  ) => {
    const now = new Date().toISOString();
    item.previous_starts_at = b.starts_at;
    item.previous_doctor = b.doctor;
    b.starts_at = target.starts_at;
    b.membership_id = target.membership_id;
    b.doctor = target.doctor;
    b.version += 1;
    Object.assign(item, { action, applied_at: now, starts_at: b.starts_at, doctor: b.doctor });
    b.pending_change = offerFor(b, item, d);
    item.reply_by = b.pending_change.reply_by;
    item.auto_accept = b.pending_change.auto_accept;
    item.version += 1;
  };
  const seedOffer = () => {
    const b = db.bookings.find((x) => x.account_patient && x.status === "confirmed");
    if (!b) return;
    const d: Disruption = {
      id: id(),
      kind: "doctor_absent",
      membership_id: SETUP_IDS.mKeza,
      doctor: "Dr Uwimana Keza",
      service_id: null,
      service_name_i18n: null,
      starts_at: new Date(new Date(b.starts_at).getTime() - 3600_000).toISOString(),
      ends_at: new Date(new Date(b.starts_at).getTime() + 3 * 3600_000).toISOString(),
      reason: "Training",
      status: "open",
      created_by: "Mukeshimana Alice",
      created_at: new Date().toISOString(),
      resolved_at: null,
      counts: counts(""),
      version: 1,
    };
    const item = itemFor(b, d.id);
    db.disruptions.push(d);
    db.items.push(item);
    moveBooking(b, item, d, "move_doctor", {
      starts_at: b.starts_at,
      membership_id: MOCK_OTHER_DOCTOR.membership_id,
      doctor: MOCK_OTHER_DOCTOR.name,
    });
    b.version = 1;
    refresh(d);
  };
  seedOffer();

  /** Close a booking's open disruption items, as the backend's `settle_booking`. */
  const settle = (b: MockBooking, response: DisruptionItem["patient_response"], newId?: string) => {
    b.pending_change = null;
    for (const i of db.items.filter((x) => x.booking_id === b.id && x.resolved_at === null)) {
      i.patient_response = response;
      i.resolved_at = new Date().toISOString();
      i.new_booking_id = newId ?? null;
      i.version += 1;
      const d = db.disruptions.find((x) => x.id === i.disruption_id);
      if (d) refresh(d);
    }
  };

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
      membership_id: b.membership_id ?? SETUP_IDS.mKeza,
      doctor: b.doctor,
      starts_at: b.starts_at,
      symptoms: b.symptoms,
      late: b.status === "confirmed" && Date.now() > new Date(b.starts_at).getTime() + 15 * 60_000,
      has_pending_change: b.pending_change !== null,
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

  const strip = ({ account_patient: _a, membership_id: _m, ...b }: MockBooking): Booking => b;
  const replay = (request: Request) => {
    const key = request.headers.get("Idempotency-Key");
    const done = key ? db.bookings.find((b) => b.id === db.keys.get(key)) : undefined;
    return { key, done };
  };
  /**
   * Reschedule checks in the backend's order (`scheduling/booking.py` reschedule): version (409),
   * then the booking must still be confirmed and, for patients, inside the change window (422
   * `cancel_closed`); only then is the hold used.
   */
  const rescheduleRule = (old: MockBooking, version: unknown, staff: boolean) => {
    if (old.version !== version)
      return context.errorResponse(409, "stale", "Someone else changed this booking.");
    if (old.status !== "confirmed" || (!staff && Date.now() > Date.parse(old.change_until)))
      return ruleError("cancel_closed", "This booking can't be changed any more.");
    return null;
  };

  checkInMockBooking = (bookingId) => {
    const b = db.bookings.find((x) => x.id === bookingId);
    if (!b) return null;
    if (b.status === "confirmed") {
      b.status = "checked_in";
      b.version += 1;
    }
    return { name: b.patient_display_name, service_id: b.service_id, slot_starts_at: b.starts_at };
  };
  remoteJoinMockService = (slug, serviceId) => {
    const f = facility(slug);
    const s = f?.services.find((x) => x.id === serviceId);
    if (!f || !s) return null;
    const known = Object.values(FACILITIES).find((x) => x.slug === f.slug);
    return {
      facility_id: known?.id ?? `facility-${f.slug}`,
      facility_name: f.name,
      service_id: s.id,
      service_name_i18n: s.name_i18n,
      remote_join: s.remote_join,
    };
  };

  return {
    reset: () => {
      db = seed();
      seedBookings();
      seedOffer();
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
            open_now: openNow(),
            service_code: s.code,
            service_name_i18n: s.name_i18n,
            accepts_insurance: insurer ? (insurer in f.insurers ? "yes" : "no") : "unknown",
            insurers: Object.keys(f.insurers).sort(),
            next_slot_at: s.bookable ? nextSlot(f.slug, s.id) : null,
            queue_load: f.load,
            ...liveQueue(f.load),
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
          email: "",
          website: "",
          photos: [],
          district: f.district,
          sector: f.sector,
          lat: f.lat,
          lng: f.lng,
          open_now: openNow(),
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
              queue_load: f.load,
              ...liveQueue(f.load),
              next_slot_at: nextSlot(f.slug, s.id),
            }),
          ),
          doctors: f.services.map((s) => ({
            membership_id: s.membership_id,
            name: s.doctor,
            days: s.weekdays,
            service_ids: [s.id],
            // upgrade 05 §3: the doctor's own public words (the demo doctor filled them in)
            ...(s.membership_id === SETUP_IDS.mKeza
              ? {
                  specialty: "General practice",
                  bio_i18n: {
                    en: "Family doctor with ten years in Kigali. I look after adults and children, and follow people with high blood pressure and diabetes.",
                    rw: "Muganga w'umuryango umaze imyaka icumi i Kigali. Nita ku bantu bakuru n'abana.",
                  },
                  languages: ["en", "fr", "rw"],
                }
              : { specialty: "", bio_i18n: {}, languages: [] }),
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
        const { key, done } = replay(request);
        if (done) return HttpResponse.json(strip(done), { status: 201 });
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
        if (key) db.keys.set(key, made.id);
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
      http.get(`${api}/patient/bookings/:id/calendar.ics`, async ({ request, params }) => {
        await context.settle();
        const ok = patientOnly(request);
        if ("error" in ok) return ok.error;
        const b = db.bookings.find((x) => x.id === params.id && x.account_patient);
        if (!b) return context.errorResponse(404, "not_found", "Not found.");
        return new HttpResponse(ics(b), {
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": `attachment; filename="${b.booking_code}.ics"`,
          },
        });
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
        // declining a disruption offer is never a late cancellation
        b.status = b.can_change || b.pending_change ? "cancelled" : "late_cancelled";
        settle(b, "cancelled");
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
        const refused = rescheduleRule(old, body.version, false);
        if (refused) return refused;
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
        settle(old, "rebooked_other", made.id);
        return HttpResponse.json(strip(made));
      }),

      // ---- staff
      http.get(`${api}/staff/bookings/`, async ({ request }) => {
        await context.settle();
        const ok = staffOnly(request, ["queue.operate", "schedule.view"]);
        if ("error" in ok) return ok.error;
        const url = new URL(request.url);
        const code = (url.searchParams.get("code") ?? "").trim().toUpperCase().replace(/\s/g, "");
        if (code) {
          const today = isoDate(kigaliDay(0));
          const found = db.bookings
            .filter((b) => b.facility_slug === FACILITIES.kigaliClinic.slug)
            .filter((b) => b.booking_code.toUpperCase() === code && b.status !== "superseded")
            .filter((b) => isoDate(new Date(b.starts_at)) >= today)
            .map(staffRow);
          return HttpResponse.json({ count: found.length, results: found });
        }
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
        const { key, done } = replay(request);
        if (done) return HttpResponse.json(staffRow(done), { status: 201 });
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
        if (key) db.keys.set(key, made.id);
        return HttpResponse.json(staffRow(made), { status: 201 });
      }),
      http.post(`${api}/staff/bookings/:id/reschedule/`, async ({ request, params }) => {
        await context.settle();
        const ok = staffOnly(request, ["queue.operate"]);
        if ("error" in ok) return ok.error;
        const body = (await context.readJson(request)) ?? {};
        const old = db.bookings.find((x) => x.id === params.id);
        if (!old) return context.errorResponse(404, "not_found", "Not found.");
        const refused = rescheduleRule(old, body.version, true);
        if (refused) return refused;
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
        settle(old, "rebooked_other", made.id);
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
      ...s5bHandlers(),
    ],
  };

  // ---- S5b handlers (contract sprint-05 §3 B10, B11, R7-R9): the same rules as the backend ----
  function s5bHandlers() {
    const detail = (d: Disruption, problems?: Record<string, DisruptionProblem>) => {
      d.counts = counts(d.id);
      return {
        disruption: d,
        items: db.items
          .filter((i) => i.disruption_id === d.id)
          .map(({ disruption_id: _d, ...i }) => i),
        ...(problems ? { problems } : {}),
      };
    };
    const clinicBookings = () =>
      db.bookings.filter((b) => b.facility_slug === FACILITIES.kigaliClinic.slug);
    const invalid = (field: string, message: string) =>
      context.errorResponse(400, "validation_error", "Some fields need attention.", {
        fields: { [field]: [message] },
      });
    const rule = (field: string, message: string) =>
      context.errorResponse(422, "business_rule_violation", message, {
        fields: { [field]: [message] },
      });
    const ownMembership = (email: string) => MEMBERSHIP_BY_EMAIL[email] ?? SETUP_IDS.mKeza;

    return [
      // B10: answer a disruption offer
      http.post(`${api}/patient/bookings/:id/respond/`, async ({ request, params }) => {
        await context.settle();
        const ok = patientOnly(request);
        if ("error" in ok) return ok.error;
        const body = (await context.readJson(request)) ?? {};
        const b = db.bookings.find((x) => x.id === params.id && x.account_patient);
        if (!b) return context.errorResponse(404, "not_found", "Not found.");
        if ((body.response === undefined) === (body.hold_id === undefined))
          return invalid("response", "Send either response or hold_id.");
        if (body.version !== undefined && body.version !== b.version)
          return context.errorResponse(409, "stale", "Someone else changed this booking.");
        if (b.status !== "confirmed" || !b.pending_change)
          return ruleError("no_offer", "There is no change to answer for this booking.");
        if (body.response === "accept") {
          settle(b, "accepted");
          b.version += 1;
          return HttpResponse.json(strip(b));
        }
        if (body.response === "cancel") {
          b.status = "cancelled"; // never a late cancellation
          b.can_change = false;
          b.version += 1;
          settle(b, "cancelled");
          return HttpResponse.json(strip(b));
        }
        b.status = "superseded";
        const made = confirm(
          str(body.hold_id),
          b.patient_id,
          b.patient_display_name,
          b.symptoms.map((x) => ({ code: x.code })),
          b.cost.insurer_code,
          b.source,
        );
        if (made instanceof Response) {
          b.status = "confirmed";
          return made;
        }
        made.account_patient = true;
        b.rescheduled_to_id = made.id;
        b.version += 1;
        settle(b, "rebooked_other", made.id);
        return HttpResponse.json(strip(made));
      }),

      // B11: private calendar feed (the URL is shown once)
      http.get(`${api}/patient/calendar-feed/`, async ({ request }) => {
        await context.settle();
        const ok = patientOnly(request);
        if ("error" in ok) return ok.error;
        return HttpResponse.json(db.feed);
      }),
      http.post(`${api}/patient/calendar-feed/`, async ({ request }) => {
        await context.settle();
        const ok = patientOnly(request);
        if ("error" in ok) return ok.error;
        const created_at = new Date().toISOString();
        db.feed = { is_active: true, created_at, last_accessed_at: null };
        const token = `mock${id().replace(/-/g, "")}`;
        return HttpResponse.json(
          { url: `https://api.medilink.rw/api/v1/calendar/${token}.ics`, created_at },
          { status: 201 },
        );
      }),
      http.delete(`${api}/patient/calendar-feed/`, async ({ request }) => {
        await context.settle();
        const ok = patientOnly(request);
        if ("error" in ok) return ok.error;
        db.feed = { is_active: false, created_at: null, last_accessed_at: null };
        return new HttpResponse(null, { status: 204 });
      }),

      // R7: disruptions (schedule.manage)
      http.get(`${api}/staff/disruptions/`, async ({ request }) => {
        await context.settle();
        const ok = staffOnly(request, ["schedule.manage"]);
        if ("error" in ok) return ok.error;
        const wanted = new URL(request.url).searchParams.get("status");
        const rows = db.disruptions
          .filter((d) => !wanted || d.status === wanted)
          .map((d) => ({ ...d, counts: counts(d.id) }))
          .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
        return HttpResponse.json({ count: rows.length, results: rows });
      }),
      http.post(`${api}/staff/disruptions/`, async ({ request }) => {
        await context.settle();
        const ok = staffOnly(request, ["schedule.manage"]);
        if ("error" in ok) return ok.error;
        const body = (await context.readJson(request)) ?? {};
        const kind = str(body.kind) as Disruption["kind"];
        const starts = str(body.starts_at);
        const ends = str(body.ends_at);
        const membership = body.membership_id ? str(body.membership_id) : null;
        const service = body.service_id ? str(body.service_id) : null;
        if (!["doctor_absent", "closure", "schedule_change"].includes(kind))
          return invalid("kind", "Choose a valid kind.");
        if (!str(body.reason).trim()) return invalid("reason", "This field is required.");
        if (!starts || !ends || new Date(starts) >= new Date(ends) || new Date(ends) <= new Date())
          return rule("ends_at", "The end must be after the start, and in the future.");
        if (kind === "doctor_absent" && !membership)
          return rule("membership_id", "Choose the doctor who is absent.");
        const d: Disruption = {
          id: id(),
          kind,
          membership_id: membership,
          doctor: membership ? (DOCTOR_NAMES[membership] ?? null) : null,
          service_id: service,
          service_name_i18n: null,
          starts_at: new Date(starts).toISOString(),
          ends_at: new Date(ends).toISOString(),
          reason: str(body.reason).trim().slice(0, 300),
          status: "open",
          created_by: ok.me.full_name,
          created_at: new Date().toISOString(),
          resolved_at: null,
          counts: counts(""),
          version: 1,
        };
        const busy = new Set(
          db.items.filter((i) => i.resolved_at === null).map((i) => i.booking_id),
        );
        const affected = clinicBookings().filter(
          (b) =>
            b.status === "confirmed" &&
            b.starts_at >= d.starts_at &&
            b.starts_at < d.ends_at &&
            (!service || b.service_id === service) &&
            (!membership || (b.membership_id ?? SETUP_IDS.mKeza) === membership) &&
            !busy.has(b.id),
        );
        // the open slots in scope close (nobody else can book them)
        for (const s of db.slots)
          if (
            s.slug === FACILITIES.kigaliClinic.slug &&
            s.starts_at >= d.starts_at &&
            s.starts_at < d.ends_at &&
            (!service || s.service_id === service) &&
            (!membership || s.membership_id === membership)
          )
            s.open_places = 0;
        db.disruptions.push(d);
        for (const b of affected) db.items.push(itemFor(b, d.id));
        refresh(d);
        return HttpResponse.json(detail(d), { status: 201 });
      }),
      http.get(`${api}/staff/disruptions/:id/`, async ({ request, params }) => {
        await context.settle();
        const ok = staffOnly(request, ["schedule.manage"]);
        if ("error" in ok) return ok.error;
        const d = db.disruptions.find((x) => x.id === params.id);
        return d
          ? HttpResponse.json(detail(d))
          : context.errorResponse(404, "not_found", "Not found.");
      }),
      http.post(`${api}/staff/disruptions/:id/apply/`, async ({ request, params }) => {
        await context.settle();
        const ok = staffOnly(request, ["schedule.manage"]);
        if ("error" in ok) return ok.error;
        const d = db.disruptions.find((x) => x.id === params.id);
        if (!d) return context.errorResponse(404, "not_found", "Not found.");
        if (d.status === "resolved")
          return ruleError("resolved", "This disruption is already resolved.");
        const body = (await context.readJson(request)) ?? {};
        type Step = { id: string; action: DisruptionAction; membership_id?: string | null };
        if (Array.isArray(body.items) === (body.all !== undefined))
          return invalid("items", "Send either items or all.");
        const steps: Step[] = Array.isArray(body.items)
          ? (body.items as Step[])
          : db.items
              .filter(
                (i) => i.disruption_id === d.id && i.action === null && i.resolved_at === null,
              )
              .map((i) => ({
                id: i.id,
                action: str(body.all) as DisruptionAction,
                membership_id: (body.membership_id as string | null | undefined) ?? null,
              }));
        const problems: Record<string, DisruptionProblem> = {};
        for (const step of steps) {
          const item = db.items.find((i) => i.id === step.id && i.disruption_id === d.id);
          if (!item) {
            problems[step.id] = "not_found";
            continue;
          }
          if (item.action || item.resolved_at) {
            problems[item.id] = "already_applied";
            continue;
          }
          const b = db.bookings.find((x) => x.id === item.booking_id);
          if (!b || b.status !== "confirmed") {
            problems[item.id] = "booking_closed";
            continue;
          }
          const now = new Date().toISOString();
          if (step.action === "cancel") {
            b.status = "cancelled";
            b.version += 1;
            Object.assign(item, {
              action: "cancel",
              applied_at: now,
              resolved_at: now,
              patient_response: "cancelled",
            });
            continue;
          }
          const current = b.membership_id ?? SETUP_IDS.mKeza;
          let target: { starts_at: string; membership_id: string; doctor: string } | undefined;
          if (step.action === "move_doctor") {
            // same time, same service, another doctor
            const other =
              step.membership_id ?? Object.keys(DOCTOR_NAMES).find((m) => m !== current);
            if (other && other !== current && other !== d.membership_id)
              target = {
                starts_at: b.starts_at,
                membership_id: other,
                doctor: DOCTOR_NAMES[other] ?? "",
              };
          } else {
            const after = d.ends_at > now ? d.ends_at : now;
            const slot = db.slots
              .filter(
                (s) =>
                  s.slug === b.facility_slug &&
                  s.service_id === b.service_id &&
                  s.open_places > 0 &&
                  s.starts_at >= after,
              )
              .sort((x, y) => x.starts_at.localeCompare(y.starts_at))[0];
            if (slot) {
              slot.open_places -= 1;
              slot.booked += 1;
              target = {
                starts_at: slot.starts_at,
                membership_id: slot.membership_id ?? current,
                doctor: slot.doctor ?? "",
              };
            }
          }
          if (!target) {
            problems[item.id] = "no_slot";
            continue;
          }
          moveBooking(b, item, d, step.action, target);
        }
        refresh(d);
        return HttpResponse.json(detail(d, problems));
      }),

      // R8: follow-up from a visit (queue.call)
      http.get(`${api}/staff/visits/:id/follow-up/`, async ({ request, params }) => {
        await context.settle();
        const ok = staffOnly(request, ["queue.call"]);
        if ("error" in ok) return ok.error;
        const fu = db.followUps.get(str(params.id));
        return fu ? HttpResponse.json(fu) : context.errorResponse(404, "not_found", "Not found.");
      }),
      http.post(`${api}/staff/visits/:id/follow-up/`, async ({ request, params }) => {
        await context.settle();
        const ok = staffOnly(request, ["queue.call"]);
        if ("error" in ok) return ok.error;
        const visitId = str(params.id);
        const body = (await context.readJson(request)) ?? {};
        const days = Number(body.in_days);
        if (!Number.isInteger(days) || days < 1 || days > 365)
          return invalid("in_days", "Ensure this value is between 1 and 365.");
        if (!["booking", "reminder"].includes(str(body.mode)))
          return invalid("mode", "Choose booking or reminder.");
        if (db.followUps.has(visitId))
          return context.errorResponse(
            409,
            "follow_up_exists",
            "A follow-up is already set for this visit.",
          );
        const due = kigaliDay(days);
        const fu: FollowUp = {
          id: id(),
          visit_id: visitId,
          due_on: isoDate(due),
          mode: body.mode as FollowUp["mode"],
          status: "due",
          booking: null,
          created_at: new Date().toISOString(),
          version: 1,
        };
        if (fu.mode === "booking") {
          // the first open slot on or after the day, with the same doctor when possible
          const open = db.slots
            .filter(
              (s) =>
                s.slug === FACILITIES.kigaliClinic.slug &&
                s.service_id === SETUP_IDS.sGen &&
                s.open_places > 0 &&
                s.starts_at >= due.toISOString(),
            )
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
          const slot = open.find((s) => s.membership_id === ownMembership(ok.me.email)) ?? open[0];
          if (slot) {
            slot.open_places -= 1;
            slot.booked += 1;
            const made = makeBooking(
              slot,
              `fu-${visitId}`,
              "Follow Up",
              "confirmed",
              [],
              null,
              "follow_up",
            );
            db.bookings.push(made);
            fu.booking = staffRow(made);
            fu.status = "booked";
          } else fu.status = "no_slot";
        }
        db.followUps.set(visitId, fu);
        return HttpResponse.json(fu, { status: 201 });
      }),

      // R9: reception calendar, and the doctor's own
      http.get(`${api}/staff/calendar/`, async ({ request }) => {
        await context.settle();
        const ok = staffOnly(request, ["schedule.view", "queue.call"]);
        if ("error" in ok) return ok.error;
        const url = new URL(request.url);
        const view = url.searchParams.get("view") ?? "week";
        if (view !== "day" && view !== "week") return invalid("view", "Use day or week.");
        const granted = ok.me.permissions as readonly string[];
        const onlyOwn = !granted.includes("queue.operate") && !granted.includes("schedule.manage");
        const from = url.searchParams.get("from") ?? isoDate(kigaliDay(0));
        const start = new Date(`${from}T00:00:00+02:00`);
        const serviceId = url.searchParams.get("service_id");
        const own = ownMembership(ok.me.email);
        const membershipId = onlyOwn ? own : url.searchParams.get("membership_id");
        const clinic = facility(FACILITIES.kigaliClinic.slug)!;
        const services = clinic.services.filter((x) => !serviceId || x.id === serviceId);
        const doctors = Object.keys(DOCTOR_NAMES).filter(
          (m) => !membershipId || m === membershipId,
        );
        const days = Array.from({ length: view === "day" ? 1 : 7 }, (_, i) => {
          const midnight = new Date(start.getTime() + i * 86_400_000);
          const blocks = [];
          for (const sv of services) {
            if (!sv.weekdays.includes(weekday(midnight))) continue;
            for (const m of doctors) {
              const startsAt = new Date(midnight.getTime() + sv.from * 3600_000).toISOString();
              const endsAt = new Date(midnight.getTime() + sv.to * 3600_000).toISOString();
              const bookings = clinicBookings()
                .filter(
                  (b) =>
                    ["confirmed", "checked_in", "no_show"].includes(b.status) &&
                    b.service_id === sv.id &&
                    (b.membership_id ?? SETUP_IDS.mKeza) === m &&
                    b.starts_at >= startsAt &&
                    b.starts_at < endsAt,
                )
                .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
                .map(staffRow);
              blocks.push({
                service_id: sv.id,
                membership_id: m,
                doctor: DOCTOR_NAMES[m] ?? null,
                starts_at: startsAt,
                ends_at: endsAt,
                capacity: ((sv.to - sv.from) * 60) / sv.minutes,
                booked: bookings.filter((b) => b.status !== "no_show").length,
                bookings,
              });
            }
          }
          return { date: isoDate(midnight), blocks, other_bookings: [] };
        });
        return HttpResponse.json({
          view,
          from_date: from,
          to_date: days.at(-1)?.date ?? from,
          only_own: onlyOwn,
          services: clinic.services.map((x) => ({ id: x.id, name_i18n: x.name_i18n })),
          doctors: Object.entries(DOCTOR_NAMES)
            .filter(([m]) => !onlyOwn || m === own)
            .map(([m, name]) => ({ id: m, name })),
          days,
          disruptions: db.disruptions.map((d) => ({
            id: d.id,
            kind: d.kind,
            membership_id: d.membership_id,
            service_id: d.service_id,
            starts_at: d.starts_at,
            ends_at: d.ends_at,
            status: d.status,
          })),
        });
      }),
    ];
  }
};

/**
 * Booked check-in for the S4 check-in mock (contract sprint-05 R6): marks the booking checked in
 * and returns who and which service, or null when the booking is unknown.
 */
export let checkInMockBooking: (
  bookingId: string,
) => { name: string; service_id: string; slot_starts_at: string } | null = () => null;

/** Remote join (B8) for the S4 queue mock: the facility and service, or null when unknown. */
export let remoteJoinMockService: (
  slug: string,
  serviceId: string,
) => {
  facility_id: string;
  facility_name: string;
  service_id: string;
  service_name_i18n: Partial<Record<"rw" | "en" | "fr", string>>;
  remote_join: boolean;
} | null = () => null;

const icsTime = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** B5 `calendar.ics`: one VEVENT in UTC; no patient data beyond the booking itself. */
function ics(b: Booking): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MediLink Rwanda//Booking//EN",
    "BEGIN:VEVENT",
    `UID:${b.id}@medilink.rw`,
    `DTSTAMP:${icsTime(new Date().toISOString())}`,
    `DTSTART:${icsTime(b.starts_at)}`,
    ...(b.ends_at ? [`DTEND:${icsTime(b.ends_at)}`] : []),
    `SUMMARY:${b.service_name_i18n.en ?? "Visit"} - ${b.facility_name}`,
    `DESCRIPTION:Booking code ${b.booking_code}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
