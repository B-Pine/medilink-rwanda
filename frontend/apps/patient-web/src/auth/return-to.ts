import { readPreference, writePreference } from "@medilink/ui";

/** Only addresses on this site: never `//host` or `https://host` (open redirect). */
export function safeReturnPath(from: unknown, fallback: string): string {
  return typeof from === "string" && from.startsWith("/") && !from.startsWith("//")
    ? from
    : fallback;
}

/**
 * Where to go after sign-up, kept across the email link (it opens in a new tab), so a visitor who
 * signed up from "Book" lands back on that booking. Only a path, never a credential.
 */
const RETURN_KEY = "returnTo";

export function rememberReturnTo(path: string | undefined): void {
  writePreference(RETURN_KEY, path ?? null);
}

/** The kept path, once: reading it forgets it. */
export function takeReturnTo(): string | undefined {
  const path = readPreference(RETURN_KEY);
  writePreference(RETURN_KEY, null);
  return path ?? undefined;
}
