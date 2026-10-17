import type { StaffMe } from "@medilink/api-client";

export const HOME_PATH = "/today";

/** Only same-app paths are accepted as a return target (no open redirects). */
export function safeReturnPath(from: unknown): string | null {
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//")) return null;
  if (from.startsWith("/login") || from === "/select-facility") return null;
  return from;
}

/** Where a freshly authenticated user goes next. */
export function destinationAfterAuth(user: StaffMe, from?: unknown): string {
  if (!user.active_facility_id && user.memberships.length > 1) return "/select-facility";
  return safeReturnPath(from) ?? HOME_PATH;
}
