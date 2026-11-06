// Scratch helper (not committed): drop static page-header subtitles in staff-web.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const root = "apps/staff-web/src";
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".tsx") && !p.includes(".test.")) files.push(p);
  }
};
walk(root);
const re = /(<PageHeader\b[^>]*?)\s+description=\{t\("([^"]+)"\)\}/g;
const keys = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const next = src.replace(re, (_, head, key) => {
    keys.push(key);
    return head;
  });
  if (next !== src) writeFileSync(f, next);
}
writeFileSync("removed-keys.json", JSON.stringify(keys, null, 1));
console.log(keys.length, "removed");
