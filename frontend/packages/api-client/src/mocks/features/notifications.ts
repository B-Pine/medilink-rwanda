import { http, HttpResponse, ws } from "msw";

import type {
  Announcement,
  AnnouncementAudience,
  AppNotification,
  DeliveryLogEntry,
  NotificationAudience,
  NotificationPriority,
  NotificationSocketMessage,
  NotificationTemplate,
  PatientNotificationPreferences,
  PushSubscriptionRow,
  StaffNotificationPreferences,
} from "../../features/notifications";
import type { LanguageCode, PatientMe, StaffMe } from "../../types";
import { extendMockRoleGrants, FACILITIES, PATIENTS, STAFF_USERS } from "../data";
import type { FeatureMockFactory } from "../features";
import type { MockContext } from "../handlers";
import { CHILD_PATIENT_ID, PARENT_PATIENT_ID } from "./patients-store";
import { SETUP_FACILITY } from "./setup";
import { conflict, fieldError, id, now, page, platformAdmin, s1, str } from "./s1-common";

/**
 * S9 mocks (contract sprint-09 §6.3): inboxes seeded per mock user (a new-device notice, a
 * platform announcement and per-facility notices for staff; a new-device notice, a Kigali Clinic
 * announcement and a notice about Keza for the patient), preferences, push subscriptions,
 * announcements, templates and the delivery log. Same rules as the backend: CSRF, sessions,
 * `announcements.manage`, error envelopes, version conflicts and the push host allowlist.
 * Both notification sockets are served with `ws.link`; `emitMockNotification()` adds an item and
 * sends `notification.created` (tests, and new items the mocks create).
 */

// Mirrors backend `notifications.permissions.ROLE_GRANTS`.
extendMockRoleGrants({ facility_admin: ["announcements.manage"] });

/** A VAPID public key shaped like a real one (65 bytes, base64url). Mock data only. */
export const MOCK_VAPID_PUBLIC_KEY =
  "BMockVapidKeyMockVapidKeyMockVapidKeyMockVapidKeyMockVapidKeyMockVapidKeyMockVapidKeyMo";
/** An endpoint on the default allowlist, for the fake push client in mock mode. */
export const MOCK_PUSH_ENDPOINT_BASE = "https://fcm.googleapis.com/fcm/send/mock-";

const ALLOWED_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "*.push.apple.com",
  "*.notify.windows.com",
];

