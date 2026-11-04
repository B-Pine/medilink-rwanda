import {
  Buildings,
  CalendarBlank,
  ChartBar,
  ClockCounterClockwise,
  GearSix,
  House,
  IdentificationBadge,
  ListNumbers,
  Pill,
  QrCode,
  Receipt,
  SealCheck,
  UserList,
  type Icon,
} from "@phosphor-icons/react";
import type { PermissionCode, StaffMe } from "@medilink/api-client";

// ---- Feature imports: ONLY between the sprint's markers (shared-file protocol) ----
// [S1 imports]
import { ChartPieSlice, Database, FileText, ToggleRight } from "@phosphor-icons/react";
// [/S1 imports]
// [S3 imports]
import { GitMerge } from "@phosphor-icons/react";
// [/S3 imports]
// [S9 imports]
import { Megaphone, MegaphoneSimple } from "@phosphor-icons/react";
// [/S9 imports]
// [S2 imports]
import { CalendarDots, ClipboardText } from "@phosphor-icons/react";
// [/S2 imports]
// [S10 imports]
import { Article, EnvelopeSimple, Headset, Lifebuoy } from "@phosphor-icons/react";
// [/S10 imports]
// [S4 imports]
import { ArrowsDownUp, Stethoscope } from "@phosphor-icons/react";
// [/S4 imports]
// [S5 imports]
import { CalendarX } from "@phosphor-icons/react";
// [/S5 imports]
// [S6 imports]
import {
  CalendarCheck,
  ChartLineUp,
  ChatCircleDots,
  Flask,
  Notebook,
  Notepad,
  Signature,
} from "@phosphor-icons/react";
// [/S6 imports]
// [S7 imports]
import { Package, Storefront } from "@phosphor-icons/react";
// [/S7 imports]
// [S11 imports]
import { Fingerprint, ShieldCheck, Siren, UsersThree } from "@phosphor-icons/react";
// [/S11 imports]

/** Sections of the Sprint 0 shell (labels in `shell.nav.<key>`). Features use their own keys. */
export type CoreNavKey =
  | "today"
  | "queue"
  | "calendar"
  | "patients"
  | "pharmacy"
  | "payments"
  | "approvals"
  | "reports"
  | "staff"
  | "settings"
  | "audit"
  | "platformFacilities";

export interface NavItem {
  /** Core section key, or a feature key (label from `labelKey`). */
  key: CoreNavKey | (string & {});
  path: string;
  icon: Icon;
  group: "facility" | "platform";
  /** Translation key of the label; default `shell.nav.<key>` (features use their namespace). */
  labelKey?: string;
  /** Shown only when this returns true (no greyed-out items, design 04 §2). */
  visible: (me: StaffMe) => boolean;
}

const hasAny =
  (...permissions: PermissionCode[]) =>
  (me: StaffMe) =>
    permissions.some((permission) => me.permissions.includes(permission));

const hasFacility = (me: StaffMe) => me.active_facility_id !== null;

