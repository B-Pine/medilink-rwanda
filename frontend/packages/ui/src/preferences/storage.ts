/**
 * The only place in the frontend allowed to use localStorage (enforced by ESLint).
 * It stores non-sensitive UI preferences: theme, language and table density. Never tokens, never personal
 * or health data (docs/security/06-application-and-api-security.md §6).
 */

const KEYS = {
  theme: "medilink.theme",
  language: "medilink.language",
  // S1: DataTable row density (compact/default/comfortable), design 08 §3
  tableDensity: "medilink.tableDensity",
} as const;

export type PreferenceKey = keyof typeof KEYS;

export function readPreference(key: PreferenceKey): string | null {
  try {
    return window.localStorage.getItem(KEYS[key]);
  } catch {
    // Storage can be disabled (private mode, policies): preferences are best-effort.
    return null;
  }
}

export function writePreference(key: PreferenceKey, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(KEYS[key]);
    else window.localStorage.setItem(KEYS[key], value);
  } catch {
    // Ignore: the preference only lasts for this page view.
  }
}
