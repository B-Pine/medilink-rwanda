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
// [/S9 imports]
// [S2 imports]
import { CalendarDots, ClipboardText } from "@phosphor-icons/react";
// [/S2 imports]
// [S10 imports]
// [/S10 imports]

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
  // [/S10]
];

/** Translation key of a nav item's label. */
export const navLabelKey = (item: Pick<NavItem, "key" | "labelKey">) =>
  item.labelKey ?? `shell.nav.${item.key}`;

export function visibleNavItems(me: StaffMe): NavItem[] {
  return NAV_ITEMS.filter(
    (item) =>
      (item.group === "facility" && item.key !== "today" ? hasFacility(me) : true) &&
      item.visible(me),
  );
}