/** Backend `conf.endpoint_host()`: https, no user info, port 443, a DNS host on the allowlist. */
export function allowedPushHost(endpoint: string): string | null {
  if (endpoint.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (url.port && url.port !== "443") return null;
  const host = url.hostname.toLowerCase();
  if (!host || /^\d+(\.\d+){3}$/.test(host) || host.startsWith("[")) return null;
  return ALLOWED_HOSTS.some((entry) =>
    entry.startsWith("*.") ? host.endsWith(entry.slice(1)) : host === entry,
  )
    ? host
    : null;
}

const MSG = {
  notAvailable: {
    en: "Push notifications are not available.",
    fr: "Les notifications push ne sont pas disponibles.",
    rw: "Kumenyesha kuri telefoni ntibirashoboka.",
  },
  hostNotAllowed: {
    en: "This push service is not allowed.",
    fr: "Ce service push n'est pas autorisé.",
    rw: "Iyi serivisi yo kumenyesha ntiyemewe.",
  },
  invalidKey: { en: "Invalid key.", fr: "Clé invalide.", rw: "Urufunguzo ntirukwiye." },
  criticalLocked: {
    en: "Critical alerts stay on while you have a ticket in a queue.",
    fr: "Les alertes critiques restent activées tant que vous avez un ticket dans une file.",
    rw: "Ubutumwa bwihutirwa buguma bwaka igihe ufite itike ku murongo.",
  },
  unknownChannel: {
    en: "Unknown channel.",
    fr: "Canal inconnu.",
    rw: "Uburyo butazwi.",
  },
  oneLanguage: {
    en: "Write the announcement in at least one language.",
    fr: "Rédigez l'annonce dans au moins une langue.",
    rw: "Andika itangazo nibura mu rurimi rumwe.",
  },
  tooLong: {
    en: "Too long.",
    fr: "Trop long.",
    rw: "Ni birebire cyane.",
  },
  clinical: {
    en: "Clinical words are not allowed in announcements.",
    fr: "Les termes cliniques ne sont pas autorisés dans les annonces.",
    rw: "Amagambo y'ubuvuzi ntiyemewe mu matangazo.",
  },
  links: {
    en: "Links are not allowed in announcements.",
    fr: "Les liens ne sont pas autorisés dans les annonces.",
    rw: "Imiyoboro ntiyemewe mu matangazo.",
  },
  audience: {
    en: "This audience is not available here.",
    fr: "Ce public n'est pas disponible ici.",
    rw: "Aba bantu ntibashobora gutoranywa hano.",
  },
  rangeRequired: {
    en: "Choose the visit dates.",
    fr: "Choisissez les dates de visite.",
    rw: "Hitamo amatariki y'uruzinduko.",
  },
  rangeOrder: {
    en: "The end date is before the start.",
    fr: "La date de fin est avant le début.",
    rw: "Itariki y'iherezo iri mbere y'intangiriro.",
  },
  facilities: {
    en: "Choose between 1 and 200 facilities.",
    fr: "Choisissez entre 1 et 200 établissements.",
    rw: "Hitamo ibigo kuva kuri 1 kugeza kuri 200.",
  },
  notDraft: {
    en: "Only drafts can be edited.",
    fr: "Seuls les brouillons peuvent être modifiés.",
    rw: "Imishinga yonyine ni yo ishobora guhindurwa.",
  },
  published: {
    en: "This announcement was already published.",
    fr: "Cette annonce a déjà été publiée.",
    rw: "Iri tangazo ryamaze gutangazwa.",
  },
  notPublished: {
    en: "Only published announcements can be withdrawn.",
    fr: "Seules les annonces publiées peuvent être retirées.",
    rw: "Amatangazo yatangajwe yonyine ni yo ashobora gukurwaho.",
  },
  daily: {
    en: "At most 10 announcements a day.",
    fr: "Au plus 10 annonces par jour.",
    rw: "Amatangazo ntarenga 10 ku munsi.",
  },
  placeholder: {
    en: "Unknown placeholder.",
    fr: "Variable inconnue.",
    rw: "Ikimenyetso kitazwi.",
  },
  newer: {
    en: "A newer version exists.",
    fr: "Une version plus récente existe.",
    rw: "Hari verisiyo nshya.",
  },
  active: {
    en: "This version is already active.",
    fr: "Cette version est déjà active.",
    rw: "Iyi verisiyo isanzwe ikoreshwa.",
  },
  invalidChoice: {
    en: "Not a valid choice.",
    fr: "Choix invalide.",
    rw: "Ihitamo ritemewe.",
  },
} as const;
type MsgKey = keyof typeof MSG;
const msg = (key: MsgKey, lang: LanguageCode) => MSG[key][lang];

/** Backend content policy (sample of the denylist) and the "no URLs" rule. */
const CLINICAL = [
  "diagnosis",
  "hiv",
  "aids",
  "tuberculosis",
  "pregnancy",
  "mental health",
  "diagnostic",
  "vih",
  "sida",
  "grossesse",
  "igituntu",
  "kanseri",
];
const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const hasClinicalTerm = (text: string) =>
  CLINICAL.some((term) => new RegExp(`\\b${term}\\b`).test(fold(text)));
export const hasUrl = (text: string) =>
  /(https?:\/\/|www\.)|\b[a-z0-9-]+\.(com|org|net|rw|io|info|biz|xyz)\b/i.test(text);

type Texts = Record<LanguageCode, string>;
const T = (en: string, fr: string, rw: string): Texts => ({ en, fr, rw });

interface MockNotification extends AppNotification {
  recipient_user_id: string;
  audience: NotificationAudience;
  announcement_id: string | null;
}

interface MockSub extends PushSubscriptionRow {
  user_id: string;
  endpoint: string;
  revoked: boolean;
}

type StaffPrefs = StaffNotificationPreferences;
interface PatientPrefs extends Omit<PatientNotificationPreferences, "dependents"> {
  dependentsOff: Set<string>;
}

type MockAnnouncement = Announcement;

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const daysAgo = (d: number) => hoursAgo(d * 24);
const ACCOUNT_EMAIL = PATIENTS[0]!.me.email;

function seedAnnouncements(): MockAnnouncement[] {
  const base = (
    facilityId: string | null,
    extra: Partial<MockAnnouncement>,
    createdBy = "Mutesi Diane",
  ): MockAnnouncement => ({
    id: id(),
    facility_id: facilityId,
    audience: facilityId ? "patients_in_range" : "all_facilities",
    target_facility_ids: null,
    range_starts_on: null,
    range_ends_on: null,
    priority: "routine",
    title_i18n: {},
    body_i18n: {},
    starts_at: null,
    ends_at: null,
    status: "draft",
    recipient_count: null,
    created_by: { id: id(), full_name: createdBy },
    published_at: null,
    withdrawn_at: null,
    version: 1,
    created_at: daysAgo(2),
    ...extra,
  });
  const facilityRows = [SETUP_FACILITY.id, FACILITIES.remera.id].flatMap((facility) => [
    base(facility, {
      status: "published",
      priority: "important",
      range_starts_on: daysAgo(-2).slice(0, 10),
      range_ends_on: daysAgo(-2).slice(0, 10),
      title_i18n: {
        rw: "Serivisi y'abana ifunze kuwa gatanu nyuma ya saa sita",
        en: "Pediatrics closed Friday afternoon",
        fr: "Pédiatrie fermée vendredi après-midi",
      },
      body_i18n: {
        rw: "Abafite gahunda bazahabwa indi tariki.",
        en: "Patients with a visit that afternoon will be offered a new time.",
        fr: "Les patients ayant une visite cet après-midi recevront un nouvel horaire.",
      },
      recipient_count: 14,
      published_at: daysAgo(1),
      version: 2,
    }),
    base(facility, {
      audience: "display",
      title_i18n: { en: "New opening hours from Monday" },
      body_i18n: { en: "Reception opens at 07:00 from next Monday." },
      created_at: hoursAgo(5),
    }),
  ]);
  return [
    ...facilityRows,
    base(
      null,
      {
        status: "published",
        title_i18n: {
          rw: "Igihe cyo kuvugurura sisitemu",
          en: "Planned maintenance on Sunday night",
          fr: "Maintenance prévue dimanche soir",
        },
        body_i18n: {
          rw: "MediLink ntizaboneka ku cyumweru kuva saa 23:00 kugeza saa 01:00.",
          en: "MediLink will be unavailable on Sunday from 23:00 to 01:00.",
          fr: "MediLink sera indisponible dimanche de 23:00 à 01:00.",
        },
        recipient_count: 6,
        published_at: daysAgo(1),
        version: 2,
      },
      "Ingabire Grace",
    ),
  ];
}

const TEMPLATE_TEXT: Record<LanguageCode, { subject: string; body: string }> = {
  en: {
    subject: "New sign-in to your MediLink account",
    body: "We noticed a sign-in from $device_label on $date at $time. If this wasn't you, change your password.",
  },
  fr: {
    subject: "Nouvelle connexion à votre compte MediLink",
    body: "Nous avons remarqué une connexion depuis $device_label le $date à $time. Si ce n'était pas vous, changez votre mot de passe.",
  },
  rw: {
    subject: "Hari uwinjiye muri konti yawe ya MediLink",
    body: "Twabonye kwinjira biturutse kuri $device_label ku wa $date saa $time. Niba atari wowe, hindura ijambo ry'ibanga.",
  },
};

function seedTemplates(): NotificationTemplate[] {
  const rows: NotificationTemplate[] = [];
  for (const channel of ["in_app", "email"] as const) {
    for (const language of ["rw", "en", "fr"] as const) {
      rows.push({
        id: id(),
        code: "account.login.new_device",
        channel,
        language,
        variant: "self",
        template_version: 1,
        subject: TEMPLATE_TEXT[language].subject,
        body: TEMPLATE_TEXT[language].body,
        placeholders: ["device_label", "date", "time"],
        allowed_placeholders: ["date", "device_label", "time"],
        limits: channel === "email" ? { subject: 120, body: 4000 } : { subject: 120, body: 500 },
        is_active: true,
        source: "seed",
        created_by: null,
        created_at: daysAgo(30),
      });
    }
  }
  return rows;
}

function seed() {
  return {
    inboxes: new Map<string, MockNotification[]>(),
    staffPrefs: new Map<string, StaffPrefs>(),
    patientPrefs: new Map<string, PatientPrefs>(),
    subs: [] as MockSub[],
    subscribeCalls: new Map<string, number[]>(),
    announcements: seedAnnouncements(),
    templates: seedTemplates(),
    pushEnabled: true,
    criticalLocked: false,
  };
}

let db = seed();
type Db = typeof db;

/** Messages sent on the sockets (tests may inspect them). */
export const mockSocketLog: { audience: NotificationAudience; message: unknown }[] = [];
let broadcast: (audience: NotificationAudience, message: NotificationSocketMessage) => void = () =>
  undefined;
let currentUser: (
  audience: NotificationAudience,
) => { id: string; lang: LanguageCode } | null = () => null;

const inboxKey = (userId: string, audience: NotificationAudience) => `${audience}:${userId}`;

function makeNotification(
  userId: string,
  audience: NotificationAudience,
  lang: LanguageCode,
  input: {
    event_type: string;
    priority: NotificationPriority;
    title: Texts | string;
    body: Texts | string;
    facility?: { id: string; name: string } | null;
    patient_id?: string | null;
    announcement_id?: string | null;
    created_at?: string;
    read?: boolean;
  },
): MockNotification {
  const nid = id();
  const text = (value: Texts | string) => (typeof value === "string" ? value : value[lang]);
  return {
    id: nid,
    recipient_user_id: userId,
    audience,
    event_type: input.event_type,
    priority: input.priority,
    language: lang,
    title: text(input.title),
    body: text(input.body),
    action_path: `/notifications/${nid}`,
    patient_id: input.patient_id ?? null,
    facility: input.facility ?? null,
    data: input.announcement_id ? { announcement_id: input.announcement_id } : {},
    announcement_id: input.announcement_id ?? null,
    is_read: Boolean(input.read),
    read_at: input.read ? hoursAgo(1) : null,
    is_withdrawn: false,
    created_at: input.created_at ?? now(),
  };
}

const NEW_DEVICE = {
  title: T(
    "New sign-in to your MediLink account",
    "Nouvelle connexion à votre compte MediLink",
    "Hari uwinjiye muri konti yawe ya MediLink",
  ),
  body: T(
    "We noticed a sign-in from Chrome on Android. If this wasn't you, change your password.",
    "Nous avons remarqué une connexion depuis Chrome sur Android. Si ce n'était pas vous, changez votre mot de passe.",
    "Twabonye kwinjira biturutse kuri Chrome kuri Android. Niba atari wowe, hindura ijambo ry'ibanga.",
  ),
};

function seedStaffInbox(user: StaffMe): MockNotification[] {
  const lang = user.preferred_language;
  const rows = [
    makeNotification(user.id, "staff", lang, {
      event_type: "account.login.new_device",
      priority: "important",
      ...NEW_DEVICE,
      created_at: hoursAgo(2),
    }),
  ];
  if (user.memberships.length) {
    const platform = db.announcements.find((a) => a.facility_id === null);
    rows.push(
      makeNotification(user.id, "staff", lang, {
        event_type: "announcement.platform.published",
        priority: "routine",
        title: T(
          platform?.title_i18n.en ?? "",
          platform?.title_i18n.fr ?? "",
          platform?.title_i18n.rw ?? "",
        ),
        body: T(
          platform?.body_i18n.en ?? "",
          platform?.body_i18n.fr ?? "",
          platform?.body_i18n.rw ?? "",
        ),
        announcement_id: platform?.id ?? null,
        created_at: daysAgo(1),
      }),
    );
  }
  for (const membership of user.memberships) {
    const name = membership.facility.name;
    rows.push(
      makeNotification(user.id, "staff", lang, {
        event_type: "account.role.changed",
        priority: "important",
        facility: { id: membership.facility.id, name },
        title: T("Your roles changed", "Vos rôles ont changé", "Inshingano zawe zahindutse"),
        body: T(
          `Your roles at ${name} were changed by a facility admin.`,
          `Vos rôles à ${name} ont été modifiés par un administrateur.`,
          `Inshingano zawe kuri ${name} zahinduwe n'umuyobozi w'ikigo.`,
        ),
        created_at: hoursAgo(26),
      }),
    );
  }
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function seedPatientInbox(user: PatientMe): MockNotification[] {
  const lang = user.preferred_language;
  const rows = [
    makeNotification(user.id, "patient", lang, {
      event_type: "account.login.new_device",
      priority: "important",
      ...NEW_DEVICE,
      created_at: hoursAgo(2),
    }),
    makeNotification(user.id, "patient", lang, {
      event_type: "announcement.facility.published",
      priority: "important",
      facility: { id: FACILITIES.kigaliClinic.id, name: FACILITIES.kigaliClinic.name },
      title: T(
        "Kigali Clinic: Pediatrics closed Friday afternoon",
        "Kigali Clinic : pédiatrie fermée vendredi après-midi",
        "Kigali Clinic: serivisi y'abana ifunze kuwa gatanu nyuma ya saa sita",
      ),
      body: T(
        "If you have a visit that afternoon, we will offer you a new time.",
        "Si vous avez une visite cet après-midi, un nouvel horaire vous sera proposé.",
        "Niba ufite gahunda icyo gihe, uzahabwa ikindi gihe.",
      ),
      created_at: daysAgo(1),
    }),
  ];
  if (user.email === ACCOUNT_EMAIL) {
    rows.push(
      makeNotification(user.id, "patient", lang, {
        event_type: "announcement.facility.published",
        priority: "routine",
        patient_id: CHILD_PATIENT_ID,
        facility: { id: FACILITIES.kigaliClinic.id, name: FACILITIES.kigaliClinic.name },
        title: T(
          "Kigali Clinic: vaccination day on Saturday",
          "Kigali Clinic : journée de vaccination samedi",
          "Kigali Clinic: umunsi w'inkingo kuwa gatandatu",
        ),
        body: T(
          "The children's service opens on Saturday morning.",
          "Le service des enfants ouvre samedi matin.",
          "Serivisi y'abana izakora kuwa gatandatu mu gitondo.",
        ),
        created_at: daysAgo(3),
        read: true,
      }),
    );
  }
  return rows;
}

function inbox(audience: NotificationAudience, user: StaffMe | PatientMe): MockNotification[] {
  const key = inboxKey(user.id, audience);
  let rows = db.inboxes.get(key);
  if (!rows) {
    rows =
      audience === "staff" ? seedStaffInbox(user as StaffMe) : seedPatientInbox(user as PatientMe);
    db.inboxes.set(key, rows);
  }
  return rows;
}

/** The staff inbox scope: facility-less items and the active facility's. */
const inScope = (me: StaffMe | PatientMe, audience: NotificationAudience) => {
  const active = audience === "staff" ? (me as StaffMe).active_facility_id : null;
  return (n: MockNotification) =>
    audience === "patient" || n.facility === null || n.facility.id === active;
};

const publicRow = (n: MockNotification): AppNotification => {
  const { recipient_user_id: _r, audience: _a, announcement_id: _x, ...row } = n;
  return row;
};

export interface EmitMockNotificationInput {
  audience: NotificationAudience;
  title?: string;
  body?: string;
  priority?: NotificationPriority;
  event_type?: string;
  facility?: { id: string; name: string } | null;
  patient_id?: string | null;
  /** Default: the signed-in user of that audience. */
  userId?: string;
}

/**
 * Add an item to a mock inbox and send `notification.created` on its socket (tests, live demos).
 * Returns the new notification, or null when nobody of that audience is signed in.
 */
export function emitMockNotification(input: EmitMockNotificationInput): AppNotification | null {
  const user = input.userId
    ? { id: input.userId, lang: "en" as LanguageCode }
    : currentUser(input.audience);
  if (!user) return null;
  const key = inboxKey(user.id, input.audience);
  const rows = db.inboxes.get(key) ?? [];
  db.inboxes.set(key, rows);
  const row = makeNotification(user.id, input.audience, user.lang, {
    event_type: input.event_type ?? "system.test",
    priority: input.priority ?? "routine",
    title: input.title ?? "Test notification",
    body: input.body ?? "This is a test notification from MediLink.",
    facility: input.facility ?? null,
    patient_id: input.patient_id ?? null,
  });
  rows.unshift(row);
  broadcast(input.audience, {
    type: "notification.created",
    data: {
      id: row.id,
      priority: row.priority,
      patient_id: row.patient_id,
      ...(input.audience === "staff" ? { facility_id: row.facility?.id ?? null } : {}),
    },
  });
  return publicRow(row);
}

/** Tests: push without VAPID keys (`is_enabled: false`). */
export function setMockPushEnabled(enabled: boolean): void {
  db.pushEnabled = enabled;
}

/** Tests: the S4 "active ticket" hook answering true (critical alerts locked). */
export function setMockCriticalLocked(locked: boolean): void {
  db.criticalLocked = locked;
}

function defaultStaffPrefs(me: StaffMe): StaffPrefs {
  return {
    language: me.preferred_language,
    sound_enabled: false,
    approvals_digest: "immediate",
    version: 0,
  };
}

function defaultPatientPrefs(me: PatientMe): PatientPrefs {
  return {
    language: me.preferred_language,
    available_channels: ["web_push", "email"],
    channels: {
      critical: ["web_push", "email"],
      important: ["web_push", "email"],
      routine: ["web_push", "email"],
    },
    quiet_hours: { is_enabled: true, start: "21:00", end: "06:00" },
    reminder_offsets_minutes: [1440, 120],
    is_critical_locked: false,
    version: 0,
    dependentsOff: new Set(),
  };
}

function dependentsOf(me: PatientMe) {
  if (me.email !== ACCOUNT_EMAIL) return [];
  return [
    { patient_id: CHILD_PATIENT_ID, display_name: "Keza", relationship: "guardian" },
    { patient_id: PARENT_PATIENT_ID, display_name: "Mukarugwiza", relationship: "delegate" },
  ];
}

function patientPrefsView(db: Db, me: PatientMe): PatientNotificationPreferences {
  const prefs = db.patientPrefs.get(me.id) ?? defaultPatientPrefs(me);
  const { dependentsOff, ...rest } = prefs;
  return {
    ...rest,
    is_critical_locked: db.criticalLocked,
    dependents: dependentsOf(me).map((d) => ({
      ...d,
      receive_alerts: !dependentsOff.has(d.patient_id),
    })),
  };
}

const b64urlBytes = (value: string): number | null => {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return null;
  const clean = value.replace(/=+$/, "");
  return Math.floor((clean.length * 3) / 4);
};

function deviceLabel(request: Request): string {
  const ua = request.headers.get("User-Agent") ?? "";
  const browser =
    [
      ["Edg/", "Edge"],
      ["Firefox/", "Firefox"],
      ["Chrome/", "Chrome"],
      ["Safari/", "Safari"],
    ].find(([token]) => ua.includes(token!))?.[1] ?? "A browser";
  const platform =
    [
      ["Android", "Android"],
      ["iPhone", "iPhone"],
      ["Windows", "Windows"],
      ["Mac OS", "macOS"],
      ["Linux", "Linux"],
    ].find(([token]) => ua.includes(token!))?.[1] ?? "a device";
  return `${browser} on ${platform}`;
}

type Lang = LanguageCode;

function validateAnnouncement(
  context: MockContext,
  lang: Lang,
  merged: Omit<Announcement, "id" | "status" | "created_by" | "version" | "created_at">,
  platform: boolean,
): Response | null {
  const allowed: AnnouncementAudience[] = platform
    ? ["all_facilities", "selected_facilities"]
    : ["patients_in_range", "display"];
  if (!allowed.includes(merged.audience))
    return fieldError(context, lang, { audience: msg("audience", lang) });
  if (merged.audience === "patients_in_range" && (!merged.range_starts_on || !merged.range_ends_on))
    return fieldError(context, lang, { range_starts_on: msg("rangeRequired", lang) });
  if (
    merged.range_starts_on &&
    merged.range_ends_on &&
    merged.range_ends_on < merged.range_starts_on
  )
    return fieldError(context, lang, { range_ends_on: msg("rangeOrder", lang) });
  if (merged.starts_at && merged.ends_at && merged.ends_at <= merged.starts_at)
    return fieldError(context, lang, { ends_at: msg("rangeOrder", lang) });
  if (merged.audience === "selected_facilities") {
    const ids = merged.target_facility_ids ?? [];
    if (ids.length < 1 || ids.length > 200)
      return fieldError(context, lang, { target_facility_ids: msg("facilities", lang) });
    const known = new Set([...Object.values(FACILITIES).map((f) => f.id), SETUP_FACILITY.id]);
    if (ids.some((x) => !known.has(x)))
      return context.errorResponse(404, "not_found", context.message("notFound", lang));
  }
  const titles = Object.entries(merged.title_i18n).filter(([, v]) => v?.trim());
  const bodies = Object.entries(merged.body_i18n).filter(([, v]) => v?.trim());
  if (!titles.length || !bodies.length)
    return fieldError(context, lang, { title_i18n: msg("oneLanguage", lang) });
  for (const [field, list, max] of [
    ["title_i18n", titles, 120],
    ["body_i18n", bodies, 1000],
  ] as const) {
    for (const [code, text] of list) {
      if ((text ?? "").trim().length > max)
        return fieldError(context, lang, { [`${field}.${code}`]: msg("tooLong", lang) });
    }
  }
  for (const [field, list] of [
    ["title_i18n", titles],
    ["body_i18n", bodies],
  ] as const) {
    for (const [code, text] of list) {
      if (hasClinicalTerm(text ?? ""))
        return fieldError(context, lang, { [`${field}.${code}`]: msg("clinical", lang) });
      if (hasUrl(text ?? ""))
        return fieldError(context, lang, { [`${field}.${code}`]: msg("links", lang) });
    }
  }
  return null;
}

const asTexts = (value: unknown): Partial<Texts> => {
  if (!value || typeof value !== "object") return {};
  const out: Partial<Texts> = {};
  for (const code of ["rw", "en", "fr"] as const) {
    const text = str((value as Record<string, unknown>)[code]).trim();
    if (text) out[code] = text;
  }
  return out;
};
const dateOrNull = (value: unknown) => (typeof value === "string" && value ? value : null);

export const notificationsMocks: FeatureMockFactory = (context) => {
  const { api } = context;
  const staffLink = ws.link("*/ws/v1/staff/notifications"); // MSW drops the trailing slash before matching;
  const patientLink = ws.link("*/ws/v1/patient/notifications");
  const links = { staff: staffLink, patient: patientLink };
  type Client = { send: (data: string) => void };
  const clients: Record<NotificationAudience, Set<Client>> = {
    staff: new Set(),
    patient: new Set(),
  };

  broadcast = (audience, message) => {
    const payload = { ...message, sent_at: now() };
    mockSocketLog.push({ audience, message: payload });
    for (const client of clients[audience]) client.send(JSON.stringify(payload));
  };
  currentUser = (audience) => {
    if (audience === "staff") {
      const session = context.staffSession();
      return session ? { id: session.me.id, lang: session.me.preferred_language } : null;
    }
    const result = context.authenticatedPatient("en");
    return "error" in result ? null : { id: result.me.id, lang: result.me.preferred_language };
  };

  const notFound = (lang: Lang) =>
    context.errorResponse(404, "not_found", context.message("notFound", lang));
  const denied = (lang: Lang) =>
    context.errorResponse(403, "permission_denied", s1("permissionDenied", lang));

  type Who = { me: StaffMe | PatientMe; lang: Lang };
  function who(request: Request, audience: NotificationAudience, write: boolean) {
    const lang = context.languageFrom(request);
    if (write) {
      const csrf = context.csrfFailure(request, lang);
      if (csrf) return { error: csrf };
    }
    const result =
      audience === "staff" ? context.authenticatedStaff(lang) : context.authenticatedPatient(lang);
    if ("error" in result) return { error: result.error };
    return { me: result.me, lang } satisfies Who;
  }

  function socketServer(audience: NotificationAudience) {
    return links[audience].addEventListener("connection", ({ client }) => {
      if (!currentUser(audience)) {
        client.close(4401, "not_authenticated");
        return;
      }
      clients[audience].add(client);
      client.addEventListener("close", () => clients[audience].delete(client));
      const window: number[] = [];
      client.addEventListener("message", (event) => {
        const at = Date.now();
        window.push(at);
        while (window.length && at - window[0]! > 60_000) window.shift();
        if (window.length > 30) {
          client.close(4429, "rate_limited");
          return;
        }
        try {
          const data = JSON.parse(typeof event.data === "string" ? event.data : "") as {
            type?: string;
          };
          if (data.type === "ping")
            client.send(JSON.stringify({ type: "pong", data: {}, sent_at: now() }));
        } catch {
          // not JSON: ignored like the server
        }
      });
    });
  }

  function inboxHandlers(audience: NotificationAudience) {
    const base = `${api}/${audience}/notifications`;
    return [
      http.get(`${base}/`, async ({ request }) => {
        await context.settle();
        const w = who(request, audience, false);
        if ("error" in w) return w.error;
        const url = new URL(request.url);
        let rows = inbox(audience, w.me).filter(inScope(w.me, audience));
        const isRead = url.searchParams.get("is_read");
        if (isRead === "true" || isRead === "false")
          rows = rows.filter((n) => n.is_read === (isRead === "true"));
        const patientId = url.searchParams.get("patient_id");
        if (patientId) {
          const linked =
            audience === "patient" &&
            ((w.me as PatientMe).profiles.some((p) => p.patient_id === patientId) ||
              dependentsOf(w.me as PatientMe).some((d) => d.patient_id === patientId));
          if (!linked) return notFound(w.lang);
          rows = rows.filter((n) => n.patient_id === patientId);
        }
        rows = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
        return HttpResponse.json(page(rows.map(publicRow), url));
      }),
      http.get(`${base}/unread-count/`, async ({ request }) => {
        await context.settle();
        const w = who(request, audience, false);
        if ("error" in w) return w.error;
        const all = inbox(audience, w.me);
        const unread = all.filter(inScope(w.me, audience)).filter((n) => !n.is_read).length;
        if (audience === "patient") return HttpResponse.json({ unread });
        const active = (w.me as StaffMe).active_facility_id;
        const others = new Map<string, number>();
        for (const n of all) {
          if (!n.is_read && n.facility && n.facility.id !== active)
            others.set(n.facility.id, (others.get(n.facility.id) ?? 0) + 1);
        }
        return HttpResponse.json({
          unread,
          other_facilities: [...others.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([facility_id, count]) => ({ facility_id, unread: count })),
        });
      }),
      http.post(`${base}/read-all/`, async ({ request }) => {
        await context.settle();
        const w = who(request, audience, true);
        if ("error" in w) return w.error;
        const body = await context.readJson(request);
        const before = str(body.before);
        if (before && Number.isNaN(Date.parse(before)))
          return fieldError(context, w.lang, { before: context.message("validation", w.lang) });
        const at = now();
        let marked = 0;
        for (const n of inbox(audience, w.me).filter(inScope(w.me, audience))) {
          if (n.is_read || (before && n.created_at > new Date(before).toISOString())) continue;
          n.is_read = true;
          n.read_at = at;
          marked += 1;
        }
        if (marked) broadcast(audience, { type: "notification.read", data: { all: true } });
        return HttpResponse.json({ marked });
      }),
      http.get(`${base}/:id/`, async ({ request, params }) => {
        await context.settle();
        const w = who(request, audience, false);
        if ("error" in w) return w.error;
        const row = inbox(audience, w.me)
          .filter(inScope(w.me, audience))
          .find((n) => n.id === params.id);
        return row ? HttpResponse.json(publicRow(row)) : notFound(w.lang);
      }),
      http.post(`${base}/:id/read/`, async ({ request, params }) => {
        await context.settle();
        const w = who(request, audience, true);
        if ("error" in w) return w.error;
        const row = inbox(audience, w.me)
          .filter(inScope(w.me, audience))
          .find((n) => n.id === params.id);
        if (!row) return notFound(w.lang);
        if (!row.is_read) {
          row.is_read = true;
          row.read_at = now();
          broadcast(audience, { type: "notification.read", data: { ids: [row.id] } });
        }
        return HttpResponse.json(publicRow(row));
      }),
    ];
  }

  function announcementHandlers(platform: boolean) {
    const base = `${api}/${platform ? "platform" : "staff"}/announcements`;
    function guard(request: Request, write: boolean) {
      const lang = context.languageFrom(request);
      if (write) {
        const csrf = context.csrfFailure(request, lang);
        if (csrf) return { error: csrf };
      }
      if (platform) {
        const result = platformAdmin(context, lang);
        if ("error" in result) return { error: result.error };
        return { me: result.me, lang, facility: null as string | null };
      }
      const result = context.authenticatedStaff(lang);
      if ("error" in result) return { error: result.error };
      if (!result.me.permissions.includes("announcements.manage")) return { error: denied(lang) };
      return { me: result.me, lang, facility: result.me.active_facility_id };
    }
    const scope = (facility: string | null) =>
      db.announcements.filter((a) => a.facility_id === facility);
    const find = (facility: string | null, value: unknown) =>
      scope(facility).find((a) => a.id === value);

    function merge(row: MockAnnouncement | null, body: Record<string, unknown>) {
      const pick = <K extends keyof MockAnnouncement>(key: K, parse: (v: unknown) => unknown) =>
        (key in body ? parse(body[key]) : row ? row[key] : null) as MockAnnouncement[K];
      return {
        facility_id: row?.facility_id ?? null,
        audience: pick("audience", (v) => str(v)) ?? (platform ? "all_facilities" : ""),
        target_facility_ids: pick("target_facility_ids", (v) =>
          Array.isArray(v) ? v.map(str) : null,
        ),
        range_starts_on: pick("range_starts_on", dateOrNull),
        range_ends_on: pick("range_ends_on", dateOrNull),
        priority: pick("priority", (v) => str(v) || "routine") ?? "routine",
        title_i18n: pick("title_i18n", asTexts) ?? {},
        body_i18n: pick("body_i18n", asTexts) ?? {},
        starts_at: pick("starts_at", dateOrNull),
        ends_at: pick("ends_at", dateOrNull),
        recipient_count: row?.recipient_count ?? null,
        published_at: row?.published_at ?? null,
        withdrawn_at: row?.withdrawn_at ?? null,
      };
    }

    return [
      http.get(`${base}/`, async ({ request }) => {
        await context.settle();
        const g = guard(request, false);
        if ("error" in g) return g.error;
        const url = new URL(request.url);
        const status = url.searchParams.get("status");
        const rows = scope(g.facility)
          .filter((a) => !status || a.status === status)
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
        return HttpResponse.json(page(rows, url));
      }),
      http.post(`${base}/`, async ({ request }) => {
        await context.settle();
        const g = guard(request, true);
        if ("error" in g) return g.error;
        const body = await context.readJson(request);
        if (!["routine", "important", undefined].includes(body.priority as string | undefined))
          return fieldError(context, g.lang, { priority: msg("invalidChoice", g.lang) });
        const merged = merge(null, body);
        merged.facility_id = g.facility;
        if (merged.audience !== "selected_facilities") merged.target_facility_ids = null;
        const invalid = validateAnnouncement(context, g.lang, merged, platform);
        if (invalid) return invalid;
        const row: MockAnnouncement = {
          ...merged,
          id: id(),
          status: "draft",
          created_by: { id: g.me.id, full_name: g.me.full_name },
          version: 1,
          created_at: now(),
        };
        db.announcements.push(row);
        return HttpResponse.json(row, { status: 201 });
      }),
      http.get(`${base}/:id/`, async ({ request, params }) => {
        await context.settle();
        const g = guard(request, false);
        if ("error" in g) return g.error;
        const row = find(g.facility, params.id);
        return row ? HttpResponse.json(row) : notFound(g.lang);
      }),
      http.patch(`${base}/:id/`, async ({ request, params }) => {
        await context.settle();
        const g = guard(request, true);
        if ("error" in g) return g.error;
        const row = find(g.facility, params.id);
        if (!row) return notFound(g.lang);
        const body = await context.readJson(request);
        if (typeof body.version !== "number")
          return fieldError(context, g.lang, { version: context.message("required", g.lang) });
        if (body.version !== row.version) return conflict(context, g.lang);
        if (row.status !== "draft")
          return context.errorResponse(422, "business_rule_violation", msg("notDraft", g.lang));
        const merged = merge(row, body);
        if (merged.audience !== "selected_facilities") merged.target_facility_ids = null;
        const invalid = validateAnnouncement(context, g.lang, merged, platform);
        if (invalid) return invalid;
        Object.assign(row, merged, { version: row.version + 1 });
        return HttpResponse.json(row);
      }),
      http.post(`${base}/:id/publish/`, async ({ request, params }) => {
        await context.settle();
        const g = guard(request, true);
        if ("error" in g) return g.error;
        const row = find(g.facility, params.id);
        if (!row) return notFound(g.lang);
        if (row.status !== "draft")
          return context.errorResponse(409, "conflict", msg("published", g.lang));
        const invalid = validateAnnouncement(context, g.lang, row, platform);
        if (invalid) return invalid;
        if (!platform) {
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          const today = scope(g.facility).filter(
            (a) => a.published_at && new Date(a.published_at) >= start,
          ).length;
          if (today >= 10)
            return context.errorResponse(429, "rate_limited", msg("daily", g.lang), {
              headers: { "Retry-After": "3600" },
            });
        }
        row.status = "published";
        row.published_at = now();
        row.version += 1;
        if (platform) {
          // Fan-out: one in-app item per active member of the audience's facilities.
          const targets = new Set(
            row.audience === "selected_facilities"
              ? (row.target_facility_ids ?? [])
              : [...Object.values(FACILITIES).map((f) => f.id), SETUP_FACILITY.id],
          );
          const members = STAFF_USERS.filter((u) =>
            u.memberships.some((m) => targets.has(m.facility.id)),
          );
          for (const member of members) {
            const key = inboxKey(member.id, "staff");
            if (!db.inboxes.has(key)) continue; // seeded (with this item) on first read
            const lang = member.preferred_language;
            const pickText = (texts: Partial<Texts>) =>
              texts[lang] ?? texts.rw ?? texts.en ?? texts.fr ?? "";
            const item = makeNotification(member.id, "staff", lang, {
              event_type: "announcement.platform.published",
              priority: row.priority,
              title: pickText(row.title_i18n),
              body: pickText(row.body_i18n),
              announcement_id: row.id,
            });
            db.inboxes.get(key)!.unshift(item);
            broadcast("staff", {
              type: "notification.created",
              data: { id: item.id, priority: item.priority, patient_id: null, facility_id: null },
            });
          }
          row.recipient_count = members.length;
        } else {
          // The patients_in_range resolver arrives with S5; until then it reaches no one.
          row.recipient_count = 0;
        }
        return HttpResponse.json(row);
      }),
      http.post(`${base}/:id/withdraw/`, async ({ request, params }) => {
        await context.settle();
        const g = guard(request, true);
        if ("error" in g) return g.error;
        const row = find(g.facility, params.id);
        if (!row) return notFound(g.lang);
        if (row.status !== "published")
          return context.errorResponse(422, "business_rule_violation", msg("notPublished", g.lang));
        row.status = "withdrawn";
        row.withdrawn_at = now();
        row.version += 1;
        for (const [key, rows] of db.inboxes) {
          for (const n of rows) {
            if (n.announcement_id !== row.id) continue;
            n.is_withdrawn = true;
            broadcast(key.startsWith("staff:") ? "staff" : "patient", {
              type: "notification.updated",
              data: { id: n.id },
            });
          }
        }
        return HttpResponse.json(row);
      }),
    ];
  }

  function logEntries(rows: MockNotification[]): DeliveryLogEntry[] {
    return rows.map((n) => ({
      notification_id: n.id,
      event_type: n.event_type,
      priority: n.priority,
      recipient_user_id: n.recipient_user_id,
      patient_id: n.patient_id,
      template: { code: n.event_type, version: 1, language: n.language },
      title: n.title,
      created_at: n.created_at,
      read_at: n.read_at,
      attempts: [
        {
          channel: "in_app",
          attempt_no: 1,
          is_fallback: false,
          status: n.is_read ? "read" : "sent",
          failure_reason: null,
          queued_at: n.created_at,
          sent_at: n.created_at,
        },
        {
          channel: "email",
          attempt_no: 1,
          is_fallback: false,
          status: n.priority === "routine" ? "skipped" : "sent",
          failure_reason: n.priority === "routine" ? "preference_off" : null,
          queued_at: n.created_at,
          sent_at: n.priority === "routine" ? null : n.created_at,
        },
      ],
    }));
  }
  const allRows = () => [...db.inboxes.values()].flat();

  return {
    reset() {
      db = seed();
      mockSocketLog.length = 0;
    },
    handlers: [
      socketServer("staff"),
      socketServer("patient"),

      http.get(`${api}/public/web-push-key/`, async () => {
        await context.settle();
        return HttpResponse.json({
          public_key: db.pushEnabled ? MOCK_VAPID_PUBLIC_KEY : null,
          is_enabled: db.pushEnabled,
        });
      }),

      ...inboxHandlers("patient"),
      ...inboxHandlers("staff"),

      // ---- preferences
      http.get(`${api}/patient/notification-preferences/`, async ({ request }) => {
        await context.settle();
        const w = who(request, "patient", false);
        if ("error" in w) return w.error;
        return HttpResponse.json(patientPrefsView(db, w.me as PatientMe));
      }),
      http.patch(`${api}/patient/notification-preferences/`, async ({ request }) => {
        await context.settle();
        const w = who(request, "patient", true);
        if ("error" in w) return w.error;
        const me = w.me as PatientMe;
        const body = await context.readJson(request);
        if (typeof body.version !== "number")
          return fieldError(context, w.lang, { version: context.message("required", w.lang) });
        const current = db.patientPrefs.get(me.id) ?? defaultPatientPrefs(me);
        if (body.version !== current.version) return conflict(context, w.lang);
        const next: PatientPrefs = {
          ...current,
          channels: { ...current.channels },
          quiet_hours: { ...current.quiet_hours },
          dependentsOff: new Set(current.dependentsOff),
        };
        if ("language" in body) {
          if (!["rw", "en", "fr"].includes(str(body.language)))
            return fieldError(context, w.lang, { language: msg("invalidChoice", w.lang) });
          next.language = str(body.language) as LanguageCode;
        }
        if (body.channels && typeof body.channels === "object") {
          const channels = body.channels as Record<string, unknown>;
          for (const level of ["critical", "important", "routine"] as const) {
            const values = Array.isArray(channels[level]) ? channels[level].map(str) : [];
            if (values.some((v) => !current.available_channels.includes(v)))
              return fieldError(context, w.lang, {
                [`channels.${level}`]: msg("unknownChannel", w.lang),
              });
            next.channels[level] = [...new Set(values)];
          }
          if (!next.channels.critical.length && db.criticalLocked)
            return context.errorResponse(
              422,
              "business_rule_violation",
              msg("criticalLocked", w.lang),
              { fields: { "channels.critical": [msg("criticalLocked", w.lang)] } },
            );
        }
        if (body.quiet_hours && typeof body.quiet_hours === "object") {
          const q = body.quiet_hours as Record<string, unknown>;
          const time = /^([01]\d|2[0-3]):[0-5]\d$/;
          for (const key of ["start", "end"] as const) {
            if (!time.test(str(q[key])))
              return fieldError(context, w.lang, {
                [`quiet_hours.${key}`]: context.message("validation", w.lang),
              });
          }
          next.quiet_hours = {
            is_enabled: Boolean(q.is_enabled),
            start: str(q.start),
            end: str(q.end),
          };
        }
        if (Array.isArray(body.dependents)) {
          const linked = new Set(dependentsOf(me).map((d) => d.patient_id));
          for (const item of body.dependents as Record<string, unknown>[]) {
            const pid = str(item.patient_id);
            if (!linked.has(pid)) return notFound(w.lang);
            if (item.receive_alerts) next.dependentsOff.delete(pid);
            else next.dependentsOff.add(pid);
          }
        }
        next.version = current.version + 1;
        db.patientPrefs.set(me.id, next);
        return HttpResponse.json(patientPrefsView(db, me));
      }),
      http.get(`${api}/staff/notification-preferences/`, async ({ request }) => {
        await context.settle();
        const w = who(request, "staff", false);
        if ("error" in w) return w.error;
        const me = w.me as StaffMe;
        return HttpResponse.json(db.staffPrefs.get(me.id) ?? defaultStaffPrefs(me));
      }),
      http.patch(`${api}/staff/notification-preferences/`, async ({ request }) => {
        await context.settle();
        const w = who(request, "staff", true);
        if ("error" in w) return w.error;
        const me = w.me as StaffMe;
        const body = await context.readJson(request);
        if (typeof body.version !== "number")
          return fieldError(context, w.lang, { version: context.message("required", w.lang) });
        const current = db.staffPrefs.get(me.id) ?? defaultStaffPrefs(me);
        if (body.version !== current.version) return conflict(context, w.lang);
        const next = { ...current };
        if ("approvals_digest" in body) {
          if (!["immediate", "daily"].includes(str(body.approvals_digest)))
            return fieldError(context, w.lang, { approvals_digest: msg("invalidChoice", w.lang) });
          next.approvals_digest = str(body.approvals_digest) as "immediate" | "daily";
        }
        if ("language" in body) {
          if (!["rw", "en", "fr"].includes(str(body.language)))
            return fieldError(context, w.lang, { language: msg("invalidChoice", w.lang) });
          next.language = str(body.language) as LanguageCode;
        }
        if ("sound_enabled" in body) next.sound_enabled = Boolean(body.sound_enabled);
        next.version = current.version + 1;
        db.staffPrefs.set(me.id, next);
        return HttpResponse.json(next);
      }),

      // ---- push subscriptions
      http.get(`${api}/patient/push-subscriptions/`, async ({ request }) => {
        await context.settle();
        const w = who(request, "patient", false);
        if ("error" in w) return w.error;
        return HttpResponse.json(
          db.subs
            .filter((s) => s.user_id === w.me.id && !s.revoked)
            .map(({ id: sid, label, endpoint_host, created_at, last_success_at }) => ({
              id: sid,
              label,
              endpoint_host,
              created_at,
              last_success_at,
            })),
        );
      }),
      http.post(`${api}/patient/push-subscriptions/`, async ({ request }) => {
        await context.settle();
        const w = who(request, "patient", true);
        if ("error" in w) return w.error;
        if (!db.pushEnabled)
          return context.errorResponse(422, "business_rule_violation", msg("notAvailable", w.lang));
        const calls = (db.subscribeCalls.get(w.me.id) ?? []).filter(
          (t) => Date.now() - t < 3_600_000,
        );
        if (calls.length >= 20)
          return context.errorResponse(
            429,
            "rate_limited",
            context.message("rateLimited", w.lang, { seconds: 3600 }),
            { headers: { "Retry-After": "3600" } },
          );
        db.subscribeCalls.set(w.me.id, [...calls, Date.now()]);
        const body = await context.readJson(request);
        const endpoint = str(body.endpoint);
        const keys = (body.keys ?? {}) as Record<string, unknown>;
        if (!endpoint)
          return fieldError(context, w.lang, { endpoint: context.message("required", w.lang) });
        const host = allowedPushHost(endpoint);
        if (!host) return fieldError(context, w.lang, { endpoint: msg("hostNotAllowed", w.lang) });
        if (b64urlBytes(str(keys.p256dh)) !== 65)
          return fieldError(context, w.lang, { "keys.p256dh": msg("invalidKey", w.lang) });
        if (b64urlBytes(str(keys.auth)) !== 16)
          return fieldError(context, w.lang, { "keys.auth": msg("invalidKey", w.lang) });
        const existing = db.subs.find((s) => s.endpoint === endpoint && !s.revoked);
        if (existing && existing.user_id === w.me.id) {
          return HttpResponse.json(
            {
              id: existing.id,
              label: existing.label,
              endpoint_host: existing.endpoint_host,
              created_at: existing.created_at,
              last_success_at: existing.last_success_at,
            },
            { status: 200 },
          );
        }
        if (existing) existing.revoked = true; // replaced: the phone changed hands
        const row: MockSub = {
          id: id(),
          user_id: w.me.id,
          endpoint,
          endpoint_host: host,
          label: deviceLabel(request),
          created_at: now(),
          last_success_at: null,
          revoked: false,
        };
        db.subs.push(row);
        const active = db.subs.filter((s) => s.user_id === w.me.id && !s.revoked);
        for (const old of active.slice(0, Math.max(0, active.length - 10))) old.revoked = true;
        const { user_id: _u, endpoint: _e, revoked: _r, ...out } = row;
        return HttpResponse.json(out, { status: 201 });
      }),
      http.delete(`${api}/patient/push-subscriptions/:id/`, async ({ request, params }) => {
        await context.settle();
        const w = who(request, "patient", true);
        if ("error" in w) return w.error;
        const row = db.subs.find((s) => s.id === params.id && s.user_id === w.me.id && !s.revoked);
        if (!row) return notFound(w.lang);
        row.revoked = true;
        return new HttpResponse(null, { status: 204 });
      }),

      ...announcementHandlers(false),
      ...announcementHandlers(true),

      // ---- delivery log and stats
      http.get(`${api}/staff/notification-deliveries/`, async ({ request }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const result = context.authenticatedStaff(lang);
        if ("error" in result) return result.error;
        if (!result.me.permissions.includes("audit.view")) return denied(lang);
        const url = new URL(request.url);
        const facility = result.me.active_facility_id;
        const rows = allRows().filter((n) => n.facility?.id === facility);
        return HttpResponse.json(page(logEntries(rows), url));
      }),
      http.get(`${api}/platform/notification-deliveries/stats/`, async ({ request }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const result = platformAdmin(context, lang);
        if ("error" in result) return result.error;
        const entries = logEntries(allRows());
        const by = new Map<string, Record<string, number>>();
        for (const attempt of entries.flatMap((e) => e.attempts)) {
          const c = by.get(attempt.channel) ?? {
            sent: 0,
            failed: 0,
            skipped: 0,
            held: 0,
            cancelled: 0,
          };
          const key = ["sent", "delivered", "read"].includes(attempt.status)
            ? "sent"
            : attempt.status;
          if (key in c) c[key]! += 1;
          by.set(attempt.channel, c);
        }
        return HttpResponse.json({
          since: hoursAgo(24),
          by_channel: [...by.entries()].map(([channel, c]) => ({ channel, ...c })),
          failure_reasons: [{ reason: "preference_off", count: by.get("email")?.skipped ?? 0 }],
          push_opt_in: {
            patient_accounts: PATIENTS.length,
            with_active_subscription: new Set(
              db.subs.filter((s) => !s.revoked).map((s) => s.user_id),
            ).size,
          },
        });
      }),
      http.get(`${api}/platform/notification-deliveries/`, async ({ request }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const result = platformAdmin(context, lang);
        if ("error" in result) return result.error;
        const url = new URL(request.url);
        const recipient = url.searchParams.get("recipient_user_id");
        const rows = allRows().filter((n) => !recipient || n.recipient_user_id === recipient);
        return HttpResponse.json(page(logEntries(rows), url));
      }),

      // ---- templates
      http.get(`${api}/platform/notification-templates/`, async ({ request }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const result = platformAdmin(context, lang);
        if ("error" in result) return result.error;
        const url = new URL(request.url);
        const active = url.searchParams.get("is_active") ?? "true";
        const rows = db.templates.filter(
          (t) =>
            (["code", "channel", "language"] as const).every(
              (k) => !url.searchParams.get(k) || t[k] === url.searchParams.get(k),
            ) &&
            (active !== "true" && active !== "false" ? true : t.is_active === (active === "true")),
        );
        return HttpResponse.json(page(rows, url));
      }),
      http.get(`${api}/platform/notification-templates/:id/`, async ({ request, params }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const result = platformAdmin(context, lang);
        if ("error" in result) return result.error;
        const row = db.templates.find((t) => t.id === params.id);
        return row ? HttpResponse.json(row) : notFound(lang);
      }),
      http.post(
        `${api}/platform/notification-templates/:id/revise/`,
        async ({ request, params }) => {
          await context.settle();
          const lang = context.languageFrom(request);
          const csrf = context.csrfFailure(request, lang);
          if (csrf) return csrf;
          const result = platformAdmin(context, lang);
          if ("error" in result) return result.error;
          const row = db.templates.find((t) => t.id === params.id);
          if (!row) return notFound(lang);
          const family = db.templates.filter(
            (t) =>
              t.code === row.code &&
              t.channel === row.channel &&
              t.language === row.language &&
              t.variant === row.variant,
          );
          const body = await context.readJson(request);
          const latest = Math.max(...family.map((t) => t.template_version));
          if (Number(body.based_on_version) !== latest)
            return context.errorResponse(409, "conflict", msg("newer", lang));
          const subject = str(body.subject);
          const text = str(body.body);
          if (!subject)
            return fieldError(context, lang, { subject: context.message("required", lang) });
          if (!text) return fieldError(context, lang, { body: context.message("required", lang) });
          const used = [...`${subject} ${text}`.matchAll(/\$\{?([a-z_]+)\}?/g)].map((m) => m[1]!);
          if (used.some((p) => !row.allowed_placeholders.includes(p)))
            return fieldError(context, lang, { body: msg("placeholder", lang) });
          if (hasClinicalTerm(subject) || hasClinicalTerm(text))
            return fieldError(context, lang, { body: msg("clinical", lang) });
          if (
            (row.limits.subject && subject.length > row.limits.subject) ||
            (row.limits.body && text.length > row.limits.body)
          )
            return fieldError(context, lang, { body: msg("tooLong", lang) });
          for (const t of family) t.is_active = false;
          const next: NotificationTemplate = {
            ...row,
            id: id(),
            template_version: latest + 1,
            subject,
            body: text,
            placeholders: [...new Set(used)],
            is_active: true,
            source: "platform",
            created_by: { id: result.me.id, full_name: result.me.full_name },
            created_at: now(),
          };
          db.templates.push(next);
          return HttpResponse.json(next, { status: 201 });
        },
      ),
      http.post(
        `${api}/platform/notification-templates/:id/activate/`,
        async ({ request, params }) => {
          await context.settle();
          const lang = context.languageFrom(request);
          const csrf = context.csrfFailure(request, lang);
          if (csrf) return csrf;
          const result = platformAdmin(context, lang);
          if ("error" in result) return result.error;
          const row = db.templates.find((t) => t.id === params.id);
          if (!row) return notFound(lang);
          if (row.is_active) return context.errorResponse(409, "conflict", msg("active", lang));
          for (const t of db.templates) {
            if (
              t.code === row.code &&
              t.channel === row.channel &&
              t.language === row.language &&
              t.variant === row.variant
            )
              t.is_active = false;
          }
          row.is_active = true;
          return HttpResponse.json(row);
        },
      ),
    ],
  };
};
