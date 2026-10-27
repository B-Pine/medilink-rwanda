import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Contract check F6 (security 06 §6), as a source scan backing the ESLint rules:
 * no dangerouslySetInnerHTML, no browser storage outside the UI preferences module, no
 * third-party scripts, fonts or CDNs.
 */

const frontend = resolve(import.meta.dirname, "..");
const SOURCE_ROOTS = [
  "apps/staff-web/src",
  "apps/patient-web/src",
  "packages/ui/src",
  "packages/api-client/src",
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sources = SOURCE_ROOTS.flatMap((root) => walk(resolve(frontend, root)))
  .filter((file) => /\.(tsx?|css|html)$/.test(file))
  .filter((file) => !/\.test\.tsx?$/.test(file) && !file.includes(`${join("src", "test")}`));
const rel = (file: string) => relative(frontend, file).replace(/\\/g, "/");
const read = (file: string) => readFileSync(file, "utf8");
/** Source without comments (docs may mention the banned APIs). */
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("front-end security rules (F6)", () => {
  it("never uses dangerouslySetInnerHTML or innerHTML", () => {
    for (const file of sources) {
      expect(code(file), rel(file)).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML\s*=/);
    }
  });

  it("uses localStorage only for UI preferences and never sessionStorage", () => {
    for (const file of sources) {
      const text = code(file);
      expect(text, rel(file)).not.toMatch(/sessionStorage/);
      if (rel(file) !== "packages/ui/src/preferences/storage.ts") {
        expect(text, rel(file)).not.toMatch(/localStorage/);
      }
    }
    const storage = read(resolve(frontend, "packages/ui/src/preferences/storage.ts"));
    const keys = [...storage.matchAll(/"(medilink\.[\w.]+)"/g)].map((m) => m[1]);
    expect(keys.sort()).toEqual([
      "medilink.language",
      "medilink.sidebarCollapsed",
      "medilink.tableDensity",
      "medilink.textSize",
      "medilink.theme",
    ]);
  });

  it("loads no third-party scripts, fonts or CDNs", () => {
    const pages = ["apps/staff-web/index.html", "apps/patient-web/index.html"].map((p) =>
      resolve(frontend, p),
    );
    for (const file of [...sources, ...pages]) {
      const text = read(file);
      expect(text, rel(file)).not.toMatch(
        /fonts\.googleapis|fonts\.gstatic|cdn\.|unpkg\.com|jsdelivr/,
      );
      expect(text, rel(file)).not.toMatch(/<script[^>]+src=["']https?:/);
      expect(text, rel(file)).not.toMatch(/<link[^>]+href=["']https?:/);
    }
  });

  it("the API client reads no cookies (the CSRF token comes from GET /api/v1/csrf/)", () => {
    for (const file of sources.filter(
      (f) => rel(f).startsWith("packages/api-client/src/") && !rel(f).includes("/mocks/"),
    )) {
      expect(read(file), rel(file)).not.toMatch(/document\.cookie/);
    }
  });

  it("pages declare a language and a density", () => {
    expect(read(resolve(frontend, "apps/staff-web/index.html"))).toMatch(
      /<html lang="rw" data-density="staff">/,
    );
    expect(read(resolve(frontend, "apps/patient-web/index.html"))).toMatch(
      /<html lang="rw" data-density="patient">/,
    );
  });
});
