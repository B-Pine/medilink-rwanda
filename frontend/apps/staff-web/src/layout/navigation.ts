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

export type NavKey =
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
  key: NavKey;
  path: string;
  icon: Icon;
  group: "facility" | "platform";
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
];

export function visibleNavItems(me: StaffMe): NavItem[] {
  return NAV_ITEMS.filter(
    (item) =>
      (item.group === "facility" && item.key !== "today" ? hasFacility(me) : true) &&
      item.visible(me),
  );
}
