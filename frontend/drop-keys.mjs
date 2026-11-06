// Scratch helper (not committed): remove locale keys no longer referenced in staff-web code.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
const root = "apps/staff-web/src";
const keys = JSON.parse(readFileSync(process.argv[2] || "removed-keys.json", "utf8"));
let code = "";
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|ts)$/.test(p)) code += readFileSync(p, "utf8");
  }
};
walk(root);
for (const key of keys) {
  if (code.includes(`"${key}"`) || code.includes(`'${key}'`)) {
    console.log("still used", key);
    continue;
  }
  const [ns, ...rest] = key.split(".");
  for (const lang of ["en", "fr", "rw"]) {
    const file = `${root}/features/${ns}/locales/${lang}.json`;
    if (!existsSync(file)) {
      console.log("no file", file);
      continue;
    }
    const data = JSON.parse(readFileSync(file, "utf8"));
    let o = data;
    for (const s of rest.slice(0, -1)) o = o?.[s];
    if (o && rest.at(-1) in o) delete o[rest.at(-1)];
    else console.log("missing", lang, key);
    writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  }
}
console.log("done");
