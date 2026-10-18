#!/usr/bin/env node
/**
 * Regenerate frontend/i18n-review.md: every Kinyarwanda string with its English source, all marked
 * "needs native-speaker review" (design 10 §3: no raw machine translation shipped as final).
 *
 *   pnpm i18n:review
 *
 * A test (tests/i18n.test.ts) fails when a key is missing from the review file.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const STATIC_CATALOGS = [
  { name: "Shared components (namespace ui)", dir: "packages/ui/src/i18n/locales" },
  { name: "Staff app", dir: "apps/staff-web/src/i18n/locales" },
  { name: "Patient app", dir: "apps/patient-web/src/i18n/locales" },
];

/** Feature namespaces: apps/<app>/src/features/<feature>/locales (shared-file protocol). */
function featureCatalogs() {
  const found = [];
  for (const app of ["staff-web", "patient-web"]) {
    const featuresDir = join(frontend, "apps", app, "src", "features");
    if (!existsSync(featuresDir)) continue;
    for (const feature of readdirSync(featuresDir).sort()) {
      const dir = `apps/${app}/src/features/${feature}/locales`;
      if (existsSync(join(frontend, dir, "en.json"))) {
        found.push({ name: `${app} feature: ${feature} (namespace ${feature})`, dir });
      }
    }
  }
  return found;
}

export const CATALOGS = [...STATIC_CATALOGS, ...featureCatalogs()];

export function flatten(tree, prefix = "") {
  const out = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

function load(dir, language) {
  return flatten(JSON.parse(readFileSync(resolve(frontend, dir, `${language}.json`), "utf8")));
}

const cell = (text) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function renderReview() {
  const lines = [
    "# Kinyarwanda strings: native-speaker review",
    "",
    "Status: **every Kinyarwanda string below is a draft that needs native-speaker review.** None of",
    "them is final (docs/design/research/10-accessibility-and-localization.md §3, NFR-UX-01). Medical",
    "terms must also be checked with clinicians. Review with real users (elderly patients, reception",
    "staff) before the pilot.",
    "",
    "How to review: correct the text in the `rw.json` file named in each section, then run",
    "`pnpm i18n:review` to regenerate this list. Change a row's status only in the review tracker",
    "agreed with the team; this file is generated.",
    "",
    "Also to confirm:",
    "",
    "- The emergency number shown to patients (`emergency.body`, currently **912**).",
    "- Facility type and role names (`facility.types.*`, `facility.roles.*`).",
    "- The mock API messages in `packages/api-client/src/mocks/messages.ts` (development only).",
    "",
  ];
  let total = 0;
  for (const catalog of CATALOGS) {
    const rw = load(catalog.dir, "rw");
    const en = load(catalog.dir, "en");
    lines.push(`## ${catalog.name}`, "", `File: \`${catalog.dir}/rw.json\``, "");
    lines.push("| Key | Kinyarwanda (draft) | English source | Status |", "|---|---|---|---|");
    for (const key of Object.keys(en)) {
      lines.push(
        `| \`${key}\` | ${cell(rw[key] ?? "**MISSING**")} | ${cell(en[key])} | needs native-speaker review |`,
      );
      total += 1;
    }
    lines.push("");
  }
  lines.splice(2, 0, `Keys: ${total}.`, "");
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = resolve(frontend, "i18n-review.md");
  writeFileSync(out, renderReview(), "utf8");
  console.log(`Wrote ${out}`);
}
