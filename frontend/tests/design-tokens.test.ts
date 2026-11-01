import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Components use design tokens, never raw hex colours (packages/ui/src/styles/tokens.css): one
 * place to change a colour, and dark mode keeps working. Remediation R8 (issue #91).
 */

const frontend = resolve(import.meta.dirname, "..");
const ROOTS = ["apps/staff-web/src", "apps/patient-web/src", "packages/ui/src"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const components = ROOTS.flatMap((root) => walk(resolve(frontend, root))).filter(
  (file) => file.endsWith(".tsx") && !file.endsWith(".test.tsx"),
);

const HEX = /["'`(]#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})["'`)]/gi;

describe("design tokens in components", () => {
  it("no .tsx component uses a raw hex colour", () => {
    const offenders = components.flatMap((file) => {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      return [...code.matchAll(HEX)].map(
        (m) => `${relative(frontend, file).replace(/\\/g, "/")}: ${m[0]}`,
      );
    });
    expect(offenders).toEqual([]);
  });
});
