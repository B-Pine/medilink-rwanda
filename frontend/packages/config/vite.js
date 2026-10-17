import { rm } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Shared Vite helpers for the MediLink apps.
 *
 * Both apps are static sites served from their own host (ADR 0006). They talk to the API on
 * another host, configured at build time with VITE_API_BASE_URL.
 */

export const DEFAULT_API_BASE_URL = "http://localhost:8000";

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
  return { apiBaseUrl, useMocks };
}

/**
 * Values for Vite's `define` so the resolved values are baked into the static build.
 * @param {{ apiBaseUrl: string, useMocks: boolean }} appEnv
 */
export function defineAppEnv({ apiBaseUrl, useMocks }) {
  return {
    "import.meta.env.VITE_API_BASE_URL": JSON.stringify(apiBaseUrl),
    "import.meta.env.VITE_USE_MOCKS": JSON.stringify(String(useMocks)),
  };
}

/**
 * Content-Security-Policy for the production build, as a <meta> tag (static hosts may not let us
 * set headers; when they do, send the same policy as a header and add `frame-ancestors 'none'`).
 * Not applied in dev: the Vite dev server injects inline scripts for hot reload.
 *
 * @param {{ apiBaseUrl: string }} options
 */
export function contentSecurityPolicy({ apiBaseUrl }) {
  const api = new URL(apiBaseUrl);
  const ws = `${api.protocol === "https:" ? "wss:" : "ws:"}//${api.host}`;
  return [
    "default-src 'self'",
    "script-src 'self'",
    // React sets style attributes through the CSSOM (allowed); Radix may add a <style> element.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${api.origin} ${ws}`,
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
