import { rm } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Shared Vite helpers for the MediLink apps.
 *
 * Both apps are static sites served from their own host (ADR 0006). They talk to the API on
 * another host, configured at build time with VITE_API_BASE_URL.
 */

export const DEFAULT_API_BASE_URL = "http://localhost:8000";
export const DEFAULT_MAP_TILES_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/**
 * Resolve the build-time environment of an app.
 * `--mode mock` (used by `pnpm dev:mock` / `pnpm build:mock`) always enables the MSW mocks.
 *
 * @param {string} mode Vite mode
 * @param {Record<string, string>} env variables loaded with Vite's loadEnv(mode, dir, "VITE_")
 */
export function resolveAppEnv(mode, env) {
  const apiBaseUrl = (env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  // Validate early: a typo here would only show up as failed requests in the browser.
  new URL(apiBaseUrl);
  const useMocks = mode === "mock" || env.VITE_USE_MOCKS === "true";
  // Map tiles (upgrade 03 §2). The provider for Rwanda is open decision OD-3; the OpenStreetMap
  // default is for development only (its tile policy does not allow production traffic).
  const mapTilesUrl = env.VITE_MAP_TILES_URL || DEFAULT_MAP_TILES_URL;
  new URL(mapTilesUrl.replace(/\{[a-z]\}/g, "0"));
  return { apiBaseUrl, useMocks, mapTilesUrl };
}

/**
 * Values for Vite's `define` so the resolved values are baked into the static build.
 * @param {{ apiBaseUrl: string, useMocks: boolean, mapTilesUrl?: string }} appEnv
 */
export function defineAppEnv({ apiBaseUrl, useMocks, mapTilesUrl = DEFAULT_MAP_TILES_URL }) {
  return {
    "import.meta.env.VITE_API_BASE_URL": JSON.stringify(apiBaseUrl),
    "import.meta.env.VITE_USE_MOCKS": JSON.stringify(String(useMocks)),
    "import.meta.env.VITE_MAP_TILES_URL": JSON.stringify(mapTilesUrl),
  };
}

/**
 * Content-Security-Policy for the production build, as a <meta> tag (static hosts may not let us
 * set headers; when they do, send the same policy as a header and add `frame-ancestors 'none'`).
 * Not applied in dev: the Vite dev server injects inline scripts for hot reload.
 *
 * `googleSignIn` (patient app only, upgrade 17) allows Google Identity Services: its one script,
 * its sign-in frame and button styles, all under https://accounts.google.com/gsi/.
 *
 * @param {{ apiBaseUrl: string, mapTilesUrl?: string, googleSignIn?: boolean }} options
 */
export function contentSecurityPolicy({
  apiBaseUrl,
  mapTilesUrl = DEFAULT_MAP_TILES_URL,
  googleSignIn = false,
}) {
  const api = new URL(apiBaseUrl);
  const tiles = new URL(mapTilesUrl.replace(/\{[a-z]\}/g, "0")).origin;
  const ws = `${api.protocol === "https:" ? "wss:" : "ws:"}//${api.host}`;
  const gsi = googleSignIn ? " https://accounts.google.com/gsi/" : "";
  return [
    "default-src 'self'",
    `script-src 'self'${googleSignIn ? " https://accounts.google.com/gsi/client" : ""}`,
    // Scripts never run inline. Styles still need 'unsafe-inline' (reviewed in R1, #83):
    // - Radix Dialog / DropdownMenu lock page scroll through react-remove-scroll-bar, which injects
    //   a <style> element with computed values at runtime;
    // - pdf.js (DocumentViewer) inserts <style> rules for its text and annotation layers.
    // A meta-tag CSP on a static host can't carry a per-response nonce and the content is dynamic,
    // so neither a nonce nor a hash works. Inline styles can't run script; the risk left is CSS
    // injection, which React's escaping and the strict script-src keep low. Revisit if the apps
    // move behind a server that can send a nonce header.
    `style-src 'self' 'unsafe-inline'${googleSignIn ? " https://accounts.google.com/gsi/style" : ""}`,
    // map tiles come from one configured origin (upgrade 03 §2, OD-3)
    `img-src 'self' data: ${tiles}`,
    "font-src 'self'",
    `connect-src 'self' ${api.origin} ${ws}${gsi}`,
    ...(googleSignIn ? [`frame-src${gsi}`] : []),
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/**
 * Vite plugin: inject the CSP meta tag into index.html at build time.
 * @param {{ apiBaseUrl: string }} options
 * @returns {import("vite").Plugin}
 */
export function medilinkCsp(options) {
  return {
    name: "medilink-csp",
    apply: "build",
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: {
            "http-equiv": "Content-Security-Policy",
            content: contentSecurityPolicy(options),
          },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

/**
 * Vite plugin: leave the MSW worker (public/mockServiceWorker.js) out of non-mock builds, so a
 * production deployment never ships mock code.
 * @param {{ useMocks: boolean }} options
 * @returns {import("vite").Plugin}
 */
export function medilinkMockWorker({ useMocks }) {
  let outDir = "dist";
  return {
    name: "medilink-mock-worker",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      if (!useMocks) await rm(resolve(outDir, "mockServiceWorker.js"), { force: true });
    },
  };
}
