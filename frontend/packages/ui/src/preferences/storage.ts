/**
 * The only place in the frontend allowed to use localStorage (enforced by ESLint).
 * It stores non-sensitive UI preferences: theme, language, table density, the collapsed sidebar, the text size and the push-banner dismissal. Never tokens, never personal
 * or health data (docs/security/06-application-and-api-security.md §6).
 */

const KEYS = {
  theme: "medilink.theme",
  language: "medilink.language",
  // S1: DataTable row density (compact/default/comfortable), design 08 §3
  tableDensity: "medilink.tableDensity",
  // design pass: staff sidebar collapsed to icons ("1") or full ("0"), design 04 §2
  sidebarCollapsed: "medilink.sidebarCollapsed",
  // design-v2: patient text size (normal/large/xlarge), design 07 §3.5 Settings
  textSize: "medilink.textSize",
  // [S9] patient push-off banner dismissed until (ISO date; a UI flag, no personal data), design 07 §3.1
  pushBannerDismissedUntil: "medilink.pushBannerDismissedUntil",
  // [/S9]
  // [Upgrade U2] home (upgrade 03 §2): last district and insurer choice (catalogue codes only),
  // and recently opened public facility pages (slug and public name, at most 5). Facility pages
  // are public data; nothing about a visit or a person is stored.
  discoveryChoice: "medilink.discoveryChoice",
  recentPlaces: "medilink.recentPlaces",
  // [/Upgrade U2]
  // public audit 2026-11-07: the site path (e.g. /dashboard/book/<slug>?service=<id>) to open
  // after sign-up confirms by email; read once, then removed. A path, nothing personal.
  returnTo: "medilink.returnTo",
  // 2026-11-08: sidebar groups the person hid (comma-separated group ids, e.g. "patient.health")
  navHidden: "medilink.navHidden",
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
