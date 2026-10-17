#!/usr/bin/env node
/**
 * Post-build check of the patient-web PWA (contract F11), run by `pnpm --filter @medilink/patient-web build`.
 * Verifies the installability criteria browsers use (manifest fields, 192/512 icons, a service
 * worker with a fetch handler, manifest linked from index.html) and that the service worker
 * precaches no /api/ URL and never caches /api/ at runtime.
 *
 *   node scripts/check-pwa.mjs apps/patient-web/dist
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const dist = resolve(process.argv[2] ?? "dist");
const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};

const manifestPath = resolve(dist, "manifest.webmanifest");
check(existsSync(manifestPath), "dist/manifest.webmanifest is missing");
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  check(manifest.name && manifest.short_name, "manifest: name and short_name are required");
  check(manifest.start_url === "/", "manifest: start_url must be /");
  check(
    ["standalone", "fullscreen", "minimal-ui"].includes(manifest.display),
    "manifest: display must be standalone",
  );
  const icons = manifest.icons ?? [];
  for (const size of ["192x192", "512x512"]) {
    check(
      icons.some((i) => i.sizes === size && (i.purpose ?? "any").includes("any")),
      `manifest: ${size} icon missing`,
    );
  }
  check(
    icons.some((i) => (i.purpose ?? "").includes("maskable")),
    "manifest: maskable icon missing",
  );
  for (const icon of icons)
    check(existsSync(resolve(dist, icon.src.replace(/^\//, ""))), `icon file missing: ${icon.src}`);
}

const html = readFileSync(resolve(dist, "index.html"), "utf8");
check(
  /<link rel="manifest" href="\/manifest\.webmanifest"/.test(html),
  "index.html does not link the manifest",
);
check(/http-equiv="Content-Security-Policy"/.test(html), "index.html has no CSP meta tag");

const swPath = resolve(dist, "sw.js");
check(existsSync(swPath), "dist/sw.js is missing");
if (existsSync(swPath)) {
  const sw = readFileSync(swPath, "utf8");
  check(/precacheAndRoute/.test(sw), "sw.js does not precache the app shell");
  check(/NetworkOnly/.test(sw), "sw.js has no NetworkOnly rule for /api/");
  check(!/url:\s*["'][^"']*api\//.test(sw), "sw.js precaches an /api/ URL");
  check(!/mockServiceWorker/.test(sw), "sw.js precaches the MSW worker");
}

if (errors.length > 0) {
  console.error(`PWA check failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`PWA check passed (${dist})`);