/** Sidebar entries, filtered by the permissions of the active facility (analysis 02 §3). */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: "today", path: "/today", icon: House, group: "facility", visible: () => true },
  {
    key: "queue",
    path: "/queue",
    icon: ListNumbers,
    group: "facility",
    visible: hasAny("queue.operate", "clinical.write"),
  },
  {
    key: "calendar",
    path: "/calendar",
    icon: CalendarBlank,
    group: "facility",
    visible: hasAny("queue.operate", "clinical.write"),
  },
  {
    key: "patients",
    path: "/patients",
    icon: UserList,
    group: "facility",
    visible: hasAny("queue.operate", "clinical.write"),
  },
  {
    key: "pharmacy",
    path: "/pharmacy",
    icon: Pill,
    group: "facility",
    visible: hasAny("pharmacy.dispense"),
  },
  {
    key: "payments",
    path: "/payments",
    icon: Receipt,
    group: "facility",
    visible: hasAny("billing.record_payment"),
  },
  {
    key: "approvals",
    path: "/approvals",
    icon: SealCheck,
    group: "facility",
    visible: hasAny("billing.approve"),
  },
  {
    key: "reports",
    path: "/reports",
    icon: ChartBar,
    group: "facility",
    visible: hasAny("reports.view"),
  },
  {
    key: "staff",
    path: "/staff",
    icon: IdentificationBadge,
    group: "facility",
    visible: hasAny("staff.manage"),
  },
  {
    key: "settings",
    path: "/settings",
    icon: GearSix,
    group: "facility",
    visible: hasAny("facility.configure"),
  },
  {
    key: "audit",
    path: "/audit",
    icon: ClockCounterClockwise,
    group: "facility",
    visible: hasAny("audit.view"),
  },
  {
    key: "platformFacilities",
    path: "/platform/facilities",
    icon: Buildings,
    group: "platform",
    visible: (me) => me.is_platform_admin,
  },
  // Shared-file protocol: new entries ONLY between the sprint's markers.
  // [S1]
  {
    key: "platformOverview",
    path: "/platform",
    icon: ChartPieSlice,
    group: "platform",
    labelKey: "platform.nav.platformOverview",
    visible: (me: StaffMe) => me.is_platform_admin,
  },
  {
    key: "platformApplications",
    path: "/platform/applications",
    icon: FileText,
    group: "platform",
    labelKey: "platform.nav.platformApplications",
    visible: (me: StaffMe) => me.is_platform_admin,
  },
  {
    key: "platformMasterData",
    path: "/platform/master-data",
    icon: Database,
    group: "platform",
    labelKey: "platform.nav.platformMasterData",
    visible: (me: StaffMe) => me.is_platform_admin,
  },
  {
    key: "platformFeatureFlags",
    path: "/platform/feature-flags",
    icon: ToggleRight,
    group: "platform",
    labelKey: "platform.nav.platformFeatureFlags",
    visible: (me: StaffMe) => me.is_platform_admin,
  },
  // [/S1]
  // [S3]
  {
    key: "patientMerges",
    path: "/patients/merge-requests",
    icon: GitMerge,
    group: "facility",
    labelKey: "patients.nav.merges",
    visible: hasAny("patients.merge_request", "patients.merge_approve"),
  },
  {
    key: "platformMerges",
    path: "/platform/merge-requests",
    icon: GitMerge,
    group: "platform",
    labelKey: "patients.nav.platformMerges",
    visible: (me: StaffMe) => me.is_platform_admin,
  },
  // [/S3]
  // [S9]
  {
    key: "announcements",
    path: "/announcements",
    icon: Megaphone,
    group: "facility",
    labelKey: "notifications.nav.announcements",
    visible: hasAny("announcements.manage"),
  },
  {
    key: "platformAnnouncements",
    path: "/platform/announcements",
    icon: MegaphoneSimple,
    group: "platform",
    labelKey: "notifications.nav.platformAnnouncements",
    visible: (me: StaffMe) => me.is_platform_admin,
  },
  // [/S9]
  // [S2]
  {
    key: "setup",
    path: "/setup",
    icon: ClipboardText,
    group: "facility",
    labelKey: "setup.nav.setup",
    visible: hasAny("facility.configure"),
  },
  {
    key: "doctorSchedules",
    path: "/settings/schedules",
    icon: CalendarDots,
    group: "facility",
    labelKey: "setup.nav.schedules",
    visible: (me: StaffMe) =>
      me.permissions.includes("schedule.view") && !me.permissions.includes("facility.configure"),
  },
  {
    key: "mySchedule",
    path: "/schedule/mine",
    icon: CalendarDots,
    group: "facility",
    labelKey: "setup.nav.mySchedule",
    visible: hasAny("leave.request"),
  },
  // [/S2]
  // [S10]
  {
    key: "help",
    path: "/support",
    icon: Lifebuoy,
    group: "facility",
    labelKey: "help.nav.help",
    // every member of the active facility (S10-D6)
    visible: (me: StaffMe) => Boolean(me.active_facility_id),
  },
  {
    key: "platformSupport",
    path: "/platform/support",
    icon: Headset,
    group: "platform",
    labelKey: "help.nav.platformSupport",
    visible: (me: StaffMe) => me.is_platform_admin,
  },
  {
    // upgrade 11 §13: messages from the public Contact page
    key: "platformContact",
    path: "/platform/contact-messages",
    icon: EnvelopeSimple,
    group: "platform",
    labelKey: "help.nav.platformContact",
    visible: (me: StaffMe) => me.is_platform_admin,
  },
  {
    key: "platformHelpArticles",
    path: "/platform/help-articles",
    icon: Article,
    group: "platform",
    labelKey: "help.nav.platformHelpArticles",
    visible: (me: StaffMe) => me.is_platform_admin,
  },
  // [/S10]
  // [S4]
  // upgrade 06 §2 (#200): the triage nurse's station
  {
    key: "triage",
    path: "/triage",
    icon: Stethoscope,
    group: "facility",
    labelKey: "queue.nav.triage",
    visible: hasAny("triage.operate"),
  },
  {
    key: "queueReorders",
    path: "/queue/reorders",
    icon: ArrowsDownUp,
    group: "facility",
    labelKey: "queue.nav.reorders",
    visible: hasAny("facility.configure"),
  },
  // [/S4]
  // [S5]
  {
    key: "disruptions",
    path: "/disruptions",
    icon: CalendarX,
    group: "facility",
    labelKey: "bookings.nav.disruptions",
    visible: hasAny("schedule.manage"),
  },
  // [/S5]
  // [S6]
  {
    key: "clinicalConsultation",
    path: "/clinical/consultation",
    icon: Notepad,
    group: "facility",
    labelKey: "clinical.nav.consultation",
    visible: hasAny("clinical.write"),
  },
  {
    key: "clinicalUnsigned",
    path: "/clinical/unsigned",
    icon: Signature,
    group: "facility",
    labelKey: "clinical.nav.unsigned",
    visible: hasAny("clinical.unsigned_list"),
  },
  {
    key: "clinicalResults",
    path: "/clinical/results",
    icon: Flask,
    group: "facility",
    labelKey: "clinical.nav.results",
    visible: hasAny("clinical.write"),
  },
  {
    key: "clinicalQuestions",
    path: "/clinical/questions",
    icon: ChatCircleDots,
    group: "facility",
    labelKey: "clinical.nav.questions",
    visible: hasAny("prescription.issue"),
  },
  {
    key: "clinicalFollowUps",
    path: "/clinical/follow-ups",
    icon: CalendarCheck,
    group: "facility",
    labelKey: "clinical.nav.followUps",
    visible: hasAny("clinical.write"),
  },
  {
    key: "clinicalActivity",
    path: "/clinical/activity",
    icon: ChartLineUp,
    group: "facility",
    labelKey: "clinical.nav.activity",
    visible: hasAny("clinical.write"),
  },
  {
    key: "clinicalTemplates",
    path: "/clinical/templates",
    icon: Notebook,
    group: "facility",
    labelKey: "clinical.nav.templates",
    visible: hasAny("clinical.write"),
  },
  // [/S6]
  // [S7]
  {
    key: "pharmacyHistory",
    path: "/pharmacy/history",
    icon: ClockCounterClockwise,
    group: "facility",
    labelKey: "pharmacy.nav.history",
    visible: hasAny("pharmacy.dispense"),
  },
  {
    key: "pharmacyVerify",
    path: "/pharmacy/verify",
    icon: QrCode,
    group: "facility",
    labelKey: "pharmacy.nav.verify",
    visible: hasAny("pharmacy.dispense"),
  },
  {
    key: "pharmacyAvailability",
    path: "/pharmacy/availability",
    icon: Storefront,
    group: "facility",
    labelKey: "pharmacy.nav.availability",
    visible: hasAny("pharmacy.availability"),
  },
  {
    key: "pharmacyStock",
    path: "/pharmacy/stock",
    icon: Package,
    group: "facility",
    labelKey: "pharmacy.nav.stock",
    visible: hasAny("pharmacy.stock", "pharmacy.dispense"),
  },
  // [/S7]
  // [S11]
  {
    key: "platformUsers",
    path: "/platform/users",
    icon: UsersThree,
    group: "platform",
    labelKey: "console.nav.users",
    visible: (me: StaffMe) => me.is_platform_admin,
  },
  {
    key: "platformBreakGlass",
    path: "/platform/break-glass",
    icon: Siren,
    group: "platform",
    labelKey: "console.nav.breakGlass",
    visible: (me: StaffMe) => me.is_platform_admin,
  },
  {
    key: "platformSecurityLog",
    path: "/platform/security-log",
    icon: ShieldCheck,
    group: "platform",
    labelKey: "console.nav.securityLog",
    visible: (me: StaffMe) => me.is_platform_admin,
  },
  {
    key: "platformAccessLog",
    path: "/platform/access-log",
    icon: Fingerprint,
    group: "platform",
    labelKey: "console.nav.accessLog",
    visible: (me: StaffMe) => me.is_platform_admin,
  },
  // [/S11]
];

