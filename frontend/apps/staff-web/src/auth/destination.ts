import type { StaffMe } from "@medilink/api-client";

export const HOME_PATH = "/today";

/**
 * Where this person's day starts: the facility's Today when a facility is active, otherwise the
 * platform overview for MediLink staff (a platform admin without a facility has no "today").
 */
export function homePath(user: Pick<StaffMe, "active_facility_id" | "is_platform_admin">): string {
  return user.active_facility_id === null && user.is_platform_admin ? "/platform" : HOME_PATH;
}

/** Only same-app paths are accepted as a return target (no open redirects). */
export function safeReturnPath(from: unknown): string | null {
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//")) return null;
  if (from.startsWith("/login") || from === "/select-facility") return null;
  return from;
}

/** Where a freshly authenticated user goes next. */
export function destinationAfterAuth(user: StaffMe, from?: unknown): string {
  if (!user.active_facility_id && user.memberships.length > 1) return "/select-facility";
  return safeReturnPath(from) ?? homePath(user);
}
