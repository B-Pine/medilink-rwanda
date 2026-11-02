#!/usr/bin/env node
/**
 * Post-build check of the pre-rendered public pages (design 06 H8, ADR 0008), run by
 * `pnpm --filter @medilink/patient-web build`:
 *  - `/` and `/for-facilities` are pre-rendered (one <h1>, Kinyarwanda, a title), each with its
 *    data block; `/facilities/<slug>` pages are checked the same way when the API had facilities;
 *  - `app-shell.html` (the fallback for every other path) is the empty shell;
 *  - no personal data: a data block only carries public discovery queries, and no page contains
 *    an email address or a 16-digit national ID;
 *  - no live data in facility snapshots (fees, queue load, next free time load in the browser).
 *
 *   node scripts/check-prerender.mjs apps/patient-web/dist
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const dist = resolve(process.argv[2] ?? "dist");
const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};

const DATA = /<script type="application\/json" id="ml-prerender">([\s\S]*?)<\/script>/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const NATIONAL_ID = /(?<!\d)1\d{15}(?!\d)/;
const PUBLIC_QUERY_ROOT = "discovery";

function checkPage(file, path) {
  const name = relative(dist, file).replace(/\\/g, "/");
  if (!existsSync(file)) {
    errors.push(`${name} is missing (${path} is not pre-rendered)`);
    return;
  }
  const html = readFileSync(file, "utf8");
  const root = /<div id="root">([\s\S]*?)<\/div>\s*<\/body>/.exec(html)?.[1] ?? "";
  check((root.match(/<h1\b/g) ?? []).length === 1, `${name}: expected exactly one <h1> in #root`);
  check(/<html lang="rw"/.test(html), `${name}: <html lang="rw"> expected`);
  check(/<title>[^<]+ · MediLink Rwanda<\/title>/.test(html), `${name}: page title missing`);
  const data = DATA.exec(html);
  check(data, `${name}: prerender data block missing`);
  if (data) {
    const parsed = JSON.parse(data[1]);
    check(parsed.path === path, `${name}: data block is for ${parsed.path}, not ${path}`);
    for (const query of parsed.queries?.queries ?? []) {
      check(
        query.queryKey?.[0] === PUBLIC_QUERY_ROOT,
        `${name}: non-public query in the data block: ${JSON.stringify(query.queryKey)}`,
      );
      // ADR 0008: live data (queue load, next free time) never goes into a snapshot; U-01: no fees
      for (const service of query.state?.data?.services ?? []) {
        check(
          !("fee_rwf" in service) && service.queue_load === null && service.next_slot_at === null,
          `${name}: a fee or live data (queue load or next time) in a pre-rendered facility page`,
        );
      }
    }
  }
  const text = html.replace(/<script\b[^>]*src=[^>]*><\/script>|<link\b[^>]*>/g, "");
  check(!EMAIL.test(text), `${name}: contains an email address (${EMAIL.exec(text)?.[0]})`);
  check(!NATIONAL_ID.test(text), `${name}: contains what looks like a national ID`);
}

checkPage(join(dist, "index.html"), "/");
checkPage(join(dist, "for-facilities", "index.html"), "/for-facilities");

const facilities = join(dist, "facilities");
const slugs = existsSync(facilities) ? readdirSync(facilities) : [];
for (const slug of slugs) checkPage(join(facilities, slug, "index.html"), `/facilities/${slug}`);

const shellPath = join(dist, "app-shell.html");
check(existsSync(shellPath), "app-shell.html is missing (navigation fallback)");
if (existsSync(shellPath)) {
  const shell = readFileSync(shellPath, "utf8");
  check(/<div id="root"><\/div>/.test(shell), "app-shell.html: #root must be empty");
  check(!DATA.test(shell), "app-shell.html: must not carry prerender data");
}

if (errors.length) {
  console.error(`Prerender check failed (${dist}):\n - ${errors.join("\n - ")}`);
  process.exit(1);
}
console.log(`Prerender check passed: 2 public pages + ${slugs.length} facility pages (${dist})`);