/** Translation key of a nav item's label. */
export const navLabelKey = (item: Pick<NavItem, "key" | "labelKey">) =>
  item.labelKey ?? `shell.nav.${item.key}`;

/**
 * Menu sections (design 04 §2): what the person does all day comes first, running the facility
 * second, help last. Items not listed here are daily work.
 */
export type NavSection = "work" | "practice" | "manage" | "help";
/** upgrade 05 §3: a clinician's own tools, apart from the daily work. */
const PRACTICE_KEYS = new Set<string>(["clinicalActivity", "clinicalTemplates"]);
const MANAGE_KEYS = new Set<string>([
  "approvals",
  "reports",
  "staff",
  "setup",
  "settings",
  "doctorSchedules",
  "queueReorders",
  "disruptions",
  "announcements",
  "patientMerges",
  "audit",
]);
export const navSection = (item: Pick<NavItem, "key">): NavSection =>
  item.key === "help"
    ? "help"
    : MANAGE_KEYS.has(item.key)
      ? "manage"
      : PRACTICE_KEYS.has(item.key)
        ? "practice"
        : "work";

/** Reached from the queue with a patient, never on its own, so not in the menu. */
const NOT_IN_MENU = new Set<string>(["clinicalConsultation"]);

/** Menu order; keys not listed keep their place after the listed ones. */
const ORDER = [
  "today",
  "queue",
  "calendar",
  "patients",
  "clinicalUnsigned",
  "clinicalResults",
  "clinicalQuestions",
  "clinicalFollowUps",
  "mySchedule",
  "pharmacy",
  "pharmacyHistory",
  "pharmacyVerify",
  // [S7]
  "pharmacyStock",
  "pharmacyAvailability",
  // [/S7]
  "payments",
  "reports",
  "approvals",
  "staff",
  "doctorSchedules",
  "setup",
  "settings",
  "queueReorders",
  "disruptions",
  "announcements",
  "patientMerges",
  "audit",
  "help",
  "platformOverview",
  "platformApplications",
  "platformFacilities",
  "platformUsers",
  "platformBreakGlass",
  "platformSecurityLog",
  "platformAccessLog",
  "platformSupport",
  "platformContact",
  "platformMasterData",
  "platformAnnouncements",
  "platformHelpArticles",
  "platformMerges",
  "platformFeatureFlags",
];
const rank = (key: string) => {
  const index = ORDER.indexOf(key);
  return index === -1 ? ORDER.length : index;
};

/**
 * The menu for this person: permitted (analysis 02 §3), needing a facility when it is a facility
 * page, and built. `built` is the set of paths that have a real page; sections that would only
 * open a placeholder stay out of the menu (design 04 §2: no dead ends).
 */
export function visibleNavItems(me: StaffMe, built?: ReadonlySet<string>): NavItem[] {
  return NAV_ITEMS.filter(
    (item) =>
      !NOT_IN_MENU.has(item.key) &&
      (item.group === "facility" ? hasFacility(me) : true) &&
      (built === undefined || item.key === "today" || built.has(item.path)) &&
      item.visible(me),
  ).sort((a, b) => rank(a.key) - rank(b.key));
}
