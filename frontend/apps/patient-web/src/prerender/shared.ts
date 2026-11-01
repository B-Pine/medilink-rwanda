import type { DehydratedState } from "@tanstack/react-query";
import { matchRoutes, type RouteObject } from "react-router";

/**
 * Build-time pre-rendering of the public pages (design 06 H8, ADR 0006/0007): the Vite prerender
 * plugin writes `dist/<path>/index.html` for each path below, rendered in Kinyarwanda. The browser
 * then hydrates the static pages, or replaces the snapshot when it can't match it exactly.
 */
export const PRERENDERED_PATHS = ["/", "/for-facilities"] as const;
/** Facility profiles, one page per facility found at build time (`/facilities/<slug>`). */
export const FACILITY_PATH = /^\/facilities\/[^/]+$/;

export function isPrerenderedPath(path: string): boolean {
  return (PRERENDERED_PATHS as readonly string[]).includes(path) || FACILITY_PATH.test(path);
}

/** The id of the JSON block the build writes next to the pre-rendered markup. */
export const PRERENDER_DATA_ID = "ml-prerender";

export interface PrerenderData {
  /** The path this markup was rendered for. */
  path: string;
  language: string;
  /**
   * True when the markup only depends on the language (hydrate it). Facility pages show live data
   * (queue load, hours from today), so the browser renders them afresh, seeded with the build's
   * data so nothing flashes.
   */
  hydrate: boolean;
  /** React Query cache at render time. */
  queries: DehydratedState;
}

/** JSON safe inside a <script> element: no `</script>`, `<!--` or line separators break out. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replaceAll(String.fromCharCode(0x2028), "\\u2028")
    .replaceAll(String.fromCharCode(0x2029), "\\u2029");
}

/**
 * Read (and remove, so hydration sees only the React markup) the build's data block. Returns
 * null when the page wasn't pre-rendered for this path, e.g. the app shell served for /login.
 */
export function takePrerenderData(container: HTMLElement, path: string): PrerenderData | null {
  const script = container.querySelector(`script#${PRERENDER_DATA_ID}`);
  if (!script) return null;
  script.remove();
  try {
    const data = JSON.parse(script.textContent ?? "") as PrerenderData;
    const normalised = path.replace(/\/$/, "") || "/";
    return data.path === normalised ? data : null;
  } catch {
    return null;
  }
}

/**
 * Load the lazy route modules of the current URL before hydrating, so the router's first render
 * is the page itself (not the HydrateFallback) and matches the pre-rendered markup.
 */
export async function loadLazyMatches(routes: RouteObject[], path: string): Promise<void> {
  const matches = matchRoutes(routes, path) ?? [];
  await Promise.all(
    matches.map(async ({ route }) => {
      if (typeof route.lazy !== "function") return;
      const loaded = await route.lazy();
      Object.assign(route, loaded);
      delete route.lazy;
    }),
  );
}
